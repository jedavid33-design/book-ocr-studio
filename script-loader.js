// Book OCR Studio 159 loader.
// Keeps the v158 READY-state repair and adds an experimental, parallel
// book-native Roman Residual validator. Production Hunt remains frozen at v157.

(async () => {
  const response = await fetch("./script.js?v=157", { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load script.js (${response.status})`);
  let source = await response.text();

  source = source.replace(
    '  const BUILD_VERSION = "157";',
    '  const BUILD_VERSION = "159";'
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
  function romanResidualLetters(value){
    return [...new Set(String(value||"").normalize("NFKC").toLocaleLowerCase().match(/\p{L}/gu)||[])];
  }
  function romanResidualExampleKey(x){
    return [Number(x?.sourcePage),Number(x?.sourceLine),Number(x?.startWordIndex),Number(x?.endWordIndex)].join(":");
  }
  function romanResidualRunKey(r){
    return [Number(r?.pageIndex),Number(r?.lineIndex),Number(r?.startWordIndex),Number(r?.endWordIndex)].join(":");
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
  function runRomanResidualExperiment(){
    const examples=(currentItalicLearningProfile().examples||[]).filter(x=>(x.label==="ITALIC"||x.label==="ROMAN")&&!x.fragment);
    const runs=state.italicCalibrationReviewSet||[],runByKey=new Map(runs.map(r=>[romanResidualRunKey(r),r]));
    const reattached=examples.filter(x=>runByKey.has(romanResidualExampleKey(x)));
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
    downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),"italic-roman-residual-v159.json");
    setStatus("ROMAN RESIDUAL EXPERIMENT READY · combined top 100: page "+p100+", token "+t100+" · exported italic-roman-residual-v159.json · production Hunt unchanged.");
    return payload;
  }
  async function launchRomanResidualExperiment(){
    setStatus("Roman Residual: rebuilding the frozen held-out baseline and pixel evidence…");
    await launchItalicLearningReview("validation");
    setStatus("Roman Residual: scoring book-native same-letter Roman references…");
    return runRomanResidualExperiment();
  }
`;

  const experimentAnchor = '  async function launchItalicLearningReview(mode, buttonTiming = null) {';
  if (!source.includes(experimentAnchor)) throw new Error("Experiment insertion anchor not found.");
  source = source.replace(experimentAnchor, experimentCode + "\n" + experimentAnchor);

  const listenerAnchor='  els.resetItalicLearning?.addEventListener("click", resetItalicLearningProfile);';
  const listenerReplacement=listenerAnchor+'\n  document.getElementById("italicRomanResidualBtn")?.addEventListener("click",()=>launchRomanResidualExperiment().catch(err=>{console.error("Roman Residual experiment failed",err);setStatus("Roman Residual experiment failed: "+(err?.message||err));}));';
  if(!source.includes(listenerAnchor))throw new Error("Experiment listener anchor not found.");
  source=source.replace(listenerAnchor,listenerReplacement);

  source += "\n//# sourceURL=book-ocr-studio-159.js";
  (0, eval)(source);
})().catch((err) => {
  console.error("Book OCR Studio loader failed", err);
  const status = document.getElementById("statusBox");
  if (status) status.textContent = `App update failed to load: ${err.message || err}`;
});
