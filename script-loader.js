// Book OCR Studio 172 loader.
// Keeps the v158 READY-state repair and adds an experimental, parallel
// book-native Roman Residual validator. Production Hunt remains frozen at v157.

(async () => {
  const response = await fetch("./script.js?v=157", { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load script.js (${response.status})`);
  let source = await response.text();

  source = source.replace(
    '  const BUILD_VERSION = "157";',
    '  const BUILD_VERSION = "172";'
  );

  const reviewAnchor =
    '  els.prevPageBtn.addEventListener("click", goToPreviousPage);\n' +
    '  els.nextPageBtn.addEventListener("click", goToNextPage);';
  const reviewReplacement =
    '  els.reviewAllBtn.addEventListener("click", () => setReviewMode("all"));\n' +
    '  els.reviewChaptersBtn.addEventListener("click", () => setReviewMode("chapters"));\n' +
    reviewAnchor;
  if (!source.includes(reviewAnchor)) throw new Error("Review-toggle patch anchor not found.");
  source = source.replace(reviewAnchor, reviewReplacement);

  const readyAnchor =
    '      setStatus(`HELD-OUT VALIDATION READY · page-grouped ${pageHeldOut.foldCount||0} folds · ${pageHeldOut.totalHeldOutPositives||0} italics / ${pageHeldOut.totalHeldOutRomans||0} Roman · export the JSON for the honest baseline.`);\n' +
    '      return;';
  const readyReplacement =
    '      setItalicReviewReady("validation", state.italicCalibrationReviewSet?.length||0);\n' +
    '      setStatus(`HELD-OUT VALIDATION READY · page-grouped ${pageHeldOut.foldCount||0} folds · ${pageHeldOut.totalHeldOutPositives||0} italics / ${pageHeldOut.totalHeldOutRomans||0} Roman · export the JSON for the honest baseline.`);\n' +
    '      return;';
  if (!source.includes(readyAnchor)) throw new Error("Held-out READY patch anchor not found.");
  source = source.replace(readyAnchor, readyReplacement);

  const experimentCode = String.raw`

  async function exportLabeledWordCrops(){
    if(!state.pages.length||!state.files.length){setStatus("Recover the labeled screenshot project before exporting word crops.");return;}
    const profile=currentItalicLearningProfile();
    const labels=(profile.examples||[]).filter(x=>(x.label==="ITALIC"||x.label==="ROMAN")&&!x.fragment);
    if(!labels.length){setStatus("No persisted Roman/Italic labels are available to export.");return;}
    const byKey=new Map();
    for(const ex of labels){
      const key=romanResidualExampleKey(ex);if(!key)continue;
      if(!byKey.has(key))byKey.set(key,ex);
    }
    const manifest=[],files=[];
    for(let pageIndex=0;pageIndex<state.pages.length;pageIndex++){
      const page=state.pages[pageIndex],file=page.file||state.files[pageIndex];if(!file)continue;
      const wanted=[...byKey.entries()].filter(([k])=>k.startsWith(pageIndex+":"));
      if(!wanted.length)continue;
      setStatus("Export labeled word crops: page "+(pageIndex+1)+" of "+state.pages.length+"…");
      const img=await loadImageFromFile(file),canvas=makeCroppedCanvas(img);
      for(const [key,ex] of wanted){
        const parts=key.split(":").map(Number),line=page.layoutLines?.[parts[1]],word=line?.italicWordMeta?.[parts[2]];
        const box=ex.reviewBox||ex.box||word?.box;if(!box)continue;
        const pad=Math.max(2,Math.round(Number(box.h||box.height||20)*.18));
        const x=Math.max(0,Math.floor(Number(box.x||0)-pad)),y=Math.max(0,Math.floor(Number(box.y||0)-pad));
        const w=Math.min(canvas.width-x,Math.ceil(Number(box.w||box.width||0)+pad*2)),h=Math.min(canvas.height-y,Math.ceil(Number(box.h||box.height||0)+pad*2));
        if(w<2||h<2)continue;
        const crop=document.createElement("canvas");crop.width=w;crop.height=h;
        crop.getContext("2d",{alpha:false}).drawImage(canvas,x,y,w,h,0,0,w,h);
        const blob=await new Promise(resolve=>crop.toBlob(resolve,"image/png"));
        if(!blob)continue;
        const name=(ex.label==="ITALIC"?"italic":"roman")+"/"+String(manifest.length+1).padStart(5,"0")+"_"+pageIndex+"_"+parts[1]+"_"+parts[2]+".png";
        files.push({name,blob});
        manifest.push({file:name,label:ex.label,text:String(ex.normalizedText||ex.text||ex.specimenText||word?.text||""),pageIndex,lineIndex:parts[1],wordIndex:parts[2],sourceFile:file.name,box:{x,y,w,h},specimenId:String(ex.id||"")});
      }
      canvas.width=1;canvas.height=1;
    }
    if(!files.length){setStatus("No labeled word crops could be matched to the recovered screenshots.");return;}
    if(typeof JSZip==="undefined")throw new Error("JSZip is required for crop export.");
    const zip=new JSZip();
    for(const item of files)zip.file(item.name,item.blob);
    zip.file("manifest.json",JSON.stringify({format:"book-ocr-studio-labeled-word-crops-v1",buildVersion:BUILD_VERSION,exportedAt:new Date().toISOString(),count:manifest.length,italic:manifest.filter(x=>x.label==="ITALIC").length,roman:manifest.filter(x=>x.label==="ROMAN").length,source:"original screenshot crop",items:manifest},null,2));
    const out=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
    downloadBlob(out,"italic-labeled-word-crops-v172.zip");
    setStatus("LABELED WORD CROPS READY · "+manifest.filter(x=>x.label==="ITALIC").length+" Italic · "+manifest.filter(x=>x.label==="ROMAN").length+" Roman · original screenshot pixels.");
  }

  function romanResidualLetters(value){
    return [...new Set(String(value||"").normalize("NFKC").toLocaleLowerCase().match(/\p{L}/gu)||[])];
  }
  function romanResidualExampleKey(x){
    const tail=String(x?.id||"").split("::").pop()||"";
    const m=tail.match(/^([0-9]+):([0-9]+):([0-9]+):([0-9]+)$/);
    if(m)return [Number(m[1]),Number(m[2]),Number(m[3])].join(":");
    if(x?.sourcePage!=null&&x?.sourceLine!=null&&x?.startWordIndex!=null)
      return [Number(x.sourcePage),Number(x.sourceLine),Number(x.startWordIndex)].join(":");
    return "";
  }
  function romanResidualAttachedExamples(){
    const evidence=state.italicValidationEvidenceByPhysical instanceof Map?state.italicValidationEvidenceByPhysical:new Map();
    const examples=(currentItalicLearningProfile().examples||[]).filter(x=>(x.label==="ITALIC"||x.label==="ROMAN")&&!x.fragment);
    const attached=[];
    for(const x of examples){
      const key=romanResidualExampleKey(x),ev=evidence.get(key);
      if(!key||!ev)continue;
      attached.push({...x,__romanResidualKey:key,__romanResidualEvidence:ev});
    }
    return {examples,attached,evidence};
  }
  function romanResidualRunKey(r){
    return [Number(r?.pageIndex),Number(r?.lineIndex),Number(r?.startWordIndex)].join(":");
  }
  function romanResidualDiversityOrder(rows,scoreField){
    const sorted=[...rows].sort((a,b)=>Number(b[scoreField]??-1)-Number(a[scoreField]??-1));
    const rounds=[],counts=new Map();
    for(const row of sorted){
      const key=italicNormalizedSpecimenText(row.run)||romanResidualRunKey(row.run);
      const round=counts.get(key)||0;counts.set(key,round+1);
      if(!rounds[round])rounds[round]=[];
      rounds[round].push(row);
    }
    return rounds.flat();
  }
  function romanResidualMetrics(rows,scoreField){
    const ordered=romanResidualDiversityOrder(rows,scoreField);
    const positives=ordered.filter(x=>x.example.label==="ITALIC").length;
    const at=n=>{const top=ordered.slice(0,n),i=top.filter(x=>x.example.label==="ITALIC").length;return{n,italic:i,precision:top.length?i/top.length:0,recall:positives?i/positives:0};};
    let hit=0,ap=0;ordered.forEach((x,i)=>{if(x.example.label==="ITALIC"){hit++;ap+=hit/(i+1);}});
    return{total:ordered.length,positives,top20:at(20),top50:at(50),top100:at(100),top250:at(250),averagePrecision:positives?ap/positives:0,
      italicRanks:ordered.map((x,i)=>x.example.label==="ITALIC"?i+1:null).filter(Boolean)};
  }
  function romanResidualGroups(examples,kind){
    const groups=new Map();
    for(const x of examples){
      const key=kind==="token"
        ? (String(x.normalizedText||x.specimenText||"").normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim()||String(x.id))
        : String(x.sourceRunId||"legacy")+"::"+String(x.sourcePage);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(x);
    }
    const buckets=Array.from({length:5},()=>[]);
    [...groups.entries()].sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0])).forEach(([key,rows])=>{
      buckets.sort((a,b)=>a.length-b.length);
      buckets[0].push(...rows.map(x=>({x,group:key})));
    });
    return buckets;
  }
  function romanResidualModel(training,runByKey){
    const byLetter=new Map();
    for(const x of training){
      if(x.label!=="ROMAN"||x.fragment===true)continue;
      const run=runByKey.get(romanResidualExampleKey(x));
      const f=run?.pixelFeatures;if(!f)continue;
      const vec=[Number(f.leanConsistency),Number(f.inkOccupancy),Number(f.contourAsymmetry)];
      if(!vec.every(Number.isFinite))continue;
      for(const ch of romanResidualLetters(x.normalizedText||x.specimenText)){
        if(!byLetter.has(ch))byLetter.set(ch,[]);
        byLetter.get(ch).push(vec);
      }
    }
    const stats=new Map();
    for(const [ch,rows] of byLetter){
      if(rows.length<5)continue;
      const mean=[0,1,2].map(i=>rows.reduce((s,r)=>s+r[i],0)/rows.length);
      const sd=[0,1,2].map(i=>Math.max(1e-4,Math.sqrt(rows.reduce((s,r)=>s+(r[i]-mean[i])**2,0)/Math.max(1,rows.length-1))));
      stats.set(ch,{n:rows.length,mean,sd});
    }
    return stats;
  }
  function romanResidualScore(run,text,model){
    const f=run?.pixelFeatures;
    if(!f)return{score:null,letters:[],referenceCount:0};
    const vec=[Number(f.leanConsistency),Number(f.inkOccupancy),Number(f.contourAsymmetry)];
    if(!vec.every(Number.isFinite))return{score:null,letters:[],referenceCount:0};
    const evidence=[];
    for(const ch of romanResidualLetters(text)){
      const s=model.get(ch);if(!s)continue;
      const z=Math.sqrt(vec.reduce((sum,v,i)=>sum+Math.min(16,((v-s.mean[i])/s.sd[i])**2),0)/3);
      evidence.push({letter:ch,references:s.n,residual:z});
    }
    if(!evidence.length)return{score:null,letters:[],referenceCount:0};
    const residual=evidence.reduce((s,e)=>s+e.residual,0)/evidence.length;
    const score=1-Math.exp(-Math.max(0,residual)/1.5);
    return{score,letters:evidence,referenceCount:evidence.reduce((s,e)=>s+e.references,0),residual};
  }
  function buildRomanResidualFoldReport(kind,examples,runByKey){
    const folds=romanResidualGroups(examples,kind),foldReports=[],pooled=[];
    folds.forEach((bucket,foldIndex)=>{
      const held=bucket.map(z=>z.x),heldIds=new Set(held.map(x=>x.id));
      const training=examples.filter(x=>!heldIds.has(x.id));
      const model=romanResidualModel(training,runByKey);
      const rows=[];
      for(const example of held){
        const run=runByKey.get(romanResidualExampleKey(example));if(!run)continue;
        const rr=romanResidualScore(run,example.normalizedText||example.specimenText,model);
        if(rr.score==null)continue;
        const clone={...run,words:Array.isArray(run.words)?run.words.map(w=>({...w})):run.words,hiddenContext:run.hiddenContext?{...run.hiddenContext}:run.hiddenContext};
        const baseline=canonicalItalicCandidateScore(clone,{trainingExamples:training}).finalScore;
        rows.push({example,run,romanResidualScore:rr.score,baselineScore:baseline,combinedScore:.75*baseline+.25*rr.score,residual:rr.residual,letters:rr.letters,referenceCount:rr.referenceCount});
      }
      const trainGroups=new Set(training.map(x=>kind==="token"?(String(x.normalizedText||x.specimenText||"").normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim()):String(x.sourceRunId||"legacy")+"::"+String(x.sourcePage)));
      const testGroups=new Set(bucket.map(z=>z.group));
      const overlap=[...testGroups].filter(g=>trainGroups.has(g));
      const report={fold:foldIndex+1,training:training.length,heldOut:held.length,usable:rows.length,coverage:held.length?rows.length/held.length:0,
        referenceLetters:model.size,groupOverlap:overlap.length,baseline:romanResidualMetrics(rows,"baselineScore"),romanResidual:romanResidualMetrics(rows,"romanResidualScore"),combined:romanResidualMetrics(rows,"combinedScore")};
      foldReports.push(report);pooled.push(...rows.map(r=>({...r,fold:foldIndex+1})));
    });
    return{kind,foldCount:5,folds:foldReports,pooled:{usable:pooled.length,coverage:examples.length?pooled.length/examples.length:0,
      baseline:romanResidualMetrics(pooled,"baselineScore"),romanResidual:romanResidualMetrics(pooled,"romanResidualScore"),combined:romanResidualMetrics(pooled,"combinedScore")}};
  }
  function romanResidualWeightSweep(kind,examples,runByKey){
    const weights=[0,.05,.10,.15,.20,.25,.30,.40];
    const folds=romanResidualGroups(examples,kind),foldRows=[],pooledByWeight=new Map(weights.map(w=>[w,[]]));
    for(let fi=0;fi<folds.length;fi++){
      const test=folds[fi],testIds=new Set(test.map(x=>x.id)),training=examples.filter(x=>!testIds.has(x.id));
      const model=romanResidualModel(training,runByKey),baseRows=[];
      for(const wrapped of test){
        const example=wrapped.x;
        const run=runByKey.get(romanResidualExampleKey(example));if(!run)continue;
        const rr=romanResidualScore(run,example.normalizedText||example.specimenText,model);
        if(rr.score==null)continue;
        const clone={...run,words:Array.isArray(run.words)?run.words.map(w=>({...w})):run.words,hiddenContext:run.hiddenContext?{...run.hiddenContext}:run.hiddenContext};
        const baseline=canonicalItalicCandidateScore(clone,{trainingExamples:training}).finalScore;
        baseRows.push({example,run,baselineScore:baseline,romanResidualScore:rr.score,residual:rr.residual,letters:rr.letters,referenceCount:rr.referenceCount});
      }
      const byWeight={};
      for(const w of weights){
        const rows=baseRows.map(row=>({...row,sweepScore:(1-w)*row.baselineScore+w*row.romanResidualScore}));
        byWeight[String(w)]=romanResidualMetrics(rows,"sweepScore");
        pooledByWeight.get(w).push(...rows);
      }
      foldRows.push({fold:fi+1,heldOut:test.length,byWeight});
    }
    const pooled={};
    for(const w of weights)pooled[String(w)]=romanResidualMetrics(pooledByWeight.get(w),"sweepScore");
    return {kind,weights,folds:foldRows,pooled,
      specimenScores:[...pooledByWeight.get(.25)].map(row=>({id:row.example.id,label:row.example.label,key:romanResidualRunKey(row.run),text:italicNormalizedSpecimenText(row.run),baselineScore:row.baselineScore,romanResidualScore:row.romanResidualScore,residual:row.residual??null,referenceCount:row.referenceCount??null}))};
  }
  function runRomanResidualExperiment(){
    const attached=romanResidualAttachedExamples();
    const examples=attached.examples, reattached=attached.attached;
    const runs=state.italicCalibrationReviewSet||[],runByKey=new Map(runs.map(r=>[romanResidualRunKey(r),r]));
    for(const x of reattached){
      const run=runByKey.get(x.__romanResidualKey);
      if(run&&x.__romanResidualEvidence){
        run.pixelFeatures=x.__romanResidualEvidence.pixelFeatures||run.pixelFeatures;
        run.pixelItalicProbability=x.__romanResidualEvidence.pixelItalicProbability??run.pixelItalicProbability;
      }
    }
    if(!reattached.length){
      throw new Error("Roman Residual aborted: 0 persisted examples reattached to reconstructed physical OCR words.");
    }
    const reattachedRate=reattached.length/Math.max(1,examples.length);
    if(reattachedRate<0.5){
      throw new Error("Roman Residual aborted: unexpectedly low persisted-example reattachment ("+reattached.length+"/"+examples.length+", "+Math.round(reattachedRate*1000)/10+"%).");
    }
    const page=buildRomanResidualFoldReport("page",reattached,runByKey);
    const token=buildRomanResidualFoldReport("token",reattached,runByKey);
    const payload={format:"book-ocr-studio-roman-residual-experiment-v1",buildVersion:BUILD_VERSION,exportedAt:new Date().toISOString(),
      productionHuntChanged:false,baseline:"Frozen v157 canonical scoring; experimental ranks are offline only.",
      method:"Book-native Roman residual v1. Candidate Pixel Assist measurements are compared against Roman-only same-letter reference pools from the same screenshot project. Each word-level pixel vector contributes to each unique letter it contains; this is a letter-conditioned word-shape residual, not yet per-glyph segmentation.",
      thresholds:{minimumRomanReferencesPerLetter:5,combinedWeight:{baseline:.75,romanResidual:.25}},
      coverage:{eligibleExamples:examples.length,reattachedExamples:reattached.length,reattachedRate:examples.length?reattached.length/examples.length:0},
      pageGrouped:page,tokenGrouped:token,
      successGate:{targetTop100:"17-18+ italics in both grouping schemes, improvement across most page folds, no major top-250 collapse",passed:null}};
    const p100=page.pooled.combined.top100.italic,t100=token.pooled.combined.top100.italic;
    payload.successGate.passed=p100>=17&&t100>=17;
    state.romanResidualExperiment=payload;
    downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),"italic-roman-residual-v172.json");
    setStatus("ROMAN RESIDUAL EXPERIMENT READY · combined top 100: page "+p100+", token "+t100+" · exported italic-roman-residual-v159.json · production Hunt unchanged.");
    return payload;
  }

  function romanResidualOfflineOrder(rows,weight=.15){
    const scored=(rows||[]).filter(r=>Number.isFinite(r.baselineScore)&&Number.isFinite(r.romanResidualScore)).map(r=>({...r,score:(1-weight)*r.baselineScore+weight*r.romanResidualScore}));
    const sorted=scored.sort((a,b)=>b.score-a.score),rounds=[],counts=new Map();
    for(const row of sorted){
      const key=String(row.text||row.key||row.id||"").normalize("NFKC").toLocaleLowerCase().trim();
      const round=counts.get(key)||0;counts.set(key,round+1);
      if(!rounds[round])rounds[round]=[];rounds[round].push(row);
    }
    return rounds.flat();
  }
  function romanResidualOfflineSlice(ordered,n){
    const top=ordered.slice(0,n),italics=top.filter(r=>r.label==="ITALIC").length;
    return {n:Math.min(n,ordered.length),italics,romans:top.length-italics,precision:top.length?italics/top.length:0,
      cards:top.map((r,i)=>({rank:i+1,label:r.label,text:r.text,key:r.key,baselineScore:r.baselineScore,romanResidualScore:r.romanResidualScore,blend15:.85*r.baselineScore+.15*r.romanResidualScore}))};
  }
  function analyzeRomanResidualExport(payload){
    const weights=[0,-.05,-.10,-.15,-.20,-.25,-.30,-.40];
    const analyze=side=>{
      const rows=payload?.weightSweep?.[side]?.specimenScores||[],byWeight={};
      for(const weight of weights){
        const ordered=romanResidualOfflineOrder(rows,weight);
        byWeight[String(weight)]={top25:romanResidualOfflineSlice(ordered,25),top50:romanResidualOfflineSlice(ordered,50),top100:romanResidualOfflineSlice(ordered,100),top250:romanResidualOfflineSlice(ordered,250)};
      }
      return {specimens:rows.length,byWeight};
    };
    const page=analyze("page"),token=analyze("token");
    const result={format:"book-ocr-studio-roman-residual-penalty-sweep-v1",buildVersion:BUILD_VERSION,sourceBuild:String(payload?.buildVersion||""),weights,
      note:"Offline Roman-penalty sweep only. Negative weights subtract the Roman Residual signal while increasing baseline proportion so coefficients sum to 1. No OCR, screenshots, Pixel Assist, labels, or production Hunt changed.",
      page,token};
    state.romanResidualOfflineSimulation=result;
    downloadBlob(new Blob([JSON.stringify(result,null,2)],{type:"application/json"}),"italic-roman-residual-penalty-v172.json");
    const summary=weights.map(w=>{const p=page.byWeight[String(w)],t=token.byWeight[String(w)];return w+": page "+p.top25.italics+"/"+p.top50.italics+"/"+p.top100.italics+"/"+p.top250.italics+", token "+t.top25.italics+"/"+t.top50.italics+"/"+t.top100.italics+"/"+t.top250.italics;}).join(" | ");
    const msg="ROMAN PENALTY SWEEP READY · italics at top 25/50/100/250 · "+summary;
    console.log(msg);setStatus("ROMAN PENALTY SWEEP READY · JSON downloaded.");return result;
  }
  function importRomanResidualExport(){
    const input=document.getElementById("italicRomanResidualImport");
    if(!input)return;
    input.value="";
    input.onchange=async()=>{
      const file=input.files?.[0];if(!file)return;
      try{
        const payload=JSON.parse(await file.text());
        if(!payload?.weightSweep?.page?.specimenScores||!payload?.weightSweep?.token?.specimenScores)throw new Error("This report does not contain v167 specimenScores.");
        analyzeRomanResidualExport(payload);
      }catch(err){console.error("Roman Residual offline import failed",err);setStatus("Roman Residual offline import failed: "+(err?.message||err));}
    };
    input.click();
  }

  async function launchRomanResidualExperiment(){
    setStatus("Roman Residual: building validation candidates…");
    state.italicReviewSelectionMode="validation";
    state.italicReviewHistory=[];
    const hasMeasurements=state.pages.some(page=>(page.layoutLines||[]).some(line=>line.italicMeta||(Array.isArray(line.italicWordMeta)&&line.italicWordMeta.length)));
    if(!hasMeasurements){
      const restored=await restoreCachedItalicMeasurements();
      if(!restored)await autoScanItalics({rebuildText:false});
    }
    downloadItalicDiagnostics(false);
    const queue=state.italicCalibrationReviewSet||[];
    const matched=queue.filter(r=>r.validationLabel==="ITALIC"||r.validationLabel==="ROMAN");
    const profile=currentItalicLearningProfile();
    const labels=(profile.examples||[]).filter(x=>(x.label==="ITALIC"||x.label==="ROMAN")&&!x.fragment);
    const exact=matched.filter(r=>r.validationMatch==="exact-id").length;
    const physical=matched.filter(r=>r.validationMatch==="physical-word").length;
    const rate=labels.length?matched.length/labels.length:0;
    console.log("Roman Residual live attachment: "+matched.length+" / "+labels.length+" labels ("+Math.round(rate*1000)/10+"%); "+exact+" exact-id, "+physical+" physical-word.");
    if(!matched.length||rate<0.5)throw new Error("Roman Residual aborted before Pixel Assist: live validation attachment unexpectedly low ("+matched.length+"/"+labels.length+").");
    setStatus("Roman Residual: measuring Pixel Assist on the attached live candidates…");
    const pixelAssist=await applyItalicPixelAssistToQueue("validation");
    finalizeItalicReviewRanking("validation");
    const liveMatched=(state.italicCalibrationReviewSet||[]).filter(r=>r.validationLabel==="ITALIC"||r.validationLabel==="ROMAN");
    const examples=liveMatched.map((r,i)=>({
      id:"live::"+romanResidualRunKey(r),label:r.validationLabel,fragment:false,
      normalizedText:italicNormalizedSpecimenText(r),specimenText:italicNormalizedSpecimenText(r),
      sourceRunId:"live",sourcePage:r.pageIndex,sourceLine:r.lineIndex,startWordIndex:r.startWordIndex,endWordIndex:r.endWordIndex,
      __liveRun:r
    }));
    const runByKey=new Map(liveMatched.map(r=>[romanResidualRunKey(r),r]));
    const page=buildRomanResidualFoldReport("page",examples,runByKey);
    const token=buildRomanResidualFoldReport("token",examples,runByKey);
    const payload={format:"book-ocr-studio-roman-residual-experiment-v2",buildVersion:BUILD_VERSION,exportedAt:new Date().toISOString(),
      productionHuntChanged:false,baseline:"Frozen v157 canonical scoring; experimental ranks are offline only.",
      method:"Book-native Roman residual v2, operating directly on the validation-labeled live candidates proven by v164. No post-hoc reattachment.",
      attachment:{persistedEligible:labels.length,liveMatched:liveMatched.length,rate,exact,physical},
      pixelAssist,thresholds:{minimumRomanReferencesPerLetter:5,combinedWeight:{baseline:.75,romanResidual:.25}},
      pageGrouped:page,tokenGrouped:token,
      weightSweep:{note:"Offline only. Reuses the same live candidates and fold-specific Roman-reference models; no additional screenshot or Pixel Assist pass.",page:romanResidualWeightSweep("page",examples,runByKey),token:romanResidualWeightSweep("token",examples,runByKey)},
      successGate:{targetTop100:"17-18+ italics in both grouping schemes, improvement across most page folds, no major top-250 collapse",passed:false}};
    const p100=page.pooled.combined.top100.italic,t100=token.pooled.combined.top100.italic;
    payload.successGate.passed=p100>=17&&t100>=17;
    state.romanResidualExperiment=payload;
    downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),"italic-roman-residual-v172.json");
    const msg="ROMAN RESIDUAL READY · attachment "+liveMatched.length+"/"+labels.length+" · combined top 100: page "+p100+", token "+t100+" · production Hunt unchanged.";
    console.log(msg);setStatus(msg);
    return payload;
  }
