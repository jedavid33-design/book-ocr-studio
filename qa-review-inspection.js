// Build 267: explicit human inspection ledger. No automatic QA certification.
// The exact observed text/structure is kept as an editable-project checkpoint field.
// A changed page is automatically stale, even if it retains an old marker.
(()=>{
 "use strict";
 function snapshot(page){
   const p=page||{};
   return JSON.stringify({
     fileName:String(p.file?.name||p.fileName||""),
     text:String(p.text||""),
     chapterStart:!!p.chapterStart,
     chapterTitle:String(p.chapterTitle||""),
     chapterPov:String(p.chapterPov||""),
     messageBubbles:Array.isArray(p.messageBubbles)?p.messageBubbles:[]
   });
 }
 function status(page){
   const old=page?.reviewInspection;
   if(!old||old.schema!=="human-source-inspection-v1"||
      typeof old.snapshot!=="string")return "pending";
   return old.snapshot===snapshot(page)?"inspected":"stale";
 }
 function mark(page,{sourceAttached=false,now=new Date().toISOString()}={}){
   if(!page||!sourceAttached)throw Error("Original screenshot must be attached before marking this page inspected.");
   return {schema:"human-source-inspection-v1",snapshot:snapshot(page),at:now};
 }
 function counts(pages){
   const n={inspected:0,pending:0,stale:0};
   for(const page of pages||[])n[status(page)]++;
   return n;
 }
 function next(rows,pages,currentIndex=-1){
   const pending=(rows||[]).filter(row=>row.priority!=="unflagged"&&
     status((pages||[])[row.pageIndex])!=="inspected");
   if(!pending.length)return -1;
   const idx=pending.findIndex(row=>row.pageIndex===currentIndex);
   return pending[(idx+1)%pending.length].pageIndex;
 }
 const api=Object.freeze({snapshot,status,mark,counts,next});
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(typeof globalThis!=="undefined")globalThis.OcrReviewInspection=api;
})();
