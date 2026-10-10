// Build 254: crop ranges and lightweight, human-approved, pre-OCR visual preflight.
(() => {
  "use strict";
  window.OcrCropPreflight = {
    create({state,els,loadImageFromFile,sourceFilesAttached,checkpointSignature,refreshSourceAttachmentUi,updatePreview,saveCheckpoint}) {
      state.cropRanges ||= [];
      state.cropPreflightCheckedSig = null;
      state.cropPreflightApprovedSig = null;
      state.cropPreflightRunning = false;
      function values(){
        return {top:Number(els.cropTop.value)||0,bottom:Number(els.cropBottom.value)||0,sides:Number(els.cropSides.value)||0};
      }
      function configSig(){
        return JSON.stringify({default:values(),ranges:state.cropRanges.map(r=>({
          start:Number(r.start)||1,end:Number(r.end)||0,top:Number(r.top)||0,
          bottom:Number(r.bottom)||0,sides:Number(r.sides)||0
        }))});
      }
      function signature(){return JSON.stringify({source:checkpointSignature(),crop:configSig()});}
      function selected(index){
        const n=index+1,total=state.files.length;
        const match=state.cropRanges.find(r=>n>=Number(r.start)&&n<=(Number(r.end)||total));
        return match?{top:Number(match.top)||0,bottom:Number(match.bottom)||0,sides:Number(match.sides)||0,
          label:"Pages "+match.start+"–"+(Number(match.end)||total)}:{...values(),label:"Default"};
      }
      function validated(){
        const total=state.files.length,ordered=[];
        for(let i=0;i<state.cropRanges.length;i++){
          const r=state.cropRanges[i],start=Number(r.start),end=Number(r.end)||total;
          if(!Number.isInteger(start)||start<1||!Number.isInteger(end)||end<start||end>total)
            return "Range "+(i+1)+": check From / Through page numbers (1–"+total+").";
          if(["top","bottom","sides"].some(key=>!Number.isInteger(Number(r[key]))||Number(r[key])<0))
            return "Range "+(i+1)+": crop values must be nonnegative whole pixels.";
          ordered.push({start,end});
        }
        ordered.sort((a,b)=>a.start-b.start);
        for(let i=1;i<ordered.length;i++)if(ordered[i].start<=ordered[i-1].end)
          return "Page ranges overlap at page "+ordered[i].start+". Correct the ranges.";
        if(Object.values(values()).some(v=>!Number.isInteger(v)||v<0))return "Default crop needs nonnegative whole pixels.";
        return "";
      }
      function isApproved(){return state.cropPreflightApprovedSig===signature();}
      function invalidate(){
        state.cropPreflightCheckedSig=null;state.cropPreflightApprovedSig=null;
        if(els.cropPreflightApprove){els.cropPreflightApprove.checked=false;els.cropPreflightApprove.disabled=true;}
        if(els.cropPreflightSamples)els.cropPreflightSamples.replaceChildren();
        if(els.cropPreflightStatus)els.cropPreflightStatus.textContent=state.files.length
          ?"Run Check sample pages and approve the crop before starting a fresh OCR batch."
          :"Add screenshots, then check the crop before OCR.";
        refreshSourceAttachmentUi();
      }
      function persistChange(){invalidate();if(state.files.length)saveCheckpoint();updatePreview().catch(()=>{});}
      function renderRanges(){
        if(!els.cropRangeList)return;els.cropRangeList.replaceChildren();
        state.cropRanges.forEach((r,i)=>{
          const row=document.createElement("div");row.className="crop-range-row";
          for(const [field,label,val] of [["start","From",r.start],["end","Through",Number(r.end)||""],["top","Top px",r.top],
            ["bottom","Bottom px",r.bottom],["sides","Sides px",r.sides]]){
            const wrap=document.createElement("label"),sp=document.createElement("span"),input=document.createElement("input");
            sp.textContent=label;input.type="number";input.min=field==="start"?"1":"0";
            input.inputMode="numeric";input.value=val;input.dataset.cropField=field;input.dataset.cropIndex=String(i);
            wrap.append(sp,input);row.append(wrap);
          }
          const remove=document.createElement("button");remove.type="button";remove.textContent="Remove";
          remove.className="button ghost";remove.dataset.removeCrop=String(i);row.append(remove);
          els.cropRangeList.append(row);
        });
      }
      function restore(saved){
        state.cropRanges=Array.isArray(saved.cropRanges)?saved.cropRanges.map(r=>({
          start:Number(r.start)||1,end:Number(r.end)||0,top:Number(r.top)||0,
          bottom:Number(r.bottom)||0,sides:Number(r.sides)||0
        })):[];
        state.cropConfigAtOcrStart=typeof saved.cropConfigAtOcrStart==="string"?saved.cropConfigAtOcrStart:null;
        renderRanges();invalidate();
      }
      function onNewBatch(){
        state.cropRanges=[];state.cropConfigAtOcrStart=null;renderRanges();invalidate();
      }
      function checkReady(processed){
        const invalid=validated();if(invalid)return invalid;
        if(processed===0&&!isApproved())return "Run Crop preflight, inspect samples, then check the approval box before starting OCR.";
        if(processed>0&&state.cropConfigAtOcrStart&&state.cropConfigAtOcrStart!==configSig())
          return "Crop settings changed after OCR started. Export a backup and use Clear OCR + restart to avoid mixing crop settings. Existing OCR was not altered.";
        return "";
      }
      function sampleIndices(){
        const n=state.files.length,out=new Set();
        if(!n)return [];
        const count=Math.min(17,n);
        for(let i=0;i<count;i++)out.add(Math.round(i*(n-1)/Math.max(1,count-1)));
        for(const r of state.cropRanges){
          const a=Math.max(0,Math.min(n-1,Number(r.start)-1)),b=Math.max(a,Math.min(n-1,(Number(r.end)||n)-1));
          for(const x of [a-1,a,a+1,Math.floor((a+b)/2),b-1,b,b+1])if(x>=0&&x<n)out.add(x);
        }
        return [...out].sort((a,b)=>a-b);
      }
      function nearCutline(img,crop){
        const c=document.createElement("canvas");c.width=260;c.height=Math.max(1,Math.round(img.height*260/img.width));
        const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(img,0,0,c.width,c.height);
        const pixels=ctx.getImageData(0,0,c.width,c.height).data;const toY=y=>Math.round(y*c.height/img.height);
        function density(center){
          let hits=0,total=0;
          for(let y=Math.max(0,center-3);y<Math.min(c.height,center+4);y++)
            for(let x=45;x<c.width-45;x+=2){
              const k=(y*c.width+x)*4;
              if(pixels[k]<150&&pixels[k+1]<150&&pixels[k+2]<150)hits++;
              total++;
            }
          return total?hits/total:0;
        }
        const warnings=[];
        if(crop.sy>0&&density(toY(crop.sy))>.03)warnings.push("ink near top cut");
        if(crop.sy+crop.sh<img.height&&density(toY(crop.sy+crop.sh))>.03)warnings.push("ink near bottom cut");
        c.width=1;c.height=1;return warnings;
      }
      async function run(){
        if(state.cropPreflightRunning||!state.files.length||!sourceFilesAttached())return;
        const error=validated();if(error){els.cropPreflightStatus.textContent=error;return;}
        const sig=signature(),samples=sampleIndices(),button=els.runCropPreflight,old=button.textContent;
        state.cropPreflightRunning=true;
        button.disabled=true;button.textContent="Checking…";
        invalidate();els.cropPreflightSamples.replaceChildren();
        let warnings=0;
        try{
          for(const [step,index] of samples.entries()){
            const img=await loadImageFromFile(state.files[index]);
            const cfg=selected(index),crop={
              sx:Math.min(Math.max(0,cfg.sides),Math.floor((img.width-1)/2)),
              sy:Math.min(Math.max(0,cfg.top),img.height-1)
            };
            crop.sw=Math.max(1,img.width-2*crop.sx);
            crop.sh=Math.max(1,img.height-crop.sy-Math.min(cfg.bottom,img.height-crop.sy-1));
            const issues=nearCutline(img,crop);warnings+=issues.length;
            const item=document.createElement("button");item.type="button";
            item.className="crop-sample-button"+(issues.length?" crop-sample-warning":"");
            item.textContent="Page "+(index+1)+(issues.length?" ⚠":" ✓");
            item.title=issues.join(", ")||"Inspect the original page with the crop outline";
            item.addEventListener("click",()=>{
              state.cropPreviewIndex=index;updatePreview().catch(console.warn);
              els.previewCanvas.scrollIntoView({block:"center",behavior:"smooth"});
            });
            els.cropPreflightSamples.append(item);
            els.cropPreflightStatus.textContent="Checking "+(step+1)+" / "+samples.length+" sample pages…";
            if(step%4===3)await new Promise(resolve=>setTimeout(resolve,25));
          }
          if(sig!==signature()){invalidate();return;}
          state.cropPreflightCheckedSig=sig;els.cropPreflightApprove.disabled=false;
          els.cropPreflightStatus.textContent=samples.length+" pages checked across the book and crop ranges. "+
            (warnings?warnings+" possible cut-line warning(s). Inspect ⚠ pages before approval.":"No cut-line ink warnings found.")+
            " Visual inspection is required; this is not a guarantee that text was preserved.";
        }catch(err){invalidate();els.cropPreflightStatus.textContent="Preflight failed: "+(err.message||err);}
        finally{state.cropPreflightRunning=false;button.disabled=false;button.textContent=old;refreshSourceAttachmentUi();}
      }
      function init(){
        renderRanges();
        els.addCropRange?.addEventListener("click",()=>{
          const last=state.cropRanges.at(-1),from=last?Math.min(state.files.length||1,(Number(last.end)||state.files.length||1)+1):1;
          state.cropRanges.push({...values(),start:from,end:0});renderRanges();persistChange();
        });
        els.cropRangeList?.addEventListener("input",e=>{
          const input=e.target,field=input.dataset?.cropField,index=Number(input.dataset?.cropIndex);
          if(!field||!state.cropRanges[index])return;
          state.cropRanges[index][field]=input.value===""&&field==="end"?0:Number(input.value);
          persistChange();
        });
        els.cropRangeList?.addEventListener("click",e=>{
          const b=e.target.closest("[data-remove-crop]");if(!b)return;
          state.cropRanges.splice(Number(b.dataset.removeCrop),1);renderRanges();persistChange();
        });
        els.runCropPreflight?.addEventListener("click",run);
        els.cropPreflightApprove?.addEventListener("change",()=>{
          state.cropPreflightApprovedSig=els.cropPreflightApprove.checked&&state.cropPreflightCheckedSig===signature()
            ?state.cropPreflightCheckedSig:null;
          if(isApproved())els.cropPreflightStatus.textContent+=" Approved. OCR is unlocked.";
          refreshSourceAttachmentUi();
        });
      }
      init();
      return {selected,configSig,isApproved,invalidate,onNewBatch,restore,checkReady,persistChange,run};
    }
  };
})();