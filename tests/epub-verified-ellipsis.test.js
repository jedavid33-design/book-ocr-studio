"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const qa=require("../qa-layout-import.js");
const bubbles=require("../message-bubbles.js");
const script=fs.readFileSync(path.join(__dirname,"..","script.js"),"utf8");
function section(a,b) {
  const i=script.indexOf(a),j=script.indexOf(b,i);
  assert.ok(i>=0&&j>i,"Missing production section "+a);
  return script.slice(i,j);
}
const source={
  pages:[
   {text:"Not approved... keep three dots.\n\nBefore... After.",
    chapterStart:false,messageBubbles:[],layoutMeta:{qaBoundaryToNext:"merge_across_pages"}},
   {text:"Then...again.\n\nAnd that is all.",
    chapterStart:false,messageBubbles:[],layoutMeta:{qaBoundaryFromPrevious:"merge_across_pages"}}
  ]
};
const chapter={chapter:{number:1,reviewedPageRange:{startPageId:"p0001",endPageId:"p0002"}},
 layout:{decisions:[
  {layoutId:"e1",type:"typographic_ellipsis",pageId:"p0001",sourceVerified:true,
    paragraph:"Before... After.",count:1},
  {layoutId:"e2",type:"typographic_ellipsis",pageId:"p0002",sourceVerified:true,
    paragraph:"Then...again.",count:1}
 ]}};
const state=structuredClone(source);
const prior=state.pages.map(x=>x.text);
assert.deepEqual(qa.validateShape([chapter],2),[]);
let result=qa.apply(state.pages,[chapter],bubbles);
assert.equal(result.errors.length,0,JSON.stringify(result.errors));
assert.equal(result.applied,2);
assert.deepEqual(state.pages.map(x=>x.text),prior,"Original OCR remains authoritative");
result=qa.apply(state.pages,[chapter],bubbles);
assert.equal(result.applied,0);
assert.equal(result.alreadyPresent,2);
assert.deepEqual(state.pages.map(x=>x.text),prior);
const broken=structuredClone(state.pages);
broken[1].text=broken[1].text.replace("Then...again.","Then..again.");
result=qa.apply(broken,[chapter],bubbles);
assert.equal(result.errors.length,1,"The missing dot must block import");
assert.equal(result.errors[0].opId,"e2");
const bad={...chapter,layout:{decisions:[{...chapter.layout.decisions[0],count:0}]}};
assert.ok(qa.validateShape([bad],2).length>0);
const testWindow={OcrMessageBubbles:bubbles};
const parse=t=>String(t||"").replace(/\r/g,"").split("\n").map(l=>l.trimEnd()).join("\n").trim();
const exp=t=>parse(t).split(/\n{2,}/).map(x=>x.split("\n").join(" ").trim()).filter(Boolean);
const render=new Function("state","exportParagraphs","stripExportedChapterHeading",
  "stripExportedChapterPov","joinParagraphLines","window",
  section("function sectionParagraphs(","function kindleReadyChecks(")+";return sectionParagraphs;")(
 state,exp,t=>t,t=>t,(arr)=>arr.join(" "),testWindow);
const paragraphs=render({start:0,end:2,title:"",pov:"",nav:false});
const printed=paragraphs.map(x=>x.text).join("\n\n");
console.log("DEBUG approved paragraphs",JSON.stringify(paragraphs.map(x=>x.text)));
assert.ok(printed.includes("Before… After. Then…again."),
  "Every approved occurrence survives a cross-page paragraph join");
assert.ok(printed.includes("Not approved... keep three dots."),
  "Unapproved three-dot punctuation must remain unchanged");
assert.equal((printed.match(/…/g)||[]).length,2);
assert.deepEqual(state.pages.map(x=>x.text),prior,"EPUB formatting never changes saved OCR");
const lost=structuredClone(state.pages);
lost[1].text=lost[1].text.replace("Then...again.","Changed content.");
const unsafe=new Function("state","exportParagraphs","stripExportedChapterHeading",
  "stripExportedChapterPov","joinParagraphLines","window",
  section("function sectionParagraphs(","function kindleReadyChecks(")+";return sectionParagraphs;")(
  {pages:lost},exp,t=>t,t=>t,a=>a.join(" "),testWindow);
assert.throws(()=>unsafe({start:0,end:2,title:"",pov:"",nav:false}),
  /source-verified ellipsis paragraph was lost/i);
console.log("Build 274: anchored ellipses, cross-page joins, idempotence, conflict and untouched OCR passed");
