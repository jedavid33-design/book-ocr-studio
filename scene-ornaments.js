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
  function sceneCount(pages) {
    // Match *paragraph* separators, not a standalone line embedded inside prose.
    // This mirrors Studio's exportParagraphs() grouping rules.
    return (pages||[]).reduce((total,page)=>
      total+String(page?.text||"").replace(/\r/g,"").trim()
        .split(/\n{2,}/).filter(part=>part.trim()==="* * *").length,0);
  }
  function controller({state,els,sourceFilesAttached,loadImageFromFile,saveCheckpoint}) {
    const pick=els.sceneArtSelect, apply=els.sceneArtApply;
    if(!pick||!apply)return {sync:()=>{},refreshLibrary:async()=>{}};
    let saved=[],fullImage=null,previewCanvas=null,selectedRect=null;
    const crop=els.sceneArtCropCanvas;
    function info(message){if(els.sceneArtStatus)els.sceneArtStatus.textContent=message;}
    function drawCrop() {
      if(!previewCanvas||!crop)return;
      const ctx=crop.getContext("2d");
      ctx.clearRect(0,0,crop.width,crop.height);
      ctx.drawImage(previewCanvas,0,0);
      if(selectedRect&&selectedRect.w>0&&selectedRect.h>0){
        ctx.save();
        ctx.strokeStyle="#7045a0";ctx.lineWidth=3;
        ctx.setLineDash([8,4]);
        ctx.strokeRect(selectedRect.x+1,selectedRect.y+1,Math.max(0,selectedRect.w-2),
          Math.max(0,selectedRect.h-2));
        ctx.restore();
      }
    }
    function sync() {
      const asset=validate(state.sceneOrnament)?state.sceneOrnament:null;
      if(!asset){state.sceneOrnament=null;state.useSceneOrnament=false;}
      pick.replaceChildren();
      const empty=new Option("No illustration selected","");
      pick.append(empty);
      for(const art of saved)pick.append(new Option(art.name,art.id));
      if(asset&&!saved.some(art=>art.id===asset.id))
        pick.append(new Option(asset.name+" (saved in this book)",asset.id));
      pick.value=asset?.id||"";
      const ready=!!asset;
      apply.disabled=!ready;
      apply.checked=ready&&!!state.useSceneOrnament;
      if(els.sceneArtDelete)els.sceneArtDelete.disabled=!ready || !saved.some(art=>art.id===asset.id);
      if(els.sceneArtPreviewWrap)els.sceneArtPreviewWrap.classList.toggle("hidden",!ready);
      if(ready){
        if(els.sceneArtPreview)els.sceneArtPreview.src=asset.dataUrl;
        if(els.sceneArtPreviewName)els.sceneArtPreviewName.textContent=asset.name;
      }else if(els.sceneArtPreview)els.sceneArtPreview.removeAttribute("src");
      const count=sceneCount(state.pages);
      info(!ready?"No artwork selected. Canonical scene dividers will remain * * *."
        :state.useSceneOrnament
          ?`“${asset.name}” will replace ${count} canonical * * * divider${count===1?"":"s"} in this book. Opal Reader pauses remain intact.`
          :`“${asset.name}” selected, but not applied. ${count} semantic scene break${count===1?"":"s"} remain plain until approved.`);
    }
    async function refreshLibrary(){
      try{saved=await list();sync();}
      catch(error){saved=[];sync();info("Cannot open local illustration library: "+(error.message||error));}
    }
    pick.addEventListener("change",()=>{
      const choice=saved.find(art=>art.id===pick.value);
      // Re-select the backed-up asset even when its library copy was deleted.
      const preserved=state.sceneOrnament?.id===pick.value?state.sceneOrnament:null;
      state.sceneOrnament=choice?snapshot(choice):preserved?snapshot(preserved):null;
      if(!state.sceneOrnament)state.useSceneOrnament=false;
      saveCheckpoint();sync();
    });
    apply.addEventListener("change",()=>{
      if(apply.checked&&!validate(state.sceneOrnament)){apply.checked=false;return;}
      if(apply.checked&&!confirm(
        "Use this source-approved ornament for every canonical * * * scene divider in this book? Only choose this when the printed book uses that ornament consistently. The source text will not be edited.")){
        apply.checked=false;return;
      }
      state.useSceneOrnament=apply.checked;
      saveCheckpoint();sync();
    });
    els.sceneArtUpload?.addEventListener("change",async()=>{
      const file=els.sceneArtUpload.files?.[0];
      if(!file)return;
      try{
        info("Processing ornament…");
        const asset=await fromFile(file);
        await save(asset);
        state.sceneOrnament=snapshot(asset);
        state.useSceneOrnament=false;
        saveCheckpoint();await refreshLibrary();
        info("Saved “"+asset.name+"” to the reusable library. Approve its use with the checkbox after checking the source page.");
      }catch(error){info("Could not save ornament: "+(error.message||error));}
      finally{els.sceneArtUpload.value="";}
    });
    els.sceneArtDelete?.addEventListener("click",async()=>{
      const asset=state.sceneOrnament;
      if(!asset||!saved.some(a=>a.id===asset.id))return;
      if(!confirm("Delete “"+asset.name+"” from the reusable illustration library and unselect it for this book?"))return;
      try{
        await remove(asset.id);
        state.sceneOrnament=null;state.useSceneOrnament=false;
        saveCheckpoint();await refreshLibrary();
      }catch(error){info("Could not delete the illustration: "+(error.message||error));}
    });
    els.sceneArtCropLoad?.addEventListener("click",async()=>{
      const index=Number(els.sceneArtCropPage?.value)-1;
      const source=state.files?.[index];
      if(!Number.isInteger(index)||index<0||index>=state.files.length||
         !sourceFilesAttached()||!source){
        info("Attach the original screenshots and enter a valid source page number.");return;
      }
      try{
        fullImage=await loadImageFromFile(source);
        const ratio=Math.min(1,520/fullImage.naturalWidth,680/fullImage.naturalHeight);
        if(!Number.isFinite(ratio)||ratio<=0)throw new Error("Invalid screenshot size.");
        previewCanvas=document.createElement("canvas");
        previewCanvas.width=Math.max(1,Math.round(fullImage.naturalWidth*ratio));
        previewCanvas.height=Math.max(1,Math.round(fullImage.naturalHeight*ratio));
        previewCanvas.getContext("2d").drawImage(fullImage,0,0,previewCanvas.width,previewCanvas.height);
        crop.width=previewCanvas.width;crop.height=previewCanvas.height;
        crop.style.touchAction="none";
        selectedRect=null;
        if(els.sceneArtCropSave)els.sceneArtCropSave.disabled=true;
        drawCrop();
        if(els.sceneArtCropHint)els.sceneArtCropHint.textContent=
          "Drag a box tightly around the illustration, then save the selected crop.";
      }catch(error){info("Could not load source screenshot: "+(error.message||error));}
    });
    let pointerStart=null;
    function pointerCoords(ev){
      const rect=crop.getBoundingClientRect();
      return {x:Math.min(crop.width,Math.max(0,(ev.clientX-rect.left)*crop.width/rect.width)),
        y:Math.min(crop.height,Math.max(0,(ev.clientY-rect.top)*crop.height/rect.height))};
    }
    crop?.addEventListener("pointerdown",ev=>{
      if(!previewCanvas)return;
      pointerStart=pointerCoords(ev);
      crop.setPointerCapture?.(ev.pointerId);
      selectedRect=null;
      if(els.sceneArtCropSave)els.sceneArtCropSave.disabled=true;
    });
    crop?.addEventListener("pointermove",ev=>{
      if(!pointerStart)return;
      const point=pointerCoords(ev),x=Math.min(pointerStart.x,point.x),y=Math.min(pointerStart.y,point.y);
      selectedRect={x,y,w:Math.abs(point.x-pointerStart.x),h:Math.abs(point.y-pointerStart.y)};
      drawCrop();
    });
    const finishCrop=()=>{
      if(!pointerStart)return;
      pointerStart=null;
      if(els.sceneArtCropSave)els.sceneArtCropSave.disabled=!(selectedRect&&selectedRect.w>=16&&selectedRect.h>=10);
    };
    crop?.addEventListener("pointerup",finishCrop);
    crop?.addEventListener("pointercancel",finishCrop);
    els.sceneArtCropSave?.addEventListener("click",async()=>{
      if(!fullImage||!previewCanvas||!selectedRect)return;
      try{
        const ratioX=fullImage.naturalWidth/previewCanvas.width;
        const ratioY=fullImage.naturalHeight/previewCanvas.height;
        const x=Math.floor(selectedRect.x*ratioX),y=Math.floor(selectedRect.y*ratioY);
        const w=Math.min(fullImage.naturalWidth-x,Math.ceil(selectedRect.w*ratioX));
        const h=Math.min(fullImage.naturalHeight-y,Math.ceil(selectedRect.h*ratioY));
        if(w<16||h<10)throw new Error("Crop is too small.");
        const source=document.createElement("canvas");
        source.width=w;source.height=h;
        source.getContext("2d").drawImage(fullImage,x,y,w,h,0,0,w,h);
        const suggested="Scene artwork · page "+els.sceneArtCropPage.value;
        const name=prompt("Name this reusable scene illustration:",suggested);
        if(name===null)return;
        if(!name.trim())throw new Error("Give the illustration a name.");
        const asset=fromCanvas(source,{x:0,y:0,w,h},name);
        source.width=source.height=1;
        await save(asset);
        state.sceneOrnament=snapshot(asset);state.useSceneOrnament=false;
        saveCheckpoint();await refreshLibrary();
        info("Crop saved as “"+asset.name+"”. Check its preview, then approve use for this book.");
      }catch(error){info("Could not save crop: "+(error.message||error));}
    });
    refreshLibrary();
    return {sync,refreshLibrary};
  }
  const api=Object.freeze({list,save,remove,validate,snapshot,bytes,fromCanvas,fromFile,sceneCount,controller});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof globalThis!=="undefined")globalThis.OcrSceneOrnaments=api;
})();
