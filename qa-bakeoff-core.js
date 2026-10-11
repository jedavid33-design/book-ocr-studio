// Build 264: blind OCR-model comparisons scored only against privately loaded gold.
// Pure: no networking, no project saves, no QA imports and no EPUB edits.
(()=>{
 "use strict";
 function canon(s){
   return String(s??"").replace(/[“”]/g,'"').replace(/[‘’]/g,"'")
     .replace(/，/g,",").replace(/…/g,"...").replace(/[—–]/g,"-")
     .replace(/\u00a0/g," ").replace(/\s+/g," ").trim().toLowerCase();
 }
 function score(gold,submission){
   const answers=gold?.answers||{};
   if(!Array.isArray(submission?.results))throw new Error("Model results must include a results array.");
   const pages=new Set(), changes=new Map(), invalid=[];
   const validPages=new Set(Object.values(answers).map(x=>x.pageId));
   for(const page of submission.results){
     const pid=page?.pageId;
     if(!validPages.has(pid)||pages.has(pid)){invalid.push("Unknown/repeated page "+pid);continue;}
     pages.add(pid);
     for(const edit of page.changes||[]){
       const id=edit?.id;
       if(!Object.hasOwn(answers,id)||answers[id].pageId!==pid||
          changes.has(id)||typeof edit.corrected!=="string"||
          edit.corrected.length>3000){invalid.push("Invalid edit "+String(id));continue;}
       changes.set(id,edit.corrected);
     }
   }
   const report={
     model:submission.model||"Unknown model",pages:pages.size,
     totalPages:validPages.size,anchors:0,
     correct:0,missed:0,wrong:0,falsePositive:0,controls:0,
     substantiveTotal:0,substantiveCorrect:0,
     typographyTotal:0,typographyCorrect:0,invalid:invalid.length,
     examples:[],costUsd:Number(submission?.usage?.cost)||0
   };
   for(const [id,a] of Object.entries(answers)){
     if(!pages.has(a.pageId))continue;
     report.anchors++;
     const before=String(a.original??""),expected=String(a.expected??"");
     const predicted=changes.has(id)?changes.get(id):before;
     const control=before===expected;
     const type=control?"control":canon(before)===canon(expected)?"typography":"substantive";
     let outcome;
     if(control){
       report.controls++;
       if(predicted===before)outcome="unchanged-control";
       else{outcome="false-positive";report.falsePositive++;}
     }else{
       if(type==="substantive")report.substantiveTotal++;
       else report.typographyTotal++;
       if(predicted===expected){
         report.correct++;outcome="correct";
         if(type==="substantive")report.substantiveCorrect++;
         else report.typographyCorrect++;
       }else if(predicted===before){report.missed++;outcome="missed";}
       else{report.wrong++;outcome="wrong-rewrite";}
     }
     if(outcome==="wrong-rewrite"||outcome==="false-positive"||outcome==="missed")
       if(report.examples.length<12)report.examples.push({id,pageId:a.pageId,outcome,type});
   }
   const totalFixes=report.correct+report.missed+report.wrong;
   report.recall=totalFixes?report.correct/totalFixes:null;
   report.substantiveRecall=report.substantiveTotal?report.substantiveCorrect/report.substantiveTotal:null;
   report.controlSpecificity=report.controls?(report.controls-report.falsePositive)/report.controls:null;
   report.precision=report.correct+report.falsePositive+report.wrong
     ?report.correct/(report.correct+report.falsePositive+report.wrong):null;
   report.note="Only tested-page correction anchors are scored. This is not whole-page QA, chapter-layout validation, or automatic approval.";
   return report;
 }
 function validateBlind(manifest){
   if(manifest?.format!=="book-ocr-studio-ai-qa-benchmark-v1"||!Array.isArray(manifest.pages))
     throw new Error("Unsupported blind benchmark manifest.");
   const ids=new Set();
   for(const page of manifest.pages){
     if(!/^p\d{4}$/.test(page.pageId)||ids.has(page.pageId)||!Array.isArray(page.anchors)||
       !/^images\/p\d{4}\.jpg$/.test(page.sourceImage))throw new Error("Invalid page entry.");
     ids.add(page.pageId);
     const anchors=new Set();
     for(const anchor of page.anchors){
       if(!anchor||typeof anchor.id!=="string"||typeof anchor.text!=="string"||
          !anchor.id.startsWith(page.pageId+"-")||anchors.has(anchor.id))
         throw new Error("Invalid/duplicate OCR anchor.");
       anchors.add(anchor.id);
     }
   }
   return {pages:manifest.pages.length,anchors:manifest.pages.reduce((n,p)=>n+p.anchors.length,0)};
 }
 const api=Object.freeze({canon,score,validateBlind});
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(typeof globalThis!=="undefined")globalThis.OcrQaBakeoffCore=api;
})();
