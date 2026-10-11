// Build 257: user-approved EPUB scene ornament library.
// Library persists independently of the current OCR project in IndexedDB.
// A selected image is also copied into the book's portable OCR backup.
(() => {
  "use strict";
  const DB_NAME = "book-ocr-studio-ornaments";
  const STORE = "artwork";
  const MAX_ASSETS = 24;
  const MAX_BYTES = 800000;
  const DATA_PREFIX = "data:image/png;base64,";
  function openDb() {
    return new Promise((resolve,reject) => {
      if (!globalThis.indexedDB) return reject(new Error("Local ornament storage is unavailable."));
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{
        if (!request.result.objectStoreNames.contains(STORE))
          request.result.createObjectStore(STORE,{keyPath:"id"});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error("Could not open ornament library."));
    });
  }
  function validate(asset) {
    const data=String(asset?.dataUrl||"");
    return Boolean(asset && typeof asset.id === "string" && asset.id.length >= 6 &&
      typeof asset.name === "string" && asset.name.trim() &&
      data.startsWith(DATA_PREFIX) && /^[A-Za-z0-9+/]*={0,2}$/.test(data.slice(DATA_PREFIX.length)) &&
      data.length <= DATA_PREFIX.length + Math.ceil(MAX_BYTES/3)*4 &&
      Number.isFinite(asset.width) && asset.width>0 && asset.width<=900 &&
      Number.isFinite(asset.height) && asset.height>0 && asset.height<=500);
  }
  function bytes(asset) {
    if (!validate(asset)) throw new Error("This scene illustration is missing or invalid.");
    const encoded=asset.dataUrl.slice(DATA_PREFIX.length);
    const binary=atob(encoded);
    if (binary.length>MAX_BYTES) throw new Error("Scene illustration exceeds the 800 KB safety limit.");
    const result=new Uint8Array(binary.length);
    for (let i=0;i<binary.length;i++) result[i]=binary.charCodeAt(i);
    return result;
  }
  function snapshot(asset) {
    if (!validate(asset)) throw new Error("Invalid scene artwork.");
    return {id:asset.id,name:asset.name,dataUrl:asset.dataUrl,
      width:asset.width,height:asset.height};
  }
  async function list() {
    const db=await openDb();
    try{return await new Promise((resolve,reject)=>{
      const request=db.transaction(STORE,"readonly").objectStore(STORE).getAll();
      request.onsuccess=()=>resolve((request.result||[]).filter(validate).sort((a,b)=>
        String(a.name).localeCompare(String(b.name))));
      request.onerror=()=>reject(request.error);
    });} finally{db.close();}
  }
  async function save(asset) {
    if (!validate(asset)) throw new Error("Artwork must be a valid PNG smaller than 800 KB.");
    bytes(asset);
    const current=await list();
    if (!current.some(a=>a.id===asset.id) && current.length>=MAX_ASSETS)
      throw new Error("The illustration library has 24 entries. Delete an unused entry first.");
    const db=await openDb();
    try{await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,"readwrite");
      tx.objectStore(STORE).put(snapshot(asset));
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error);
    });}finally{db.close();}
    return snapshot(asset);
  }
  async function remove(id) {
    const db=await openDb();
    try{await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,"readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
    });}finally{db.close();}
  }
  function newId() {
    return typeof crypto!=="undefined"&&crypto.randomUUID ? crypto.randomUUID()
      : "art-"+Date.now()+"-"+Math.random().toString(36).slice(2);
  }
  function fromCanvas(canvas,rect,name="Scene ornament") {
    if (!canvas||!canvas.width||!canvas.height) throw new Error("Load a source image first.");
    const x=Math.max(0,Math.floor(Number(rect?.x)||0));
    const y=Math.max(0,Math.floor(Number(rect?.y)||0));
    const w=Math.min(canvas.width-x,Math.floor(Number(rect?.w)||0));
    const h=Math.min(canvas.height-y,Math.floor(Number(rect?.h)||0));
    if (w<16||h<10) throw new Error("Select a larger illustration area.");
    const ratio=Math.min(1,900/w,500/h);
    const output=document.createElement("canvas");
    output.width=Math.max(1,Math.round(w*ratio));
    output.height=Math.max(1,Math.round(h*ratio));
    const ctx=output.getContext("2d");
    if(!ctx)throw new Error("Canvas image processing isn't supported.");
    ctx.drawImage(canvas,x,y,w,h,0,0,output.width,output.height);
    const dataUrl=output.toDataURL("image/png");
    const asset={id:newId(),name:String(name||"Scene ornament").trim().slice(0,80),
      dataUrl,width:output.width,height:output.height};
    if(!validate(asset)||!bytes(asset))throw new Error("Illustration too large. Crop it more tightly.");
    output.width=output.height=1;
    return asset;
  }
  async function fromFile(file,name) {
    if(!file||!/^image\/(?:png|jpeg|webp)$/i.test(file.type))
      throw new Error("Choose a PNG, JPG, or WebP illustration image.");
    const url=URL.createObjectURL(file);
    try{
      const image=await new Promise((resolve,reject)=>{
        const img=new Image();
        img.onload=()=>resolve(img);
        img.onerror=()=>reject(new Error("Could not read the illustration image."));
        img.src=url;
      });
      const canvas=document.createElement("canvas");
      canvas.width=image.naturalWidth;
      canvas.height=image.naturalHeight;
      if(!canvas.width||!canvas.height||canvas.width*canvas.height>24000000)
        throw new Error("Image is too large to process safely. Crop it first.");
      canvas.getContext("2d").drawImage(image,0,0);
      const asset=fromCanvas(canvas,{x:0,y:0,w:canvas.width,h:canvas.height},
        name||file.name.replace(/\.[^.]+$/,""));
      canvas.width=canvas.height=1;
      return asset;
    }finally{URL.revokeObjectURL(url);}
  }
  const api=Object.freeze({list,save,remove,validate,snapshot,bytes,fromCanvas,fromFile});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof globalThis!=="undefined")globalThis.OcrSceneOrnaments=api;
})();
