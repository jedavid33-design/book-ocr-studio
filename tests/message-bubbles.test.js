"use strict";
// Build 256: no dependencies, no browser, no source-text modification.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const bubble=require("../message-bubbles.js");
const source=fs.readFileSync(path.join(__dirname,"..","script.js"),"utf8");
function section(start,end) {
  const code=source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
  assert.ok(code.length>100);
  return code;
}
const text="RANDY\n\nMaybe. Do u wanna b sexted?\n\nLILY\n\nNot now.";
const first=bubble.rows(text,[]);
assert.equal(first.marked,0);
assert.equal(first.rows[1].label,"RANDY");
assert.equal(first.rows[1].suggested,true);
const selected=bubble.setAnnotation([],first.rows[1],"outgoing",true);
assert.equal(bubble.rows(text,selected).rows[1].useLabel,true);
const labeled=bubble.labeledSuggestions(bubble.rows(text,[]),"Randy");
assert.equal(labeled.length,2);
assert.equal(labeled[0].side,"outgoing");
assert.equal(labeled[1].side,"incoming");
assert.equal(bubble.labeledSuggestions(bubble.rows(text,[]),"").length,0);
assert.equal(bubble.rows(text.replace("Do u","Would u"),selected).stale.length,1);
assert.equal(bubble.rows(text.replace("RANDY","MILLER"),selected).stale.length,1);
assert.equal(bubble.rows(text, bubble.setAnnotation(selected, first.rows[1],"",false)).marked,0);
assert.equal(bubble.speakerLabel("CHAPTER 7"),"");
assert.equal(bubble.speakerLabel("RANDY"),"RANDY");
const same=bubble.rows("Yes.\n\nYes.",[]);
const second=bubble.setAnnotation([],same.rows[1],"incoming",false);
assert.equal(bubble.rows("Yes.\n\nYes.",second).rows[0].side,"");
assert.equal(bubble.rows("Yes.\n\nYes.",second).rows[1].side,"incoming");

const state={pages:[
  {text:"CHAPTER ONE\n\nRANDY\n\nMaybe. Do u wanna b sexted?\n\nI can wait.",
    chapterStart:true,chapterTitle:"CHAPTER ONE",chapterPov:"Randy",
    messageBubbles:[],layoutMeta:null},
  {text:"LILY\n\nI'm about to teach.",chapterStart:false,messageBubbles:[],layoutMeta:null}
],coverFile:null,importedEpub:null};
const original=state.pages.map(p=>p.text);
const current=bubble.rows(state.pages[0].text,[]).rows[2];
state.pages[0].messageBubbles=bubble.setAnnotation([],current,"outgoing",true);
const makeSections=new Function("state","exportParagraphs","stripExportedChapterHeading","joinParagraphLines","window",
  section("function sectionParagraphs(section)","function kindleReadyChecks()")+";return sectionParagraphs;");
const pageSections=makeSections(state,bubble.paragraphs,text=>text.replace("CHAPTER ONE\n\n",""),parts=>parts.join(" "),{OcrMessageBubbles:bubble});
const rows=pageSections({title:"CHAPTER ONE",start:0,end:2,nav:true,pov:"Randy"});
assert.equal(rows[0].side,"outgoing");
assert.equal(rows[0].speakerLabel,"RANDY");
assert.equal(rows[0].text,"Maybe. Do u wanna b sexted?");
assert.equal(rows[1].text,"I can wait.");
assert.deepEqual(state.pages.map(p=>p.text),original);

const els={bookTitle:{value:"Book"},bookAuthor:{value:"Author"}};
const manifest={};
class Zip {file(key,content){manifest[key]=content;return this}
  async generateAsync(){return {kind:"mock EPUB"}}}
let downloaded=false;
const exportBook=new Function("state","els","window","JSZip","crypto",
  "syncCurrentEditor","ensureItalicEvidenceProjected","normalizedPageText",
  "cleanFilename","chapterSections","escapeXml","sectionParagraphs",
  "paragraphToEpubHtml","downloadBlob",
  section("async function buildEpub()","async function downloadEpub()")+";return buildEpub;");
const escaped=value=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;");
async function testExport(){
  const fn=exportBook(state,els,{JSZip:Zip,OcrMessageBubbles:bubble},Zip,{randomUUID:()=>"test-id"},
    ()=>{},()=>{},x=>x,x=>x,()=>[{title:"CHAPTER ONE",start:0,end:2,nav:true,pov:"Randy"}],
    escaped,pageSections,value=>"<p>"+escaped(value)+"</p>",()=>{downloaded=true});
  await fn();
  const html=manifest["EPUB/chapter-001.xhtml"];
  assert.ok(downloaded);
  assert.ok(html.includes('class="message-group outgoing"'));
  assert.ok(html.includes('data-opal-narration="skip">RANDY</span>'));
  assert.ok(html.includes("<p id=\"p-1-2\" class=\"message-bubble\">Maybe. Do u wanna b sexted?</p>"));
  assert.ok(!html.includes("<p>RANDY</p>"));
  assert.ok(html.includes("<p id=\"p-1-3\">I can wait.</p>"));
  assert.ok(html.includes('data-opal-pov="Randy"'));
  assert.ok(manifest["EPUB/style.css"].includes(".message-group.incoming"));
  assert.deepEqual(state.pages.map(p=>p.text),original);
}
const checkpoint=section("function buildCheckpointPayload()","let projectCheckpointWriteChain");
const restoration=section("function applyCheckpoint(","function legacyCheckpointCandidates");
assert.ok(checkpoint.includes("messageBubbles:"));
assert.ok(restoration.includes("messageBubbles:"));
const ready=section("function kindleReadyChecks()","function renderKindleReady");
assert.ok(ready.includes('add("Reviewed text bubbles", staleBubbles ? "fail"'));
testExport().then(()=>console.log("Build 256: 18 bubble/export/retention checks passed"))
.catch(error=>{console.error(error);process.exitCode=1;});
