"use strict";
// Reader-aware export regression, Build 255+ (Node, no browser).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

assert.ok(/const BUILD_VERSION = "(?:25[5-9]|2[6-9][0-9]|[3-9][0-9]{2})"/.test(source));
const exportStart = source.indexOf("async function buildEpub()");
const exportEnd = source.indexOf("async function downloadEpub()", exportStart);
assert.ok(exportStart >= 0 && exportEnd > exportStart, "EPUB exporter exists");
const exporter = source.slice(exportStart, exportEnd);
assert.ok(exporter.includes('class="scene-break" data-opal-scene-break="true"'),
  "scene breaks must carry the Reader pause marker");
assert.ok(exporter.includes('data-opal-pov='),
  "chapter narrator metadata must be retained");
assert.ok(!exporter.includes('class="scene-break" data-opal-narration="skip"'),
  "Reader must see scene-break nodes to insert pauses");

const readyStart = source.indexOf("function kindleReadyChecks()");
const readyEnd = source.indexOf("function renderKindleReady", readyStart);
assert.ok(readyStart >= 0 && readyEnd > readyStart);
const makeCheck = new Function("state", "els", "sections", "window", `
  const syncCurrentEditor=()=>{}, ensureItalicEvidenceProjected=()=>{},
        normalizedPageText=s=>String(s||"").trim(),
        chapterSections=()=>sections,
        getRepairReviewState=()=>({total:0}),
        finalPolishAudit=()=>({issues:[]});
  ${source.slice(readyStart, readyEnd)}
  return kindleReadyChecks().checks;
`);
const state = {pages:[
  {text:"Prologue",chapterStart:true},
  {text:"Chapter one",chapterStart:true}
], coverFile:{name:"cover.jpg"}};
const els = {bookTitle:{value:"Test book"},bookAuthor:{value:"Test author"}};
const status = chapters => makeCheck(state, els, chapters, {OcrMessageBubbles:{validate:()=>({stale:[],marked:0})},OcrSceneOrnaments:{sceneCount:()=>0,validate:()=>false}})
  .find(x => x.name === "Reader POV metadata")?.status;
assert.equal(status([
  {title:"Prologue",nav:true,pov:"Lily"},
  {title:"Chapter one",nav:true,pov:""}]), "warn");
assert.equal(status([
  {title:"Prologue",nav:true,pov:"Lily"},
  {title:"Chapter one",nav:true,pov:"Randy"}]), "pass");
assert.equal(status([
  {title:"Chapter one",nav:true,pov:""},
  {title:"Chapter two",nav:true,pov:""}]), "pass");
console.log("Reader-ready EPUB export: 5 checks passed");
