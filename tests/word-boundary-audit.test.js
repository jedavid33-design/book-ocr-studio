"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {audit}=require("../word-boundary-audit.js");

const pages=[
 {text:"I saw fi rst and fl owers. Then I waited."},
 {text:"We were wait- ing, and thenShe said,then left."},
 {text:"He went to the market, then came home. Long-term planning; right! Yes."}
];
const snapshot=JSON.stringify(pages);
const out=audit(pages);
assert.equal(out.pagesScanned,3);
assert.equal(out.total,5);
assert.equal(out.omitted,0);
for(const phrase of ["fi rst","fl owers","wait- ing","thenShe","said,then"]){
 assert.ok(out.findings.some(r=>r.match===phrase),"missing "+phrase);
}
assert.equal(out.counts["split-ligature"],2);
assert.equal(out.counts["broken-hyphen"],1);
assert.equal(out.counts["glued-capital"],1);
assert.equal(out.counts["missing-punctuation-space"],1);
assert.equal(JSON.stringify(pages),snapshot,"scan cannot edit project text");
assert.equal(audit([]).total,0);
assert.equal(audit([{text:"She said fi rst. Next, she left."}],{maxFindings:0}).omitted,1);
assert.equal(audit([{text:"Some fi rst and fl owers."}],{maxPerPage:1}).omitted,1);
const normal=audit([{text:"The first flowers appeared. He waited, then left. This is long-term.\n\nCHAPTER 1"}]);
assert.equal(normal.total,0,"everyday prose should not be flagged");
const italian=audit([{text:"This is [[i]]fi rst[[/i]] and [[i]]fl owers[[/i]]."}]);
assert.equal(italian.total,2,"italic delimiters should not hide text candidates");
const index=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const script=fs.readFileSync(path.join(__dirname,"..","script.js"),"utf8");
for(const id of ["runWordAudit","wordAuditResults","wordAuditStatus","downloadWordAudit"]){
 assert.ok(index.includes('id="'+id+'"'),"UI missing "+id);
}
assert.ok(index.includes("word-boundary-audit.js?v=259"));
assert.ok(script.includes("window.OcrWordBoundaryAudit.audit(snapshot)"));
const version=script.match(/const BUILD_VERSION = "([0-9]+)"/);
assert.ok(version && Number(version[1])>=259,"Word audit requires Build 259+");
assert.ok(!fs.readFileSync(path.join(__dirname,"..","word-boundary-audit.js"),"utf8").includes(".text = "),"pure audit must not assign text");
console.log("Build 259 residual word-boundary audit: all fixtures passed");
