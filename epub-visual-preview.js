// Build 262: isolated preview of the XHTML and stylesheet inside the generated EPUB.
// No network, script execution, OCR or project-state mutation is needed.
(()=>{
  "use strict";
  function htmlDocument(xhtml,css,images={}){
    let html=String(xhtml??"");
    const sheet=String(css??"");
    if(!/<html\b/i.test(html)||!/<head\b/i.test(html)||!/<body\b/i.test(html))
      throw new Error("EPUB XHTML document is incomplete.");
    // Preview only the original EPUB CSS, never the Studio app CSS.
    const safeSheet=sheet.replace(/<\/style/gi,"<\\/style");
    html=html.replace(/<link\b[^>]*\bhref=["']style\.css["'][^>]*\/?>/gi,"");
    const csp='<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; img-src data:; base-uri &#39;none&#39;; form-action &#39;none&#39;"/>';
    html=html.replace(/<head\b[^>]*>/i,match=>match+csp+"<style>"+safeSheet+"</style>");
    // Only images physically packaged with the EPUB may be shown. Unknown URLs
    // are blank, so an external URL in an unexpected document cannot be loaded.
    html=html.replace(/\bsrc=(["'])([^"']+)\1/gi,(_whole,quote,ref)=>{
      const known=Object.prototype.hasOwnProperty.call(images,ref)?images[ref]:null;
      return "src="+quote+(typeof known==="string"&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(known)?known:"")+quote;
    });
    return "<!DOCTYPE html>\n"+html.replace(/^\s*<\?xml[^>]*\?>\s*/i,"").replace(/^\s*<!DOCTYPE html>\s*/i,"");
  }
  function inspectXhtml(xhtml){
    const source=String(xhtml??"");
    const count=pattern=>(source.match(pattern)||[]).length;
    const headingCount=count(/<h1(?:\s|>)/gi);
    const groups=count(/<div\b[^>]*class="message-group (?:incoming|outgoing)"/gi);
    const sceneBreaks=count(/data-opal-scene-break="true"/gi);
    const illustrations=count(/class="scene-break illustrated"/gi);
    const paragraphs=count(/<p(?:\s|>)/gi);
    const italics=count(/<em(?:\s|>)/gi);
    const warnings=[];
    if(count(/\[\[(?:\/?i)\]\]/gi))warnings.push("Unconverted italic markup is visible in the EPUB.");
    if(headingCount>1)warnings.push("Multiple chapter headings; inspect for duplicated titles.");
    if(illustrations>sceneBreaks)warnings.push("Illustrated divider lacks a semantic scene-break marker.");
    if(groups>paragraphs)warnings.push("A message group may be missing its paragraph.");
    if(!paragraphs&&!/class="title-page"|alt="Cover"/.test(source))
      warnings.push("This section has no body paragraphs.");
    return {headingCount,paragraphs,italics,groups,sceneBreaks,illustrations,warnings};
  }
  const api=Object.freeze({htmlDocument,inspectXhtml});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof globalThis!=="undefined")globalThis.OcrEpubVisualPreview=api;
})();
