"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const queue=require("../prioritized-qa-queue.js");
const chapter=require("../chapter-opening-audit.js");
const words=require("../word-boundary-audit.js");
const pages=[
  {text:"Normal text. No suspicious patterns.",chapterStart:false},
  {text:"Chapter 2\n\nfi rst,then I left.",chapterStart:true,chapterTitle:"Chapter 2",chapterPov:"Lily"},
  {text:""},
  {text:"The scene looked normal.",messageBubbles:[{text:"stale",occurrence:0,side:"outgoing"}]},
  {text:"Next page of writing.",chapterStart:false,chapterCandidate:true},
  {text:"Nothing special here."}
];
const snapshot=JSON.stringify(pages);
const chapterReport=chapter.audit(pages);
const wordReport=words.audit(pages);
const polishReport={issues:[
  {pageIndex:4,type:"Short paragraph",current:"Part",detail:"Tiny fragment"},
  {pageIndex:1,type:"Decorative marker candidate",current:"❧",detail:"Verify image divider"}
]};
const bubbleReports=[{stale:[]},{stale:[]},{stale:[]},{stale:[{text:"stale"}]},{stale:[]},{stale:[]}];
const report=queue.build({
 pages,chapterReport,wordReport,polishReport,bubbleReports,
 dropcapCandidates:[{pageIndex:1,status:"pending"}],
 typographyUncertain:[{pageIndex:4,resolution:null},{pageIndex:5,resolution:"roman"}]
});
assert.equal(report.pagesScanned,6);
assert.equal(report.counts.high,3);
assert.equal(report.counts.medium,1);
assert.equal(report.counts.unflagged,2);
assert.equal(report.flagged,4);
assert.equal(report.ranked[0].pageIndex,1);
assert.equal(report.ranked[0].priority,"high");
assert.equal(report.ranked[0].reasons.some(x=>x.kind==="word"),true);
assert.equal(report.ranked[1].priority,"high");
assert.ok(report.ranked.some(row=>row.pageIndex===3&&row.reasons.some(x=>x.kind==="bubble")));
assert.equal(report.ranked.some(row=>row.pageIndex===4&&row.reasons.some(x=>x.kind==="typography")),true);
assert.deepEqual(queue.visible(report,{filter:"high",order:"book"}).map(x=>x.pageIndex),[1,2,3]);
assert.deepEqual(queue.visible(report,{filter:"unflagged",order:"book"}).map(x=>x.pageIndex),[0,5]);
assert.deepEqual(queue.visible(report,{filter:"attention",order:"book"}).map(x=>x.pageIndex),[1,2,3,4]);
assert.equal(queue.visible(report,{filter:"attention"}).length,4);
assert.equal(queue.visible(report,{filter:"all"}).length,6);
assert.equal(report.unflaggedAreVerified,false);
assert.ok(report.ranked.every(row=>row.verifiedByThisQueue===false));
assert.equal(JSON.stringify(pages),snapshot,"queue must never modify authoritative page data");
const empty=queue.build({pages:[]});
assert.equal(empty.pagesScanned,0);
assert.equal(empty.flagged,0);
assert.equal(queue.visible(empty).length,0);
const bad=queue.build({pages:[{text:"Good"}],
  wordReport:{findings:[{pageIndex:999,match:"fi rst",suggestion:"first"}],omitted:4}});
assert.equal(bad.counts.unflagged,1,"out-of-range candidates must never create fake page rows");
assert.equal(bad.incompleteWordCoverage,true);
assert.equal(bad.omittedWordLeads,4);
const page=queue.build({pages:[{text:"Good"}],polishReport:{issues:Array.from({length:14},(_,i)=>({
  pageIndex:0,type:"Issue "+i,detail:"Check "+i
}))}});
assert.equal(page.ranked[0].flagCount,14);
assert.equal(page.ranked[0].reasons.length,8);
assert.equal(page.ranked[0].moreReasons,6);

const index=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const script=fs.readFileSync(path.join(__dirname,"..","script.js"),"utf8");
const sw=fs.readFileSync(path.join(__dirname,"..","sw.js"),"utf8");
const loader=fs.readFileSync(path.join(__dirname,"..","script-loader.js"),"utf8");
for(const id of ["qaQueueRun","qaQueueNext","qaQueueFilter","qaQueueSort","qaQueueStatus","qaQueueResults"])
 assert.ok(index.includes('id="'+id+'"'),"missing UI "+id);
assert.ok(index.includes('prioritized-qa-queue.js?v=263'));
assert.ok(sw.includes("./prioritized-qa-queue.js?v=263"));
const loaderBuild=loader.match(/script\.js\?v=([0-9]+)/);
assert.ok(loaderBuild&&Number(loaderBuild[1])>=263,"Priority QA needs loader Build 263+");
const runningBuild=script.match(/const BUILD_VERSION = "([0-9]+)"/);
assert.ok(runningBuild&&Number(runningBuild[1])>=263,"Priority QA needs Build 263+");
assert.ok(script.includes('window.OcrPrioritizedQaQueue.build('));
assert.ok(script.includes('suppressQaApproved:true,respectIgnored:true'),"avoid resurfacing approved Polish flags");
assert.ok(script.includes('maxFindings:20000,maxPerPage:500'),"aggregate broad whole-book word coverage");
assert.ok(script.includes('function flagQaQueueForRescan()'),"live edits must mark queue snapshot stale");
assert.ok(script.includes('setReviewMode("all")'),"page jumps must escape chapter-only review mode");
assert.ok(!script.includes("latestPrioritizedQaQueue=report;\n      saveCheckpoint()"),"queue must not save text/QA checkpoint");
console.log("Build 263 prioritized QA: pure ranking, exclusions, review links and no-state-mutation tests passed");
