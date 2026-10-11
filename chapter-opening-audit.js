// Build 258. Read-only chapter opening inventory; never modifies OCR or QA state.
(()=>{
  "use strict";
  function auditChapterOpenings(pages) {
  const source=Array.isArray(pages)?pages:[];
  const clean=x=>String(x??"").replace(/\r/g,"").replace(/\[\[\/?i\]\]/gi,"").trim();
  const number=x=>{
    const s=clean(x),m=s.match(/^(?:chapter|ch\.?)\s*([0-9]{1,3})\b/i)||s.match(/^([0-9]{1,3})(?:\b|$)/);
    return m?Number(m[1]):null;
  };
  const starts=source.map((page,pageIndex)=>({page:page||{},pageIndex})).filter(x=>x.page.chapterStart);
  const hasPov=starts.some(x=>clean(x.page.chapterPov));
  const rows=[],candidates=[];
  let previousNumber=null;
  for(let pageIndex=0;pageIndex<source.length;pageIndex++){
    const page=source[pageIndex]||{};
    if(!page.chapterStart) {
      if(page.chapterCandidate && clean(page.text)) candidates.push({
        pageIndex,kind:"candidate",title:"Possible unmarked chapter",issues:["OCR suggests a chapter heading here; verify the screenshot before marking it."]});
      continue;
    }
    const lines=clean(page.text).split("\n").map(clean).filter(Boolean);
    const title=clean(page.chapterTitle)||lines[0]||"Untitled chapter";
    const issues=[];
    if(!lines.length) issues.push("No OCR text on the chapter-start page.");
    if(!clean(page.chapterTitle)) issues.push("Chapter title has not been confirmed.");
    let pos=0;
    const line0=lines[0]||"";
    const lower=s=>clean(s).toLocaleLowerCase();
    const titleIsHeader=lower(line0)===lower(title)
      || /^(?:chapter|ch\.?)\s*\d{1,3}\b/i.test(line0)
      || /^(?:prologue|epilogue|interlude)\b/i.test(line0)
      || (/^\d{1,3}$/.test(line0) && number(title)===Number(line0));
    if(titleIsHeader) pos=1;
    const pov=clean(page.chapterPov);
    if(pov && lower(lines[pos])===lower(pov))pos++;
    const opening=lines.slice(pos).join(" ").trim();
    if(lines.length && !opening) issues.push("Opening prose not found on this start page; confirm where the chapter begins.");
    else if(/^[“”"'‘’(\[]*\s*[a-z]/u.test(opening))
      issues.push("Opening begins with a lowercase letter; check for a missing decorative initial.");
    if(hasPov && !pov) issues.push("POV label is blank while other chapters have one.");
    const currentNumber=number(title);
    if(currentNumber!==null){
      if(previousNumber!==null && currentNumber!==previousNumber+1)
        issues.push(currentNumber<=previousNumber
          ? `Repeated or out-of-order chapter number ${currentNumber} (previous: ${previousNumber}).`
          : `Chapter numbering jumps from ${previousNumber} to ${currentNumber}.`);
      previousNumber=currentNumber;
    }
    rows.push({pageIndex,kind:"chapter",title,number:currentNumber,pov,opening:opening.slice(0,130),issues});
  }
  return {
    chapterCount:rows.length,flaggedChapters:rows.filter(r=>r.issues.length).length,
    candidateCount:candidates.length,rows,candidates,
    note:"Read-only heuristic inventory. Missing initials, headings and candidate chapters require comparison with source screenshots."
  };
}
  const api=Object.freeze({audit:auditChapterOpenings});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof globalThis!=="undefined")globalThis.OcrChapterAudit=api;
})();
