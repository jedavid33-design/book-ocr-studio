// Build 263: prioritize *inspection*, never infer that unflagged pages passed visual QA.
// A pure aggregation layer over existing source-backed audit reports.
(()=>{
  "use strict";
  const PRIORITY=Object.freeze({high:0,medium:1,unflagged:2});
  const TITLE=Object.freeze({high:"High attention",medium:"Review suggested",unflagged:"No patterns flagged"});
  const MAX_REASONS=8;
  const SHORT=x=>String(x??"").replace(/\s+/g," ").trim().slice(0,190);
  function build({pages,chapterReport,wordReport,polishReport,bubbleReports,dropcapCandidates,typographyUncertain}={}){
    const source=Array.isArray(pages)?pages:[];
    const rows=source.map((page,pageIndex)=>({
      pageIndex,priority:"unflagged",score:0,flagCount:0,reasons:[],
      moreReasons:0,hasSourceWarning:false,
      // Important: false means "not established", NOT "QA incomplete".
      verifiedByThisQueue:false
    }));
    function add(pageIndex,kind,label,detail,rank,weight){
      if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=rows.length)return;
      const row=rows[pageIndex];
      row.flagCount++;
      row.score+=weight;
      if(PRIORITY[rank]<PRIORITY[row.priority])row.priority=rank;
      if(row.reasons.length<MAX_REASONS)
        row.reasons.push({kind,label,detail:SHORT(detail)});
      else row.moreReasons++;
    }
    source.forEach((page,pageIndex)=>{
      if(!String(page?.text||"").replace(/\[\[\/?i\]\]/gi,"").trim())
        add(pageIndex,"empty","No recognized text",
          "Confirm whether this source page is genuinely blank, cropped, or missed by OCR.", "high",120);
    });
    const chapters=chapterReport||{};
    for(const item of [...(chapters.rows||[]),...(chapters.candidates||[])]){
      for(const issue of item.issues||[]){
        const urgent=/no ocr text|opening prose not found|missing decorative initial|lowercase letter|unmarked chapter/i.test(issue);
        add(item.pageIndex,"chapter",item.title||"Chapter opening",issue,urgent?"high":"medium",urgent?90:22);
      }
    }
    for(const issue of (polishReport?.issues||[])){
      const severe=/decorative marker candidate/i.test(issue?.type||"");
      add(issue.pageIndex,"polish",issue.type||"Final Polish warning",
        issue.detail||issue.current||"Compare with original screenshot.",severe?"high":"medium",severe?90:24);
    }
    for(const issue of (wordReport?.findings||[])){
      add(issue.pageIndex,"word",issue.match+" → "+issue.suggestion,
        issue.reason||"Check original typography.", "medium",10);
    }
    (bubbleReports||[]).forEach((report,pageIndex)=>{
      const stale=Array.isArray(report?.stale)?report.stale:[];
      if(stale.length)add(pageIndex,"bubble","Message annotation no longer matches",
        stale.length+" saved text-bubble mark"+(stale.length===1?"":"s")+" need re-review.","high",100+Math.min(stale.length,10));
    });
    for(const item of dropcapCandidates||[]){
      if(item?.status!=="pending")continue;
      add(item.pageIndex,"dropcap","Unresolved drop-cap candidate",
        "Compare the chapter opening against the screenshot before choosing a repair.","high",85);
    }
    for(const item of typographyUncertain||[]){
      if(item?.resolution!=null)continue;
      add(item.pageIndex,"typography","Uncertain typography",
        "An imported italic/style span still needs a decision.", "medium",18);
    }
    rows.forEach(row=>{
      row.reasons.sort((a,b)=>a.kind.localeCompare(b.kind)||a.label.localeCompare(b.label));
    });
    const ranked=rows.slice().sort((a,b)=>
      PRIORITY[a.priority]-PRIORITY[b.priority]||
      b.score-a.score||
      a.pageIndex-b.pageIndex);
    const counts={
      high:rows.filter(row=>row.priority==="high").length,
      medium:rows.filter(row=>row.priority==="medium").length,
      unflagged:rows.filter(row=>row.priority==="unflagged").length
    };
    const omitted=Math.max(0,Number(wordReport?.omitted)||0);
    return {
      format:"book-ocr-studio-prioritized-qa-v1",
      pagesScanned:rows.length,flagged:counts.high+counts.medium,counts,
      leadCount:rows.reduce((sum,row)=>sum+row.flagCount,0),
      ranked,unflaggedAreVerified:false,
      incompleteWordCoverage:omitted>0,omittedWordLeads:omitted,
      note:"Ranking is heuristic. High means inspect sooner, not that an error is confirmed. No patterns flagged does not mean visual QA is complete. Review original source images and rerun after any edits."
    };
  }
  function visible(report,{filter="attention",order="priority"}={}){
    if(!report)return [];
    const source=Array.isArray(report.ranked)?report.ranked:[];
    const subset=source.filter(row=>filter==="all"||
      (filter==="high"&&row.priority==="high")||
      (filter==="unflagged"&&row.priority==="unflagged")||
      (filter==="attention"&&row.priority!=="unflagged"));
    return order==="book"?subset.slice().sort((a,b)=>a.pageIndex-b.pageIndex):subset.slice();
  }
  const api=Object.freeze({build,visible,PRIORITY,TITLE});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof globalThis!=="undefined")globalThis.OcrPrioritizedQaQueue=api;
})();