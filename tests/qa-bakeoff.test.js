"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const core=require("../qa-bakeoff-core.js");
const manifest={format:"book-ocr-studio-ai-qa-benchmark-v1",book:"Synthetic Test",pages:[
  {pageId:"p0001",sourceImage:"images/p0001.jpg",anchors:[
    {id:"p0001-w01",text:"fi rst"},
    {id:"p0001-w02",text:"“I’m here.”"}
  ]},
  {pageId:"p0002",sourceImage:"images/p0002.jpg",anchors:[
    {id:"p0002-w01",text:"sneke"},{id:"p0002-control-01",text:"No typo here."}
  ]}
]};
assert.deepEqual(core.validateBlind(manifest),{pages:2,anchors:4});
assert.throws(()=>core.validateBlind({...manifest,pages:[manifest.pages[0],manifest.pages[0]]}),/Invalid/);
const gold={answers:{
  "p0001-w01":{pageId:"p0001",original:"fi rst",expected:"first"},
  "p0001-w02":{pageId:"p0001",original:'"I\'m here."',expected:"“I’m here.”"},
  "p0002-w01":{pageId:"p0002",original:"sneke",expected:"snake"},
  "p0002-control-01":{pageId:"p0002",original:"No typo here.",expected:"No typo here."}
}};
const before=JSON.stringify(gold);
const r=core.score(gold,{model:"example",results:[
  {pageId:"p0001",changes:[{id:"p0001-w01",corrected:"first"},{id:"p0001-w02",corrected:"“I’m here.”"}]},
  {pageId:"p0002",changes:[{id:"p0002-w01",corrected:"sneak"},{id:"p0002-control-01",corrected:"No typo!"}]}
],usage:{cost:0.0012}});
assert.equal(r.pages,2);
assert.equal(r.anchors,4);
assert.equal(r.correct,2);
assert.equal(r.wrong,1);
assert.equal(r.falsePositive,1);
assert.equal(r.substantiveTotal,2);
assert.equal(r.substantiveCorrect,1);
assert.equal(r.typographyTotal,1);
assert.equal(r.typographyCorrect,1);
assert.equal(r.controlSpecificity,0);
assert.equal(r.costUsd,0.0012);
assert.equal(JSON.stringify(gold),before,"scorer cannot modify answers");
const partial=core.score(gold,{model:"example",results:[{pageId:"p0001",changes:[]}]});
assert.equal(partial.pages,1);
assert.equal(partial.anchors,2);
assert.equal(partial.controls,0);
assert.equal(partial.missed,2);
assert.equal(core.canon('“Don’t…”'),core.canon('"Don\'t..."'));
const invalid=core.score(gold,{results:[
  {pageId:"p0001",changes:[{id:"p0002-w01",corrected:"snake"}]},
  {pageId:"p0001",changes:[]}]});
assert.equal(invalid.invalid,2);
const root=path.join(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
const script=fs.readFileSync(path.join(root,"script.js"),"utf8");
const worker=fs.readFileSync(path.join(root,"cloudflare/openrouter-qa-relay.js"),"utf8");
const browser=fs.readFileSync(path.join(root,"qa-bakeoff-ui.js"),"utf8");
for(const id of ["qaBakeoffBlind","qaBakeoffGold","qaBakeoffModel","qaBakeoffEndpoint",
  "qaBakeoffToken","qaBakeoffRun","qaBakeoffCheckKey","qaBakeoffStop","qaBakeoffExport","qaBakeoffImport","qaBakeoffResults"])
 assert.ok(html.includes('id="'+id+'"'),"Missing UI "+id);
assert.ok(html.includes("qa-bakeoff-core.js?v=264")&&html.includes("qa-bakeoff-ui.js?v=266"));
assert.ok(sw.includes("qa-bakeoff-core.js?v=264")&&sw.includes("qa-bakeoff-ui.js?v=266"));
assert.ok(script.includes('const BUILD_VERSION = "266"'));
assert.ok(worker.includes('env.OPENROUTER_API_KEY'));
assert.ok(worker.includes('env.QA_ACCESS_TOKEN'));
assert.ok(worker.includes('url.pathname==="/key-check"'), "Authenticated key-check route must exist");
assert.ok(worker.includes('/api/v1/key'), "Key check must use non-generative OpenRouter endpoint");
assert.ok(worker.includes('upstreamStatus:code'), "Model errors must expose sanitized upstream status");
assert.ok(worker.includes('data_collection:"deny",zdr:true,require_parameters:true'));
assert.ok(worker.includes('const MODELS=new Set'));
assert.ok(worker.includes('Access-Control-Allow-Origin'));
assert.ok(!worker.includes('YOUR_ACTUAL_OPENROUTER_KEY'));
assert.ok(browser.includes('Gold files are read in memory locally'));
assert.ok(browser.includes('body:JSON.stringify({model:ui.model.value,pageId:page.pageId,'));
assert.ok(!browser.includes('JSON.stringify({gold'));
assert.ok(browser.includes('localStorage.setItem'));
assert.ok(browser.includes("Latest: "), "Failure details must persist visibly after reload");
assert.ok(browser.includes("if(failed)"), "Failure must not be overwritten by a completion message");
assert.ok(browser.includes('slice(0,3)'),"paid calls must remain at most three per confirmation");
console.log("Build 264: blind/private scoring, partial runs, false positives, safe opt-in UI and relay guards passed");
