// Build 261: narrow, idempotent cleanup for newly recognized OCR pages only.
// Never call on manual/QA-approved text. Every change is retained as an audit row.
(() => {
  "use strict";
  const RULES = Object.freeze([
    {id:"false-period-inside-word",pattern:/\b(resent|expres|assist)\.[ \t]+(ment|sion|ant)\b/g,
      replacement(parts){
        const [left,right]=parts;
        const candidates={resent:"ment",expres:"sion",assist:"ant"};
        return candidates[left.toLowerCase()]===right.toLowerCase()
          ? left+right.toLowerCase():null;
      }},
    {id:"exact-split-ligature",pattern:/\b(fi)[ \t]+(rst|nally)\b|\b(fl)[ \t]+(owers|oor)\b/g,
      replacement(parts){
        const [a,b,c,d]=parts;
        const left=a||c,right=b||d;
        if(!left||!right)return null;
        return left+right.toLowerCase();
      }},
    {id:"missing-comma-semicolon-space",pattern:/\b([A-Za-z]{2,})([,;])([a-z]{2,})\b/g,
      replacement(parts){return parts[0]+parts[1]+" "+parts[2];}}
  ]);

  function repair(input) {
    let text=String(input??"");
    const changes=[];
    // This stage is only for raw OCR. If it is accidentally handed already
    // formatted/QA text, bail out rather than rewrite an approved italic span.
    if(/\[\[\/?i\]\]/i.test(text))return {text,changed:0,changes};
    for(const rule of RULES){
      const regex=new RegExp(rule.pattern.source,rule.pattern.flags);
      text=text.replace(regex,(match,...args)=>{
        const captures=args.slice(0,-2);
        const offset=args[args.length-2];
        const after=rule.replacement(captures);
        if(!after || after===match) return match;
        // Never extend these patterns through an inline markup token or a
        // newline: the authoritative document and its paragraph boundaries
        // must remain structurally identical.
        if(/[\r\n[\]]/.test(match))return match;
        changes.push({rule:rule.id,before:match,after,offset});
        return after;
      });
    }
    return {text,changed:changes.length,changes};
  }

  const api=Object.freeze({repair});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof globalThis!=="undefined")globalThis.OcrFirstPassRepair=api;
})();