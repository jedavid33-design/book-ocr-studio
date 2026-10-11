// Build 260: two-checkpoint read-only book audit.
// Reuses the chapter, word-boundary, Final Polish, and Kindle Ready checks.
// It never performs OCR, repairs, QA imports, or EPUB export.
(()=>{
  "use strict";
  const STAGES=Object.freeze({afterOcr:"afterOcr",afterQa:"afterQa"});
  const MAX_ROWS=100;

  function assemble({stage,pages,chapterReport,wordReport,polishReport,preflightReport=null}={}){
    if(!Object.values(STAGES).includes(stage)) throw new TypeError("Unknown book audit checkpoint.");
    const source=Array.isArray(pages)?pages:[];
    const chapters=chapterReport||{rows:[],candidates:[]};
    const words=wordReport||{total:0,findings:[]};
    const polish=polishReport||{issues:[],checks:[]};
    const chapterItems=[];
    for(const row of [...(chapters.rows||[]),...(chapters.candidates||[])]){
      for(const problem of row.issues||[])chapterItems.push({
        kind:"chapter",pageIndex:row.pageIndex,title:row.title||"Chapter opening",
        detail:problem,excerpt:row.opening||""
      });
    }
    const wordItems=(words.findings||[]).map(item=>({
      kind:"word",pageIndex:item.pageIndex,title:item.match+" → "+item.suggestion,
      detail:item.reason,excerpt:item.excerpt||""
    }));
    const polishItems=(polish.issues||[]).map(item=>({
      kind:"polish",pageIndex:item.pageIndex,title:item.type||"Final Polish review",
      detail:item.detail||"Compare against the screenshot.",
      excerpt:String(item.current||item.fullText||"").slice(0,210)
    }));
    const blankItems=source.flatMap((page,pageIndex)=>
      String(page?.text||"").replace(/\[\[\/?i\]\]/gi,"").trim()?[]:[{
        kind:"empty",pageIndex,title:"No OCR text",detail:"This page has no recognized text. Confirm whether it is intentionally blank.",excerpt:""
      }]);
    const complete=source.filter(page=>String(page?.text||"").trim()).length;
    const groups=[
      {id:"chapter",label:"Chapter openings and drop caps",count:chapterItems.length,items:chapterItems.slice(0,MAX_ROWS)},
      {id:"polish",label:"Paragraphs, punctuation and scene breaks",count:polishItems.length,items:polishItems.slice(0,MAX_ROWS)},
      {id:"word",label:"Suspicious split and joined words",count:Number(words.total)||0,
        items:wordItems.slice(0,MAX_ROWS),scannerOmitted:Math.max(0,(Number(words.total)||0)-wordItems.length)},
      {id:"empty",label:"Blank or missing OCR text",count:blankItems.length,items:blankItems.slice(0,MAX_ROWS)}
    ];
    const reviewLeads=groups.reduce((sum,g)=>sum+g.count,0);
    const preflightChecks=stage==="afterQa"&&preflightReport?Array.from(preflightReport.checks||[]):[];
    const blockers=preflightChecks.filter(c=>c.status==="fail");
    const warnings=preflightChecks.filter(c=>c.status==="warn");
    return {
      format:"book-ocr-studio-unified-audit-v1",stage,
      scannedPages:source.length,pagesWithText:complete,
      summary:{reviewLeads,shownLeads:groups.reduce((sum,g)=>sum+g.items.length,0),
        exportBlockers:stage==="afterQa"?blockers.length:null,
        exportWarnings:stage==="afterQa"?warnings.length:null,
        exportReady:stage==="afterQa"&&preflightReport?blockers.length===0:null},
      groups,preflightChecks,
      notes:[
        "Read-only snapshot. Review leads are not confirmed OCR errors or export blockers.",
        "The after-OCR checkpoint is advisory. Export readiness is checked only after QA.",
        "After-QA export statuses reuse Kindle Ready preflight rules. Final Kindle Ready remains the export authority.",
        "Word-boundary checks are heuristic and capped; an unflagged book is not proof of zero OCR errors."
      ]
    };
  }
  const api=Object.freeze({STAGES,assemble});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof globalThis!=="undefined")globalThis.OcrUnifiedBookAudit=api;
})();
