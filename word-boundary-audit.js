// Build 259: advisory residual split/joined-word detector.
// Never rewrites authoritative OCR, QA, typography or EPUB text.
(()=>{
  "use strict";
  function auditResidualWordBoundaries(pages,{maxFindings=450,maxPerPage=24}={}) {
  const findings=[],counts={"split-ligature":0,"broken-hyphen":0,"glued-capital":0,"missing-punctuation-space":0};
  const commonLeft=new Set(["and","but","then","when","what","just","that","with","from","this","they","would","could","should","where","there","here","after","before","again","said","into","over","under","some","have","were","was","had","well","even","still","only","never","always","really","maybe","also","while","which","their"]);
  const patterns=[
    {type:"split-ligature",re:/\b(fi|fl|ffi|ffl)[ \t]+([a-z]{2,})\b/g,
      reason:"Possible OCR split within an fi/fl ligature. The two pieces may be one word.",
      suggest:m=>m[1]+m[2]},
    {type:"broken-hyphen",re:/\b([a-zA-Z]{3,})-[ \t\n]+([a-z]{2,})\b/g,
      reason:"A hyphen followed by whitespace may be a wrapped word rather than an intentional hyphen.",
      suggest:m=>m[1]+m[2]},
    {type:"glued-capital",re:/\b([a-z]{3,})([A-Z][a-z]{2,})\b/g,
      reason:"Unexpected capital letter inside a token may mark two accidentally joined words.",
      eligible:m=>commonLeft.has(m[1].toLowerCase()),
      suggest:m=>m[1]+" "+m[2]},
    {type:"missing-punctuation-space",re:/\b([A-Za-z]{2,})([,;:!?])([A-Za-z]{2,})\b/g,
      reason:"Punctuation between words has no following space; confirm the printed spacing.",
      suggest:m=>m[1]+m[2]+" "+m[3]}
  ];
  const source=Array.isArray(pages)?pages:[];
  let total=0;
  for(let pageIndex=0;pageIndex<source.length;pageIndex++){
    const text=String(source[pageIndex]?.text||"").replace(/\[\[\/?i\]\]/gi,"").replace(/\r/g,"");
    let perPage=0;
    const pageFindings=[];
    for(const rule of patterns){
      rule.re.lastIndex=0;
      for(const m of text.matchAll(rule.re)){
        if(rule.eligible&&!rule.eligible(m))continue;
        total++;counts[rule.type]++;
        if(perPage>=maxPerPage)continue;
        const offset=m.index??0, end=offset+m[0].length;
        const excerpt=text.slice(Math.max(0,offset-58),Math.min(text.length,end+58))
          .replace(/\s+/g," ").trim();
        pageFindings.push({pageIndex,type:rule.type,match:m[0],
          suggestion:rule.suggest(m),excerpt,reason:rule.reason,offset});
        perPage++;
      }
    }
    pageFindings.sort((a,b)=>a.offset-b.offset||a.type.localeCompare(b.type));
    for(const item of pageFindings)if(findings.length<maxFindings)findings.push(item);
  }
  return {pagesScanned:source.length,total,shown:findings.length,omitted:total-findings.length,counts,findings,
    note:"Review-only heuristic. Results may contain false positives and do not identify every possible spacing error. Compare against original screenshot before changing OCR."};
}
  const api=Object.freeze({audit:auditResidualWordBoundaries});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof globalThis!=="undefined")globalThis.OcrWordBoundaryAudit=api;
})();
