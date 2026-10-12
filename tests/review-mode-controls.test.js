"use strict";
// Build 270: Review navigation and button styling must never disagree.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const from = script.indexOf("function reviewIndices()");
const to = script.indexOf("function currentReviewTextarea()", from);
assert.ok(from >= 0 && to > from, "Review mode functions exist");
const button = () => {
  const names = new Set();
  const attrs = {};
  return {
    classList: {
      toggle: (cls, yes) => yes ? names.add(cls) : names.delete(cls),
      contains: cls => names.has(cls)
    },
    setAttribute: (name, value) => { attrs[name] = value; },
    getAttribute: name => attrs[name]
  };
};
const all = button(), chapters = button();
const els = { reviewAllBtn: all, reviewChaptersBtn: chapters };
const pages = [true, false, false, true, false].map(chapterStart => ({chapterStart, text:"Original OCR"}));
const state = { pages, reviewMode:"all", currentPageIndex:4 };
let renders = 0, status = "";
const funcs = new Function("state","els","renderReview","setStatus",
  script.slice(from,to) + ";return {reviewIndices,setReviewMode,syncReviewModeControls};"
)(state,els,()=>{renders++;},value=>{status=value;});
const beforeText = pages.map(p=>p.text);
funcs.syncReviewModeControls();
assert.equal(all.classList.contains("active"),true,"All pages initially active");
assert.equal(chapters.classList.contains("active"),false);
assert.equal(all.getAttribute("aria-pressed"),"true");
assert.equal(chapters.getAttribute("aria-pressed"),"false");
assert.deepEqual(funcs.reviewIndices(),[0,1,2,3,4]);
funcs.setReviewMode("chapters");
assert.equal(state.reviewMode,"chapters");
assert.deepEqual(funcs.reviewIndices(),[0,3]);
assert.equal(state.currentPageIndex,0,"nonchapter page moves to valid start");
assert.equal(all.classList.contains("active"),false);
assert.equal(chapters.classList.contains("active"),true);
assert.equal(all.getAttribute("aria-pressed"),"false");
assert.equal(chapters.getAttribute("aria-pressed"),"true");
assert.match(status,/chapter start/);
funcs.setReviewMode("all");
assert.deepEqual(funcs.reviewIndices(),[0,1,2,3,4]);
assert.equal(all.classList.contains("active"),true);
assert.equal(chapters.classList.contains("active"),false);
assert.equal(renders,2);
state.reviewMode="chapters"; // simulate restoration or another navigation tool
funcs.syncReviewModeControls();
assert.equal(chapters.classList.contains("active"),true,"restored selection synchronized");
assert.deepEqual(pages.map(p=>p.text),beforeText,"no OCR changes");
assert.ok(script.includes('els.reviewAllBtn?.addEventListener("click", () => setReviewMode("all"))'));
assert.ok(script.includes('els.reviewChaptersBtn?.addEventListener("click", () => setReviewMode("chapters"))'));
const nav = script.slice(script.indexOf("function updateNavigationControls()"),
  script.indexOf("function setPostOcrSectionsVisible("));
assert.ok(nav.includes("syncReviewModeControls();"),"render and recovery synchronize highlight");
assert.match(html,/<button class="chip active" id="reviewAllBtn"[^>]*aria-pressed="true"/);
assert.match(html,/<button class="chip" id="reviewChaptersBtn"[^>]*aria-pressed="false"/);
console.log("Build 270: Review mode toggle, highlight, recovery and text preservation passed");
