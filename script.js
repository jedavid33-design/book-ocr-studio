(() => {
  "use strict";

  const BUILD_VERSION = "2.2.0-dropcap-rescue";
  console.info(`Book OCR Studio ${BUILD_VERSION} loaded`);

  const $ = (id) => document.getElementById(id);

  const state = {
    files: [],
    pages: [],
    coverFile: null,
    coverUrl: "",
    worker: null,
    paddle: null,
    stopRequested: false,
    processing: false,
    currentPageIndex: -1,
    reviewMode: "all",
    importedEpub: null,
    dropcapCandidates: [],
  };

  let PaddleOCRClass = null;
  let paddleModulePromise = null;

  async function loadPaddleModule() {
    if (PaddleOCRClass) return PaddleOCRClass;
    if (!paddleModulePromise) {
      paddleModulePromise = (async () => {
        const urls = [
          "https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm",
          "https://esm.sh/@paddleocr/paddleocr-js@0.4.2?bundle"
        ];
        let lastError = null;
        for (const url of urls) {
          try {
            const mod = await import(url);
            if (mod?.PaddleOCR) {
              PaddleOCRClass = mod.PaddleOCR;
              console.info(`Loaded PaddleOCR from ${url}`);
              return PaddleOCRClass;
            }
            lastError = new Error(`PaddleOCR export not found from ${url}`);
          } catch (err) {
            console.warn(`Could not load PaddleOCR from ${url}`, err);
            lastError = err;
          }
        }
        throw lastError || new Error("Could not load PaddleOCR browser module.");
      })();
    }
    try {
      return await paddleModulePromise;
    } catch (err) {
      paddleModulePromise = null;
      throw err;
    }
  }

  const CHECKPOINT_KEY = "bookOcrStudio.progress.current";
  const CHAPTER_MEMORY_KEY = "bookOcrStudio.chapterMemory.current";
  const LEGACY_CHECKPOINT_KEYS = [
    "bookOcrStudio.progress.v12",
    "bookOcrStudio.progress.v11",
    "bookOcrStudio.progress.v10",
    "bookOcrStudio.progress.v9",
  ];
  const WORKER_RECYCLE_EVERY = 12;

  const els = {
    bookTitle: $("bookTitle"),
    bookAuthor: $("bookAuthor"),
    coverInput: $("coverInput"),
    coverPreviewWrap: $("coverPreviewWrap"),
    coverPreview: $("coverPreview"),
    imageInput: $("imageInput"),
    fileCount: $("fileCount"),
    clearImages: $("clearImages"),
    thumbStrip: $("thumbStrip"),
    cropTop: $("cropTop"),
    cropBottom: $("cropBottom"),
    cropSides: $("cropSides"),
    previewCanvas: $("previewCanvas"),
    previewDims: $("previewDims"),
    processBtn: $("processBtn"),
    freshPaddleBtn: $("freshPaddleBtn"),
    stopBtn: $("stopBtn"),
    progressWrap: $("progressWrap"),
    progressLabel: $("progressLabel"),
    progressPercent: $("progressPercent"),
    progressBar: $("progressBar"),
    statusBox: $("statusBox"),
    reviewSection: $("reviewSection"),
    reviewList: $("reviewList"),
    reviewProgress: $("reviewProgress"),
    reviewAllBtn: $("reviewAllBtn"),
    reviewChaptersBtn: $("reviewChaptersBtn"),
    prevPageBtn: $("prevPageBtn"),
    nextPageBtn: $("nextPageBtn"),
    messageOcrBtn: $("messageOcrBtn"),
    exportSection: $("exportSection"),
    downloadTxt: $("downloadTxt"),
    downloadEpub: $("downloadEpub"),
    epubInput: $("epubInput"),
    epubImportStatus: $("epubImportStatus"),
    dropcapSection: $("dropcapSection"),
    dropcapSummary: $("dropcapSummary"),
    scanDropcaps: $("scanDropcaps"),
    acceptHighDropcaps: $("acceptHighDropcaps"),
    dropcapEmpty: $("dropcapEmpty"),
    dropcapResults: $("dropcapResults"),
  };

  const MESSAGE_BUBBLE_COLORS = [
    [234, 216, 182], // incoming bubbles
    [160, 179, 180], // outgoing / ME bubbles
  ];

  function naturalSort(a, b) {
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  }

  function setStatus(message) {
    els.statusBox.textContent = message;
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function escapeXml(str = "") {
    return str
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function cleanFilename(name) {
    return (name || "book")
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, " ")
      .trim() || "book";
  }

  function checkpointSignature() {
    return state.files.map(f => `${f.name}:${f.size}:${f.lastModified || 0}`);
  }

  function saveCheckpoint() {
    if (!state.files.length) return;
    try {
      const payload = {
        signature: checkpointSignature(),
        cropTop: Number(els.cropTop.value) || 0,
        cropBottom: Number(els.cropBottom.value) || 0,
        cropSides: Number(els.cropSides.value) || 0,
        currentPageIndex: state.currentPageIndex,
        pages: state.pages.map(p => ({
          fileName: p.file.name,
          text: p.text || "",
          chapterCandidate: !!p.chapterCandidate,
          chapterStart: !!p.chapterStart,
          chapterTitle: p.chapterTitle || "",
        })),
      };
      localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn("Could not save OCR checkpoint", err);
    }
  }

  function clearCheckpoint() {
    try {
      localStorage.removeItem(CHECKPOINT_KEY);
      LEGACY_CHECKPOINT_KEYS.forEach(key => localStorage.removeItem(key));
    } catch (_) {}
  }

  function saveChapterMemory() {
    if (!state.files.length || !state.pages.length) return;
    try {
      const chapters = state.pages.map((page, index) => ({
        fileName: page.file?.name || state.files[index]?.name || "",
        chapterStart: !!page.chapterStart,
        chapterTitle: page.chapterTitle || "",
      }));
      localStorage.setItem(CHAPTER_MEMORY_KEY, JSON.stringify({
        signatureNames: state.files.map(file => normalizedStem(file.name)),
        chapters,
      }));
    } catch (err) {
      console.warn("Could not save chapter markers", err);
    }
  }

  function rememberedChapterFor(file, index) {
    try {
      const raw = localStorage.getItem(CHAPTER_MEMORY_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      const currentNames = state.files.map(f => normalizedStem(f.name));
      if (!Array.isArray(saved?.signatureNames) || saved.signatureNames.length !== currentNames.length) return null;
      if (!saved.signatureNames.every((name, i) => name === currentNames[i])) return null;

      const chapters = Array.isArray(saved.chapters) ? saved.chapters : [];
      const exact = chapters.find(item => normalizedStem(item.fileName) === normalizedStem(file?.name));
      const item = exact || chapters[index];
      if (!item) return null;
      return {
        chapterStart: !!item.chapterStart,
        chapterTitle: item.chapterTitle || "",
      };
    } catch (_) {
      return null;
    }
  }

  function restartFreshWithPaddle() {
    if (!state.files.length || state.processing) return;

    const ok = confirm(
      "Start this book over with PaddleOCR?\\n\\n" +
      "This clears saved OCR text from the current and older versions. " +
      "Your selected screenshots stay loaded, and existing chapter markers are preserved where possible."
    );
    if (!ok) return;

    saveChapterMemory();
    clearCheckpoint();

    state.pages = [];
    state.currentPageIndex = -1;

    els.progressWrap.classList.add("hidden");
    els.progressBar.value = 0;
    els.progressPercent.textContent = "0%";
    els.progressLabel.textContent = "Ready";
    els.reviewSection.classList.add("hidden");
    els.exportSection.classList.add("hidden");
    els.processBtn.disabled = false;
    els.freshPaddleBtn.disabled = false;

    renderReview();
    setStatus("Old OCR cleared. Ready to process page 1 fresh with PaddleOCR.");
  }

  function signatureFileName(entry) {
    const value = String(entry || "");
    const match = value.match(/^(.*):\d+:\d+$/);
    return match ? match[1] : value;
  }

  function normalizedStem(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function checkpointMatchScore(saved) {
    const signature = checkpointSignature();
    if (!Array.isArray(saved?.signature) || saved.signature.length !== signature.length) return 0;

    // Best case: the browser returned the files with identical metadata.
    if (saved.signature.every((v, i) => v === signature[i])) return 3;

    // iOS/Safari can hand the exact same Photos selection back with different
    // size/lastModified metadata after a reload or deployment. Match names next.
    const savedNames = saved.signature.map(signatureFileName);
    const currentNames = state.files.map(f => f.name);
    if (savedNames.every((name, i) => name === currentNames[i])) return 2;

    // Last safe fallback: same number of files, same ordered filename stems.
    // This tolerates .jpg/.jpeg/.png representation changes without attaching
    // an old book project to an unrelated screenshot batch.
    if (savedNames.every((name, i) => normalizedStem(name) === normalizedStem(currentNames[i]))) return 1;

    return 0;
  }

  function applyCheckpoint(saved) {
    if (Number.isFinite(saved.cropTop)) els.cropTop.value = saved.cropTop;
    if (Number.isFinite(saved.cropBottom)) els.cropBottom.value = saved.cropBottom;
    if (Number.isFinite(saved.cropSides)) els.cropSides.value = saved.cropSides;

    const byName = new Map(state.files.map(f => [f.name, f]));
    const byStem = new Map(state.files.map(f => [normalizedStem(f.name), f]));
    const savedPages = saved.pages || [];

    state.pages = savedPages.map((page, index) => {
      const file = byName.get(page.fileName)
        || byStem.get(normalizedStem(page.fileName))
        || state.files[index];
      if (!file) return null;
      return {
        file,
        text: page.text || "",
        chapterCandidate: !!page.chapterCandidate,
        chapterStart: page.chapterStart != null ? !!page.chapterStart : !!page.chapterCandidate,
        chapterTitle: page.chapterTitle || "",
      };
    }).filter(Boolean);

    const savedIndex = Number(saved.currentPageIndex);
    state.currentPageIndex = state.pages.length
      ? clamp(Number.isFinite(savedIndex) ? savedIndex : state.pages.length - 1, 0, state.pages.length - 1)
      : -1;
  }

  function restoreCheckpointIfMatching() {
    try {
      const keys = [CHECKPOINT_KEY, ...LEGACY_CHECKPOINT_KEYS];
      const candidates = [];

      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;

        let saved;
        try { saved = JSON.parse(raw); } catch (_) { continue; }
        const score = checkpointMatchScore(saved);
        if (!score) continue;
        candidates.push({ key, saved, score, pageCount: Array.isArray(saved.pages) ? saved.pages.length : 0 });
      }

      if (!candidates.length) return 0;

      // Prefer the checkpoint containing the most completed work. This matters
      // if a newer build accidentally saved one fresh page before an older,
      // much larger project was recovered.
      candidates.sort((a, b) => (b.pageCount - a.pageCount) || (b.score - a.score));
      const best = candidates[0];
      applyCheckpoint(best.saved);

      // Re-save in the permanent format with the currently selected files so
      // future version updates no longer depend on old iOS file metadata.
      saveCheckpoint();
      console.info(`Recovered ${state.pages.length} pages from ${best.key} (match score ${best.score}).`);
      return state.pages.length;
    } catch (err) {
      console.warn("Could not restore OCR checkpoint", err);
      return 0;
    }
  }

  async function ensurePaddle() {
    if (state.paddle) return state.paddle;
    setStatus("Loading PaddleOCR PP-OCRv5… The first run can take a moment.");
    const PaddleOCR = await loadPaddleModule();
    try {
      state.paddle = await PaddleOCR.create({
        textDetectionModelName: "PP-OCRv5_mobile_det",
        textRecognitionModelName: "PP-OCRv5_mobile_rec",
        textDetectionBatchSize: 1,
        textRecognitionBatchSize: 6,
        ortOptions: {
          backend: "wasm",
          wasmPaths: "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/",
          numThreads: 1,
          simd: true
        }
      });
      console.info("PaddleOCR initialized", state.paddle.getInitializationSummary?.());
      return state.paddle;
    } catch (err) {
      state.paddle = null;
      setStatus("PaddleOCR could not initialize. Your selected pages are still loaded; try reloading or check your connection.");
      throw err;
    }
  }

  function polyBounds(poly) {
    const points = Array.isArray(poly) ? poly : [];
    const xs = [];
    const ys = [];
    for (const pt of points) {
      if (Array.isArray(pt) && pt.length >= 2) {
        const x = Number(pt[0]);
        const y = Number(pt[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); }
      } else if (pt && typeof pt === "object") {
        const x = Number(pt.x ?? pt[0]);
        const y = Number(pt.y ?? pt[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); }
      }
    }
    if (!xs.length) return { x:0, y:0, w:0, h:0, cx:0, cy:0 };
    const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
    return { x:minX, y:minY, w:maxX-minX, h:maxY-minY, cx:(minX+maxX)/2, cy:(minY+maxY)/2 };
  }

  function median(values) {
    const arr = values.filter(Number.isFinite).sort((a,b)=>a-b);
    if (!arr.length) return 0;
    const mid=Math.floor(arr.length/2);
    return arr.length % 2 ? arr[mid] : (arr[mid-1]+arr[mid])/2;
  }

  function normalizePaddleItems(items) {
    return (Array.isArray(items) ? items : [])
      .map(item => ({
        text: String(item?.text || "").trim(),
        score: Number(item?.score ?? 0),
        box: polyBounds(item?.poly)
      }))
      .filter(item => item.text && item.score >= 0.25)
      .sort((a,b) => (a.box.cy-b.box.cy) || (a.box.x-b.box.x));
  }

  function paddleItemsToText(items, { messageMode=false } = {}) {
    const lines = normalizePaddleItems(items);
    if (!lines.length) return "";
    const heights = lines.map(x => x.box.h).filter(h => h > 2);
    const typicalH = median(heights) || 28;
    const out=[];
    let prev=null;
    for (const line of lines) {
      if (prev) {
        const verticalGap = line.box.y - (prev.box.y + prev.box.h);
        const sameVisualRow = Math.abs(line.box.cy-prev.box.cy) <= typicalH * 0.48;
        if (sameVisualRow) {
          // Rare same-row fragments: append in reading order.
          out[out.length-1] = `${out[out.length-1]} ${line.text}`.replace(/\s{2,}/g," ").trim();
          prev=line;
          continue;
        }
        const blankThreshold = messageMode ? typicalH * 0.58 : typicalH * 0.95;
        if (verticalGap > blankThreshold) out.push("");
      }
      out.push(line.text);
      prev=line;
    }
    return out.join("\n").replace(/\n{3,}/g,"\n\n").trim();
  }

  async function paddleRecognizeCanvas(canvas, { messageMode=false } = {}) {
    const ocr = await ensurePaddle();
    const [result] = await ocr.predict(canvas, {
      textDetLimitSideLen: messageMode ? 1600 : 1280,
      textDetLimitType: "max",
      textDetThresh: messageMode ? 0.25 : 0.3,
      textDetBoxThresh: messageMode ? 0.45 : 0.5,
      textDetUnclipRatio: messageMode ? 1.7 : 1.5,
      textRecScoreThresh: 0.35
    });
    return { text: paddleItemsToText(result?.items, { messageMode }), result };
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Could not load ${file.name}`));
      };
      img.src = url;
    });
  }

  function getCropSettings(img) {
    const top = clamp(Number(els.cropTop.value) || 0, 0, img.height - 1);
    const bottom = clamp(Number(els.cropBottom.value) || 0, 0, img.height - top - 1);
    const sides = clamp(Number(els.cropSides.value) || 0, 0, Math.floor((img.width - 1) / 2));
    return {
      sx: sides,
      sy: top,
      sw: Math.max(1, img.width - sides * 2),
      sh: Math.max(1, img.height - top - bottom),
    };
  }

  function makeCroppedCanvas(img) {
    const { sx, sy, sw, sh } = getCropSettings(img);
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sw, sh);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas;
  }

  function cropCanvasRegion(sourceCanvas, region) {
    const x = clamp(Math.round(region.x), 0, sourceCanvas.width - 1);
    const y = clamp(Math.round(region.y), 0, sourceCanvas.height - 1);
    const w = clamp(Math.round(region.w), 1, sourceCanvas.width - x);
    const h = clamp(Math.round(region.h), 1, sourceCanvas.height - y);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(sourceCanvas, x, y, w, h, 0, 0, w, h);
    return canvas;
  }

  async function updatePreview() {
    if (!state.files.length) {
      const c = els.previewCanvas;
      c.width = 800;
      c.height = 360;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#e6dfd7";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#756c63";
      ctx.font = "32px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Add screenshots to preview crop", c.width / 2, c.height / 2);
      els.previewDims.textContent = "";
      return;
    }

    const img = await loadImageFromFile(state.files[0]);
    const crop = getCropSettings(img);
    const maxW = 1000;
    const scale = Math.min(1, maxW / crop.sw);
    const c = els.previewCanvas;
    c.width = Math.round(crop.sw * scale);
    c.height = Math.round(crop.sh * scale);
    const ctx = c.getContext("2d", { alpha: false });
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, c.width, c.height);
    els.previewDims.textContent = `${crop.sw} × ${crop.sh} px`;
  }

  function renderThumbs() {
    els.thumbStrip.innerHTML = "";
    state.files.slice(0, 40).forEach((file, index) => {
      const wrap = document.createElement("div");
      wrap.className = "thumb";
      const img = document.createElement("img");
      const url = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(url);
      img.src = url;
      img.alt = file.name;
      const number = document.createElement("span");
      number.textContent = index + 1;
      wrap.append(img, number);
      els.thumbStrip.appendChild(wrap);
    });
    if (state.files.length > 40) {
      const more = document.createElement("div");
      more.className = "thumb";
      more.style.display = "grid";
      more.style.placeItems = "center";
      more.textContent = `+${state.files.length - 40}`;
      els.thumbStrip.appendChild(more);
    }
  }

  function chapterHeuristic(text) {
    const normalized = (text || "").replace(/\r/g, "").trimStart();
    if (!normalized) return false;
    const firstLines = normalized.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 6);
    const firstChunk = firstLines.join(" ").slice(0, 220);
    const hasChapterWord = /\b(chapter|prologue|epilogue)\b/i.test(firstChunk);
    const startsWithNumber = /^\d{1,3}\b/.test(firstLines[0] || "");
    const shortAllCaps = firstLines.some(line => line.length >= 2 && line.length <= 24 && /^[A-Z][A-Z\s.'&-]+$/.test(line));
    return hasChapterWord || (startsWithNumber && shortAllCaps) || (startsWithNumber && firstLines.length >= 2);
  }

  function syncCurrentEditor() {
    if (state.currentPageIndex < 0 || !state.pages[state.currentPageIndex]) return;
    const editor = els.reviewList.querySelector("textarea");
    if (!editor) return;
    state.pages[state.currentPageIndex].text = editor.value;
    state.pages[state.currentPageIndex].chapterCandidate = chapterHeuristic(editor.value);
    saveCheckpoint();
  }

  function normalizedPageText(text) {
    return (text || "")
      .replace(/\r/g, "")
      .split("\n")
      .map(line => line.replace(/[ \t]+$/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function detectChapterTitle(text, fallbackNumber = 1) {
    const lines = normalizedPageText(text).split("\n").map(s => s.trim()).filter(Boolean).slice(0, 6);
    if (!lines.length) return `Chapter ${fallbackNumber}`;
    if (/^(prologue|epilogue|interlude)\b/i.test(lines[0])) return lines[0];
    if (/^chapter\b/i.test(lines[0])) return lines[0];
    if (/^\d{1,3}$/.test(lines[0])) {
      if (lines[1] && lines[1].length <= 40) return `Chapter ${lines[0]} — ${lines[1]}`;
      return `Chapter ${lines[0]}`;
    }
    return lines[0].length <= 45 ? lines[0] : `Chapter ${fallbackNumber}`;
  }

  function chapterSections() {
    const starts = state.pages.reduce((arr, page, index) => {
      if (page.chapterStart) arr.push(index);
      return arr;
    }, []);
    if (!starts.length) return [{ title: (els.bookTitle.value || "Book").trim() || "Book", start: 0, end: state.pages.length }];
    const sections = [];
    if (starts[0] > 0) sections.push({ title: "Opening", start: 0, end: starts[0] });
    starts.forEach((start, i) => {
      const end = i + 1 < starts.length ? starts[i + 1] : state.pages.length;
      const page = state.pages[start];
      const title = (page.chapterTitle || "").trim() || detectChapterTitle(page.text, i + 1);
      sections.push({ title, start, end });
    });
    return sections.filter(section => section.end > section.start);
  }

  function stripExportedChapterHeading(text, title) {
    const lines = normalizedPageText(text).split("\n");
    let i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    const first = lines[i]?.trim() || "";
    const second = lines[i + 1]?.trim() || "";
    const norm = v => (v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const nt = norm(title), nf = norm(first), ns = norm(second);
    if ((/^\d{1,3}$/.test(first) || /^chapter\b/i.test(first) || /^(prologue|epilogue|interlude)$/i.test(first)) && nf && nt.includes(nf)) {
      lines.splice(i, 1);
      if (second && ns && nt.includes(ns)) lines.splice(i, 1);
    }
    return lines.join("\n").trim();
  }

  function combinedText() {
    syncCurrentEditor();
    return state.pages
      .map(p => normalizedPageText(p.text))
      .filter(Boolean)
      .join("\n\n");
  }

  function exportParagraphs(text) {
    const normalized = normalizedPageText(text);
    if (!normalized) return [];
    return normalized
      .split(/\n{2,}/)
      .map(block => block.split("\n").map(line => line.trim()).filter(Boolean).join(" ").trim())
      .filter(Boolean);
  }

  function pageImageUrl(file) {
    return URL.createObjectURL(file);
  }

  function reviewIndices() {
    if (state.reviewMode === "chapters") {
      return state.pages.map((page, index) => page.chapterStart ? index : -1).filter(index => index >= 0);
    }
    return state.pages.map((_, index) => index);
  }

  function setReviewMode(mode) {
    state.reviewMode = mode === "chapters" ? "chapters" : "all";
    const indices = reviewIndices();
    if (indices.length && !indices.includes(state.currentPageIndex)) {
      state.currentPageIndex = indices[0];
    }
    els.reviewAllBtn?.classList.toggle("active", state.reviewMode === "all");
    els.reviewChaptersBtn?.classList.toggle("active", state.reviewMode === "chapters");
    renderReview();
    setStatus(state.reviewMode === "chapters"
      ? `Showing ${indices.length} chapter start page${indices.length === 1 ? "" : "s"}.`
      : `Showing all ${state.pages.length} processed pages.`);
  }

  function updateNavigationControls() {
    const processed = state.pages.length;
    const total = state.files.length;
    const indices = reviewIndices();
    const pos = indices.indexOf(state.currentPageIndex);
    els.reviewProgress.textContent = state.reviewMode === "chapters"
      ? `${indices.length} chapter start${indices.length === 1 ? "" : "s"} · ${processed} of ${total} processed`
      : `${processed} of ${total} processed`;

    const hasCurrent = processed > 0 && state.currentPageIndex >= 0;
    els.prevPageBtn.disabled = state.processing || !hasCurrent || pos <= 0;
    els.messageOcrBtn.disabled = state.processing || !hasCurrent;
    els.nextPageBtn.disabled = state.processing || !hasCurrent || pos < 0 || pos >= indices.length - 1;
    els.prevPageBtn.textContent = state.reviewMode === "chapters" ? "Previous chapter" : "Previous page";
    els.nextPageBtn.textContent = state.reviewMode === "chapters" ? "Next chapter" : "Next page";
  }

  function renderReview() {
    els.reviewList.innerHTML = "";

    if (!state.pages.length || state.currentPageIndex < 0) {
      const empty = document.createElement('div');
      empty.className = 'review-empty';
      empty.textContent = state.files.length
        ? 'No pages have been processed yet. Tap “Process all pages” to begin.'
        : 'Add screenshots above to begin.';
      els.reviewList.appendChild(empty);
      updateNavigationControls();
      return;
    }

    state.currentPageIndex = clamp(state.currentPageIndex, 0, state.pages.length - 1);
    const index = state.currentPageIndex;
    const page = state.pages[index];

    const item = document.createElement("article");
    item.className = "review-item";

    const title = document.createElement("div");
    title.className = "review-title";

    const left = document.createElement("div");
    left.className = "left";

    const strong = document.createElement("strong");
    strong.textContent = `Page ${index + 1} of ${state.files.length}`;

    const name = document.createElement("span");
    name.className = "page-name";
    name.textContent = page.file.name;

    left.append(strong, name);
    if (page.chapterCandidate) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "Check chapter start";
      left.appendChild(badge);
    }
    title.append(left);

    const chapterControls = document.createElement("div");
    chapterControls.className = "chapter-controls";

    const chapterCheckLabel = document.createElement("label");
    chapterCheckLabel.className = "chapter-check";
    const chapterCheck = document.createElement("input");
    chapterCheck.type = "checkbox";
    chapterCheck.checked = !!page.chapterStart;
    const chapterCheckText = document.createElement("span");
    chapterCheckText.textContent = "Chapter start";
    chapterCheckLabel.append(chapterCheck, chapterCheckText);

    const chapterTitleLabel = document.createElement("label");
    chapterTitleLabel.className = "chapter-title-input";
    const chapterTitleText = document.createElement("span");
    chapterTitleText.textContent = "Chapter title";
    const chapterTitleInput = document.createElement("input");
    chapterTitleInput.type = "text";
    chapterTitleInput.value = page.chapterTitle || "";
    chapterTitleInput.placeholder = detectChapterTitle(page.text, index + 1);
    chapterTitleInput.disabled = !chapterCheck.checked;
    chapterTitleLabel.append(chapterTitleText, chapterTitleInput);

    chapterCheck.addEventListener("change", () => {
      page.chapterStart = chapterCheck.checked;
      if (chapterCheck.checked && !page.chapterTitle) page.chapterTitle = detectChapterTitle(page.text, index + 1);
      chapterTitleInput.disabled = !chapterCheck.checked;
      chapterTitleInput.value = page.chapterTitle || "";
      saveCheckpoint();
    });
    chapterTitleInput.addEventListener("input", () => {
      page.chapterTitle = chapterTitleInput.value;
      saveCheckpoint();
    });
    chapterControls.append(chapterCheckLabel, chapterTitleLabel);

    const body = document.createElement("div");
    body.className = "review-body";

    const img = document.createElement("img");
    const url = pageImageUrl(page.file);
    img.onload = () => URL.revokeObjectURL(url);
    img.src = url;
    img.alt = `Original screenshot ${index + 1}`;

    const text = document.createElement("textarea");
    text.value = page.text;
    text.setAttribute("aria-label", `OCR text for page ${index + 1}`);
    text.addEventListener("input", () => {
      state.pages[index].text = text.value;
      state.pages[index].chapterCandidate = chapterHeuristic(text.value);
      saveCheckpoint();
    });

    body.append(img, text);
    item.append(title, chapterControls, body);
    els.reviewList.appendChild(item);

    updateNavigationControls();
  }

  async function ensureWorker() {
    // Compatibility shim for older helper functions retained from v19.
    return ensurePaddle();
  }

  async function ocrCanvas(canvas, parameters = {}) {
    const messageMode = String(parameters?.tessedit_pageseg_mode || "") !== "6";
    const { text } = await paddleRecognizeCanvas(canvas, { messageMode });
    return text;
  }

  function cleanBodyText(text) {
    return (text || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function cleanMessageText(text) {
    let out = (text || "")
      .replace(/\r/g, "")
      // Fix OCR's common capital-I error before flattening lines.
      .replace(/(^|[\s(])\|(?=\s|[A-Za-z])/g, "$1I")
      // De-hyphenate words that were split across a line break.
      .replace(/([A-Za-z]{2,})-\s*\n\s*([a-z]{2,})/g, "$1$2")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      // A double quote between letters is almost always a mangled apostrophe.
      .replace(/([A-Za-z])["”]([A-Za-z])/g, "$1'$2")
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, " ")
      // Catch remaining OCR line-wrap artifacts such as "wait- ing".
      .replace(/\b([A-Za-z]{3,})-\s+([a-z]{2,})\b/g, "$1$2")
      .replace(/\s{2,}/g, " ")
      .trim();

    out = out.replace(/^[.,;:!?\-–—]+/, "").trim();

    // Drop bubbles that OCR reduced to punctuation/symbol garbage (for example "@").
    if (!/[A-Za-z0-9]{2}/.test(out)) return "";
    return out;
  }

  function cleanLabel(text) {
    let label = (text || "")
      .toUpperCase()
      .replace(/[^A-Z&'\- ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!label) return "";
    const words = label.split(" ").filter(Boolean);
    if (!words.length || words.length > 2) return "";
    if (label.length > 18) return "";

    // OCR sometimes grabs the first few words of the message itself as the
    // speaker label. Reject phrase-like results while still allowing names.
    const phraseWords = new Set([
      "WHAT","WHY","WHEN","WHERE","WHO","HOW","ARE","YOU","YOUR","AND","BUT",
      "THE","THIS","THAT","HAVE","HAS","HAD","TO","OF","FOR","WITH","ABOUT","NOT",
      "CAN","COULD","WOULD","SHOULD","WILL","JUST","SHE","HE","THEY","WE","I",
      "NOTED","RIGHT","FINE","OKAY","YES","NO","THANKS","THANK","HELLO","HEY","SURE","GOT"
    ]);
    if (words.some(w => phraseWords.has(w))) {
      if (!(words.length === 1 && ["I","ME"].includes(words[0]))) return "";
    }
    if (words.length === 1 && words[0].length < 3 && words[0] !== "ME") return "";

    return words.join(" ");
  }

  function colorDistanceSq(r, g, b, target) {
    const dr = r - target[0];
    const dg = g - target[1];
    const db = b - target[2];
    return dr * dr + dg * dg + db * db;
  }

  function sampleBackgroundColor(data, w, h) {
    const points = [
      [10, 10],
      [w - 11, 10],
      [10, h - 11],
      [w - 11, h - 11],
      [Math.floor(w / 2), 10],
      [10, Math.floor(h / 2)],
    ];
    let r = 0, g = 0, b = 0, n = 0;
    points.forEach(([x, y]) => {
      const xx = clamp(x, 0, w - 1);
      const yy = clamp(y, 0, h - 1);
      const i = (yy * w + xx) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n += 1;
    });
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  }

  function mergeBoxes(boxes, pad = 8) {
    const merged = [];
    boxes.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    boxes.forEach(box => {
      let target = null;
      for (const existing of merged) {
        const overlapX = !(box.x > existing.x + existing.w + pad || existing.x > box.x + box.w + pad);
        const overlapY = !(box.y > existing.y + existing.h + pad || existing.y > box.y + box.h + pad);
        if (overlapX && overlapY) {
          target = existing;
          break;
        }
      }
      if (!target) {
        merged.push({ ...box });
      } else {
        const x1 = Math.min(target.x, box.x);
        const y1 = Math.min(target.y, box.y);
        const x2 = Math.max(target.x + target.w, box.x + box.w);
        const y2 = Math.max(target.y + target.h, box.y + box.h);
        target.x = x1;
        target.y = y1;
        target.w = x2 - x1;
        target.h = y2 - y1;
        target.area += box.area || 0;
      }
    });
    return merged;
  }

  function detectMessageBubbles(sourceCanvas) {
    // v19: keep each colored bubble as its own connected component. v18 merged
    // components that were merely close together, which accidentally fused stacked
    // bubbles into one giant OCR crop on several of our regression pages.
    const scale = sourceCanvas.width > 900 ? 0.5 : 0.6;
    const w = Math.max(1, Math.round(sourceCanvas.width * scale));
    const h = Math.max(1, Math.round(sourceCanvas.height * scale));
    const small = document.createElement("canvas");
    small.width = w;
    small.height = h;
    const sctx = small.getContext("2d", { alpha: false, willReadFrequently: true });
    sctx.drawImage(sourceCanvas, 0, 0, w, h);
    const { data } = sctx.getImageData(0, 0, w, h);

    const bg = sampleBackgroundColor(data, w, h);
    const mask = new Uint8Array(w * h);
    const bubbleThreshSq = 46 * 46;
    const bgThreshSq = 18 * 18;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const farFromBg = colorDistanceSq(r, g, b, bg) > bgThreshSq;
        const nearBubble = MESSAGE_BUBBLE_COLORS.some(color => colorDistanceSq(r, g, b, color) < bubbleThreshSq);
        if (farFromBg && nearBubble) mask[y * w + x] = 1;
      }
    }

    const visited = new Uint8Array(w * h);
    const boxes = [];
    const queueX = [];
    const queueY = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const pos = y * w + x;
        if (!mask[pos] || visited[pos]) continue;
        let head = 0;
        queueX.length = 0;
        queueY.length = 0;
        queueX.push(x);
        queueY.push(y);
        visited[pos] = 1;

        let minX = x, maxX = x, minY = y, maxY = y, count = 0;

        while (head < queueX.length) {
          const cx = queueX[head];
          const cy = queueY[head];
          head += 1;
          count += 1;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          for (let ny = cy - 1; ny <= cy + 1; ny++) {
            if (ny < 0 || ny >= h) continue;
            for (let nx = cx - 1; nx <= cx + 1; nx++) {
              if (nx < 0 || nx >= w) continue;
              const npos = ny * w + nx;
              if (!mask[npos] || visited[npos]) continue;
              visited[npos] = 1;
              queueX.push(nx);
              queueY.push(ny);
            }
          }
        }

        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const density = count / Math.max(1, bw * bh);

        // The actual rounded fills are dense components. Decorative/text fragments
        // that happen to be close to a bubble color are much sparser.
        if (count < 55 || bw < 28 || bh < 10) continue;
        if (bw < bh || density < 0.43) continue;

        const box = {
          x: Math.round(minX / scale),
          y: Math.round(minY / scale),
          w: Math.round(bw / scale),
          h: Math.round(bh / scale),
          area: count,
          density,
        };
        if (box.w < 70 || box.h < 20) continue;
        boxes.push(box);
      }
    }

    // Remove near-duplicate detections without ever joining neighboring bubbles.
    const unique = [];
    boxes.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    for (const box of boxes) {
      const duplicate = unique.some(other => {
        const x1 = Math.max(box.x, other.x);
        const y1 = Math.max(box.y, other.y);
        const x2 = Math.min(box.x + box.w, other.x + other.w);
        const y2 = Math.min(box.y + box.h, other.y + other.h);
        const overlap = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        const smaller = Math.min(box.w * box.h, other.w * other.h);
        return smaller > 0 && overlap / smaller > 0.82;
      });
      if (!duplicate) unique.push(box);
    }

    small.width = 1;
    small.height = 1;
    return unique.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  }

  function buildNarrativeRegion(canvas, topY, bottomY) {
    const y = clamp(Math.round(topY), 0, canvas.height - 1);
    const h = clamp(Math.round(bottomY - topY), 0, canvas.height - y);
    return { x: 0, y, w: canvas.width, h };
  }

  async function ocrNarrativeRegion(canvas, topY, bottomY) {
    const region = buildNarrativeRegion(canvas, topY, bottomY);
    if (region.h < 24) return "";
    const cropped = cropCanvasRegion(canvas, region);
    const text = await ocrCanvas(cropped, {
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1",
    });
    return cleanBodyText(text);
  }

  function upscaleCanvas(sourceCanvas, factor = 2) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceCanvas.width * factor));
    canvas.height = Math.max(1, Math.round(sourceCanvas.height * factor));
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function highContrastCanvas(sourceCanvas) {
    const canvas = document.createElement("canvas");
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    ctx.drawImage(sourceCanvas, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      const v = gray < 185 ? 0 : 255;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  function messageTextQuality(text) {
    const t = (text || "").trim();
    if (!t) return -100;
    const letters = (t.match(/[A-Za-z]/g) || []).length;
    const words = t.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
    const normalWords = words.filter(w => w.length >= 2).length;
    const oneLetterWords = words.filter(w => w.length === 1 && !/^[aAI]$/.test(w)).length;
    const junk = (t.match(/[^A-Za-z0-9\s.,!?;:'"()&—–-]/g) || []).length;
    return letters + normalWords * 8 - oneLetterWords * 10 - junk * 5;
  }

  async function recognizeBestMessageCrop(cropped, modes = [6, 7]) {
    const scaled = upscaleCanvas(cropped, cropped.width < 700 ? 2.6 : 1.8);
    const contrast = highContrastCanvas(scaled);
    let best = "";
    let bestScore = -Infinity;

    for (const source of [scaled, contrast]) {
      for (const mode of modes) {
        const raw = await ocrCanvas(source, {
          tessedit_pageseg_mode: String(mode),
          preserve_interword_spaces: "1",
        });
        const cleaned = cleanMessageText(raw);
        const score = messageTextQuality(cleaned);
        if (score > bestScore) {
          best = cleaned;
          bestScore = score;
        }
      }
    }
    scaled.width = 1;
    scaled.height = 1;
    contrast.width = 1;
    contrast.height = 1;
    return { text: best, score: bestScore };
  }

  function bubbleLane(canvas, bubble) {
    const rightEdge = bubble.x + bubble.w;
    // Kindle message bubbles are visually anchored to either the left or right lane.
    // Using the outer edge is more reliable than the center for long bubbles.
    if (rightEdge > canvas.width * 0.78 && bubble.x > canvas.width * 0.25) return "right";
    return "left";
  }

  function horizontalOverlapRatio(a, b) {
    const left = Math.max(a.x, b.x);
    const right = Math.min(a.x + a.w, b.x + b.w);
    const overlap = Math.max(0, right - left);
    return overlap / Math.max(1, Math.min(a.w, b.w));
  }

  function labelSpaceAbove(bubble, priorBubbles) {
    // Do not let the label crop reach into a previous message bubble. This was the
    // source of fake labels such as "WHAT ARE YOU" and "AND YOU HAVE".
    let blockerBottom = 0;
    for (const prev of priorBubbles) {
      if (prev.y >= bubble.y) continue;
      if (horizontalOverlapRatio(prev, bubble) < 0.18) continue;
      blockerBottom = Math.max(blockerBottom, prev.y + prev.h);
    }
    const top = Math.max(blockerBottom + 5, bubble.y - 48);
    const bottom = bubble.y - 7;
    return { top, bottom, height: bottom - top };
  }

  async function ocrBubbleLabel(canvas, bubble, priorBubbles = []) {
    const space = labelSpaceAbove(bubble, priorBubbles);
    if (space.height < 14) return "";

    // Speaker labels are tiny and hug the bubble edge. Keep a safety gap above the
    // fill so the first line of message text can never leak into this crop.
    const lane = bubbleLane(canvas, bubble);
    const labelWidth = Math.min(260, Math.max(110, Math.round(bubble.w * 0.45)));
    const x = lane === "right"
      ? Math.max(0, bubble.x + bubble.w - labelWidth)
      : Math.max(0, bubble.x - 8);
    const bottom = Math.max(space.top, bubble.y - 12);
    const region = {
      x,
      y: space.top,
      w: Math.min(canvas.width - x, labelWidth),
      h: Math.min(30, Math.max(0, bottom - space.top)),
    };
    if (region.h < 12) return "";

    const cropped = cropCanvasRegion(canvas, region);
    const scaled = upscaleCanvas(cropped, 4.0);
    const contrast = highContrastCanvas(scaled);
    let best = "";
    let bestScore = -Infinity;

    for (const source of [scaled, contrast]) {
      for (const mode of [7, 13]) {
        const worker = await ensureWorker();
        await worker.setParameters({
          tessedit_pageseg_mode: String(mode),
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz&'- ",
          preserve_interword_spaces: "1",
        });
        const result = await worker.recognize(source);
        const raw = result?.data?.text || "";
        const label = cleanLabel(raw);
        if (!label) continue;
        const confidence = Number(result?.data?.confidence) || 0;
        const words = label.split(/\s+/).filter(Boolean);
        // Prefer confident, compact labels; two-word names remain supported.
        const score = confidence + Math.min(18, label.length) - (words.length - 1) * 4;
        if (score > bestScore) {
          best = label;
          bestScore = score;
        }
      }
    }

    cropped.width = 1;
    cropped.height = 1;
    scaled.width = 1;
    scaled.height = 1;
    contrast.width = 1;
    contrast.height = 1;
    return bestScore >= 35 ? best : "";
  }

  async function ocrBubbleText(canvas, bubble) {
    const normalRegion = {
      x: Math.max(0, bubble.x - 12),
      y: Math.max(0, bubble.y - 8),
      w: Math.min(canvas.width - Math.max(0, bubble.x - 12), bubble.w + 24),
      h: Math.min(canvas.height - Math.max(0, bubble.y - 8), bubble.h + 16),
    };
    const normal = cropCanvasRegion(canvas, normalRegion);
    let best = await recognizeBestMessageCrop(normal, [6, 7]);
    normal.width = 1;
    normal.height = 1;

    // If the first pass looks fragmented, retry with more breathing room. This helps
    // later-book message layouts where bubble fills, padding, and font sizes change.
    if (best.score < 55 || /(?:\b[A-Z]\b\s*){3,}/.test(best.text)) {
      const padX = Math.max(22, Math.round(bubble.w * 0.08));
      const padY = Math.max(14, Math.round(bubble.h * 0.14));
      const x = Math.max(0, bubble.x - padX);
      const y = Math.max(0, bubble.y - padY);
      const wideRegion = {
        x,
        y,
        w: Math.min(canvas.width - x, bubble.w + padX * 2),
        h: Math.min(canvas.height - y, bubble.h + padY * 2),
      };
      const wide = cropCanvasRegion(canvas, wideRegion);
      const retry = await recognizeBestMessageCrop(wide, [4, 6, 11, 12]);
      wide.width = 1;
      wide.height = 1;
      if (retry.score > best.score) best = retry;
    }

    return best.text;
  }

  async function runMessagePageOcr(index) {
    const page = state.pages[index];
    if (!page) return;

    const img = await loadImageFromFile(page.file);
    const canvas = makeCroppedCanvas(img);
    setStatus(`PaddleOCR is re-reading message page ${index + 1}…`);

    const { text, result } = await paddleRecognizeCanvas(canvas, { messageMode: true });
    const finalText = cleanBodyText(text);
    if (!finalText) throw new Error("PaddleOCR did not find readable text on this page.");

    state.pages[index].text = finalText;
    state.pages[index].chapterCandidate = chapterHeuristic(finalText);
    saveCheckpoint();

    const count = result?.items?.length || 0;
    setStatus(`PaddleOCR updated page ${index + 1} from ${count} detected text lines.`);
    canvas.width = 1;
    canvas.height = 1;
  }

  async function processSinglePage(index, { batch = false } = {}) {
    if (!state.files.length) return;
    if (index < 0 || index >= state.files.length) return;

    state.processing = true;
    els.processBtn.disabled = true;
    els.nextPageBtn.disabled = true;
    els.prevPageBtn.disabled = true;
    els.messageOcrBtn.disabled = true;
    els.progressWrap.classList.remove("hidden");
    els.reviewSection.classList.remove("hidden");
    els.exportSection.classList.remove("hidden");
    renderReview();

    try {
      els.progressLabel.textContent = `Page ${index + 1}: PaddleOCR`;
      const file = state.files[index];
      setStatus(`PaddleOCR processing page ${index + 1} of ${state.files.length}: ${file.name}`);
      const img = await loadImageFromFile(file);
      const canvas = makeCroppedCanvas(img);
      const paddleResult = await paddleRecognizeCanvas(canvas, { messageMode: false });
      const text = cleanBodyText(paddleResult.text || "");
      const isChapter = chapterHeuristic(text);
      const rememberedChapter = rememberedChapterFor(file, index);
      const pageData = {
        file,
        text,
        chapterCandidate: isChapter,
        chapterStart: rememberedChapter ? rememberedChapter.chapterStart : isChapter,
        chapterTitle: rememberedChapter && rememberedChapter.chapterTitle
          ? rememberedChapter.chapterTitle
          : detectChapterTitle(text, index + 1)
      };

      if (index < state.pages.length) state.pages[index] = pageData;
      else state.pages.push(pageData);

      state.currentPageIndex = index;
      saveCheckpoint();
      if (!batch) renderReview();

      canvas.width = 1;
      canvas.height = 1;

      const pct = Math.round(((index + 1) / state.files.length) * 100);
      els.progressBar.value = pct;
      els.progressPercent.textContent = `${pct}%`;
      if (!batch) setStatus(`Finished page ${index + 1} of ${state.files.length}.`);
    } catch (err) {
      console.error(err);
      saveCheckpoint();
      setStatus(`OCR failed on page ${index + 1}. Your previous progress was preserved.`);
      if (!batch) alert(`OCR failed on page ${index + 1}: ${err.message || err}`);
      else throw err;
    } finally {
      state.processing = false;
      els.processBtn.disabled = !state.files.length || state.pages.length >= state.files.length;
      updateNavigationControls();
    }
  }


  async function processAllPages() {
    if (!state.files.length || state.processing) return;
    els.reviewSection.classList.remove("hidden");
    els.exportSection.classList.remove("hidden");
    const startIndex = state.pages.length;
    if (startIndex >= state.files.length) {
      setStatus("All pages are already processed.");
      setReviewMode("chapters");
      return;
    }

    setStatus(`Batch OCR starting at page ${startIndex + 1} of ${state.files.length}…`);
    for (let index = startIndex; index < state.files.length; index++) {
      try {
        await processSinglePage(index, { batch: true });
        // Yield to iPadOS between pages so the UI can repaint and memory can settle.
        await new Promise(resolve => setTimeout(resolve, 60));
      } catch (err) {
        console.error(err);
        setStatus(`Batch OCR stopped on page ${index + 1}. Pages 1–${index} are safely saved. Tap Process all pages to resume.`);
        renderReview();
        return;
      }
    }

    state.currentPageIndex = 0;
    state.reviewMode = "chapters";
    saveCheckpoint();
    renderReview();
    const chapters = reviewIndices().length;
    setStatus(`Batch OCR complete: ${state.pages.length} pages processed. Showing ${chapters} detected chapter start page${chapters === 1 ? "" : "s"} for review.`);
  }

  async function goToPreviousPage() {
    if (state.processing) return;
    const indices = reviewIndices();
    const pos = indices.indexOf(state.currentPageIndex);
    if (pos <= 0) return;
    state.currentPageIndex = indices[pos - 1];
    saveCheckpoint();
    renderReview();
  }

  async function goToNextPage() {
    if (state.processing) return;
    const indices = reviewIndices();
    const pos = indices.indexOf(state.currentPageIndex);
    if (pos < 0 || pos >= indices.length - 1) return;
    state.currentPageIndex = indices[pos + 1];
    saveCheckpoint();
    renderReview();
  }

  // Dropcap Rescue intentionally works on completed text. It never calls an OCR
  // engine. For a live project, the original File objects provide the optional
  // image preview. For an imported EPUB, the original ZIP and XHTML documents
  // stay in memory so only accepted paragraph repairs are written back.
  const COMMON_DROPCAP_WORDS = new Map([
    ["abrina", "Sabrina"], ["rap", "Crap"], ["tay", "Stay"],
    ["ucker", "Tucker"], ["he", "The"], ["ractice", "Practice"],
    ["ope's", "Hope's"], ["fter", "After"], ["oly", "Holy"]
  ]);

  function firstWordInfo(text) {
    const match = String(text || "").match(/^([\s“‘"'(\[{—–-]*)([\p{L}][\p{L}’'-]*)/u);
    if (!match) return null;
    return { prefix: match[1], word: match[2], start: match[1].length, end: match[0].length };
  }

  function excerpt(text, limit = 150) {
    const flat = String(text || "").replace(/\s+/g, " ").trim();
    return flat.length > limit ? `${flat.slice(0, limit).trim()}…` : flat;
  }

  function standaloneFragment(text, paragraphText) {
    const lines = String(text || "").split(/\n+/).map(line => line.trim()).filter(Boolean);
    const target = String(paragraphText || "").trim();
    const targetIndex = lines.findIndex(line => line === target || line.startsWith(target.slice(0, 40)));
    let best = null;
    lines.forEach((line, index) => {
      if (line === target || !/^\P{N}$/u.test(line)) return;
      const distance = targetIndex < 0 ? 99 : Math.abs(index - targetIndex);
      if (!best || distance < best.distance) best = { value: line, lineIndex: index, distance, source: "line" };
    });
    if (!best) {
      const tokens = Array.from(target.matchAll(/(?:^|\s)([^\p{N}\s])(?=\s|[.,!?;:]|$)/gu));
      const token = tokens.find(match => match.index > 0);
      if (token) best = { value: token[1], charIndex: token.index, distance: token.index < 30 ? 1 : 3, source: "token" };
    }
    return best;
  }

  function removeDetachedToken(text, fragment, firstWordEnd) {
    if (!fragment?.value) return text;
    const escaped = fragment.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (fragment.source === "token") {
      const tail = text.slice(firstWordEnd);
      return text.slice(0, firstWordEnd) + tail.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|[.,!?;:]|$)`, "u"), "$1").replace(/ {2,}/g, " ");
    }
    return text;
  }

  function likelyOpeningParagraphs() {
    if (state.importedEpub) {
      return state.importedEpub.documents.map((doc, pageIndex) => {
        const paragraphs = Array.from(doc.dom.querySelectorAll("p"));
        const target = paragraphs.find(p => p.textContent.trim().length > 12) || paragraphs[0];
        if (!target) return null;
        return { pageIndex, paragraphIndex: paragraphs.indexOf(target), text: target.textContent, element: target, doc };
      }).filter(Boolean);
    }

    return state.pages.flatMap((page, pageIndex) => {
      if (!(page.chapterStart || page.chapterCandidate || pageIndex === 0)) return [];
      const paragraphs = exportParagraphs(page.text);
      let paragraphIndex = 0;
      if (paragraphs.length > 1 && /^(chapter|prologue|epilogue|part|\d+|[ivxlcdm]+\b)/i.test(paragraphs[0])) paragraphIndex = 1;
      const text = paragraphs[paragraphIndex] || paragraphs[0];
      return text ? [{ pageIndex, paragraphIndex, text, page }] : [];
    });
  }

  function buildDropcapCandidate(opening, id) {
    const info = firstWordInfo(opening.text);
    if (!info || !/^\p{Ll}/u.test(info.word)) return null;

    const pageText = state.importedEpub
      ? Array.from(opening.doc.dom.querySelectorAll("p, div"))
        .map(element => element.textContent.trim()).filter(Boolean).join("\n")
      : opening.page.text;
    const fragment = standaloneFragment(pageText, opening.text);
    const latinFragment = fragment && /^\p{Lu}$/u.test(fragment.value) ? fragment.value : "";
    const dictionaryProposal = COMMON_DROPCAP_WORDS.get(info.word.toLowerCase()) || "";
    let proposedWord = "";
    let confidence = "ambiguous";
    let reason = "The chapter-opening word begins with a lowercase letter, but no reliable detached letter was found.";

    if (latinFragment) {
      proposedWord = `${latinFragment}${info.word}`;
      const fragmentMatchesSuggestion = !dictionaryProposal || dictionaryProposal.toLowerCase() === proposedWord.toLowerCase();
      confidence = fragment.distance <= 2 && fragmentMatchesSuggestion ? "high" : "ambiguous";
      reason = confidence === "high"
        ? `A detached capital “${latinFragment}” appears beside this opening paragraph.`
        : `A detached capital “${latinFragment}” appears elsewhere in this chapter; please verify it.`;
    } else if (dictionaryProposal) {
      proposedWord = dictionaryProposal;
      reason = fragment
        ? `A stray “${fragment.value}” may be the misread decorative letter. The proposed word is only a review suggestion.`
        : "The opening resembles a common word missing its first letter. This is a review suggestion only.";
    } else {
      proposedWord = info.word;
    }

    let proposedText = `${opening.text.slice(0, info.start)}${proposedWord}${opening.text.slice(info.end)}`;
    proposedText = removeDetachedToken(proposedText, fragment, info.start + proposedWord.length);
    return {
      id, ...opening, info, fragment, confidence, reason,
      before: opening.text, proposed: proposedText, status: "pending"
    };
  }

  function scanDropcaps() {
    syncCurrentEditor();
    const openings = likelyOpeningParagraphs();
    state.dropcapCandidates = openings.map((opening, index) => buildDropcapCandidate(opening, index + 1)).filter(Boolean);
    renderDropcapResults();
    const count = state.dropcapCandidates.length;
    setStatus(count
      ? `Dropcap Rescue found ${count} chapter opening${count === 1 ? "" : "s"} to review. No OCR was run.`
      : "Dropcap Rescue found no likely missing drop caps. No text was changed and no OCR was run.");
  }

  function replaceLocalParagraph(candidate, replacement) {
    const page = state.pages[candidate.pageIndex];
    if (!page) return;
    const blocks = normalizedPageText(page.text).split(/\n{2,}/);
    if (!blocks[candidate.paragraphIndex]) return;
    blocks[candidate.paragraphIndex] = replacement;
    page.text = blocks.join("\n\n");

    if (candidate.fragment?.value) {
      const escaped = candidate.fragment.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (candidate.fragment.source === "line") {
        const detached = new RegExp(`(^|\\n)\\s*${escaped}\\s*(?=\\n|$)`, "u");
        page.text = page.text.replace(detached, "$1").replace(/\n{3,}/g, "\n\n");
      }
    }
    page.chapterCandidate = chapterHeuristic(page.text);
    saveCheckpoint();
  }

  function applyDropcap(candidate, replacement) {
    if (!candidate || candidate.status !== "pending") return;
    const clean = String(replacement || "").trim();
    if (!clean) return;

    if (state.importedEpub) {
      candidate.element.textContent = clean;
      if (candidate.fragment?.value) {
        const siblings = Array.from(candidate.doc.dom.querySelectorAll("p, div"));
        const detached = siblings.find(el => el !== candidate.element && el.textContent.trim() === candidate.fragment.value);
        if (detached) detached.remove();
      }
      candidate.doc.changed = true;
      candidate.text = clean;
      state.pages[candidate.pageIndex].text = Array.from(candidate.doc.dom.querySelectorAll("p"))
        .map(p => p.textContent.trim()).filter(Boolean).join("\n\n");
    } else {
      replaceLocalParagraph(candidate, clean);
      candidate.text = clean;
    }
    candidate.status = "accepted";
    renderDropcapResults();
  }

  function rejectDropcap(candidate) {
    if (!candidate) return;
    candidate.status = "rejected";
    renderDropcapResults();
  }

  function candidateImageUrl(candidate) {
    const file = candidate.page?.file;
    return file ? pageImageUrl(file) : "";
  }

  function renderDropcapResults() {
    const candidates = state.dropcapCandidates;
    els.dropcapResults.innerHTML = "";
    const pending = candidates.filter(c => c.status === "pending");
    const highPending = pending.filter(c => c.confidence === "high");
    els.dropcapSummary.textContent = candidates.length
      ? `${pending.length} to review · ${candidates.length - pending.length} resolved`
      : "No candidates";
    els.acceptHighDropcaps.disabled = !highPending.length;
    els.dropcapEmpty.classList.toggle("hidden", candidates.length > 0);
    if (!candidates.length) els.dropcapEmpty.textContent = "No likely drop-cap failures were found. Nothing was changed.";

    candidates.forEach(candidate => {
      const card = document.createElement("article");
      card.className = `dropcap-card ${candidate.status !== "pending" ? "resolved" : ""}`;
      const head = document.createElement("div");
      head.className = "dropcap-head";
      const title = document.createElement("strong");
      title.textContent = state.importedEpub
        ? `Chapter file ${candidate.pageIndex + 1}`
        : `Page ${candidate.pageIndex + 1}`;
      const badge = document.createElement("span");
      badge.className = `confidence ${candidate.confidence}`;
      badge.textContent = candidate.status === "pending"
        ? `${candidate.confidence === "high" ? "High confidence" : "Ambiguous"}`
        : candidate.status === "accepted" ? "Accepted" : "Rejected";
      head.append(title, badge);

      const body = document.createElement("div");
      body.className = "dropcap-body";
      const copy = document.createElement("div");
      copy.className = "dropcap-copy";
      const note = document.createElement("p");
      note.className = "dropcap-note";
      note.textContent = candidate.reason;
      const comparison = document.createElement("div");
      comparison.className = "before-after";
      const before = document.createElement("div");
      before.textContent = `Before: ${excerpt(candidate.before)}`;
      const proposed = document.createElement("div");
      proposed.className = "proposed";
      proposed.textContent = `Proposed: ${excerpt(candidate.proposed)}`;
      comparison.append(before, proposed);
      const edit = document.createElement("textarea");
      edit.className = "dropcap-edit";
      edit.rows = 3;
      edit.value = candidate.proposed;
      edit.disabled = candidate.status !== "pending";
      edit.setAttribute("aria-label", "Editable proposed correction");
      const actions = document.createElement("div");
      actions.className = "dropcap-actions";
      const accept = document.createElement("button");
      accept.className = "button primary";
      accept.type = "button";
      accept.textContent = "Accept correction";
      accept.disabled = candidate.status !== "pending";
      accept.addEventListener("click", () => applyDropcap(candidate, edit.value));
      const reject = document.createElement("button");
      reject.className = "button ghost";
      reject.type = "button";
      reject.textContent = "Reject";
      reject.disabled = candidate.status !== "pending";
      reject.addEventListener("click", () => rejectDropcap(candidate));
      actions.append(accept, reject);
      copy.append(note, comparison, edit, actions);

      const source = document.createElement("div");
      source.className = "dropcap-source";
      const imageUrl = candidateImageUrl(candidate);
      if (imageUrl) {
        const img = document.createElement("img");
        img.src = imageUrl;
        img.alt = `Source page ${candidate.pageIndex + 1}`;
        source.append(img);
      } else {
        const unavailable = document.createElement("p");
        unavailable.className = "dropcap-note";
        unavailable.textContent = "Source image unavailable in an imported EPUB. Review the before/proposed text and edit if needed.";
        source.append(unavailable);
      }
      body.append(copy, source);
      card.append(head, body);
      els.dropcapResults.append(card);
    });
  }

  async function importEpub(file) {
    if (!file || !window.JSZip) return;
    const zip = await JSZip.loadAsync(file);
    const containerFile = zip.file("META-INF/container.xml");
    if (!containerFile) throw new Error("This EPUB has no META-INF/container.xml file.");
    const parser = new DOMParser();
    const container = parser.parseFromString(await containerFile.async("text"), "application/xml");
    const rootPath = container.querySelector("rootfile")?.getAttribute("full-path");
    if (!rootPath) throw new Error("Could not find the EPUB package document.");
    const opfFile = zip.file(rootPath);
    if (!opfFile) throw new Error("Could not open the EPUB package document.");
    const opf = parser.parseFromString(await opfFile.async("text"), "application/xml");
    const opfDir = rootPath.includes("/") ? rootPath.slice(0, rootPath.lastIndexOf("/") + 1) : "";
    const items = new Map(Array.from(opf.querySelectorAll("manifest item")).map(item => [item.getAttribute("id"), item]));
    const paths = Array.from(opf.querySelectorAll("spine itemref"))
      .map(ref => items.get(ref.getAttribute("idref")))
      .filter(item => item && /xhtml|html/i.test(item.getAttribute("media-type") || ""))
      .map(item => `${opfDir}${item.getAttribute("href")}`.replace(/\/\.\//g, "/"));
    const documents = [];
    for (const path of paths) {
      const entry = zip.file(path);
      if (!entry) continue;
      const source = await entry.async("text");
      const dom = parser.parseFromString(source, "application/xhtml+xml");
      if (dom.querySelector("parsererror")) continue;
      if (!dom.querySelector("p")) continue;
      documents.push({ path, dom, source, changed: false });
    }
    if (!documents.length) throw new Error("No readable chapter paragraphs were found in this EPUB.");

    state.importedEpub = { fileName: file.name, zip, documents };
    state.files = [];
    state.pages = documents.map((doc, index) => ({
      file: { name: doc.path },
      text: Array.from(doc.dom.querySelectorAll("p")).map(p => p.textContent.trim()).filter(Boolean).join("\n\n"),
      chapterCandidate: true, chapterStart: true, chapterTitle: `Chapter ${index + 1}`
    }));
    state.currentPageIndex = 0;
    state.dropcapCandidates = [];
    const title = opf.querySelector("title")?.textContent?.trim();
    const author = opf.querySelector("creator")?.textContent?.trim();
    if (title) els.bookTitle.value = title;
    if (author) els.bookAuthor.value = author;
    els.epubImportStatus.textContent = `Imported ${file.name}: ${documents.length} chapter file${documents.length === 1 ? "" : "s"}. Ready to scan; no OCR will run.`;
    els.reviewSection.classList.add("hidden");
    els.dropcapSection.classList.remove("hidden");
    els.exportSection.classList.remove("hidden");
    renderDropcapResults();
    scanDropcaps();
  }

  async function exportRepairedImportedEpub() {
    const imported = state.importedEpub;
    if (!imported) return false;
    const serializer = new XMLSerializer();
    imported.documents.forEach(doc => {
      if (doc.changed) imported.zip.file(doc.path, serializer.serializeToString(doc.dom));
    });
    const blob = await imported.zip.generateAsync({
      type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE", compressionOptions: { level: 6 }
    });
    const base = imported.fileName.replace(/\.epub$/i, "") || cleanFilename(els.bookTitle.value);
    downloadBlob(blob, `${base}-dropcap-rescued.epub`);
    return true;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function downloadTxt() {
    syncCurrentEditor();
    const paragraphs = state.pages
      .flatMap(page => exportParagraphs(page.text))
      .filter(Boolean);
    const text = paragraphs.join("\n\n");
    const title = cleanFilename(els.bookTitle.value || "book");
    downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), `${title}.txt`);
  }

  async function buildEpub() {
    if (!window.JSZip) throw new Error("JSZip did not load.");
    if (state.importedEpub) {
      await exportRepairedImportedEpub();
      return;
    }
    syncCurrentEditor();
    if (!state.pages.some(p => normalizedPageText(p.text))) throw new Error("There is no OCR text to export.");

    const title = (els.bookTitle.value || "Untitled Book").trim();
    const author = (els.bookAuthor.value || "Unknown Author").trim();
    const safeTitle = cleanFilename(title);
    const identifier = `urn:uuid:${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
    const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const sections = chapterSections();

    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
    zip.file("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

    const manifest = [
      '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
      '    <item id="style" href="style.css" media-type="text/css"/>'
    ];
    const spine = [];
    const navItems = [];

    sections.forEach((section, sectionIndex) => {
      const fileName = `chapter-${String(sectionIndex + 1).padStart(3, "0")}.xhtml`;
      const itemId = `chapter-${sectionIndex + 1}`;
      const bodyParagraphs = [];

      for (let pageIndex = section.start; pageIndex < section.end; pageIndex++) {
        let pageText = state.pages[pageIndex]?.text || "";
        if (pageIndex === section.start && state.pages[pageIndex]?.chapterStart) {
          pageText = stripExportedChapterHeading(pageText, section.title);
        }
        exportParagraphs(pageText).forEach((paragraph, paragraphIndex) => {
          bodyParagraphs.push(`<p id="p-${pageIndex + 1}-${paragraphIndex + 1}">${escapeXml(paragraph)}</p>`);
        });
      }

      zip.file(`EPUB/${fileName}`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(section.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <section epub:type="chapter">
    <h1>${escapeXml(section.title)}</h1>
    ${bodyParagraphs.join("\n    ")}
  </section>
</body>
</html>`);

      manifest.push(`    <item id="${itemId}" href="${fileName}" media-type="application/xhtml+xml"/>`);
      spine.push(`    <itemref idref="${itemId}"/>`);
      navItems.push(`<li><a href="${fileName}">${escapeXml(section.title)}</a></li>`);
    });

    zip.file("EPUB/nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body>
<nav epub:type="toc" id="toc">
  <h1>Contents</h1>
  <ol>${navItems.join("\n")}</ol>
</nav>
</body>
</html>`);

    zip.file("EPUB/style.css", `body{font-family:serif;line-height:1.5;margin:5%;}p{display:block;margin:0 0 1em;white-space:normal;}h1{font-size:1.5em;margin:0 0 1.25em;}`);

    let coverManifest = "";
    let coverMeta = "";
    let coverSpine = "";
    let coverGuide = "";

    if (state.coverFile) {
      const type = state.coverFile.type || "image/jpeg";
      const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
      const coverName = `cover.${ext}`;
      zip.file(`EPUB/${coverName}`, await state.coverFile.arrayBuffer());
      zip.file("EPUB/cover.xhtml", `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="utf-8"/><title>Cover</title><style>html,body{margin:0;padding:0;text-align:center}img{max-width:100%;max-height:100vh}</style></head>
<body><img src="${coverName}" alt="Cover"/></body>
</html>`);
      coverManifest = `
    <item id="cover-image" href="${coverName}" media-type="${type}" properties="cover-image"/>
    <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>`;
      coverSpine = `    <itemref idref="cover-page" linear="yes"/>\n`;
      coverMeta = `\n    <meta name="cover" content="cover-image"/>`;
      coverGuide = `\n  <guide><reference type="cover" title="Cover" href="cover.xhtml"/></guide>`;
    }

    zip.file("EPUB/package.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${identifier}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${modified}</meta>${coverMeta}
  </metadata>
  <manifest>
${manifest.join("\n")}${coverManifest}
  </manifest>
  <spine>
${coverSpine}${spine.join("\n")}
  </spine>${coverGuide}
</package>`);

    const blob = await zip.generateAsync({
      type: "blob",
      mimeType: "application/epub+zip",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });

    downloadBlob(blob, `${safeTitle}-2.0.epub`);
  }

  async function downloadEpub() {
    els.downloadEpub.disabled = true;
    const old = els.downloadEpub.textContent;
    els.downloadEpub.textContent = "Building EPUB…";
    try {
      await buildEpub();
    } catch (err) {
      alert(`Could not build EPUB: ${err.message || err}`);
    } finally {
      els.downloadEpub.disabled = false;
      els.downloadEpub.textContent = old;
    }
  }

  document.querySelectorAll("[data-preset]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-preset]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const preset = btn.dataset.preset;
      if (preset === "cloud") {
        els.cropTop.value = 0;
        els.cropBottom.value = 75;
        els.cropSides.value = 0;
      } else if (preset === "kindle") {
        els.cropTop.value = 130;
        els.cropBottom.value = 0;
        els.cropSides.value = 0;
      } else {
        els.cropTop.value = 0;
        els.cropBottom.value = 0;
        els.cropSides.value = 0;
      }
      updatePreview();
    });
  });

  [els.cropTop, els.cropBottom, els.cropSides].forEach(input => input.addEventListener("input", updatePreview));

  els.coverInput.addEventListener("change", () => {
    const file = els.coverInput.files?.[0] || null;
    state.coverFile = file;
    if (state.coverUrl) URL.revokeObjectURL(state.coverUrl);
    if (file) {
      state.coverUrl = URL.createObjectURL(file);
      els.coverPreview.src = state.coverUrl;
      els.coverPreviewWrap.classList.remove("hidden");
    } else {
      els.coverPreviewWrap.classList.add("hidden");
    }
  });

  els.imageInput.addEventListener("change", async () => {
    state.importedEpub = null;
    state.dropcapCandidates = [];
    state.files = Array.from(els.imageInput.files || []).sort(naturalSort);
    state.pages = [];
    state.currentPageIndex = -1;
    const restored = state.files.length ? restoreCheckpointIfMatching() : 0;
    if (restored && state.currentPageIndex < 0) state.currentPageIndex = restored - 1;
    els.fileCount.textContent = `${state.files.length} page${state.files.length === 1 ? "" : "s"} loaded`;
    els.processBtn.disabled = !state.files.length || restored >= state.files.length;
    els.freshPaddleBtn.disabled = !state.files.length;
    els.reviewSection.classList.toggle("hidden", restored === 0);
    els.exportSection.classList.toggle("hidden", restored === 0);
    els.dropcapSection.classList.toggle("hidden", restored === 0);
    renderThumbs();
    renderReview();
    try {
      await updatePreview();
    } catch (err) {
      console.warn("Could not render crop preview", err);
    }
    if (restored) {
      setStatus(`Recovered ${restored} processed pages. Tap Process all pages to resume at page ${Math.min(restored + 1, state.files.length)}, or review what is already saved.`);
    } else {
      setStatus(state.files.length ? "Ready to process all pages." : "Add screenshots to begin.");
    }
  });

  els.clearImages.addEventListener("click", () => {
    els.imageInput.value = "";
    state.files = [];
    state.pages = [];
    state.currentPageIndex = -1;
    clearCheckpoint();
    els.fileCount.textContent = "0 pages loaded";
    els.processBtn.disabled = true;
    els.freshPaddleBtn.disabled = true;
    els.reviewSection.classList.add("hidden");
    els.exportSection.classList.add("hidden");
    els.dropcapSection.classList.add("hidden");
    renderThumbs();
    renderReview();
    updatePreview();
    setStatus("Add screenshots to begin.");
  });

  els.freshPaddleBtn.addEventListener("click", restartFreshWithPaddle);

  els.processBtn.addEventListener("click", async () => {
    els.reviewSection.classList.remove("hidden");
    els.exportSection.classList.remove("hidden");
    els.dropcapSection.classList.remove("hidden");
    await processAllPages();
  });
  els.prevPageBtn.addEventListener("click", goToPreviousPage);
  els.nextPageBtn.addEventListener("click", goToNextPage);
  els.messageOcrBtn.addEventListener("click", async () => {
    if (state.processing || state.currentPageIndex < 0) return;
    const idx = state.currentPageIndex;
    const original = els.messageOcrBtn.textContent;
    els.messageOcrBtn.disabled = true;
    els.messageOcrBtn.textContent = "Working…";
    try {
      await runMessagePageOcr(idx);
      renderReview();
      setStatus(`PaddleOCR message pass updated page ${idx + 1}.`);
    } catch (err) {
      console.error(err);
      alert(`Message-page OCR failed: ${err.message || err}`);
    } finally {
      els.messageOcrBtn.textContent = original;
      updateNavigationControls();
    }
  });

  els.downloadTxt.addEventListener("click", downloadTxt);
  els.downloadEpub.addEventListener("click", downloadEpub);
  els.scanDropcaps.addEventListener("click", scanDropcaps);
  els.acceptHighDropcaps.addEventListener("click", () => {
    state.dropcapCandidates
      .filter(candidate => candidate.status === "pending" && candidate.confidence === "high")
      .forEach(candidate => applyDropcap(candidate, candidate.proposed));
    renderDropcapResults();
  });
  els.epubInput.addEventListener("change", async () => {
    const file = els.epubInput.files?.[0];
    if (!file) return;
    els.epubImportStatus.textContent = `Opening ${file.name}…`;
    try {
      await importEpub(file);
    } catch (err) {
      console.error(err);
      els.epubImportStatus.textContent = "Import failed. Your existing project and EPUB were not changed.";
      alert(`Could not import EPUB: ${err.message || err}`);
    }
  });

  window.addEventListener("error", (event) => {
    console.error("Book OCR Studio error", event.error || event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    console.error("Book OCR Studio promise error", event.reason);
  });

  updatePreview();
})();