`;

  const experimentAnchor = '  async function launchItalicLearningReview(mode, buttonTiming = null) {';
  if (!source.includes(experimentAnchor)) throw new Error("Experiment insertion anchor not found.");
  source = source.replace(experimentAnchor, experimentCode + "\n" + experimentAnchor);

  const listenerAnchor='  els.resetItalicLearning?.addEventListener("click", resetItalicLearningProfile);';
  const listenerReplacement=listenerAnchor+'\n  document.getElementById("italicRomanResidualBtn")?.addEventListener("click",()=>launchRomanResidualExperiment().catch(err=>{console.error("Roman Residual experiment failed",err);setStatus("Roman Residual experiment failed: "+(err?.message||err));}));\n  document.getElementById("italicRomanResidualOfflineBtn")?.addEventListener("click",importRomanResidualExport);
  document.getElementById("italicCropExportBtn")?.addEventListener("click",()=>exportLabeledWordCrops().catch(err=>{console.error("Labeled crop export failed",err);setStatus("Labeled crop export failed: "+(err?.message||err));}));';
  if(!source.includes(listenerAnchor))throw new Error("Experiment listener anchor not found.");
  source=source.replace(listenerAnchor,listenerReplacement);

  source += "\n//# sourceURL=book-ocr-studio-172.js";
  (0, eval)(source);
})().catch((err) => {
  console.error("Book OCR Studio loader failed", err);
  const status = document.getElementById("statusBox");
  if (status) status.textContent = `App update failed to load: ${err.message || err}`;
});
