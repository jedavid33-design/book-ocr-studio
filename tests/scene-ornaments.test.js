"use strict";
// Build 257: without browser/network, verify illustration preservation and EPUB safety.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const art=require("../scene-ornaments.js");
const script=fs.readFileSync(path.join(__dirname,"..","script.js"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const tinyPng="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sC8y14AAAAASUVORK5CYII=";
const asset={id:"ornament-fixture",name:"Approved puppy divider",dataUrl:"data:image/png;base64,"+tinyPng,width:1,height:1};
assert.equal(art.validate(asset),true);
assert.equal(art.bytes(asset)[0],137);
assert.deepEqual(art.snapshot(asset),asset);
assert.equal(art.validate({...asset,dataUrl:"data:image/svg+xml;base64,"+tinyPng}),false);
assert.equal(art.sceneCount([{text:"A.\n\n* * *\n\nB."}]),1);
assert.equal(art.sceneCount([{text:"A.\n* * *\nB."}]),0);
assert.equal(art.sceneCount([{text:"* * *\n\n* * *"}]),2);
for(const id of ["sceneArtSelect","sceneArtUpload","sceneArtPreview","sceneArtApply",
 "sceneArtCropCanvas","sceneArtCropSave"])assert.ok(index.includes('id="'+id+'"'),"UI missing "+id);

function sourceBetween(first,last){
 const a=script.indexOf(first),b=script.indexOf(last,a);
 assert.ok(a>=0&&b>a,"source range missing");
 return script.slice(a,b);
}
const checkpoint=sourceBetween("function buildCheckpointPayload()","let projectCheckpointWriteChain");
const restore=sourceBetween("function applyCheckpoint(","function legacyCheckpointCandidates");
assert.ok(checkpoint.includes("sceneOrnament:"));
assert.ok(checkpoint.includes("useSceneOrnament:"));
assert.ok(restore.includes("state.sceneOrnament ="));
assert.ok(restore.includes("state.useSceneOrnament ="));
assert.ok(script.includes("state.sceneOrnament = null;"));

const sourceState={
 importedEpub:null,
 sceneOrnament:asset,useSceneOrnament:true,
 pages:[{text:"CHAPTER ONE\n\nBeginning.\n\n* * *\n\nEnding.",
   chapterStart:true,chapterTitle:"CHAPTER ONE",chapterPov:"Lily",messageBubbles:[]}]
};
const els={bookTitle:{value:"Test book"},bookAuthor:{value:"Test Author"}};
const files={};
class Zip{
 file(name,content){files[name]=content;return this}
 async generateAsync(){return {type:"mock-epub"}}
}
const section=()=>[{title:"CHAPTER ONE",nav:true,start:0,end:1,pov:"Lily"}];
const paragraphs=()=>[
 {text:"Beginning.",pageIndex:0,paragraphIndex:0},
 {text:"* * *",pageIndex:0,paragraphIndex:1},
 {text:"Ending.",pageIndex:0,paragraphIndex:2}
];
const escapeXml=value=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;");
let downloaded=0;
const exporter=new Function("state","els","window","JSZip","crypto","syncCurrentEditor",
 "ensureItalicEvidenceProjected","normalizedPageText","cleanFilename","chapterSections",
 "escapeXml","sectionParagraphs","paragraphToEpubHtml","downloadBlob",
 sourceBetween("async function buildEpub()","async function downloadEpub()")+";return buildEpub;");
const fn=exporter(sourceState,els,{JSZip:Zip,OcrSceneOrnaments:art,
 OcrMessageBubbles:{validate:()=>({stale:[],marked:0})}},Zip,{randomUUID:()=>"uuid-test"},
 ()=>{},()=>{},x=>x,x=>x,section,escapeXml,paragraphs,x=>"<p>"+escapeXml(x)+"</p>",()=>{downloaded++});
async function run(){
 const original=sourceState.pages[0].text;
 await fn();
 const doc=files["EPUB/chapter-001.xhtml"],opf=files["EPUB/package.opf"];
 assert.equal(downloaded,1);
 assert.ok(doc.includes('class="scene-break illustrated" data-opal-scene-break="true"'));
 assert.ok(doc.includes('src="images/scene-ornament.png" alt="" role="presentation"'));
 assert.ok(doc.includes('data-opal-pov="Lily"'));
 assert.ok(doc.includes("Beginning.")&&doc.includes("Ending."));
 assert.ok(!doc.includes(">* * *</p>"));
 assert.ok(opf.includes('id="scene-ornament" href="images/scene-ornament.png" media-type="image/png"'));
 assert.equal(files["EPUB/images/scene-ornament.png"][0],137);
 assert.ok(files["EPUB/style.css"].includes(".scene-break.illustrated img"));
 assert.equal(sourceState.pages[0].text,original);
 sourceState.useSceneOrnament=false;
 delete files["EPUB/images/scene-ornament.png"];
 await fn();
 assert.ok(files["EPUB/chapter-001.xhtml"].includes('class="scene-break" data-opal-scene-break="true">* * *</p>'));
 assert.ok(!files["EPUB/package.opf"].includes('id="scene-ornament"'));
 assert.ok(!files["EPUB/images/scene-ornament.png"]);
 sourceState.useSceneOrnament=true;
 sourceState.sceneOrnament=null;
 await assert.rejects(fn,/Selected scene artwork is invalid/);
 assert.equal(sourceState.pages[0].text,original);
 console.log("Build 257: illustrated/plain EPUB, checkpoint, and asset tests passed");
}
run().catch(error=>{console.error(error);process.exitCode=1;});
