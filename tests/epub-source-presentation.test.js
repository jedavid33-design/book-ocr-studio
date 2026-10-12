"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const presentation=require("../epub-presentation.js");
const qa=require("../qa-layout-import.js");
const bubbles=require("../message-bubbles.js");
const script=fs.readFileSync(path.join(__dirname,"..","script.js"),"utf8");
function section(a,b) {
  const start=script.indexOf(a),stop=script.indexOf(b,start);
  assert.ok(start>=0&&stop>start,"Missing production function "+a);
  return script.slice(start,stop);
}
const xml=value=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const clean=s=>String(s||"").replace(/\r/g,"").trim()
  .split("\n").map(x=>x.replace(/[ \t]+$/g,"")).join("\n").replace(/\n{3,}/g,"\n\n");
const sourceOpening="ONE\n\nA TWO-LINE HEADING\n\nVIOLET\n\nToday starts here.";
const letter="Violet, A year ago I met you.";
const signature="You're my forever, Alex";
const sourceOther="Before the letter.\n\n[[letter]]\n\n"+letter+
  "\n\nSeveral handwritten lines.\n\n"+signature+
  "\n\n[[/letter]]\n\nA paragraph before.\n\n* * *\n\nAnother paragraph after.";
const state={importedEpub:null,useSceneOrnament:false,coverFile:null,pages:[
 {text:sourceOpening,chapterStart:true,chapterTitle:"ONE\nA TWO-LINE HEADING",chapterPov:"VIOLET",
  messageBubbles:[],layoutMeta:{}},
 {text:sourceOther,chapterStart:false,chapterTitle:"",chapterPov:"",
  messageBubbles:[],layoutMeta:{}}
]};
const before=state.pages.map(p=>p.text);
const decisions=[
 {layoutId:"greeting",type:"letter_line_break",pageId:"p0002",sourceVerified:true,
  paragraph:letter,breakAfter:"Violet,"},
 {layoutId:"signature",type:"letter_line_break",pageId:"p0002",sourceVerified:true,
  paragraph:signature,breakAfter:"forever,"},
 {layoutId:"line",type:"scene_rule",pageId:"p0002",sourceVerified:true,
  before:"A paragraph before.",after:"Another paragraph after."},
 {layoutId:"drop",type:"chapter_dropcap",pageId:"p0001",sourceVerified:true,
  paragraph:"Today starts here."}
];
const chapter={chapter:{number:1,reviewedPageRange:{startPageId:"p0001",endPageId:"p0002"}},
 layout:{decisions}};
assert.deepEqual(qa.validateShape([chapter],2),[]);
let report=qa.apply(state.pages,[chapter],bubbles);
assert.equal(report.errors.length,0,JSON.stringify(report.errors));
assert.equal(report.applied,4);
assert.deepEqual(state.pages.map(p=>p.text),before,"visual metadata never rewrites OCR");
assert.equal(state.pages[1].layoutMeta.qaPresentation.letterLines.length,2);
assert.equal(state.pages[1].layoutMeta.qaPresentation.sceneRules.length,1);
assert.equal(state.pages[0].layoutMeta.qaPresentation.dropcaps.length,1);
report=qa.apply(state.pages,[chapter],bubbles);
assert.equal(report.errors.length,0);
assert.equal(report.alreadyPresent,4);
assert.equal(report.applied,0);
const failed=structuredClone(state.pages);
const badDec={...decisions[2],before:"Not on this page.",layoutId:"badscene"};
assert.equal(qa.apply(failed,[{...chapter,layout:{decisions:[badDec]}}],bubbles).errors.length,1);
const pieces=section("function stripExportedChapterHeading(","function combinedText()");
const helpers=new Function("normalizedPageText","stripItalicMarkers",
 pieces+";return {stripExportedChapterHeading,stripExportedChapterPov};")(clean,s=>s);
const exportParagraphs=t=>clean(t).split(/\n{2,}/)
 .map(p=>p.split("\n").map(x=>x.trim()).filter(Boolean).join(" ").trim()).filter(Boolean);
const sections=new Function("state","exportParagraphs","stripExportedChapterHeading",
 "stripExportedChapterPov","joinParagraphLines","window",
 section("function sectionParagraphs(","function kindleReadyChecks(")+";return sectionParagraphs;")
(state,exportParagraphs,helpers.stripExportedChapterHeading,helpers.stripExportedChapterPov,
 a=>a.join(" "),{OcrMessageBubbles:bubbles});
const paragraphs=sections({start:0,end:2,nav:true,title:"ONE\nA TWO-LINE HEADING",pov:"VIOLET"});
assert.ok(paragraphs.some(p=>p.chapterDropcap));
assert.equal(paragraphs.filter(p=>p.letterBreakAfter).length,2);
assert.equal(paragraphs.filter(p=>p.sceneRule).length,1);
const generated={};
class Zip {file(name,data){generated[name]=data;return this}
 async generateAsync(){return {kind:"stub"}}}
const exporter=new Function("state","els","window","JSZip","crypto",
 "syncCurrentEditor","ensureItalicEvidenceProjected","normalizedPageText","cleanFilename",
 "chapterSections","escapeXml","sectionParagraphs","paragraphToEpubHtml","downloadBlob",
 section("async function buildEpub(","async function downloadEpub()")+";return buildEpub;");
const window={JSZip:Zip,OcrMessageBubbles:bubbles,
 OcrSceneOrnaments:{validate:()=>false,sceneCount:()=>1},
 OcrEpubPresentation:presentation};
const book=exporter(state,{bookTitle:{value:"Test"},bookAuthor:{value:"Author"}},
 window,Zip,{randomUUID:()=>"test-uid"},()=>{},()=>{},clean,x=>x,
 ()=>[{start:0,end:2,nav:true,title:"ONE\nA TWO-LINE HEADING",pov:"VIOLET"}],
 xml,sections,s=>"<p>"+xml(s)+"</p>",()=>{});
(async()=>{
 await book();
 const x=generated["EPUB/chapter-001.xhtml"],css=generated["EPUB/style.css"];
 assert.ok(x.includes('<span class="chapter-heading-line chapter-heading-number">ONE</span>'));
 assert.ok(x.includes('<span class="chapter-heading-line">A TWO-LINE HEADING</span>'));
 assert.equal((x.match(/<h1 class="chapter-heading">/g)||[]).length,1);
 assert.ok(x.includes('class="chapter-dropcap"'));
 assert.ok(x.includes('class="letter-source-linebreak"'));
 assert.equal((x.match(/<br class="letter-source-linebreak"/g)||[]).length,2);
 assert.ok(x.includes('class="scene-break source-rule"'));
 assert.ok(x.includes("<hr />"));
 assert.ok(!x.includes('data-opal-scene-break="true">* * *</p>'));
 assert.ok(css.includes(".chapter-dropcap::first-letter"));
 assert.ok(css.includes(".chapter-heading-line{display:block;}"));
 assert.deepEqual(state.pages.map(p=>p.text),before,"EPUB presentation does not rewrite narration");
 const normal=presentation.letterParagraph("A B","",t=>"<p>"+xml(t)+"</p>");
 assert.equal(normal,"<p>A B</p>");
 assert.throws(()=>presentation.letterParagraph("A B","X",t=>"<p>"+xml(t)+"</p>"),/ambiguous/);
 console.log("Build 273: 4 source approvals, heading/letter/rule/dropcap export and immutable OCR passed");
})().catch(e=>{console.error(e);process.exitCode=1;});
