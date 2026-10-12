// Build 273: source-faithful, reflowable EPUB presentation helpers.
// No OCR recognition or narration-text changes.
(() => {
  "use strict";
  function heading(title, escape) {
    const lines=String(title||"").replace(/\r/g,"").split("\n").map(s=>s.trim()).filter(Boolean);
    if(!lines.length)return "";
    return '<h1 class="chapter-heading">'+lines.map((line,i)=>
      '<span class="chapter-heading-line'+(i===0?' chapter-heading-number':'')+'">'+escape(line)+'</span>').join("")+"</h1>";
  }
  function letterParagraph(text, afterText, paragraphToHtml) {
    if(!afterText)return paragraphToHtml(text);
    const source=String(text||"");
    const i=source.indexOf(afterText);
    if(i<0 || source.indexOf(afterText,i+1)>=0)
      throw Error("Source-approved letter line break is missing or ambiguous.");
    const at=i+afterText.length, left=source.slice(0,at), right=source.slice(at);
    if(!right.trim() || !/^\s+/.test(right))throw Error("Source-approved letter line break does not fall between words.");
    if((left.match(/\[\[i\]\]/gi)||[]).length!==(left.match(/\[\[\/i\]\]/gi)||[]).length)
      throw Error("A letter line break cannot split an italic span.");
    const leftHtml=paragraphToHtml(left.trimEnd()).replace(/^<p>|<\/p>$/g,"");
    const rightHtml=paragraphToHtml(right.trimStart()).replace(/^<p>|<\/p>$/g,"");
    return '<p>'+leftHtml+'<br class="letter-source-linebreak" />'+rightHtml+'</p>';
  }
  function sceneRule(id) {
    return '<div id="'+id+'" class="scene-break source-rule" data-opal-scene-break="true" role="separator" aria-label="Scene break"><hr /></div>';
  }
  const api=Object.freeze({heading,letterParagraph,sceneRule});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof globalThis!=="undefined")globalThis.OcrEpubPresentation=api;
})();
