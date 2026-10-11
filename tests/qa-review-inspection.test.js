"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const review=require("../qa-review-inspection.js");
const queue=require("../prioritized-qa-queue.js");
const pages=[
 {file:{name:"IMG_001.png"},text:"First page.",chapterStart:true,chapterTitle:"Prologue",
  chapterPov:"Lily",messageBubbles:[]},
 {file:{name:"IMG_002.png"},text:"fi rst",chapterStart:false,chapterTitle:"",messageBubbles:[]},
 {file:{name:"IMG_003.png"},text:"Normal",chapterStart:false,messageBubbles:[]}
];
const initial=JSON.stringify(pages);
assert.equal(review.status(pages[0]),"pending");
assert.throws(()=>review.mark(pages[0],{sourceAttached:false}),/Original screenshot/);
const stamp=review.mark(pages[0],{sourceAttached:true,now:"2026-10-11T21:00:00.000Z"});
assert.equal(stamp.at,"2026-10-11T21:00:00.000Z");
assert.equal(stamp.schema,"human-source-inspection-v1");
assert.equal(JSON.stringify(pages),initial,"mark() must never mutate page");
pages[0].reviewInspection=stamp;
assert.equal(review.status(pages[0]),"inspected");
assert.deepEqual(review.counts(pages),{inspected:1,pending:2,stale:0});
const book=JSON.parse(JSON.stringify(pages));
assert.equal(review.status(book[0]),"inspected","checkpoint roundtrip must retain explicit evidence");
book[0].chapterPov="Randy";
assert.equal(review.status(book[0]),"stale","POV edits invalidate old inspection");
book[0].chapterPov="Lily";
assert.equal(review.status(book[0]),"inspected","same snapshot is still exact");
book[0].text+=" new text";
assert.equal(review.status(book[0]),"stale","text edits invalidate inspection");
const metadata=JSON.parse(JSON.stringify(pages[0]));
metadata.messageBubbles=[{text:"Test message",side:"incoming"}];
assert.equal(review.status(metadata),"stale","text bubble edits invalidate inspection");
const title=JSON.parse(JSON.stringify(pages[0]));
title.chapterTitle="Chapter 1";
assert.equal(review.status(title),"stale","chapter changes invalidate inspection");
const file=JSON.parse(JSON.stringify(pages[0]));
file.file.name="Other edition.jpg";
assert.equal(review.status(file),"stale","different source file must invalidate inspection");
const report=queue.build({pages,wordReport:{findings:[
 {pageIndex:0,match:"F",suggestion:"F",reason:"sample"},
 {pageIndex:1,match:"fi rst",suggestion:"first",reason:"word split"},
 {pageIndex:2,match:"N",suggestion:"N",reason:"sample"}
]}});
assert.equal(review.next(report.ranked,pages,-1),1,"Next flagged skips previously inspected first page");
assert.equal(review.next(report.ranked,pages,1),2);
assert.equal(review.next(report.ranked,pages,2),1);
pages[1].reviewInspection=review.mark(pages[1],{sourceAttached:true});
pages[2].reviewInspection=review.mark(pages[2],{sourceAttached:true});
assert.equal(review.next(report.ranked,pages,0),-1,"completed flagged queue has no next page");
pages[0].text+=" new";
assert.equal(review.next(report.ranked,pages,1),0,"edited page is in queue again");
const root=path.resolve(__dirname,"..");
const main=fs.readFileSync(path.join(root,"script.js"),"utf8");
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
const css=fs.readFileSync(path.join(root,"styles.css"),"utf8");
assert.ok(main.includes("reviewInspection: p.reviewInspection?.schema"),"checkpoint must export inspection marker");
assert.ok(main.includes("reviewInspection: page.reviewInspection?.schema"),"checkpoint must restore inspection marker");
assert.ok(main.includes("saveCheckpoint();\n    renderPrioritizedQaQueue();"),"inspection must persist");
assert.ok(main.includes("window.OcrReviewInspection.mark(page,{sourceAttached:true})"));
assert.ok(main.includes('if(!isRealSourceFile(page.file||state.files[pageIndex]))'),"unattached source cannot be marked inspected");
assert.ok(main.includes("const inspectButton=document.createElement"),"editor needs a direct review control");
assert.ok(index.includes('qa-review-inspection.js?v=267'),"helper must load");
assert.ok(sw.includes('qa-review-inspection.js?v=267'),"offline shell must cache helper");
assert.ok(index.includes('value="pending"')&&index.includes('value="inspected"'));
assert.ok(index.includes('class="review-working-area"'));
assert.ok(css.includes(".review-working-area{position:relative"),"sticky toolbar must be scoped to page editor");
const auditTop=index.indexOf("Prioritized QA Review");
const ai=index.indexOf("AI QA Bake-off");
assert.ok(auditTop>=0&&ai>auditTop,"paid AI experiments should be below free audits");
assert.ok(index.includes("AI QA Bake-off · Parked"),"paid testing stays opt-in and parked");
assert.ok(!main.includes("OcrReviewInspection.status(page)==='inspected'&&page.qaApproved"),"inspection must not certify QA");
// Whole-book and optional paid audits stay outside the spoiler-free Review pane.
const reviewStart=index.indexOf('id="reviewSection"');
const reviewArea=index.indexOf('<div class="review-working-area">',reviewStart);
const labStart=index.indexOf('<details class="card lab-collapsible">',reviewArea);
const labEnd=index.indexOf('</main>',labStart);
assert.ok(reviewStart>=0&&reviewArea>reviewStart&&labStart>reviewArea&&labEnd>labStart);
assert.ok(!index.slice(reviewStart,reviewArea).includes('class="qa-queue-panel"'),"no book-wide audits above the page editor");
const labContent=index.slice(labStart,labEnd);
assert.ok(labContent.includes('<details class="lab-book-audits">'),"spoiler-risk tools must start collapsed in Lab");
for(const cls of ['qa-queue-panel','unified-audit-panel','chapter-audit-panel','word-audit-panel','qa-bakeoff-panel']){
  assert.ok(labContent.includes('class="'+cls+'"'),cls+" must live in Lab");
  assert.ok(!index.slice(reviewStart,labStart).includes('class="'+cls+'"'),cls+" must not appear in normal Review");
}
for(const id of ['qaQueueRun','qaQueueNext','unifiedAuditAfterOcr','unifiedAuditAfterQa','runChapterAudit','runWordAudit','qaBakeoffRun']){
  assert.equal(index.split('id="'+id+'"').length-1,1,id+" must still be wired exactly once");
}
assert.ok(index.includes('<div class="review-working-area">'),"normal page-by-page editor retained");
console.log("Build 267: source-backed manual inspection ledger, change invalidation, reviewer navigation and iPad scoping passed");
