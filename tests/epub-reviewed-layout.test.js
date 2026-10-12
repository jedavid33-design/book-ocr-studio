"use strict";
// Build 269 real-book layout regression: only source-confirmed features export.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const bubble=require("../message-bubbles.js");
const script=fs.readFileSync(path.join(__dirname,"..","script.js"),"utf8");
function section(a,b){
  const first=script.indexOf(a),last=script.indexOf(b,first);
  assert.ok(first>=0&&last>first,"missing production function "+a);
  return script.slice(first,last);
}
const normalize=x=>String(x||"").replace(/\r/g,"").split("\n")
  .map(line=>line.replace(/[ \t]+$/g,"")).join("\n")
  .replace(/\n{3,}/g,"\n\n").trim();
const stripItalic=x=>String(x||"").replace(/\[\[\/?i\]\]/gi,"");
const funcs=new Function("normalizedPageText","stripItalicMarkers",
  section("function stripExportedChapterHeading(","function combinedText()")+
  ";return {stripExportedChapterHeading,stripExportedChapterPov};")(normalize,stripItalic);
const opening="ONE\n\nANNIVERSARIES SUCK CHEESY BALLS\n\nVIOLET\n\nFirst paragraph.";
assert.equal(funcs.stripExportedChapterPov(funcs.stripExportedChapterHeading(
  opening,"ONE\nANNIVERSARIES SUCK CHEESY BALLS"),"VIOLET"),"First paragraph.");
assert.equal(funcs.stripExportedChapterHeading("ONE\n\nThis is prose.","ONE\nNOT THIS TITLE"),
  "ONE\n\nThis is prose.","unrelated prose cannot be removed");

const state={importedEpub:null,useSceneOrnament:false,coverFile:null,pages:[
  {text:opening,chapterStart:true,chapterTitle:"ONE\nANNIVERSARIES SUCK CHEESY BALLS",
    chapterPov:"VIOLET",messageBubbles:[],layoutMeta:null},
  {text:"I got a reply: VIOLET\n\nI'll be right there!\n\n* * *\n\n"+
    "[[letter]]\n\nDear reader,\n\nLove, someone.\n\n[[/letter]]\n\nAfter the letter.",
    chapterStart:false,chapterPov:"",messageBubbles:[],layoutMeta:null}
]};
const reply=bubble.rows(state.pages[1].text).rows.find(r=>r.text==="I'll be right there!");
assert.equal(reply.label,"VIOLET");
assert.equal(reply.side,"","bubble side must never be guessed");
state.pages[1].messageBubbles=bubble.setAnnotation([],reply,"incoming",true);
const saved=state.pages.map(p=>p.text);
const exportParagraphs=t=>normalize(t).split(/\n{2,}/)
  .map(p=>p.split("\n").map(x=>x.trim()).filter(Boolean).join(" ").trim())
  .filter(Boolean);
const makeSectionParagraphs=new Function("state","exportParagraphs",
  "stripExportedChapterHeading","stripExportedChapterPov","joinParagraphLines","window",
  section("function sectionParagraphs(","function kindleReadyChecks(")+";return sectionParagraphs;");
const paragraphs=makeSectionParagraphs(state,exportParagraphs,
  funcs.stripExportedChapterHeading,funcs.stripExportedChapterPov,
  lines=>lines.join(" "),{OcrMessageBubbles:bubble});
const metadata={title:"ONE\nANNIVERSARIES SUCK CHEESY BALLS",
  start:0,end:2,nav:true,pov:"VIOLET"};
const rows=paragraphs(metadata);
assert.equal(rows[0].text,"First paragraph.");
assert.equal(rows.find(r=>r.text==="I'll be right there!").speakerLabel,"VIOLET");
assert.equal(rows.find(r=>r.text==="I got a reply:").text,"I got a reply:");
assert.equal(rows.filter(r=>r.text==="* * *").length,1);
assert.equal(rows.filter(r=>r.text==="[[letter]]").length,1);
assert.deepEqual(state.pages.map(p=>p.text),saved);

const generated={};
class Zip{file(name,text){generated[name]=text;return this}
  async generateAsync(){return {type:"fake-epub"}}}
const xml=x=>String(x||"").replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const exporter=new Function("state","els","window","JSZip","crypto",
  "syncCurrentEditor","ensureItalicEvidenceProjected","normalizedPageText",
  "cleanFilename","chapterSections","escapeXml","sectionParagraphs",
  "paragraphToEpubHtml","downloadBlob",
  section("async function buildEpub(","async function downloadEpub()")+
  ";return buildEpub;");
const build=exporter(state,{bookTitle:{value:"Forever Pucked"},
  bookAuthor:{value:"Source author"}},{
    JSZip:Zip,OcrMessageBubbles:bubble,OcrSceneOrnaments:{validate:()=>false,sceneCount:()=>1}
  },Zip,{randomUUID:()=> "test-id"},()=>{},()=>{},normalize,x=>x,
  ()=>[metadata],xml,paragraphs,text=>"<p>"+xml(text)+"</p>",()=>{});
(async()=>{
  await build();
  const doc=generated["EPUB/chapter-001.xhtml"];
  assert.equal((doc.match(/<h1>/g)||[]).length,1);
  assert.ok(!doc.includes("<p>ONE</p>"));
  assert.ok(!doc.includes("<p>ANNIVERSARIES SUCK CHEESY BALLS</p>"));
  assert.equal((doc.match(/class="chapter-pov"/g)||[]).length,1);
  assert.ok(!doc.includes("<p>VIOLET</p>"));
  assert.ok(doc.includes('class="message-group incoming"'));
  assert.ok(doc.includes('data-opal-narration="skip">VIOLET</span>'));
  assert.ok(doc.includes('data-opal-scene-break="true"'));
  assert.ok(doc.includes('<blockquote class="letter-block" data-opal-letter="true">'));
  assert.ok(doc.includes('<p id="p-2-')&&doc.includes('class="letter-line"'));
  assert.ok(doc.includes("</blockquote>"));
  assert.ok(!doc.includes("[[letter]]"));
  assert.ok(generated["EPUB/style.css"].includes(".letter-block{"));
  assert.deepEqual(state.pages.map(p=>p.text),saved);
  state.pages[1].text=state.pages[1].text.replace("[[/letter]]","");
  await assert.rejects(build,/Letter block is not closed/);
  console.log("Build 269: headings, POV, opt-in bubbles, scenes, letter blocks and guards passed");
})().catch(error=>{console.error(error);process.exitCode=1;});
