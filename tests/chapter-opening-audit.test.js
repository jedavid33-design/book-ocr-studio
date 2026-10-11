"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {audit}=require("../chapter-opening-audit.js");
const pages=[
 {text:"PROLOGUE\n\nLILY\n\nI was ready.",chapterStart:true,chapterTitle:"Prologue",chapterPov:"Lily"},
 {text:"CHAPTER 1\n\nLILY\n\nonce upon a time.",chapterStart:true,chapterTitle:"Chapter 1",chapterPov:"Lily"},
 {text:"CHAPTER 3\n\nHe opened the door.",chapterStart:true,chapterTitle:"Chapter 3",chapterPov:""},
 {text:"CHAPTER 4\n\nText",chapterCandidate:true},
 {text:"CHAPTER 4\n\nRANDY\n\nIt happened.",chapterStart:true,chapterTitle:"Chapter 4",chapterPov:"Randy"}
];
const before=JSON.stringify(pages);
const result=audit(pages);
assert.equal(result.chapterCount,4);
assert.equal(result.flaggedChapters,2);
assert.equal(result.candidateCount,1);
assert.ok(result.rows[1].issues.some(x=>x.includes("lowercase")));
assert.ok(result.rows[2].issues.some(x=>x.includes("numbering jumps")));
assert.ok(result.rows[2].issues.some(x=>x.includes("POV")));
assert.equal(JSON.stringify(pages),before,"Audit must not modify book");
assert.equal(audit([]).chapterCount,0);
assert.equal(audit([{text:"CHAPTER 1\n\nFirst line.",chapterStart:true,chapterTitle:"Chapter 1"}]).flaggedChapters,0);
const index=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const source=fs.readFileSync(path.join(__dirname,"..","script.js"),"utf8");
for(const id of ["runChapterAudit","chapterAuditStatus","chapterAuditResults"])assert.ok(index.includes('id="'+id+'"'));
assert.ok(index.includes("chapter-opening-audit.js?v=258"));
assert.ok(source.includes("window.OcrChapterAudit.audit(state.pages)"));
const version=source.match(/const BUILD_VERSION = "(\\d+)"/);
assert.ok(version && Number(version[1])>=258,"Chapter audit requires Build 258+");
console.log("Build 258 chapter opening inventory checks passed");
