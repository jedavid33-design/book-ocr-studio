(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  const state = {
    files: [], pages: [], coverFile: null, coverUrl: "", worker: null, stopRequested: false,
  };

  const els = {
    bookTitle: $("bookTitle"), bookAuthor: $("bookAuthor"), coverInput: $("coverInput"),
    coverPreview: $("coverPreview"), coverPreviewWrap: $("coverPreviewWrap"), imageInput: $("imageInput"),
    clearImages: $("clearImages"), fileCount: $("fileCount"), thumbStrip: $("thumbStrip"),
    cropTop: $("cropTop"), cropBottom: $("cropBottom"), cropSides: $("cropSides"),
    previewCanvas: $("previewCanvas"), previewDims: $("previewDims"), processBtn: $("processBtn"),
    stopBtn: $("stopBtn"), progressWrap: $("progressWrap"), progressLabel: $("progressLabel"),
    progressPercent: $("progressPercent"), progressBar: $("progressBar"), statusBox: $("statusBox"),
    reviewSection: $("reviewSection"), reviewList: $("reviewList"), reviewSearch: $("reviewSearch"),
    chapterOnly: $("chapterOnly"), exportSection: $("exportSection"), downloadTxt: $("downloadTxt"),
    downloadEpub: $("downloadEpub"),
  };

  function setStatus(msg) { els.statusBox.textContent = msg; }
  function naturalSort(a,b){ return a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:"base"}); }
  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function escapeXml(str=""){ return str.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;"); }
  function cleanFilename(name){ return (name||"book").replace(/[\\/:*?"<>|]+/g,"").replace(/\s+/g," ").trim()||"book"; }
  function normalizeOcrText(text){ return (text||"").replace(/\r/g,"").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim(); }

  function loadImageFromFile(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file), img=new Image();
      img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error(`Could not load ${file.name}`));};
      img.src=url;
    });
  }

  function getCropSettings(img){
    const top=clamp(Number(els.cropTop.value)||0,0,img.height-1);
    const bottom=clamp(Number(els.cropBottom.value)||0,0,img.height-top-1);
    const sides=clamp(Number(els.cropSides.value)||0,0,Math.floor((img.width-1)/2));
    return {sx:sides,sy:top,sw:Math.max(1,img.width-sides*2),sh:Math.max(1,img.height-top-bottom)};
  }

  function makeCroppedCanvas(img){
    const {sx,sy,sw,sh}=getCropSettings(img), canvas=document.createElement("canvas");
    canvas.width=sw; canvas.height=sh;
    const ctx=canvas.getContext("2d",{alpha:false}); ctx.fillStyle="#fff"; ctx.fillRect(0,0,sw,sh); ctx.drawImage(img,sx,sy,sw,sh,0,0,sw,sh);
    return canvas;
  }

  async function updatePreview(){
    if(!state.files.length){
      const c=els.previewCanvas; c.width=800;c.height=360; const ctx=c.getContext("2d");
      ctx.fillStyle="#e6dfd7";ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle="#756c63";ctx.font="32px -apple-system,sans-serif";ctx.textAlign="center";ctx.fillText("Add screenshots to preview crop",c.width/2,c.height/2);els.previewDims.textContent="";return;
    }
    const img=await loadImageFromFile(state.files[0]), crop=getCropSettings(img), scale=Math.min(1,1000/crop.sw), c=els.previewCanvas;
    c.width=Math.round(crop.sw*scale);c.height=Math.round(crop.sh*scale);c.getContext("2d",{alpha:false}).drawImage(img,crop.sx,crop.sy,crop.sw,crop.sh,0,0,c.width,c.height);els.previewDims.textContent=`${crop.sw} × ${crop.sh} px`;
  }

  function renderThumbs(){
    els.thumbStrip.innerHTML="";
    state.files.slice(0,40).forEach((file,index)=>{ const w=document.createElement("div");w.className="thumb";const im=document.createElement("img"),u=URL.createObjectURL(file);im.onload=()=>URL.revokeObjectURL(u);im.src=u;im.alt=file.name;const n=document.createElement("span");n.textContent=index+1;w.append(im,n);els.thumbStrip.appendChild(w); });
    if(state.files.length>40){const m=document.createElement("div");m.className="thumb";m.style.display="grid";m.style.placeItems="center";m.textContent=`+${state.files.length-40}`;els.thumbStrip.appendChild(m);}
  }

  function chapterHeuristic(text){
    const n=(text||"").replace(/\r/g,"").trimStart(); if(!n) return false;
    const lines=n.split("\n").map(s=>s.trim()).filter(Boolean).slice(0,8), chunk=lines.join(" ").slice(0,260);
    const hasWord=/\b(chapter|prologue|epilogue|interlude)\b/i.test(chunk), num=/^\d{1,3}\b/.test(lines[0]||""), caps=lines.some(l=>l.length>=2&&l.length<=28&&/^[A-Z][A-Z\s.'&-]+$/.test(l));
    return hasWord||(num&&caps)||(num&&lines.length>=2);
  }

  function detectChapterTitle(text,ordinal){
    const lines=(text||"").replace(/\r/g,"").split("\n").map(s=>s.trim()).filter(Boolean).slice(0,10).filter(l=>/[A-Za-z0-9]/.test(l));
    let num="", label="";
    for(const line of lines){
      if(!num&&/^\d{1,3}$/.test(line)){num=line;continue;}
      if(!label&&/^(chapter|prologue|epilogue|interlude)\b/i.test(line)){label=line;break;}
      if(!label&&line.length<=35&&(/^[A-Z][A-Z\s.'&-]+$/.test(line)||/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}$/.test(line))){label=line;if(num)break;}
    }
    if(label&&/^(chapter|prologue|epilogue|interlude)\b/i.test(label)) return label;
    if(num&&label) return `${num} — ${label}`;
    if(label) return label;
    if(num) return `Chapter ${num}`;
    return `Chapter ${ordinal}`;
  }

  function combinedText(){ return state.pages.map(p=>(p.text||"").trim()).filter(Boolean).join("\n\n"); }
  function chapterIndices(){ return state.pages.reduce((a,p,i)=>{if(p.chapterStart)a.push(i);return a;},[]); }
  function buildSections(){
    if(!state.pages.length) return [];
    const starts=chapterIndices(); if(!starts.length) return [{title:(els.bookTitle.value||"Book").trim()||"Book",pages:state.pages}];
    const out=[]; let ordinal=0;
    if(starts[0]>0) out.push({title:"Opening",pages:state.pages.slice(0,starts[0])});
    for(let i=0;i<starts.length;i++){
      const start=starts[i], end=i+1<starts.length?starts[i+1]:state.pages.length; ordinal++;
      const page=state.pages[start], title=(page.chapterTitle||"").trim()||detectChapterTitle(page.text,ordinal);
      out.push({title,pages:state.pages.slice(start,end)});
    }
    return out.filter(s=>s.pages.some(p=>(p.text||"").trim()));
  }

  function showReview(){ els.reviewSection.classList.remove("hidden"); els.exportSection.classList.remove("hidden"); }

  function createReviewItem(page,index){
    const item=document.createElement("article");item.className="review-item";item.dataset.pageIndex=index;
    const title=document.createElement("div");title.className="review-title";
    const left=document.createElement("div");left.className="left";
    const strong=document.createElement("strong");strong.textContent=`Page ${index+1}`;
    const name=document.createElement("span");name.className="page-name";name.textContent=page.file.name;left.append(strong,name);
    if(page.chapterStart){const b=document.createElement("span");b.className="badge";b.textContent=page.chapterTouched?"Chapter start":"Auto chapter start";left.appendChild(b);}
    const actions=document.createElement("div");actions.className="inline-actions";
    const msg=document.createElement("button");msg.className="button secondary";msg.type="button";msg.textContent="Message-page OCR";msg.addEventListener("click",()=>runMessagePageOcr(index,msg));actions.appendChild(msg);
    title.append(left,actions);

    const body=document.createElement("div");body.className="review-body";
    const img=document.createElement("img"), url=URL.createObjectURL(page.file);img.onload=()=>URL.revokeObjectURL(url);img.src=url;img.alt=`Original screenshot ${index+1}`;
    const right=document.createElement("div");right.className="review-right";
    const meta=document.createElement("div");meta.className="page-meta";
    const chapLabel=document.createElement("label");chapLabel.className="mini-check";const cb=document.createElement("input");cb.type="checkbox";cb.checked=!!page.chapterStart;const sp=document.createElement("span");sp.textContent="Chapter start";chapLabel.append(cb,sp);
    const titleField=document.createElement("label");titleField.className="chapter-title-field";const tl=document.createElement("span");tl.textContent="Chapter title";const ti=document.createElement("input");ti.type="text";ti.value=page.chapterTitle||"";ti.placeholder=detectChapterTitle(page.text,Math.max(1,chapterIndices().indexOf(index)+1));ti.disabled=!page.chapterStart;titleField.append(tl,ti);meta.append(chapLabel,titleField);
    cb.addEventListener("change",()=>{page.chapterStart=cb.checked;page.chapterTouched=true;ti.disabled=!cb.checked;renderReview();});
    ti.addEventListener("input",()=>{page.chapterTitle=ti.value;});
    const ta=document.createElement("textarea");ta.value=page.text;ta.setAttribute("aria-label",`OCR text for page ${index+1}`);ta.addEventListener("input",()=>{page.text=ta.value;page.detectedChapterStart=chapterHeuristic(ta.value);if(!page.chapterTouched)page.chapterStart=page.detectedChapterStart;});
    right.append(meta,ta);body.append(img,right);item.append(title,body);return item;
  }

  function renderReview(){
    const q=els.reviewSearch.value.trim().toLowerCase(), only=els.chapterOnly.checked;els.reviewList.innerHTML="";
    state.pages.forEach((p,i)=>{if(only&&!p.chapterStart)return;if(q&&!p.text.toLowerCase().includes(q)&&!p.file.name.toLowerCase().includes(q))return;els.reviewList.appendChild(createReviewItem(p,i));});
  }

  function appendReview(index){
    const p=state.pages[index];if(!p)return;const q=els.reviewSearch.value.trim().toLowerCase(),only=els.chapterOnly.checked;if(only&&!p.chapterStart)return;if(q&&!p.text.toLowerCase().includes(q)&&!p.file.name.toLowerCase().includes(q))return;els.reviewList.appendChild(createReviewItem(p,index));
  }

  async function ensureWorker(logger){ if(state.worker)return state.worker;if(!window.Tesseract)throw new Error("Tesseract.js did not load. Check your connection and reload.");state.worker=await Tesseract.createWorker("eng",1,{logger});return state.worker; }

  async function processPages(){
    if(!state.files.length)return;state.stopRequested=false;state.pages=[];els.reviewList.innerHTML="";els.processBtn.disabled=true;els.stopBtn.disabled=false;els.progressWrap.classList.remove("hidden");els.progressBar.value=0;els.progressPercent.textContent="0%";els.reviewSection.classList.add("hidden");els.exportSection.classList.add("hidden");
    try{
      let active=0;const worker=await ensureWorker(m=>{if(m.status==="recognizing text"){const pct=Math.round(((active+(m.progress||0))/state.files.length)*100);els.progressBar.value=pct;els.progressPercent.textContent=`${pct}%`;}if(m.status)els.progressLabel.textContent=`Page ${Math.min(active+1,state.files.length)}: ${m.status}`;});
      for(let i=0;i<state.files.length;i++){
        active=i;if(state.stopRequested)break;const file=state.files[i];setStatus(`Processing page ${i+1} of ${state.files.length}: ${file.name}`);const img=await loadImageFromFile(file),canvas=makeCroppedCanvas(img),result=await worker.recognize(canvas),text=normalizeOcrText(result?.data?.text||"");const detected=chapterHeuristic(text);
        state.pages.push({file,text,detectedChapterStart:detected,chapterStart:detected,chapterTouched:false,chapterTitle:""});showReview();if(els.reviewSearch.value||els.chapterOnly.checked)renderReview();else appendReview(state.pages.length-1);
        const pct=Math.round(((i+1)/state.files.length)*100);els.progressBar.value=pct;els.progressPercent.textContent=`${pct}%`;els.progressLabel.textContent=`Finished page ${i+1} of ${state.files.length}`;setStatus(`Processed ${i+1} of ${state.files.length}. You can review completed pages while OCR continues.`);
      }
      setStatus(state.stopRequested?`Stopped after ${state.pages.length} pages.`:`Done. ${state.pages.length} pages processed.`);
    }catch(err){console.error(err);setStatus(`OCR error: ${err.message||err}`);}finally{els.processBtn.disabled=!state.files.length;els.stopBtn.disabled=true;}
  }

  function cropCanvasRegion(canvas, region, padX = 0, padY = 0, fullWidth = false){
    const x = fullWidth ? 0 : clamp(Math.floor(region.x0 - padX), 0, canvas.width - 1);
    const y = clamp(Math.floor(region.y0 - padY), 0, canvas.height - 1);
    const right = fullWidth ? canvas.width : clamp(Math.ceil(region.x1 + padX), x + 1, canvas.width);
    const bottom = clamp(Math.ceil(region.y1 + padY), y + 1, canvas.height);
    const out = document.createElement("canvas");
    out.width = Math.max(1, right - x);
    out.height = Math.max(1, bottom - y);
    const ctx = out.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0,0,out.width,out.height);
    ctx.drawImage(canvas, x, y, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  function cleanOcrInlineText(text, mode = "text"){
    let out = (text || "").replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
    out = out.replace(/[|¦]/g, "I").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    out = out.replace(/\s+([,.;:!?])/g, "$1").replace(/([({\["'])\s+/g, "$1").replace(/\s+([)}\]"'])/g, "$1");
    out = out.replace(/\bI\s+will\b/gi, "I will").replace(/\bI\s+know\b/gi, "I know").replace(/\bI\s+hate\b/gi, "I hate");
    if(mode === "label") out = out.replace(/[^A-Za-z0-9 '&.-]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
    return out;
  }

  function looksLikeSpeakerLabel(text){
    const raw = cleanOcrInlineText(text, "label");
    if(!raw || raw.length < 2 || raw.length > 22) return false;
    if(/\d{2,}/.test(raw)) return false;
    const words = raw.split(/\s+/).filter(Boolean);
    if(words.length > 3) return false;
    if(!/^[A-Z0-9 '&.-]+$/.test(raw)) return false;
    const letters = raw.replace(/[^A-Z]/g, "");
    return letters.length >= 2 && letters.length <= 16;
  }

  function normalizeMessageText(text){
    return normalizeOcrText(text)
      .replace(/\n{2,}/g, "\n\n")
      .replace(/\n/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function detectInkRuns(canvas){
    const maxW = 900;
    const scale = Math.min(1, maxW / canvas.width);
    const w = Math.max(1, Math.round(canvas.width * scale));
    const h = Math.max(1, Math.round(canvas.height * scale));
    const temp = document.createElement("canvas");
    temp.width = w; temp.height = h;
    const tctx = temp.getContext("2d", { alpha: false });
    tctx.drawImage(canvas, 0, 0, w, h);
    const data = tctx.getImageData(0, 0, w, h).data;

    const rows = [];
    const threshold = 210;
    for(let y = 0; y < h; y++){
      let count = 0, xMin = w, xMax = -1;
      for(let x = 0; x < w; x += 1){
        const i = (y * w + x) * 4;
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        if(lum < threshold){ count++; if(x < xMin) xMin = x; if(x > xMax) xMax = x; }
      }
      rows.push({ count, xMin, xMax });
    }

    const activeThreshold = Math.max(8, Math.round(w * 0.012));
    const rawRuns = [];
    let start = null;
    for(let y = 0; y < h; y++){
      const active = rows[y].count >= activeThreshold;
      if(active && start === null) start = y;
      if((!active || y === h - 1) && start !== null){
        const end = active && y === h - 1 ? y : y - 1;
        let x0 = w, x1 = -1, dark = 0;
        for(let yy = start; yy <= end; yy++){
          if(rows[yy].xMax >= 0){ x0 = Math.min(x0, rows[yy].xMin); x1 = Math.max(x1, rows[yy].xMax); }
          dark += rows[yy].count;
        }
        if(x1 >= x0){
          rawRuns.push({ x0, x1, y0: start, y1: end + 1, w: x1 - x0 + 1, h: end - start + 1, dark });
        }
        start = null;
      }
    }

    const merged = [];
    for(const run of rawRuns){
      if(run.h < 4 || run.w < 14) continue;
      const prev = merged[merged.length - 1];
      if(prev){
        const gap = run.y0 - prev.y1;
        const overlap = Math.min(prev.x1, run.x1) - Math.max(prev.x0, run.x0);
        const centerPrev = (prev.x0 + prev.x1) / 2;
        const centerRun = (run.x0 + run.x1) / 2;
        if(gap <= 8 && (overlap > Math.min(prev.w, run.w) * 0.18 || Math.abs(centerPrev - centerRun) < w * 0.18)){
          prev.x0 = Math.min(prev.x0, run.x0); prev.x1 = Math.max(prev.x1, run.x1);
          prev.y1 = run.y1; prev.w = prev.x1 - prev.x0 + 1; prev.h = prev.y1 - prev.y0; prev.dark += run.dark;
          continue;
        }
      }
      merged.push({ ...run });
    }

    return merged.map(run => ({
      x0: Math.max(0, Math.round(run.x0 / scale)),
      x1: Math.min(canvas.width, Math.round((run.x1 + 1) / scale)),
      y0: Math.max(0, Math.round(run.y0 / scale)),
      y1: Math.min(canvas.height, Math.round(run.y1 / scale)),
      w: Math.max(1, Math.round(run.w / scale)),
      h: Math.max(1, Math.round(run.h / scale)),
      dark: run.dark,
    }));
  }

  function detectMessagePairsFromRuns(runs, canvasWidth){
    const pairs = [];
    const used = new Set();
    for(let i = 0; i < runs.length - 1; i++){
      if(used.has(i) || used.has(i + 1)) continue;
      const label = runs[i], bubble = runs[i + 1];
      const gap = bubble.y0 - label.y1;
      const labelLike = label.h <= 42 && label.w <= canvasWidth * 0.42;
      const bubbleLike = bubble.h >= 20 && bubble.w >= Math.max(canvasWidth * 0.20, label.w * 1.1);
      const centerLabel = (label.x0 + label.x1) / 2;
      const centerBubble = (bubble.x0 + bubble.x1) / 2;
      const aligned = Math.abs(centerLabel - centerBubble) <= canvasWidth * 0.28;
      const close = gap >= 0 && gap <= 26;
      const score = (labelLike ? 1 : 0) + (bubbleLike ? 1 : 0) + (aligned ? 1 : 0) + (close ? 1 : 0);
      if(labelLike && bubbleLike && aligned && close){
        pairs.push({ label, bubble, top: label.y0, bottom: bubble.y1, score });
        used.add(i); used.add(i + 1); i += 1;
      }
    }
    return pairs;
  }

  function groupPairsIntoChatRegions(pairs){
    if(!pairs.length) return [];
    const groups = [];
    let current = { pairs: [pairs[0]], top: pairs[0].top, bottom: pairs[0].bottom };
    for(let i = 1; i < pairs.length; i++){
      const pair = pairs[i];
      const gap = pair.top - current.bottom;
      if(gap <= 90){
        current.pairs.push(pair);
        current.bottom = pair.bottom;
      } else {
        groups.push(current);
        current = { pairs: [pair], top: pair.top, bottom: pair.bottom };
      }
    }
    groups.push(current);
    return groups;
  }

  async function recognizeCanvasText(worker, canvas){
    const result = await worker.recognize(canvas);
    return normalizeOcrText(result?.data?.text || "");
  }

  async function runMessagePageOcr(index,button){
    if(!state.pages[index]) return;
    const old = button.textContent;
    const originalText = state.pages[index].text || "";
    button.disabled = true;
    button.textContent = "Working…";
    try{
      setStatus(`Re-processing page ${index + 1} as a message page…`);
      const worker = await ensureWorker();
      const img = await loadImageFromFile(state.pages[index].file);
      const cropped = makeCroppedCanvas(img);
      const runs = detectInkRuns(cropped);
      const pairs = detectMessagePairsFromRuns(runs, cropped.width);
      if(!pairs.length) throw new Error("No message-bubble pairs were detected on this page.");

      const chatRegions = groupPairsIntoChatRegions(pairs);
      const out = [];
      let cursorY = 0;
      let confidentMessages = 0;

      for(const region of chatRegions){
        if(region.top - cursorY > 24){
          const proseCanvas = cropCanvasRegion(cropped, { x0: 0, x1: cropped.width, y0: cursorY, y1: region.top - 10 }, 10, 6, true);
          const proseText = await recognizeCanvasText(worker, proseCanvas);
          if(proseText) out.push(proseText);
        }

        const regionMessages = [];
        for(const pair of region.pairs){
          const labelCanvas = cropCanvasRegion(cropped, pair.label, 10, 6, false);
          const bubbleCanvas = cropCanvasRegion(cropped, pair.bubble, 14, 10, false);
          const labelText = cleanOcrInlineText(await recognizeCanvasText(worker, labelCanvas), "label");
          const bubbleText = normalizeMessageText(await recognizeCanvasText(worker, bubbleCanvas));
          if(labelText && looksLikeSpeakerLabel(labelText) && bubbleText){
            regionMessages.push(`${labelText}: ${bubbleText}`);
            confidentMessages += 1;
          }
        }

        if(regionMessages.length){
          out.push(regionMessages.join("\n\n"));
        } else {
          const fallbackCanvas = cropCanvasRegion(cropped, { x0: 0, x1: cropped.width, y0: Math.max(0, region.top - 8), y1: Math.min(cropped.height, region.bottom + 8) }, 0, 0, true);
          const fallbackText = await recognizeCanvasText(worker, fallbackCanvas);
          if(fallbackText) out.push(fallbackText);
        }

        cursorY = region.bottom + 10;
      }

      if(cropped.height - cursorY > 24){
        const proseCanvas = cropCanvasRegion(cropped, { x0: 0, x1: cropped.width, y0: cursorY, y1: cropped.height }, 10, 6, true);
        const proseText = await recognizeCanvasText(worker, proseCanvas);
        if(proseText) out.push(proseText);
      }

      const finalText = out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
      if(!finalText || confidentMessages < 2){
        throw new Error("The page did not produce enough confident message matches.");
      }
      state.pages[index].text = finalText;
      state.pages[index].detectedChapterStart = chapterHeuristic(finalText);
      if(!state.pages[index].chapterTouched) state.pages[index].chapterStart = state.pages[index].detectedChapterStart;
      renderReview();
      setStatus(`Page ${index + 1} reprocessed with safer chat-section replacement.`);
    }catch(err){
      console.error(err);
      state.pages[index].text = originalText;
      alert(`Could not run message-page OCR: ${err.message || err}`);
      setStatus(`Message-page OCR failed on page ${index + 1}. Original OCR was preserved.`);
    }finally{
      button.disabled = false;
      button.textContent = old;
    }
  }

  function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function downloadTxt(){downloadBlob(new Blob([combinedText()],{type:"text/plain;charset=utf-8"}),`${cleanFilename(els.bookTitle.value||"book")}.txt`);}
  function xhtml(title,body){return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en"><head><meta charset="utf-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" href="style.css" type="text/css"/></head><body><section xmlns:epub="http://www.idpf.org/2007/ops" epub:type="bodymatter">${body}</section></body></html>`;}
  function paras(text){return text.split(/\n{2,}/).map(p=>p.trim()).filter(Boolean).map(p=>`<p>${escapeXml(p).replace(/\n/g,"<br/>")}</p>`).join("\n");}

  async function buildEpub(){
    if(!window.JSZip)throw new Error("JSZip did not load.");const sections=buildSections();if(!sections.length)throw new Error("There is no OCR text to export.");const title=(els.bookTitle.value||"Untitled Book").trim(),author=(els.bookAuthor.value||"Unknown Author").trim(),safe=cleanFilename(title),id=`urn:uuid:${crypto.randomUUID?crypto.randomUUID():Date.now()}`,modified=new Date().toISOString().replace(/\.\d{3}Z$/,"Z"),zip=new JSZip();zip.file("mimetype","application/epub+zip",{compression:"STORE"});zip.file("META-INF/container.xml",`<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
    const manifest=['    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>','    <item id="style" href="style.css" media-type="text/css"/>'],spine=[],nav=[];let coverManifest="",coverMeta="",coverSpine="",coverGuide="";
    if(state.coverFile){const type=state.coverFile.type||"image/jpeg",ext=type.includes("png")?"png":type.includes("webp")?"webp":"jpg",name=`cover.${ext}`;zip.file(`EPUB/${name}`,await state.coverFile.arrayBuffer());zip.file("EPUB/cover.xhtml",`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/><title>Cover</title><style>html,body{margin:0;text-align:center}img{max-width:100%;max-height:100vh}</style></head><body><img src="${name}" alt="Cover"/></body></html>`);coverManifest=`\n    <item id="cover-image" href="${name}" media-type="${type}" properties="cover-image"/>\n    <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>`;coverMeta='\n    <meta name="cover" content="cover-image"/>';coverSpine='    <itemref idref="cover-page"/>\n';coverGuide='\n  <guide><reference type="cover" title="Cover" href="cover.xhtml"/></guide>';nav.push('<li><a href="cover.xhtml">Cover</a></li>');}
    sections.forEach((s,i)=>{const fn=`chapter-${String(i+1).padStart(3,"0")}.xhtml`,mid=`chap-${i+1}`,text=s.pages.map(p=>(p.text||"").trim()).filter(Boolean).join("\n\n");zip.file(`EPUB/${fn}`,xhtml(s.title,`<h2>${escapeXml(s.title)}</h2>${paras(text)}`));manifest.push(`    <item id="${mid}" href="${fn}" media-type="application/xhtml+xml"/>`);spine.push(`    <itemref idref="${mid}"/>`);nav.push(`<li><a href="${fn}">${escapeXml(s.title)}</a></li>`);});
    zip.file("EPUB/nav.xhtml",`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><meta charset="utf-8"/><title>Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol>${nav.join("\n")}</ol></nav></body></html>`);zip.file("EPUB/style.css","body{font-family:serif;line-height:1.5;margin:5%}p{margin:0 0 1em}h2{text-align:center;margin:0 0 1.2em}");zip.file("EPUB/package.opf",`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="pub-id">${id}</dc:identifier><dc:title>${escapeXml(title)}</dc:title><dc:creator>${escapeXml(author)}</dc:creator><dc:language>en</dc:language><meta property="dcterms:modified">${modified}</meta>${coverMeta}</metadata><manifest>${manifest.join("\n")}${coverManifest}</manifest><spine>${coverSpine}${spine.join("\n")}</spine>${coverGuide}</package>`);const blob=await zip.generateAsync({type:"blob",mimeType:"application/epub+zip",compression:"DEFLATE",compressionOptions:{level:6}});downloadBlob(blob,`${safe}.epub`);
  }
  async function downloadEpub(){els.downloadEpub.disabled=true;const old=els.downloadEpub.textContent;els.downloadEpub.textContent="Building EPUB…";try{await buildEpub();}catch(err){alert(`Could not build EPUB: ${err.message||err}`);}finally{els.downloadEpub.disabled=false;els.downloadEpub.textContent=old;}}

  document.querySelectorAll("[data-preset]").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll("[data-preset]").forEach(b=>b.classList.remove("active"));btn.classList.add("active");if(btn.dataset.preset==="cloud"){els.cropTop.value=0;els.cropBottom.value=75;els.cropSides.value=0;}else if(btn.dataset.preset==="kindle"){els.cropTop.value=130;els.cropBottom.value=0;els.cropSides.value=0;}else{els.cropTop.value=0;els.cropBottom.value=0;els.cropSides.value=0;}updatePreview();}));
  [els.cropTop,els.cropBottom,els.cropSides].forEach(i=>i.addEventListener("input",updatePreview));
  els.coverInput.addEventListener("change",()=>{const f=els.coverInput.files?.[0]||null;state.coverFile=f;if(state.coverUrl)URL.revokeObjectURL(state.coverUrl);if(f){state.coverUrl=URL.createObjectURL(f);els.coverPreview.src=state.coverUrl;els.coverPreviewWrap.classList.remove("hidden");}else els.coverPreviewWrap.classList.add("hidden");});
  els.imageInput.addEventListener("change",async()=>{state.files=Array.from(els.imageInput.files||[]).sort(naturalSort);state.pages=[];els.fileCount.textContent=`${state.files.length} page${state.files.length===1?"":"s"} loaded`;els.processBtn.disabled=!state.files.length;els.reviewSection.classList.add("hidden");els.exportSection.classList.add("hidden");els.reviewList.innerHTML="";renderThumbs();await updatePreview();setStatus(state.files.length?"Ready to process.":"Add screenshots to begin.");});
  els.clearImages.addEventListener("click",()=>{els.imageInput.value="";state.files=[];state.pages=[];els.fileCount.textContent="0 pages loaded";els.processBtn.disabled=true;els.reviewSection.classList.add("hidden");els.exportSection.classList.add("hidden");els.reviewList.innerHTML="";renderThumbs();updatePreview();setStatus("Add screenshots to begin.");});
  els.processBtn.addEventListener("click",processPages);els.stopBtn.addEventListener("click",()=>{state.stopRequested=true;setStatus("Stop requested. Finishing current page…");});els.reviewSearch.addEventListener("input",renderReview);els.chapterOnly.addEventListener("change",renderReview);els.downloadTxt.addEventListener("click",downloadTxt);els.downloadEpub.addEventListener("click",downloadEpub);updatePreview();
})();
