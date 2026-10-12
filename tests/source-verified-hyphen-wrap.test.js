"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {shouldPreserveHyphen} = require("../ocr-hyphen-guard.js");

// Seven source-verified compounds from Pucked Over Chapter 1 EPUB reflow QA.
// The source really contains the terminal hyphen; the previous joiner removed it.
const printedWraps = [
  ["twelve-", "year-old cousin", "twelve-year-old cousin"],
  ["sweat-", "soaked jersey", "sweat-soaked jersey"],
  ["almost-", "changing seasons", "almost-changing seasons"],
  ["post-", "camping conversation", "post-camping conversation"],
  ["speed-", "walk home", "speed-walk home"],
  ["high-", "pitched voice", "high-pitched voice"],
  ["up-close-and-", "personal story", "up-close-and-personal story"]
];
for (const [left,right,expected] of printedWraps) {
  assert.equal(shouldPreserveHyphen(left,right),true,expected);
  assert.equal((shouldPreserveHyphen(left,right)?left:left.slice(0,-1))+right,expected);
}
assert.equal(shouldPreserveHyphen("A SWEAT-", "soaked jacket"),true,"case-insensitive source spellings");
for (const [left,right] of [
  ["drag-", "ging"], ["inter-", "planetary"], ["Some-", "other word"],
  ["sweat", "soaked"], ["sweat-", "soakedness"],
  ["sweat-", "Soaked"], ["some unrelated text-", "soaked"],
  ["sweat-", "\nsoaked"]
]) {
  assert.equal(shouldPreserveHyphen(left,right),false,"no guessed restoration for "+JSON.stringify([left,right]));
}
const root=path.resolve(__dirname,"..");
const script=fs.readFileSync(path.join(root,"script.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
const loader=fs.readFileSync(path.join(root,"script-loader.js"),"utf8");
assert.ok(script.includes('const BUILD_VERSION = "269"'));
assert.ok(script.includes('window.OcrHyphenGuard?.shouldPreserveHyphen?.(out, text) === true'));
assert.ok(script.includes('(keepPrintedHyphen ? out : out.slice(0, -1)) + text'));
assert.ok(html.includes('ocr-hyphen-guard.js?v=268'));
assert.ok(sw.includes('./ocr-hyphen-guard.js?v=268'));
assert.ok(sw.includes('book-ocr-studio-shell-v96'));
assert.ok(loader.includes('script.js?v=269'));
assert.ok(html.indexOf('ocr-hyphen-guard.js?v=268')<html.indexOf('script-loader.js?v=269'),
  "guard must load before the OCR app");
console.log("Build 268: seven verified compound wraps protected, ambiguous joins unchanged");
