"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {assemble}=require("../unified-book-audit.js");
const chapters=require("../chapter-opening-audit.js");
const words=require("../word-boundary-audit.js");
const pages=[
  {text:"CHAPTER 1\n\nLILY\n\nfi rst thing I did was wait- ing,then leaving.",chapterStart:true,chapterTitle:"Chapter 1",chapterPov:"Lily"},
  {text:"Some other text.",chapterStart:false,chapterCandidate:true},
  {text:"",chapterStart:false}
];
const copy=JSON.stringify(pages);
const chapterReport=chapters.audit(pages);
const wordReport=words.audit(pages);
const polishReport={issues:[{pageIndex:0,type:"Terminal punctuation",detail:"Check screenshot.",current:"waiting"}],checks:[]};
const args={pages,chapterReport,wordReport,polishReport};
const before=assemble({stage:"afterOcr",...args});
assert.equal(before.stage,"afterOcr");
assert.equal(before.scannedPages,3);
assert.equal(before.summary.exportBlockers,null);
assert.equal(before.summary.exportReady,null);
assert.equal(before.preflightChecks.length,0);
assert.ok(before.summary.reviewLeads>=5);
assert.ok(before.groups.find(g=>g.id==="chapter").count>=2);
assert.equal(before.groups.find(g=>g.id==="empty").items[0].pageIndex,2);
assert.ok(before.groups.find(g=>g.id==="word").items.some(i=>i.title.includes("fi rst")));
const preflightReport={checks:[
  {name:"Italic markup",status:"fail",detail:"One unclosed marker."},
  {name:"Cover",status:"warn",detail:"No cover."},
  {name:"Chapter navigation",status:"pass",detail:"Ready."}
]};
const after=assemble({stage:"afterQa",...args,preflightReport});
assert.equal(after.summary.exportBlockers,1);
assert.equal(after.summary.exportWarnings,1);
assert.equal(after.summary.exportReady,false);
assert.equal(after.preflightChecks.length,3);
const ready=assemble({stage:"afterQa",...args,preflightReport:{checks:[{name:"Text",status:"pass",detail:"ok"}]}});
assert.equal(ready.summary.exportReady,true);
assert.equal(ready.summary.exportBlockers,0);
const unavailable=assemble({stage:"afterQa",...args});
assert.equal(unavailable.summary.exportReady,null);
assert.equal(unavailable.summary.exportBlockers,null);
assert.equal(unavailable.summary.exportWarnings,null);
assert.throws(()=>assemble({stage:"not-a-stage",pages}),/Unknown/);
assert.equal(JSON.stringify(pages),copy,"unified audit may never change saved book data");
const index=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const main=fs.readFileSync(path.join(__dirname,"..","script.js"),"utf8");
const sw=fs.readFileSync(path.join(__dirname,"..","sw.js"),"utf8");
for(const id of ["unifiedAuditAfterOcr","unifiedAuditAfterQa","unifiedAuditExport","unifiedAuditStatus","unifiedAuditResults"]){
  assert.ok(index.includes('id="'+id+'"'),"missing UI "+id);
}
assert.ok(index.includes("unified-book-audit.js?v=260"));
assert.ok(sw.includes("./unified-book-audit.js?v=260"));
const version=main.match(/const BUILD_VERSION = "([0-9]+)"/);
assert.ok(version&&Number(version[1])>=260,"Unified audit requires Build 260+");
assert.ok(main.includes("kindleReadyChecks({readOnly:true})"),"must use non-mutating preflight");
assert.ok(main.includes("if (!readOnly) {"),"read-only preflight must bypass side effects");
assert.ok(main.includes("finalPolishAudit({"),"must reuse existing Final Polish checks");
assert.ok(!main.includes("showUnifiedBookAudit(\"afterQa\"); syncCurrentEditor()"));
console.log("Build 260: both read-only checkpoints, real blockers, null preflight, and UI wiring passed");
