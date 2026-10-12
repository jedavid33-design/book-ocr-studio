"use strict";
// Build 271: source-approved layout is applied atomically, without guessing
// or removing manuscript words; old chapter QA packages remain valid.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const layout=require("../qa-layout-import.js");
const bubbles=require("../message-bubbles.js");
const chapter=(n,from,to,decisions)=>({
  chapter:{number:n,reviewedPageRange:{startPageId:from,endPageId:to}},
  ...(decisions===undefined?{}:{layout:{decisions}})
});
const mk=(id,type,pageId,rest)=>({layoutId:id,type,pageId,sourceVerified:true,...rest});
const tests=[
 mk("m1","message_bubble","p0002",{paragraph:"Leaving work in 10!",side:"incoming",senderLabel:"VIOLET"}),
 mk("m2","message_bubble","p0002",{paragraph:"Home soon!",side:"incoming",senderLabel:"VIOLET"}),
 mk("s1","scene_break","p0003",{before:"A paragraph before.",after:"Another paragraph after."}),
 mk("l1","letter_block","p0001",{startText:"Dear person,",endText:"Yours truly."})
];
const chapters=[chapter(1,"p0001","p0003",tests)];
const original=[
 {text:"Narration introducing a letter: Dear person,\n\nLetter body.\n\nYours truly.\n\nAfterward.",messageBubbles:[]},
 {text:"I got a reply: VIOLET\n\nLeaving work in 10!\n\nAnother reply: VIOLET\n\nHome soon!",messageBubbles:[]},
 {text:"A paragraph before.\n\nAnother paragraph after.",messageBubbles:[]}
];
const clone=()=>structuredClone(original);
assert.deepEqual(layout.validateShape([chapter(1,"p0001","p0003")],3),[]);
assert.deepEqual(layout.validateShape(chapters,3),[]);
let pages=clone();
let result=layout.apply(pages,chapters,bubbles);
assert.equal(result.errors.length,0,JSON.stringify(result.errors));
assert.equal(result.requested,4);
assert.equal(result.applied,4);
assert.equal(result.alreadyPresent,0);
assert.equal(pages[1].messageBubbles.length,2);
assert.ok(pages[2].text.includes("\n\n* * *\n\n"));
assert.ok(pages[0].text.includes("\n\n[[letter]]\n\nDear person,"));
assert.ok(pages[0].text.includes("Yours truly.\n\n[[/letter]]"));
assert.ok(pages[0].text.includes("Narration introducing a letter:"));
assert.ok(pages[0].text.includes("Afterward."));
const saved=JSON.stringify(pages);
result=layout.apply(pages,chapters,bubbles);
assert.equal(result.errors.length,0);
assert.equal(result.applied,0);
assert.equal(result.alreadyPresent,4);
assert.equal(JSON.stringify(pages),saved,"re-import must not double insert or duplicate bubbles");
// A missed paragraph is a hard conflict, not an invented bubble.
let conflict=clone();
conflict[1].text=conflict[1].text.replace("Home soon!","Later!");
result=layout.apply(conflict,chapters,bubbles);
assert.equal(result.errors.length,1);
assert.equal(result.errors[0].opId,"m2");
assert.equal(layout.validateShape([chapter(1,"p0001","p0003",[
  mk("bad","message_bubble","p0002",{paragraph:"Home soon!",side:"unknown"})
])],3).length,1);
assert.ok(layout.validateShape([chapter(1,"p0001","p0003",[
  mk("bad1","scene_break","p0004",{before:"a",after:"b"})
])],3).length>0);
assert.ok(layout.validateShape([chapter(1,"p0001","p0003",[
  {...tests[0],sourceVerified:false}
])],3).length>0);
assert.ok(layout.validateShape([chapter(1,"p0001","p0003",[
  {...tests[0]},{...tests[0]}
])],3).length>0);
// No silent substitution when narration and letter opening lack a source boundary.
pages=clone(); pages[0].text="Narration with Dear person,\n\nLetter body.\n\nYours truly.";
result=layout.apply(pages,chapters,bubbles);
assert.ok(result.errors.some(x=>x.opId==="l1"));
// The production importer performs all changes on workingPages and only commits
// after checking the same structuralMisses collection.
const script=fs.readFileSync(path.join(__dirname,"..","script.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const sw=fs.readFileSync(path.join(__dirname,"..","sw.js"),"utf8");
const start=script.indexOf("async function importTypographyAnnotationsFile(");
const end=script.indexOf("function exportOcrBackup()",start);
assert.ok(start>0 && end>start);
const importer=script.slice(start,end);
assert.ok(importer.indexOf("const layoutResult = window.OcrQaLayout.apply(")>0);
assert.ok(importer.indexOf("const layoutResult = window.OcrQaLayout.apply(")<
  importer.indexOf("if (structuralMisses.length || misses.length)"));
assert.ok(importer.indexOf("if (structuralMisses.length || misses.length)")<
  importer.indexOf("state.pages = workingPages"));
assert.ok(importer.includes("messageBubbles:Array.isArray(page.messageBubbles)"));
assert.ok(script.includes("window.OcrQaLayout.validateShape(chapters,totalPages)"));
assert.ok(html.includes('qa-layout-import.js?v=271'));
assert.ok(sw.includes('./qa-layout-import.js?v=271'));
console.log("Build 271: source-verified layout, conflict, idempotence and atomic import checks passed");
