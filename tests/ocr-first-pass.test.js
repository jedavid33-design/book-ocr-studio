"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {repair}=require("../ocr-first-pass.js");
const raw="I was fi rst,then we saw fl owers. My assist. ant had an expres. sion of resent. ment;later we were fi nally on the fl oor.";
const result=repair(raw);
for(const pair of [
  ["fi rst","first"],["fl owers","flowers"],["assist. ant","assistant"],
  ["expres. sion","expression"],["resent. ment","resentment"],
  ["fi nally","finally"],["fl oor","floor"],["rst,then","rst, then"],["ment;later","ment; later"]
])assert.ok(result.text.includes(pair[1]),"Expected "+pair[1]);
assert.equal(result.changed,9);
assert.equal(result.changes.length,result.changed);
assert.ok(result.changes.every(c=>c.before && c.after && Number.isInteger(c.offset)));
assert.equal(repair(result.text).changed,0,"second pass must be idempotent");
assert.equal(repair(result.text).text,result.text);

const safeExamples=[
 "We were wait- ing, a name thenShe, and a deliberate double-name.",
 "Her dog was named Flowers, but NASA;ESA were abbreviations.",
 "A URL is https://example.com/a,b and email jane@example.com.",
 "Money 1,000 and 1;2 should not change.",
 "He said [[i]]fi rst[[/i]] and [[/i]]some[[i]] lines.",
 "Off ice is not always office. Leave it alone.",
 "His assistant. Ant was the name of a character.",
 "A paper stated:\n\nfi\nrst\n\nnot a single OCR line."
];
const unchanged=safeExamples.join("\n\n");
assert.equal(repair(unchanged).text,unchanged,
  "do not guess at word joins, markup boundaries, numbers, acronyms or cross-line repairs");
const cap=repair("Fi rst;Then FIRST,THEN");
assert.equal(cap.text,"First;Then FIRST,THEN");

const script=fs.readFileSync(path.join(__dirname,"..","script.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const sw=fs.readFileSync(path.join(__dirname,"..","sw.js"),"utf8");
const loader=fs.readFileSync(path.join(__dirname,"..","script-loader.js"),"utf8");
const current=script.match(/const BUILD_VERSION = "([0-9]+)"/);
assert.ok(current && Number(current[1])>=261,"First-pass repair requires Build 261+");
assert.ok(script.includes("index >= state.pages.length"),"only new OCR pages can receive fixes");
assert.ok(script.includes("window.OcrFirstPassRepair.repair(rawRecognizedText)"));
assert.ok(script.includes("ocrFirstPass:"));
assert.ok(script.includes("firstPass.changes"),"audit trail must survive checkpoint in layoutMeta");
assert.ok(script.includes("const text = firstPass.text"));
assert.ok(script.includes("firstPassLedger.appendChild(row)"));
assert.ok(html.includes('ocr-first-pass.js?v=261'));
assert.ok(sw.includes('./ocr-first-pass.js?v=261'));
const loaderRevision=loader.match(/script\.js\?v=([0-9]+)/);
assert.ok(loaderRevision && Number(loaderRevision[1])>=261,"The loader must include Build 261 or newer");
// Guard old imported/QA material from this new helper, even via explicit repair.
const firstPassCalls=script.match(/OcrFirstPassRepair\.repair\(/g)||[];
assert.equal(firstPassCalls.length,1,"the auto-joiner must run only at first OCR capture");
console.log("Build 261 first-pass OCR correction tests passed");
