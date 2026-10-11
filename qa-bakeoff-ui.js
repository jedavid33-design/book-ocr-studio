// Build 264: opt-in 3-page OpenRouter model audition, with private reference scoring.
// This file NEVER stores API keys. Only a user's separately deployed relay has the key.
// Gold files are read in memory locally and are NEVER attached to fetch requests.
(()=>{
 "use strict";
 const $=id=>document.getElementById(id);
 if(!$("qaBakeoffBlind"))return;
 const ui={
  blind:$("qaBakeoffBlind"),gold:$("qaBakeoffGold"),
  model:$("qaBakeoffModel"),endpoint:$("qaBakeoffEndpoint"),token:$("qaBakeoffToken"),
  run:$("qaBakeoffRun"),stop:$("qaBakeoffStop"),export:$("qaBakeoffExport"),
  import:$("qaBakeoffImport"),status:$("qaBakeoffStatus"),results:$("qaBakeoffResults")
 };
 const core=window.OcrQaBakeoffCore;
 let blind=null,gold=null,running=false,stop=false,records=new Map();
 const key=model=>"ocrStudio.qaBakeoff.264."+blind?.book+"."+blind?.pages?.length+"."+model;
 function setStatus(s){ui.status.textContent=s;}
 function current(){
  const model=ui.model.value;
  if(records.has(model))return records.get(model);
  let obj=null;
  if(blind){
   try{obj=JSON.parse(localStorage.getItem(key(model))||"null");}catch{}
  }
  if(!obj||obj.model!==model||!Array.isArray(obj.results))obj={
   format:"book-ocr-studio-openrouter-results-v1",model,results:[],
   usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0,cost:0},errors:[]
  };
  records.set(model,obj);
  return obj;
 }
 function persist(){
  try{localStorage.setItem(key(ui.model.value),JSON.stringify(current()));return true;}
  catch(e){setStatus("Browser storage was full. Export the model results now to avoid losing this run.");return false;}
 }
 function render(){
  const root=ui.results;
  root.replaceChildren();
  ui.export.disabled=!blind||!current().results.length||running;
  ui.run.disabled=!blind||running;
  ui.stop.disabled=!running;
  ui.model.disabled=running;
  ui.blind.disabled=running;
  ui.gold.disabled=running;
  ui.import.disabled=running;
  if(!blind)return;
  const obj=current();
  const p=document.createElement("p");
  p.textContent=blind.pages.length+" blind page images · "+
   blind.pages.reduce((sum,row)=>sum+row.anchors.length,0)+" OCR snippets · "+
   obj.results.length+" pages tested for "+ui.model.value;
  root.appendChild(p);
  const note=document.createElement("p");
  note.className="hint";
  note.textContent="Private gold answers never leave this device. No API call happens until you tap Run. "+
   "This checks correction snippets, not complete-page visual QA.";
  root.appendChild(note);
  if(gold){
   try{
    const report=core.score(gold,obj);
    const metrics=[
      ["Exact corrections",report.correct+" / "+(report.correct+report.missed+report.wrong)],
      ["Substantive OCR corrections",report.substantiveCorrect+" / "+report.substantiveTotal],
      ["Typography corrections",report.typographyCorrect+" / "+report.typographyTotal],
      ["False changes to controls",report.falsePositive+" / "+report.controls],
      ["Unmatched/invalid IDs",String(report.invalid)],
      ["Reported API cost",obj.usage.cost?"$"+Number(obj.usage.cost).toFixed(4):"Not reported / $0 recorded"]
    ];
    const table=document.createElement("div");table.className="qa-bakeoff-metrics";
    for(const [label,val] of metrics){
      const item=document.createElement("div");
      const a=document.createElement("small");a.textContent=label;
      const b=document.createElement("strong");b.textContent=val;
      item.append(a,b);table.appendChild(item);
    }
    root.appendChild(table);
    if(report.examples.length){
      const example=document.createElement("p");example.className="hint";
      example.textContent="Review candidates: "+
        report.examples.slice(0,6).map(x=>x.pageId+" "+x.outcome).join(" · ");
      root.appendChild(example);
    }
   }catch(error){
    const err=document.createElement("p");err.textContent="Score unavailable: "+error.message;root.appendChild(err);
   }
  }
  if(obj.errors?.length){
   const err=document.createElement("p");
   err.className="qa-bakeoff-warning";
   const last=obj.errors[obj.errors.length-1];
   const suffix=last?.status?" (HTTP "+last.status+")":"";
   err.textContent=obj.errors.length+" failed call(s). Latest: "+
     String(last?.pageId||"unknown page")+": "+String(last?.error||"Unknown error")+suffix+
     ". No pages were credited for failed calls.";
   root.appendChild(err);
  }
 }
 async function uploadBlind(event){
  const file=event.target.files?.[0];if(!file)return;
  try{
   const zip=await JSZip.loadAsync(file);
   if(zip.file("reference/gold.json"))throw new Error("This ZIP includes answers. Use the BLIND ZIP, not the reference file.");
   const item=zip.file("blind/benchmark.json");
   if(!item)throw new Error("Blind manifest missing.");
   const manifest=JSON.parse(await item.async("string"));
   const count=core.validateBlind(manifest);
   if(count.pages>100||count.anchors>6000)throw new Error("Pilot is too large.");
   for(const page of manifest.pages)if(!zip.file(page.sourceImage))throw new Error("Missing "+page.sourceImage);
   blind={...manifest,zip};
   records.clear();gold=null;ui.gold.value="";
   setStatus("Loaded "+count.pages+" pages, "+count.anchors+" blind OCR snippets. No files sent.");
   render();
  }catch(error){blind=null;records.clear();setStatus("Could not load blind file: "+error.message);render();}
 }
 async function uploadGold(event){
  const file=event.target.files?.[0];if(!file)return;
  try{
   const zip=await JSZip.loadAsync(file);
   const item=zip.file("reference/gold.json");
   if(!item)throw new Error("Reference answer key missing.");
   const answer=JSON.parse(await item.async("string"));
   if(answer.format!=="book-ocr-studio-ai-qa-gold-v1"||!answer.answers)
     throw new Error("Invalid private reference.");
   if(blind && Object.keys(answer.answers).some(id=>
     !blind.pages.some(p=>p.anchors.some(a=>a.id===id))))
     throw new Error("This private reference does not match the selected blind benchmark.");
   gold=answer;
   setStatus("Private ground truth loaded locally. It will NOT be sent to OpenRouter.");
   render();
  }catch(error){gold=null;setStatus("Reference error: "+error.message);render();}
 }
 function canonicalEndpoint(value){
  const u=new URL(value);
  if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash)
    throw new Error("Use an HTTPS Worker URL without credentials or query parameters.");
  return u.href.replace(/\/$/,"")+"/qa";
 }
 async function run(){
  if(running||!blind)return;
  let endpoint;
  try{endpoint=canonicalEndpoint(ui.endpoint.value.trim());}
  catch(error){setStatus("Configure your secure Cloudflare QA Worker URL. "+error.message);return;}
  if(!ui.token.value.trim()){setStatus("Enter the Worker access token. Do NOT enter an OpenRouter API key.");return;}
  const obj=current();
  const finished=new Set(obj.results.map(x=>x.pageId));
  const queue=blind.pages.filter(p=>!finished.has(p.pageId)).slice(0,3);
  if(!queue.length){setStatus("All 41 pages have been attempted for this model. Export its results.");return;}
  if(!confirm("Send "+queue.length+" page image(s) and OCR snippets to OpenRouter via your private Worker? "+
    "Requests can incur usage charges. The gold EPUB/answers will NOT be uploaded."))return;
  running=true;stop=false;render();
  let failed=false;
  try{
   for(let i=0;i<queue.length;i++){
    if(stop)break;
    const page=queue[i];
    setStatus("Paid AI run: "+page.pageId+" ("+(i+1)+"/"+queue.length+") …");
    const jpg=await blind.zip.file(page.sourceImage).async("base64");
    const start=performance.now();
    const resp=await fetch(endpoint,{method:"POST",
      headers:{"Content-Type":"application/json","X-QA-Token":ui.token.value.trim()},
      body:JSON.stringify({model:ui.model.value,pageId:page.pageId,
        anchors:page.anchors,imageDataUrl:"data:image/jpeg;base64,"+jpg})});
    if(!resp.ok){
      let explanation="HTTP "+resp.status;
      try{const e=await resp.json();explanation=e.error||explanation;}catch{}
      obj.errors.push({pageId:page.pageId,error:explanation,status:resp.status});
      persist();setStatus(page.pageId+" failed (HTTP "+resp.status+"): "+explanation+
        ". No further paid requests made.");
      failed=true;
      break;
    }
    const data=await resp.json();
    if(data.pageId!==page.pageId||data.model!==ui.model.value||
       !Array.isArray(data.changes))throw new Error("Unexpected Worker response.");
    const expected=new Set(page.anchors.map(a=>a.id));
    const seen=new Set();
    for(const change of data.changes){
      if(!expected.has(change.id)||seen.has(change.id)||
         typeof change.corrected!=="string")
        throw new Error("Model returned invalid or duplicate correction IDs.");
      seen.add(change.id);
    }
    obj.results.push({pageId:page.pageId,changes:data.changes,
      latencySeconds:Math.round((performance.now()-start)/100)/10});
    for(const k of ["prompt_tokens","completion_tokens","total_tokens","cost"])
      obj.usage[k]=(Number(obj.usage[k])||0)+(Number(data.usage?.[k])||0);
    persist();
    render();
   }
   if(failed){
     // Keep the reason for the failed call visible instead of showing a false success.
   }else if(!stop)setStatus(obj.results.length+" pages completed for "+obj.model+
     ". Export results or run the next three pages.");
   else setStatus("Stopped between requests. Existing page results are preserved locally.");
  }catch(error){
   const explanation=String(error?.message||"Unknown connection error");
   obj.errors.push({pageId:queue.find(page=>!obj.results.some(x=>x.pageId===page.pageId))?.pageId||"unknown",
     error:"Connection interrupted: "+explanation});
   persist();
   setStatus("Model run interrupted: "+explanation+"; completed pages remain in local storage.");
  }finally{running=false;render();}
 }
 function exportResults(){
  if(!blind)return;
  const obj=current();
  const filename="Pucked_Over_QA_"+ui.model.value.replace(/[^a-z0-9]+/gi,"_")+".json";
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
 }
 async function importResults(event){
  const file=event.target.files?.[0];if(!file)return;
  try{
   const parsed=JSON.parse(await file.text());
   if(!blind||!Array.isArray(parsed?.results)||!parsed.model)
     throw new Error("Load the blind benchmark first, then a valid model-results JSON.");
   const ids=new Set(blind.pages.map(x=>x.pageId));
   if(parsed.results.some(x=>!ids.has(x.pageId)))throw new Error("Different benchmark pages.");
   records.set(parsed.model,parsed);
   const option=[...ui.model.options].find(x=>x.value===parsed.model);
   if(option)ui.model.value=parsed.model;
   persist();setStatus("Loaded "+parsed.results.length+" saved model pages.");
   render();
  }catch(error){setStatus("Could not import results: "+error.message);}
 }
 ui.blind.addEventListener("change",uploadBlind);
 ui.gold.addEventListener("change",uploadGold);
 ui.model.addEventListener("change",()=>{render();setStatus("Ready to audition "+ui.model.value);});
 ui.run.addEventListener("click",run);
 ui.stop.addEventListener("click",()=>{stop=true;setStatus("Stopping after current page request…");});
 ui.export.addEventListener("click",exportResults);
 ui.import.addEventListener("change",importResults);
 render();
})();
