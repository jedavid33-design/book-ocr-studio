(() => {
  "use strict";

  const BUILD_VERSION = "2.7.56-italics-detection-recovery";
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
    pageDropcapCandidate: null,
    pageDropcapImageUrl: "",
    bookLayoutProfile: null,
    lastRegressionReport: null,
    ignoredLigatureCandidates: new Set(),
    ignoredFinalPolishIssues: new Set(),
    lastFinalPolishCounts: null,
    repairBookHasRun: false,
    guidedRepairMode: "whole",
    guidedRepairChapterIndex: 0,
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
  const REPAIR_OVERLAY_KEY = "bookOcrStudio.repairs.current";
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
    pageDropcapBtn: $("pageDropcapBtn"),
    markItalicBtn: $("markItalicBtn"),
    clearItalicBtn: $("clearItalicBtn"),
    exportSection: $("exportSection"),
    guidedRepairSection: $("guidedRepairSection"),
    advancedSection: $("advancedSection"),
    downloadTxt: $("downloadTxt"),
    downloadEpub: $("downloadEpub"),
    safePolish: $("safePolish"),
    autoItalicScan: $("autoItalicScan"),
    downloadItalicDiagnostics: $("downloadItalicDiagnostics"),
    italicStatus: $("italicStatus"),
    polishStatus: $("polishStatus"),
    repairLigatures: $("repairLigatures"),
    ligatureStatus: $("ligatureStatus"),
    ligatureReviewDetails: $("ligatureReviewDetails"),
    ligatureReviewSummaryToggle: $("ligatureReviewSummaryToggle"),
    ligatureReviewSummary: $("ligatureReviewSummary"),
    ligatureReviewList: $("ligatureReviewList"),
        rebuildParagraphs: $("rebuildParagraphs"),
    downloadLayoutDiagnostics: $("downloadLayoutDiagnostics"),
    paragraphStatus: $("paragraphStatus"),
    repairBook: $("repairBook"),
    repairBookStatus: $("repairBookStatus"),
    guidedLiveStatus: $("guidedLiveStatus"),
    geometryAssist: $("geometryAssist"),
    repairDiagnostic: $("repairDiagnostic"),
    repairModeWhole: $("repairModeWhole"),
    repairModeChapter: $("repairModeChapter"),
    repairChapterNav: $("repairChapterNav"),
    repairChapterPrev: $("repairChapterPrev"),
    repairChapterNext: $("repairChapterNext"),
    repairChapterStatus: $("repairChapterStatus"),
    repairReview: $("repairReview"),
    repairReviewToggle: $("repairReviewToggle"),
    repairReviewList: $("repairReviewList"),
    runRegression: $("runRegression"),
    regressionStatus: $("regressionStatus"),
    regressionResults: $("regressionResults"),
    finalPolish: $("finalPolish"),
    finalPolishStatus: $("finalPolishStatus"),
    finalPolishResults: $("finalPolishResults"),
    finalPolishReview: $("finalPolishReview"),
    finalPolishReviewToggle: $("finalPolishReviewToggle"),
    finalPolishReviewList: $("finalPolishReviewList"),
    kindleReadySection: $("kindleReadySection"),
    runKindleReady: $("runKindleReady"),
    kindleReadyStatus: $("kindleReadyStatus"),
    kindleReadyResults: $("kindleReadyResults"),
    epubInput: $("epubInput"),
    epubImportStatus: $("epubImportStatus"),
    dropcapSection: $("dropcapSection"),
    dropcapSummary: $("dropcapSummary"),
    scanDropcaps: $("scanDropcaps"),
    acceptHighDropcaps: $("acceptHighDropcaps"),
    dropcapEmpty: $("dropcapEmpty"),
    dropcapResults: $("dropcapResults"),
    pageDropcapDialog: $("pageDropcapDialog"),
    pageDropcapReason: $("pageDropcapReason"),
    pageDropcapBefore: $("pageDropcapBefore"),
    pageDropcapEdit: $("pageDropcapEdit"),
    pageDropcapOrphan: $("pageDropcapOrphan"),
    pageDropcapImageWrap: $("pageDropcapImageWrap"),
    pageDropcapImage: $("pageDropcapImage"),
    closePageDropcap: $("closePageDropcap"),
    cancelPageDropcap: $("cancelPageDropcap"),
    applyPageDropcap: $("applyPageDropcap"),
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

  function setGuidedProgress(stage, percent = null, detail = "") {
    if (!els.guidedLiveStatus) return;
    const pct = Number.isFinite(Number(percent))
      ? ` · ${Math.max(0, Math.min(100, Math.round(Number(percent))))}%`
      : "";
    const extra = detail ? ` · ${detail}` : "";
    els.guidedLiveStatus.textContent = `${stage}${pct}${extra}`;
    els.guidedLiveStatus.classList.remove("hidden");
  }

  function clearGuidedProgress() {
    if (!els.guidedLiveStatus) return;
    els.guidedLiveStatus.textContent = "";
    els.guidedLiveStatus.classList.add("hidden");
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

  function repairOverlaySignature() {
    return state.files.map(file => normalizedStem(file?.name || ""));
  }

  function readRepairOverlay() {
    try {
      const raw = localStorage.getItem(REPAIR_OVERLAY_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      const sig = repairOverlaySignature();
      if (!Array.isArray(saved?.signatureNames) || saved.signatureNames.length !== sig.length) return null;
      if (!saved.signatureNames.every((name, i) => name === sig[i])) return null;
      return saved;
    } catch (err) {
      console.warn("Could not read durable repair overlay", err);
      return null;
    }
  }

  function saveRepairOverlayPage(pageIndex, { manualEdited = null } = {}) {
    const page = state.pages[pageIndex];
    const file = state.files[pageIndex] || page?.file;
    if (!page || !file) return false;
    try {
      const existing = readRepairOverlay() || {
        signatureNames: repairOverlaySignature(),
        pages: {}
      };
      if (!existing.pages || typeof existing.pages !== "object") existing.pages = {};
      const key = normalizedStem(file.name);
      const prior = existing.pages[key] || {};
      const manualFlag = manualEdited == null
        ? !!(prior.manualEdited || page.manualEdited)
        : !!manualEdited;
      page.manualEdited = manualFlag;
      existing.pages[key] = {
        fileName: file.name,
        text: String(page.text || ""),
        manualEdited: manualFlag,
        savedAt: Date.now()
      };
      localStorage.setItem(REPAIR_OVERLAY_KEY, JSON.stringify(existing));

      // Verify the lightweight durable store itself before claiming success.
      const verify = readRepairOverlay();
      return String(verify?.pages?.[key]?.text ?? "") === String(page.text || "");
    } catch (err) {
      console.warn("Could not save durable repair overlay", err);
      return false;
    }
  }

  function applyRepairOverlay() {
    const overlay = readRepairOverlay();
    if (!overlay?.pages || !state.pages.length) return 0;
    let applied = 0;
    state.pages.forEach((page, pageIndex) => {
      const file = state.files[pageIndex] || page?.file;
      if (!file) return;
      const saved = overlay.pages[normalizedStem(file.name)];
      if (!saved || typeof saved.text !== "string") return;
      page.text = saved.text;
      page.manualEdited = !!saved.manualEdited;
      page.chapterCandidate = chapterHeuristic(page.text);
      applied++;
    });
    return applied;
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
        bookTitle: els.bookTitle?.value || "",
        bookAuthor: els.bookAuthor?.value || "",
        bookLayoutProfile: state.bookLayoutProfile || null,
        repairBookHasRun: !!state.repairBookHasRun,
        finalPolishHasRun: !!state.finalPolishHasRun,
        guidedRepairMode: state.guidedRepairMode || "whole",
        guidedRepairChapterIndex: Number(state.guidedRepairChapterIndex) || 0,
        ignoredLigatureCandidates: Array.from(state.ignoredLigatureCandidates || []),
        ignoredFinalPolishIssues: Array.from(state.ignoredFinalPolishIssues || []),
        pages: state.pages.map(p => ({
          fileName: p.file.name,
          text: p.text || "",
          chapterCandidate: !!p.chapterCandidate,
          chapterStart: !!p.chapterStart,
          chapterTitle: p.chapterTitle || "",
          manualEdited: !!p.manualEdited,
          layoutLines: Array.isArray(p.layoutLines) ? p.layoutLines : [],
          rawOcrItems: Array.isArray(p.rawOcrItems) ? p.rawOcrItems : [],
          layoutMeta: p.layoutMeta || null,
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
      localStorage.removeItem(REPAIR_OVERLAY_KEY);
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
    state.bookLayoutProfile = null;
    state.repairBookHasRun = false;
    state.currentPageIndex = -1;

    els.progressWrap.classList.add("hidden");
    els.progressBar.value = 0;
    els.progressPercent.textContent = "0%";
    els.progressLabel.textContent = "Ready";
    setPostOcrSectionsVisible(false);
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
    if (typeof saved.bookTitle === "string" && saved.bookTitle.trim()) els.bookTitle.value = saved.bookTitle;
    if (typeof saved.bookAuthor === "string" && saved.bookAuthor.trim()) els.bookAuthor.value = saved.bookAuthor;
    if (Number.isFinite(saved.cropTop)) els.cropTop.value = saved.cropTop;
    if (Number.isFinite(saved.cropBottom)) els.cropBottom.value = saved.cropBottom;
    if (Number.isFinite(saved.cropSides)) els.cropSides.value = saved.cropSides;

    const byName = new Map(state.files.map(f => [f.name, f]));
    const byStem = new Map(state.files.map(f => [normalizedStem(f.name), f]));
    const savedPages = saved.pages || [];
    state.bookLayoutProfile = saved.bookLayoutProfile || null;
    state.repairBookHasRun = !!saved.repairBookHasRun;
    state.finalPolishHasRun = !!saved.finalPolishHasRun;
    state.guidedRepairMode = saved.guidedRepairMode === "chapter" ? "chapter" : "whole";
    state.guidedRepairChapterIndex = Number.isFinite(Number(saved.guidedRepairChapterIndex)) ? Number(saved.guidedRepairChapterIndex) : 0;
    state.ignoredLigatureCandidates = new Set(Array.isArray(saved.ignoredLigatureCandidates) ? saved.ignoredLigatureCandidates : []);
    state.ignoredFinalPolishIssues = new Set(Array.isArray(saved.ignoredFinalPolishIssues) ? saved.ignoredFinalPolishIssues : []);

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
        manualEdited: !!page.manualEdited,
        layoutLines: Array.isArray(page.layoutLines) ? page.layoutLines : [],
        rawOcrItems: Array.isArray(page.rawOcrItems) ? page.rawOcrItems : [],
        layoutMeta: page.layoutMeta || null,
      };
    }).filter(Boolean);

    const savedIndex = Number(saved.currentPageIndex);
    state.currentPageIndex = state.pages.length
      ? clamp(Number.isFinite(savedIndex) ? savedIndex : state.pages.length - 1, 0, state.pages.length - 1)
      : -1;

    // Repair edits live in a compact second store as well as the large OCR
    // checkpoint. Reapply them last so an older/full checkpoint can never
    // resurrect pre-repair text after reload.
    applyRepairOverlay();
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

  function mergeSameRowLines(items) {
    const lines = normalizePaddleItems(items);
    if (!lines.length) return [];
    const typicalH = median(lines.map(x => x.box.h).filter(h => h > 2)) || 28;
    const merged=[];
    for (const line of lines) {
      const prev = merged[merged.length - 1];
      if (prev && Math.abs(line.box.cy - prev.box.cy) <= typicalH * 0.48) {
        const right = Math.max(prev.box.x + prev.box.w, line.box.x + line.box.w);
        const bottom = Math.max(prev.box.y + prev.box.h, line.box.y + line.box.h);
        prev.text = `${prev.text} ${line.text}`.replace(/\s{2,}/g, " ").trim();
        prev.box.w = right - prev.box.x;
        prev.box.h = bottom - prev.box.y;
        prev.box.cx = prev.box.x + prev.box.w / 2;
        prev.box.cy = prev.box.y + prev.box.h / 2;
        prev.score = Math.min(prev.score, line.score);
      } else {
        merged.push({ text: line.text, score: line.score, box: { ...line.box } });
      }
    }
    return merged;
  }

  function dominantBodyLeft(lines, typicalH, pageWidth) {
    const candidates = lines.filter(line => {
      const t = line.text.trim();
      if (t.length < 8) return false;
      if (/^(?:chapter\b|prologue\b|epilogue\b|interlude\b)/i.test(t)) return false;
      if (/^(?:\*{3,}|[-–—]{3,}|[•·◆◇❖✦⁂]+)$/.test(t)) return false;
      return line.box.w >= pageWidth * 0.22;
    });
    const pool = candidates.length >= 4 ? candidates : lines;
    const tolerance = Math.max(8, typicalH * 0.45);
    const clusters=[];
    [...pool].sort((a,b)=>a.box.x-b.box.x).forEach(line => {
      let cluster = clusters.find(c => Math.abs(c.center - line.box.x) <= tolerance);
      if (!cluster) {
        cluster = { xs: [], weight: 0, center: line.box.x };
        clusters.push(cluster);
      }
      cluster.xs.push(line.box.x);
      cluster.weight += Math.min(120, Math.max(12, line.text.length));
      cluster.center = median(cluster.xs);
    });
    if (!clusters.length) return Math.min(...lines.map(line => line.box.x));
    clusters.sort((a,b) => b.weight - a.weight || a.center - b.center);
    return clusters[0].center;
  }

  function isSceneMarkerText(text) {
    return /^(?:\*{3,}|\*\s+\*\s+\*|[-–—]{3,}|[•·◆◇❖✦⁂❦☙❧]+|[①②③④⑤⑥⑦⑧⑨⑩]+)$/u.test(String(text || "").trim());
  }

  function isCenteredShortLine(line, pageWidth, pageCenter) {
    const text = line.text.trim();
    if (!text || text.length > 55 || line.box.w > pageWidth * 0.68) return false;
    return Math.abs(line.box.cx - pageCenter) <= pageWidth * 0.09;
  }

  function joinParagraphLines(parts) {
    let out = "";
    for (const raw of parts) {
      const text = String(raw || "").trim();
      if (!text) continue;
      if (!out) { out = text; continue; }
      if (/[A-Za-z]{2,}-$/.test(out) && /^[a-z]/.test(text)) {
        out = out.slice(0, -1) + text;
      } else {
        out += ` ${text}`;
      }
    }
    return out.replace(/\s{2,}/g, " ").trim();
  }

  function clusterLeftEdges(lines, tolerance) {
    const clusters=[];
    const sorted = lines
      .filter(line => line?.text && line?.box && Number.isFinite(Number(line.box.x)))
      .slice().sort((a,b) => a.box.x - b.box.x);
    for (const line of sorted) {
      const x = Number(line.box.x);
      let cluster = clusters.find(c => Math.abs(x - c.center) <= tolerance);
      if (!cluster) {
        cluster = { xs: [], weight: 0, count: 0, center: x };
        clusters.push(cluster);
      }
      cluster.xs.push(x);
      cluster.count += 1;
      cluster.weight += Math.min(100, Math.max(10, String(line.text || "").trim().length));
      cluster.center = median(cluster.xs);
    }
    return clusters;
  }

  function buildBookLayoutProfile(pages) {
    const allLines = (pages || []).flatMap(page => Array.isArray(page?.layoutLines) ? page.layoutLines : [])
      .filter(line => line?.text && line?.box && String(line.text).trim());
    if (allLines.length < 8) return null;

    const typicalH = median(allLines.map(line => Number(line.box.h)).filter(h => h > 2)) || 28;
    const tolerance = Math.max(7, typicalH * 0.32);
    const clusters = clusterLeftEdges(allLines, tolerance)
      .filter(c => c.count >= 2)
      .sort((a,b) => a.center - b.center);
    if (!clusters.length) return null;

    // Paragraph-first OCR lines can easily outnumber continuation lines, so
    // frequency alone cannot tell us which recurring lane is the body margin.
    // Look for two *strong* recurring lanes separated by a realistic first-line
    // indent. When found, the left lane is the continuation/body margin and the
    // right lane is the paragraph-start margin, regardless of which is larger.
    const minIndentDelta = Math.max(12, typicalH * 0.65);
    const maxIndentDelta = Math.max(52, typicalH * 1.9);
    const minStrongCount = Math.max(8, Math.floor(allLines.length * 0.035));
    const strong = clusters.filter(c => c.count >= minStrongCount);

    let body = null;
    let indent = null;
    let bestPairScore = -Infinity;
    for (let i = 0; i < strong.length; i++) {
      for (let j = i + 1; j < strong.length; j++) {
        const left = strong[i].center <= strong[j].center ? strong[i] : strong[j];
        const right = left === strong[i] ? strong[j] : strong[i];
        const delta = right.center - left.center;
        if (delta < minIndentDelta || delta > maxIndentDelta) continue;
        // Prefer pairs supported by lots of lines and separated by roughly one
        // text-height, which is typical of ebook first-line indentation.
        const support = left.count + right.count;
        const idealDelta = typicalH * 1.15;
        const distancePenalty = Math.abs(delta - idealDelta) / Math.max(1, typicalH);
        const score = support - distancePenalty * 18;
        if (score > bestPairScore) {
          bestPairScore = score;
          body = left;
          indent = right;
        }
      }
    }

    // Fallback for layouts that do not expose a convincing two-lane pattern.
    // Use the leftmost well-supported recurring text lane as the body margin;
    // only adopt a right-hand indent lane when it has meaningful support.
    if (!body) {
      const recurring = clusters.filter(c => c.count >= Math.max(3, Math.floor(allLines.length * 0.01)));
      body = (recurring.length ? recurring : clusters).slice().sort((a,b) => a.center - b.center)[0];
      const indentCandidates = clusters.filter(c => {
        const delta = c.center - body.center;
        return delta >= minIndentDelta && delta <= maxIndentDelta && c.count >= Math.max(4, Math.floor(body.count * 0.08));
      });
      indent = indentCandidates.sort((a,b) => b.count - a.count || b.weight - a.weight)[0] || null;
    }

    const indentDelta = indent ? indent.center - body.center : Math.max(14, typicalH * 0.95);

    return {
      bodyLeft: body.center,
      indentLeft: indent ? indent.center : body.center + indentDelta,
      indentDelta,
      typicalH,
      laneTolerance: Math.max(6, Math.min(tolerance, indentDelta * 0.38)),
      learnedFromLines: allLines.length,
      bodyCount: body.count,
      indentCount: indent?.count || 0,
      lanePairLearned: !!indent,
    };
  }

  function reconstructParagraphsFromLayout(layoutLines, { messageMode=false, bookProfile=null } = {}) {
    const lines = Array.isArray(layoutLines) ? layoutLines.filter(line => line?.text && line?.box) : [];
    if (!lines.length) return { text: "", paragraphs: [], meta: null };

    const typicalH = bookProfile?.typicalH || median(lines.map(line => Number(line.box.h)).filter(h => h > 2)) || 28;
    const minX = Math.min(...lines.map(line => line.box.x));
    const maxRight = Math.max(...lines.map(line => line.box.x + line.box.w));
    const pageWidth = Math.max(1, maxRight - Math.min(0, minX));
    const pageCenter = (Math.min(0, minX) + maxRight) / 2;
    const bodyLeft = Number.isFinite(bookProfile?.bodyLeft) ? bookProfile.bodyLeft : dominantBodyLeft(lines, typicalH, pageWidth);
    const learnedIndentLeft = Number.isFinite(bookProfile?.indentLeft) ? bookProfile.indentLeft : null;
    const indentThreshold = learnedIndentLeft !== null
      ? Math.max(8, (learnedIndentLeft - bodyLeft) * 0.48)
      : Math.max(12, typicalH * 0.58);
    const strongIndentThreshold = learnedIndentLeft !== null
      ? Math.max(indentThreshold + 4, (learnedIndentLeft - bodyLeft) * 0.78)
      : Math.max(18, typicalH * 0.82);
    const gapThreshold = messageMode ? typicalH * 0.58 : typicalH * 0.92;

    const paragraphs=[];
    let current=[];
    let currentMeta=null;
    const flush = () => {
      if (!current.length) return;
      let text = joinParagraphLines(current);
      if (currentMeta?.scene && text) text = "* * *";
      if (text) paragraphs.push({ text, ...currentMeta });
      current=[];
      currentMeta=null;
    };

    lines.forEach((line, index) => {
      const prev = index ? lines[index - 1] : null;
      const text = line.text.trim();
      const scene = isSceneMarkerText(text);
      const centered = isCenteredShortLine(line, pageWidth, pageCenter);
      const indent = line.box.x - bodyLeft;
      const indented = indent >= indentThreshold;
      const stronglyIndented = indent >= strongIndentThreshold;
      const verticalGap = prev ? line.box.y - (prev.box.y + prev.box.h) : 0;
      const largeGap = !!prev && verticalGap > gapThreshold;
      const chapterish = /^(?:chapter\b|prologue\b|epilogue\b|interlude\b|\d{1,3}$)/i.test(text);

      // A visible first-line indent is primary paragraph evidence. Do not make
      // it depend on OCR punctuation from the preceding line.
      const startsParagraph = !current.length || largeGap || scene || chapterish || centered || stronglyIndented || (indented && text.length > 1);

      if (startsParagraph && current.length) flush();
      if (!current.length) {
        currentMeta = {
          firstLineX: line.box.x,
          startsIndented: indented && !centered,
          scene,
          centered,
          y: line.box.y,
        };
      }
      current.push(line.italicText || (line.italicAuto ? `[[i]]${text}[[/i]]` : text));

      // Standalone visual furniture should never absorb the prose beneath it.
      if (scene || chapterish || centered) flush();
    });
    flush();

    const text = paragraphs.map(p => p.text).join("\n\n");
    return {
      text,
      paragraphs,
      meta: {
        bodyLeft,
        indentLeft: learnedIndentLeft,
        typicalH,
        indentThreshold,
        pageWidth,
        bookProfileUsed: !!bookProfile,
        firstStartsIndented: paragraphs[0]?.startsIndented ?? false,
        firstIsFurniture: !!(paragraphs[0]?.scene || paragraphs[0]?.centered),
        lastIsFurniture: !!(paragraphs.at(-1)?.scene || paragraphs.at(-1)?.centered),
      }
    };
  }

  function paddleItemsToText(items, { messageMode=false } = {}) {
    const layoutLines = mergeSameRowLines(items);
    if (!layoutLines.length) return { text: "", layoutLines: [], layoutMeta: null };
    const rebuilt = reconstructParagraphsFromLayout(layoutLines, { messageMode });
    return { text: rebuilt.text, layoutLines, layoutMeta: rebuilt.meta };
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
    const structured = paddleItemsToText(result?.items, { messageMode });
    return { text: structured.text, layoutLines: structured.layoutLines, layoutMeta: structured.layoutMeta, result };
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
    if (!firstLines.length) return false;

    const editDistance = (a, b) => {
      const x = String(a || ""), y = String(b || "");
      const row = Array.from({ length: y.length + 1 }, (_, i) => i);
      for (let i = 1; i <= x.length; i++) {
        let prev = row[0];
        row[0] = i;
        for (let j = 1; j <= y.length; j++) {
          const old = row[j];
          row[j] = Math.min(
            row[j] + 1,
            row[j - 1] + 1,
            prev + (x[i - 1] === y[j - 1] ? 0 : 1)
          );
          prev = old;
        }
      }
      return row[y.length];
    };

    const structuralHeading = (line) => {
      const raw = String(line || "").trim();
      if (!raw || raw.length > 42) return false;

      // Normal headings first.
      if (/^(?:CHAPTER\s+(?:\d{1,3}|[IVXLCDM]+)|PROLOGUE|EPILOGUE(?:\s+(?:ONE|TWO|THREE|\d{1,2}|[IVX]+))?|INTERLUDE)\s*[.:—-]*$/i.test(raw)) {
        return true;
      }

      // OCR commonly confuses zero with O and 1 with I/l in decade chapter
      // numbers. Only tolerate that inside a short top-of-page CHAPTER heading.
      const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (compact.startsWith("CHAPTER")) {
        const suffix = compact.slice(7);
        if (/^[0-9OIL]{1,3}$/.test(suffix)) {
          const repairedNumber = suffix.replace(/O/g, "0").replace(/[IL]/g, "1");
          if (/^\d{1,3}$/.test(repairedNumber)) return true;
        }
      }

      // Epilogue headings are also prone to one- or two-character OCR damage.
      // Fuzzy matching is restricted to a very short, heading-like top line.
      const epilogueBase = compact
        .replace(/(?:ONE|TWO|THREE|1|2|3|I|II|III)$/, "");
      if (epilogueBase.length >= 6 && epilogueBase.length <= 10 &&
          editDistance(epilogueBase, "EPILOGUE") <= 2) {
        return true;
      }

      return false;
    };

    // Structural evidence must occur in the first three nonblank lines.
    if (firstLines.slice(0, 3).some(structuralHeading)) return true;

    // Some books render a bare chapter number as its own heading. Accept that
    // only when it is one of the first two nonblank lines and the neighboring
    // line looks like a short heading/name, never ordinary prose.
    for (let i = 0; i < Math.min(2, firstLines.length); i++) {
      if (!/^\d{1,3}$/.test(firstLines[i])) continue;
      const neighbor = firstLines[i + 1] || "";
      if (neighbor && neighbor.length <= 32 &&
          !/[.!?]["”']?$/.test(neighbor) &&
          ( /^[A-Z][A-Z\s.'&-]+$/.test(neighbor) || /^[A-Z][a-zA-Z'’-]{1,24}$/.test(neighbor) )) {
        return true;
      }
    }
    return false;
  }

  function redetectAutomaticChapterStarts() {
    let detected = 0;
    state.pages.forEach((page, index) => {
      const isChapter = chapterHeuristic(page.text);
      page.chapterCandidate = isChapter;
      page.chapterStart = isChapter;
      page.chapterTitle = isChapter ? detectChapterTitle(page.text, detected + 1) : "";
      if (isChapter) detected++;
    });
    state.lastDropcapAudit = null;
    state.dropcapCandidates = [];
    state.repairBookHasRun = false;
    saveChapterMemory();
    saveCheckpoint();
    return detected;
  }

  function redetectExistingChapterStarts() {
    syncCurrentEditor();
    if (!state.pages.length || !state.pages.some(page => String(page.text || "").trim())) {
      setStatus("No saved OCR text is available to re-detect chapter starts.");
      return;
    }
    const oldCount = state.pages.filter(page => page.chapterStart).length;
    state.pages.forEach(page => {
      page.chapterStart = false;
      page.chapterCandidate = false;
      page.chapterTitle = "";
    });
    const newCount = redetectAutomaticChapterStarts();
    state.repairReview = [];
    state.repairBookHasRun = false;
    state.lastDropcapAudit = null;
    state.dropcapCandidates = [];
    state.finalPolishReview = [];
    state.finalPolishHasRun = false;
    const starts = state.pages.reduce((a,p,i) => { if (p.chapterStart) a.push(i); return a; }, []);
    state.currentPageIndex = starts.length ? starts[0] : 0;
    state.reviewMode = "chapters";
    saveCheckpoint();
    renderReview();
    renderRepairReview();
    if (els.kindleReadyStatus) els.kindleReadyStatus.textContent = "Recheck needed";
    if (els.kindleReadyResults) els.kindleReadyResults.classList.add("hidden");
    setStatus(`Chapter starts re-detected from existing OCR: ${oldCount} → ${newCount}. OCR text was not rerun or changed.`);
  }

  function syncCurrentEditor() {
    if (state.currentPageIndex < 0 || !state.pages[state.currentPageIndex]) return;
    const editor = els.reviewList.querySelector("textarea");
    if (!editor) return;
    state.pages[state.currentPageIndex].text = editor.value;
    state.pages[state.currentPageIndex].chapterCandidate = chapterHeuristic(editor.value);
    saveRepairOverlayPage(state.currentPageIndex);
    saveCheckpoint();
  }

  function commitPageText(pageIndex, nextText) {
    const page = state.pages[pageIndex];
    if (!page) return false;
    page.text = String(nextText ?? "");
    page.chapterCandidate = chapterHeuristic(page.text);

    // If the repaired page is currently open, update the editor too. Otherwise
    // a later syncCurrentEditor() can write the stale textarea back over the fix.
    if (state.currentPageIndex === pageIndex) {
      const editor = els.reviewList?.querySelector("textarea");
      if (editor) editor.value = page.text;
    }

    // The full OCR checkpoint can be very large (204 pages + geometry). Store
    // repaired page text separately first so quota/serialization trouble in the
    // large checkpoint cannot erase a successful repair on reload.
    const overlaySaved = saveRepairOverlayPage(pageIndex);
    saveCheckpoint();
    return overlaySaved;
  }

  function refreshDownstreamRepairState({ refreshPolish = false } = {}) {
    renderReview();
    renderLigatureReview();
    renderRepairReview();
    if (refreshPolish) {
      try {
        const audit = finalPolishAudit();
        renderFinalPolishReport({ fixedCount: 0, ...audit });
      } catch (_) {}
    }
    // Kindle Ready is intentionally recalculated from current repaired text on
    // demand. Clear an old badge/results so stale blockers never look current.
    if (els.kindleReadyStatus) els.kindleReadyStatus.textContent = "Recheck needed";
    if (els.kindleReadyResults) els.kindleReadyResults.classList.add("hidden");
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

    if (!starts.length) {
      return [{
        title: (els.bookTitle.value || "Book").trim() || "Book",
        start: 0,
        end: state.pages.length,
        nav: true
      }];
    }

    const sections = [];

    // If OCR begins before the first marked chapter, keep that text in the EPUB
    // spine but do not invent a fake "Opening" TOC entry. Only label it as
    // front matter when the text itself looks like front matter.
    if (starts[0] > 0) {
      const preText = state.pages
        .slice(0, starts[0])
        .map(p => normalizedPageText(p.text || ""))
        .filter(Boolean)
        .join("\n\n")
        .trim();

      const frontMatterLike = /\b(?:copyright|contents|dedication|acknowledg(?:e)?ments?|about the author|title page|also by)\b/i.test(preText.slice(0, 1200));

      sections.push({
        title: frontMatterLike ? "Front Matter" : "",
        start: 0,
        end: starts[0],
        nav: frontMatterLike
      });
    }

    starts.forEach((start, i) => {
      const end = i + 1 < starts.length ? starts[i + 1] : state.pages.length;
      const page = state.pages[start];
      const title = (page.chapterTitle || "").trim() || detectChapterTitle(page.text, i + 1);
      sections.push({ title, start, end, nav: true });
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

  function stripItalicMarkers(text) {
    return String(text || "").replace(/\[\[\/?i\]\]/gi, "");
  }

  function parseItalicMarkedText(value) {
    const source = String(value || "");
    const marker = /\[\[i\]\]|\[\[\/i\]\]/gi;
    const ranges = [];
    let plain = "";
    let cursor = 0;
    let italicStart = null;
    let match;
    while ((match = marker.exec(source))) {
      plain += source.slice(cursor, match.index);
      if (/^\[\[i\]\]$/i.test(match[0])) {
        if (italicStart == null) italicStart = plain.length;
      } else if (italicStart != null) {
        if (plain.length > italicStart) ranges.push({ start: italicStart, end: plain.length });
        italicStart = null;
      }
      cursor = match.index + match[0].length;
    }
    plain += source.slice(cursor);
    if (italicStart != null && plain.length > italicStart) ranges.push({ start: italicStart, end: plain.length });
    return { plain, ranges };
  }

  function mergeItalicRanges(ranges, maxLength) {
    const sorted = (ranges || [])
      .map(r => ({ start: Math.max(0, Math.min(maxLength, Number(r.start) || 0)), end: Math.max(0, Math.min(maxLength, Number(r.end) || 0)) }))
      .filter(r => r.end > r.start)
      .sort((a,b) => a.start - b.start || a.end - b.end);
    const merged = [];
    sorted.forEach(r => {
      const prev = merged[merged.length - 1];
      if (prev && r.start <= prev.end) prev.end = Math.max(prev.end, r.end);
      else merged.push({ ...r });
    });
    return merged;
  }

  function renderItalicRanges(plain, ranges) {
    const merged = mergeItalicRanges(ranges, plain.length);
    if (!merged.length) return plain;
    let out = "", cursor = 0;
    merged.forEach(r => {
      out += plain.slice(cursor, r.start);
      out += `[[i]]${plain.slice(r.start, r.end)}[[/i]]`;
      cursor = r.end;
    });
    return out + plain.slice(cursor);
  }

  function flexiblePhraseMatch(haystack, needle, fromIndex = 0) {
    const parts = String(needle || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return null;
    const escaped = parts.map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(escaped.join("\\s+"), "gu");
    re.lastIndex = Math.max(0, fromIndex || 0);
    const match = re.exec(haystack);
    return match ? { start: match.index, end: match.index + match[0].length, text: match[0] } : null;
  }

  // Italic recognition is geometry-derived, but repaired/manual page text is the
  // authority for wording and paragraph structure. Project accepted italic runs
  // onto the current text instead of rebuilding the page from OCR geometry.
  // Existing manual italic spans are unioned with automatic evidence, so a
  // later scan cannot erase a user's formatting decision.
  //
  // v2.7.55 hardening: repaired text often differs slightly from the original
  // OCR line (fixed punctuation, contractions, split words, etc.). Requiring the
  // ENTIRE OCR line to match before projecting emphasis made accepted italics
  // disappear from export. Prefer the whole-line anchor when available, but
  // fall back to matching each accepted italic phrase directly in authoritative
  // page text. This preserves formatting without letting OCR geometry replace
  // repaired wording or paragraph structure.
  function projectItalicEvidenceToPage(page) {
    if (!page || !Array.isArray(page.layoutLines) || !page.layoutLines.length) return 0;
    const current = parseItalicMarkedText(page.text || "");
    const plain = current.plain;
    const ranges = [...current.ranges];
    let lineSearchFrom = 0;
    let runSearchFrom = 0;
    let added = 0;

    for (const line of page.layoutLines) {
      const markedLine = String(line?.italicText || "");
      if (!markedLine || !/\[\[i\]\]/i.test(markedLine)) continue;
      const parsedLine = parseItalicMarkedText(markedLine);
      if (!parsedLine.ranges.length || !parsedLine.plain.trim()) continue;

      let whole = flexiblePhraseMatch(plain, parsedLine.plain, lineSearchFrom);
      if (!whole) whole = flexiblePhraseMatch(plain, parsedLine.plain, 0);
      const matchedSegment = whole ? plain.slice(whole.start, whole.end) : "";

      for (const r of parsedLine.ranges) {
        const italicPhrase = parsedLine.plain.slice(r.start, r.end);
        if (!italicPhrase.trim()) continue;

        let absolute = null;
        if (whole) {
          const local = flexiblePhraseMatch(matchedSegment, italicPhrase, 0);
          if (local) absolute = { start: whole.start + local.start, end: whole.start + local.end };
        }

        // If repairs changed any non-italic text on the OCR line, the whole-line
        // anchor may be gone. Match the accepted run itself, preserving document
        // order to reduce accidental attachment to repeated phrases.
        if (!absolute) {
          let direct = flexiblePhraseMatch(plain, italicPhrase, runSearchFrom);
          if (!direct) direct = flexiblePhraseMatch(plain, italicPhrase, 0);
          if (direct) absolute = direct;
        }

        if (!absolute) continue;
        ranges.push(absolute);
        runSearchFrom = Math.max(runSearchFrom, absolute.end);
        added++;
      }

      if (whole) lineSearchFrom = Math.max(lineSearchFrom, whole.end);
    }

    if (!added && current.ranges.length === 0) return 0;
    const nextText = renderItalicRanges(plain, ranges);
    if (nextText !== String(page.text || "")) {
      page.text = nextText;
      page.chapterCandidate = chapterHeuristic(page.text);
      return added || 1;
    }
    return 0;
  }

  function ensureItalicEvidenceProjected({ persist = true } = {}) {
    let changedPages = 0;
    let projectedRuns = 0;
    state.pages.forEach((page, pageIndex) => {
      const before = String(page?.text || "");
      const added = projectItalicEvidenceToPage(page);
      if (String(page?.text || "") !== before) {
        changedPages++;
        projectedRuns += Math.max(1, added || 0);
        if (persist) saveRepairOverlayPage(pageIndex);
      }
    });
    if (changedPages && persist) saveCheckpoint();
    return { changedPages, projectedRuns };
  }

  function paragraphToEpubHtml(text) {
    const raw = String(text || "");
    if (raw.trim() === "* * *") return '<hr class="scene-break"/>';
    let out = "";
    let cursor = 0;
    const marker = /\[\[i\]\]([\s\S]*?)\[\[\/i\]\]/gi;
    let match;
    while ((match = marker.exec(raw))) {
      out += escapeXml(raw.slice(cursor, match.index));
      out += `<em>${escapeXml(match[1])}</em>`;
      cursor = match.index + match[0].length;
    }
    out += escapeXml(raw.slice(cursor));
    return `<p>${out}</p>`;
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

  function currentReviewTextarea() {
    return els.reviewList?.querySelector(".review-body textarea") || null;
  }

  function markSelectedItalic() {
    const textarea = currentReviewTextarea();
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      setStatus("Select the exact italic text in the page editor first.");
      return;
    }
    const selected = textarea.value.slice(start, end);
    if (!selected.trim()) {
      setStatus("Select visible text before marking italics.");
      return;
    }
    const replacement = `[[i]]${selected}[[/i]]`;
    textarea.setRangeText(replacement, start, end, "select");
    const page = state.pages[state.currentPageIndex];
    if (page) {
      page.text = textarea.value;
      page.manualEdited = true;
      page.chapterCandidate = chapterHeuristic(page.text);
      saveRepairOverlayPage(state.currentPageIndex, { manualEdited: true });
    }
    saveCheckpoint();
    setStatus(`Marked the selected text as italic on page ${state.currentPageIndex + 1}. The formatting is now durable and EPUB export will preserve it as emphasis.`);
  }

  function clearItalicMarksOnPage() {
    const textarea = currentReviewTextarea();
    if (!textarea) return;
    const before = textarea.value;
    const after = before.replace(/\[\[\/?i\]\]/gi, "");
    if (after === before) {
      setStatus(`Page ${state.currentPageIndex + 1} has no italic marks to remove.`);
      return;
    }
    textarea.value = after;
    const page = state.pages[state.currentPageIndex];
    if (page) {
      page.text = after;
      page.manualEdited = true;
      page.chapterCandidate = chapterHeuristic(page.text);
      saveRepairOverlayPage(state.currentPageIndex, { manualEdited: true });
    }
    saveCheckpoint();
    setStatus(`Removed italic marks from page ${state.currentPageIndex + 1} and saved that formatting decision durably.`);
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
    els.pageDropcapBtn.disabled = state.processing || !hasCurrent;
    if (els.markItalicBtn) els.markItalicBtn.disabled = state.processing || !hasCurrent;
    if (els.clearItalicBtn) els.clearItalicBtn.disabled = state.processing || !hasCurrent;
    els.nextPageBtn.disabled = state.processing || !hasCurrent || pos < 0 || pos >= indices.length - 1;
    els.prevPageBtn.textContent = state.reviewMode === "chapters" ? "Previous chapter" : "Previous page";
    els.nextPageBtn.textContent = state.reviewMode === "chapters" ? "Next chapter" : "Next page";
  }


  function setPostOcrSectionsVisible(visible) {
    const method = visible ? "remove" : "add";
    els.reviewSection?.classList[method]("hidden");
    els.guidedRepairSection?.classList[method]("hidden");
    els.advancedSection?.classList[method]("hidden");
    els.kindleReadySection?.classList[method]("hidden");
    els.exportSection?.classList[method]("hidden");
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
      state.pages[index].manualEdited = true;
      state.pages[index].chapterCandidate = chapterHeuristic(text.value);

      // Manual Review edits are authoritative book text. Persist the current
      // page immediately in the compact repair overlay before touching the
      // much larger whole-book checkpoint. This survives tab/window closure
      // even if the large checkpoint save hits browser storage limits.
      saveRepairOverlayPage(index, { manualEdited: true });
      saveCheckpoint();
    });

    // A second synchronous save at edit completion covers paste/autofill and
    // makes blur/navigation an explicit durability boundary.
    text.addEventListener("change", () => {
      state.pages[index].text = text.value;
      state.pages[index].manualEdited = true;
      state.pages[index].chapterCandidate = chapterHeuristic(text.value);
      saveRepairOverlayPage(index, { manualEdited: true });
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

    const { text, layoutLines, layoutMeta, result } = await paddleRecognizeCanvas(canvas, { messageMode: true });
    const finalText = cleanBodyText(text);
    if (!finalText) throw new Error("PaddleOCR did not find readable text on this page.");

    state.pages[index].text = finalText;
    state.pages[index].chapterCandidate = chapterHeuristic(finalText);
    state.pages[index].layoutLines = layoutLines || [];
    state.pages[index].layoutMeta = layoutMeta || null;
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
    els.pageDropcapBtn.disabled = true;
    els.progressWrap.classList.remove("hidden");
    els.reviewSection.classList.remove("hidden");
    els.guidedRepairSection?.classList.remove("hidden");
    els.advancedSection?.classList.remove("hidden");
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
          : detectChapterTitle(text, index + 1),
        layoutLines: paddleResult.layoutLines || [],
        rawOcrItems: normalizePaddleItems(paddleResult.result?.items),
        layoutMeta: paddleResult.layoutMeta || null,
      };

      if (index < state.pages.length) state.pages[index] = pageData;
      else state.pages.push(pageData);

      state.currentPageIndex = index;
      saveCheckpoint();
      if (!batch) renderReview();
      refreshParagraphRebuildUi();

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


  function refreshParagraphRebuildUi() {
    if (!els.rebuildParagraphs) return;
    const available = state.pages.filter(page => Array.isArray(page.layoutLines) && page.layoutLines.length).length;
    els.rebuildParagraphs.disabled = state.processing || available === 0;
    if (els.downloadLayoutDiagnostics) els.downloadLayoutDiagnostics.disabled = state.processing || available === 0;
    if (els.paragraphStatus) {
      const profile = state.bookLayoutProfile || (available ? buildBookLayoutProfile(state.pages) : null);
      if (profile && available) {
        state.bookLayoutProfile = profile;
        els.paragraphStatus.textContent = `${available}/${state.pages.length} layout pages · body ${Math.round(profile.bodyLeft)} / indent ${Math.round(profile.indentLeft)}`;
      } else {
        els.paragraphStatus.textContent = available
          ? `${available}/${state.pages.length} pages have layout data`
          : "Needs OCR from this build";
      }
    }
  }


  function downloadLayoutDiagnostics() {
    const eligible = state.pages.filter(page =>
      !page.manualEdited && Array.isArray(page.layoutLines) && page.layoutLines.length
    );
    if (!eligible.length) {
      setStatus("No saved line geometry is available to export yet.");
      return;
    }
    const bookProfile = state.bookLayoutProfile || buildBookLayoutProfile(eligible);
    state.bookLayoutProfile = bookProfile;
    const payload = {
      format: "book-ocr-studio-layout-diagnostics-v1",
      buildVersion: BUILD_VERSION,
      exportedAt: new Date().toISOString(),
      book: {
        title: els.bookTitle?.value || "",
        author: els.bookAuthor?.value || "",
        pageCount: state.pages.length,
        geometryPageCount: eligible.length,
      },
      bookProfile,
      pages: state.pages.map((page, index) => ({
        index,
        fileName: page.fileName || state.files[index]?.name || "",
        text: page.text || "",
        chapterStart: !!page.chapterStart,
        chapterTitle: page.chapterTitle || "",
        layoutMeta: page.layoutMeta || null,
        layoutLines: Array.isArray(page.layoutLines) ? page.layoutLines : [],
      })),
    };
    const safeTitle = cleanFilename(els.bookTitle?.value || "book");
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeTitle}-layout-diagnostics.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Downloaded layout diagnostics for ${eligible.length} page${eligible.length === 1 ? "" : "s"}.`);
  }

  function rebuildParagraphsFromSavedGeometry({ confirmOverwrite=true } = {}) {
    const eligible = state.pages.filter(page =>
      !page.manualEdited && Array.isArray(page.layoutLines) && page.layoutLines.length
    );
    if (!eligible.length) {
      setStatus("No saved line geometry is available yet. Pages OCRed with this build will save it automatically.");
      refreshParagraphRebuildUi();
      return 0;
    }
    if (confirmOverwrite && !confirm(
      `Rebuild paragraph structure on ${eligible.length} page${eligible.length === 1 ? "" : "s"}?\n\n` +
      "This uses the saved PaddleOCR line geometry and replaces the current page text on those pages. Run it before manual text edits, or export a copy first."
    )) return 0;

    const bookProfile = buildBookLayoutProfile(eligible);
    state.bookLayoutProfile = bookProfile;
    let rebuiltCount = 0;
    state.pages.forEach(page => {
      // Manual Review edits are canonical. Keep scanning them, but never replace
      // their text wholesale from OCR/layout geometry.
      if (page.manualEdited) return;
      if (!Array.isArray(page.layoutLines) || !page.layoutLines.length) return;
      const rebuilt = reconstructParagraphsFromLayout(page.layoutLines, { messageMode: false, bookProfile });
      if (!rebuilt.text) return;
      page.text = cleanBodyText(rebuilt.text);
      // Rebuild is allowed to replace paragraph structure, but it should not
      // erase safe formatting cleanup the user already ran. Re-apply the same
      // conservative cleanup after reconstruction so button order is harmless.
      const safePolish = globalThis.BookOcrEpubPolish?.safePolishText;
      if (typeof safePolish === "function") page.text = safePolish(page.text).text;
      page.layoutMeta = rebuilt.meta;
      page.chapterCandidate = chapterHeuristic(page.text);
      if (!page.chapterTitle) page.chapterTitle = detectChapterTitle(page.text, rebuiltCount + 1);
      rebuiltCount++;
    });
    saveCheckpoint();
    renderReview();
    refreshParagraphRebuildUi();
    const profileNote = bookProfile?.indentCount
      ? ` Layout profile: body ${Math.round(bookProfile.bodyLeft)} / indent ${Math.round(bookProfile.indentLeft)} from ${bookProfile.learnedFromLines} OCR lines.`
      : " Used the best available body-margin profile.";
    const protectedManual = state.pages.filter(page => page.manualEdited).length;
    setStatus(`Paragraph structure rebuilt on ${rebuiltCount} page${rebuiltCount === 1 ? "" : "s"} from saved OCR geometry. ${protectedManual ? `${protectedManual} manually edited page${protectedManual===1?" was":"s were"} protected from text rebuild. ` : ""}No OCR rerun was needed.${profileNote}`);
    return rebuiltCount;
  }


  async function processAllPages() {
    if (!state.files.length || state.processing) return;
    els.reviewSection.classList.remove("hidden");
    els.guidedRepairSection?.classList.remove("hidden");
    els.advancedSection?.classList.remove("hidden");
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

    // Once the batch exists as a whole, learn one authoritative profile and
    // feed that exact object through rebuild, diagnostics, status, and export.
    // This prevents helper/profile drift between code paths.
    state.bookLayoutProfile = buildBookLayoutProfile(state.pages);
    rebuildParagraphsFromSavedGeometry({ confirmOverwrite: false });
    const detectedChapters = redetectAutomaticChapterStarts();
    state.currentPageIndex = 0;
    state.reviewMode = "chapters";
    saveCheckpoint();
    renderReview();
    refreshParagraphRebuildUi();
    const chapters = state.pages.filter(page => page.chapterStart).length;
    setStatus(`Batch OCR complete: ${state.pages.length} pages processed. Book-level paragraph profile applied automatically. Strict chapter detection found ${chapters} chapter start page${chapters === 1 ? "" : "s"} for review.`);
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
    ["ope's", "Hope's"], ["fter", "After"], ["oly", "Holy"],
    ["aked", "Naked"], ["t", "At"], ["here's", "There's"],
    ["hen", "When"], ["hat", "What"], ["n", "On"], ["h", "Oh"],
    ["ittle", "Little"], ["otherhood", "Motherhood"], ["here", "There"],
    ["eese", "Reese"], ["his", "This"],
    ["kay", "Okay"], ["ucker's", "Tucker's"]
  ]);

  const COMMON_DROPCAP_PHRASES = [
    { pattern: /^e suck\b/i, missing: "W", replace: text => text.replace(/^e\b/i, "We") },
    { pattern: /^couple days\b/i, missing: "A", replace: text => `A ${text}` },
    { pattern: /^always thought\b/i, missing: "I", replace: text => `I ${text}` }
  ];

  // These create review suggestions, never automatic repairs. At a chapter
  // opening they can indicate that OCR lost a standalone first-person “I”
  // rather than the first letter of the verb itself.
  const FIRST_PERSON_OPENING_VERBS = new Set([
    "wait", "walk", "watch", "wonder", "stare", "look", "feel", "hear",
    "know", "think", "want", "need", "hate", "love", "drag", "step",
    "sit", "stand", "turn", "glance", "take", "make", "head", "leave",
    "wake", "pull", "push", "open", "close", "remember", "realize",
    "like", "lie", "limp", "ask", "apologize"
  ]);

  function firstWordInfo(text) {
    const match = String(text || "").match(/^([\s“‘"'(\[{—–-]*)([\p{L}][\p{L}’'-]*)/u);
    if (!match) return null;
    return { prefix: match[1], word: match[2], start: match[1].length, end: match[0].length };
  }

  function repairOpeningDialogueQuote(text, info, proposedWord) {
    let value = String(text || "");
    if (!proposedWord || !/^This$/i.test(proposedWord) || /[“"]/.test(info?.prefix || "")) return value;
    // OCR can miss the opening quote beside a decorative dropcap but still
    // capture the closing quote immediately before a dialogue tag:
    //   his is the training room, " I tell Milo.
    // Reconstruct that as "This is the training room," I tell Milo.
    const re = /^(This\b[^.!?\n]{0,180}),\s*([“"])\s*(I\s+(?:tell|told|say|said|ask|asked|add|added|reply|replied|answer|answered)\b)/i;
    const m = value.match(re);
    if (!m) return value;
    const quote = m[2] === "“" ? "“" : "\"";
    const close = quote === "“" ? "”" : "\"";
    return value.replace(re, `${quote}$1,${close} $3`);
  }

  function excerpt(text, limit = 150) {
    const flat = String(text || "").replace(/\s+/g, " ").trim();
    return flat.length > limit ? `${flat.slice(0, limit).trim()}…` : flat;
  }

  async function hydrateRawDropcapDetections(pageIndexes = null, progressCallback = null) {
    if (state.importedEpub || !state.files.length) return 0;
    const allowed = pageIndexes ? new Set(pageIndexes) : null;
    const targets = state.pages
      .map((page, pageIndex) => ({ page, pageIndex }))
      .filter(({ page, pageIndex }) =>
        page?.chapterStart &&
        (!allowed || allowed.has(pageIndex)) &&
        (!Array.isArray(page.rawOcrItems) || !page.rawOcrItems.length)
      );

    let hydrated = 0;
    for (let i = 0; i < targets.length; i++) {
      const { page, pageIndex } = targets[i];
      const file = state.files[pageIndex] || page.file;
      if (!file) continue;
      try {
        const dropPct = ((i + 1) / Math.max(1, targets.length)) * 100;
        if (typeof progressCallback === "function") {
          progressCallback(i + 1, targets.length, dropPct, pageIndex + 1);
        } else {
          setStatus(`Dropcap Rescue geometry ${i + 1}/${targets.length} · reading raw Paddle detections from page ${pageIndex + 1}…`);
        }
        const img = await loadImageFromFile(file);
        const canvas = makeCroppedCanvas(img);
        const paddle = await paddleRecognizeCanvas(canvas, { messageMode: false });
        page.rawOcrItems = normalizePaddleItems(paddle.result?.items);
        canvas.width = 1;
        canvas.height = 1;
        hydrated++;
        saveCheckpoint();
        await new Promise(resolve => setTimeout(resolve, 25));
      } catch (err) {
        console.warn("Could not hydrate raw Dropcap Rescue detections", pageIndex, err);
      }
    }
    return hydrated;
  }

  function geometryDropcapFragment(opening, expectedInitial = "") {
    try {
      const page = opening?.page;
      const sourceItems = Array.isArray(page?.rawOcrItems) && page.rawOcrItems.length
        ? page.rawOcrItems
        : (Array.isArray(page?.layoutLines) ? page.layoutLines : []);

      const lines = sourceItems
        .map((line, originalIndex) => ({
          ...line, originalIndex,
          box: line?.box ? {
            x:Number(line.box.x), y:Number(line.box.y), w:Number(line.box.w),
            h:Number(line.box.h), cx:Number(line.box.cx), cy:Number(line.box.cy)
          } : null
        }))
        .filter(line => line?.text && line?.box &&
          [line.box.x,line.box.y,line.box.w,line.box.h,line.box.cx,line.box.cy].every(Number.isFinite));

      if (!lines.length) return null;
      const openingInfo = firstWordInfo(opening?.text || "");
      if (!openingInfo || !/^\p{Ll}/u.test(openingInfo.word)) return null;

      const firstWord = openingInfo.word.toLowerCase();
      const typicalH = median(lines.map(line => line.box.h).filter(h => h > 2)) || 28;
      const prose = lines.filter(line => String(line.text || "").trim().length > 1);

      let target = prose.find(line => {
        const t = String(line.text || "").trim().replace(/^[“”"'‘’([{—–-]+/, "").toLowerCase();
        return t.startsWith(firstWord) || t.includes(firstWord.slice(0, Math.min(12, firstWord.length)));
      });
      if (!target) return null;

      const expected = String(expectedInitial || "").toUpperCase();
      const singles = lines.filter(line => {
        const value = String(line.text || "").trim().replace(/[“”"'‘’]/g, "");
        return /^[A-Z]$/u.test(value) && line !== target;
      });

      const candidates = singles.map(line => {
        const value = String(line.text || "").trim().replace(/[“”"'‘’]/g, "");
        const leftGap = target.box.x - (line.box.x + line.box.w);
        const verticalOverlap = Math.max(0,
          Math.min(line.box.y + line.box.h, target.box.y + target.box.h * 2.6) -
          Math.max(line.box.y, target.box.y - target.box.h * 1.2));
        const dy = Math.abs(line.box.cy - target.box.cy);
        const isLeft = line.box.x < target.box.x;
        const closeLeft = leftGap >= -typicalH * .45 && leftGap <= typicalH * 2.8;
        const tall = line.box.h >= typicalH * 1.15;

        let score = 0;
        if (expected && value === expected) score += 9;
        if (isLeft) score += 5;
        if (closeLeft) score += 5;
        if (verticalOverlap > 0) score += 4;
        if (dy <= typicalH * 1.8) score += 3;
        if (tall) score += 3;

        return {
          value, source:"raw-geometry", distance: dy / Math.max(1, typicalH),
          geometryScore:score,
          geometry:{ targetText:String(target.text||""), targetBox:target.box,
                     fragmentBox:line.box, typicalH, raw: Array.isArray(page?.rawOcrItems) && page.rawOcrItems.length > 0 }
        };
      }).filter(c => c.geometryScore >= (expected ? 8 : 11));

      candidates.sort((a,b) => b.geometryScore-a.geometryScore || a.distance-b.distance);
      return candidates[0] || null;
    } catch (err) {
      console.warn("Raw geometry Dropcap Rescue skipped one opening", err, opening?.pageIndex);
      return null;
    }
  }

  function standaloneFragment(text, paragraphText, expectedInitial = "", allowPronounI = false) {
    const lines = String(text || "").split(/\n+/).map(line => line.trim()).filter(Boolean);
    const target = String(paragraphText || "").trim();
    const targetIndex = lines.findIndex(line => line === target || line.startsWith(target.slice(0, 40)));
    const candidates = [];
    lines.forEach((line, index) => {
      if (line === target || !/^\P{N}$/u.test(line)) return;
      const distance = targetIndex < 0 ? 99 : Math.abs(index - targetIndex);
      candidates.push({ value: line, lineIndex: index, distance, source: "line" });
    });
    Array.from(target.matchAll(/(?:^|[^\p{L}\p{N}])([\p{L}\p{S}_])(?=$|[^\p{L}\p{N}])/gu))
      .filter(match => match.index > 0)
      .forEach(match => candidates.push({
        value: match[1], charIndex: match.index,
        distance: match.index < 30 ? 1 : 3, source: "token"
      }));

    const usable = candidates.filter(candidate => {
      if (candidate.value === "I" && !allowPronounI) return false;
      // Lowercase one-letter words (especially “a”) are ordinary prose, not
      // detached decorative capitals.
      return /^\p{Lu}$/u.test(candidate.value) || !/^[a-z]$/iu.test(candidate.value);
    });
    const exact = expectedInitial && usable
      .filter(candidate => candidate.value.toLocaleUpperCase() === expectedInitial.toLocaleUpperCase())
      .filter(candidate => expectedInitial !== "I" || candidate.source === "line")
      .sort((a, b) => a.distance - b.distance)[0];
    if (exact) return exact;

    // A bad glyph such as 可 is useful only as an ambiguous removable fragment
    // when a separate word/phrase rule already supplies the expected letter.
    if (expectedInitial) {
      return usable.filter(candidate => !/^[A-Z]$/u.test(candidate.value))
        .sort((a, b) => a.distance - b.distance)[0] || null;
    }

    // With no proposed initial, only a separate adjacent line is strong enough
    // to flag. Never fish through ordinary paragraph prose for a letter.
    return usable.filter(candidate => candidate.source === "line" && candidate.distance <= 1)
      .sort((a, b) => a.distance - b.distance)[0] || null;
  }

  function removeDetachedToken(text, fragment, firstWordEnd) {
    if (!fragment?.value) return text;
    const escaped = fragment.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (fragment.source === "token") {
      const tail = text.slice(firstWordEnd);
      return text.slice(0, firstWordEnd) + tail
        .replace(new RegExp(`(^|\\s)[“”"'‘’]?${escaped}[“”"'‘’]?(?=\\s|[.,!?;:]|$)`, "u"), "$1")
        .replace(/ {2,}/g, " ");
    }
    return text;
  }

  function selectProseOpening(paragraphTexts) {
    const texts = (paragraphTexts || []).map(text => String(text || "").trim());
    for (let index = 0; index < Math.min(texts.length, 12); index++) {
      const fullText = texts[index];
      if (!fullText) continue;
      const startOffset = damagedOpeningOffset(fullText);
      if (startOffset >= 0) return { index, startOffset };
      if (isOpeningPrelude(fullText)) continue;
      return { index, startOffset: 0 };
    }
    const fallback = texts.findIndex(text => text.length > 12);
    return fallback >= 0 ? { index: fallback, startOffset: 0 } : null;
  }

  function pageParagraphEntries(text) {
    const normalized = normalizedPageText(text);
    if (!normalized) return [];
    const blocks = normalized.split(/\n{2,}/);
    const entries = [];
    blocks.forEach((block, sourceBlockIndex) => {
      const lines = block.split("\n").map(line => line.trim()).filter(Boolean);
      const leadingMetadataLines = [];
      while (lines.length > 1 && isOpeningPrelude(lines[0])) {
        const metadata = lines.shift();
        leadingMetadataLines.push(metadata);
        entries.push({ text: metadata, sourceBlockIndex, metadataOnly: true });
      }
      if (lines.length) {
        entries.push({
          text: lines.join(" ").trim(), sourceBlockIndex,
          leadingMetadataLines: [...leadingMetadataLines], metadataOnly: false
        });
      }
    });
    return entries;
  }

  function openingFromPage(page, pageIndex) {
    const entries = pageParagraphEntries(page?.text || "");
    const selected = selectProseOpening(entries.map(entry => entry.text));
    if (!selected) return null;
    const entry = entries[selected.index];
    const fullText = entry.text;
    return {
      pageIndex, paragraphIndex: selected.index,
      text: fullText.slice(selected.startOffset),
      fullText, startOffset: selected.startOffset, page,
      sourceBlockIndex: entry.sourceBlockIndex,
      leadingMetadataLines: entry.leadingMetadataLines || []
    };
  }

  function likelyOpeningParagraphs() {
    if (state.importedEpub) {
      return state.importedEpub.documents.map((doc, pageIndex) => {
        const paragraphs = Array.from(doc.dom.querySelectorAll("p"));
        const selected = selectProseOpening(paragraphs.map(paragraph => paragraph.textContent));
        if (!selected) return null;
        const target = paragraphs[selected.index];
        const fullText = target.textContent.trim();
        return {
          pageIndex, paragraphIndex: selected.index,
          text: fullText.slice(selected.startOffset), fullText, startOffset: selected.startOffset,
          element: target, doc
        };
      }).filter(Boolean);
    }

    return state.pages.flatMap((page, pageIndex) => {
      if (!(page.chapterStart || page.chapterCandidate || pageIndex === 0)) return [];
      const opening = openingFromPage(page, pageIndex);
      return opening ? [opening] : [];
    });
  }

  function knownDamagedOpening(text) {
    const info = firstWordInfo(text);
    if (!info || !/^\p{Ll}/u.test(info.word)) return false;
    return COMMON_DROPCAP_WORDS.has(info.word.toLowerCase()) ||
      COMMON_DROPCAP_PHRASES.some(item => item.pattern.test(text)) ||
      FIRST_PERSON_OPENING_VERBS.has(info.word.toLowerCase()) ||
      /^['’]m\b/i.test(text);
  }

  function legacyBadIOpening(text) {
    const info = firstWordInfo(text);
    if (!info || !/^I\p{Ll}/u.test(info.word)) return false;
    const withoutBadI = `${text.slice(0, info.start)}${info.word.slice(1)}${text.slice(info.end)}`;
    return knownDamagedOpening(withoutBadI);
  }

  function isOpeningPrelude(text) {
    const value = String(text || "").trim();
    if (!value) return true;
    const months = "January|February|March|April|May|June|July|August|September|October|November|December";
    const holidays = "New Year(?:'s)?(?: Eve| Day)?|Valentine(?:'s)? Day|Easter|Memorial Day|Independence Day|Fourth of July|Labor Day|Halloween|Thanksgiving|Christmas(?: Eve| Day)?";
    if (value.length <= 60 && (/^[A-Z][A-Z\s.'&-]+$/.test(value) || new RegExp(`^(?:${months}|${holidays})$`, "i").test(value))) return true;
    if (value.length <= 60 && /^(?:\w+day,?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?$/i.test(value)) return true;
    if (value.length <= 45 && /^(?:\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?|(?:one|two|three|four|five|six|seven|eight|nine|ten|several|a few)\s+(?:hours?|days?|weeks?|months?|years?)\s+(?:later|earlier|before|after))$/i.test(value)) return true;
    const labelWords = value.split(/\s+/);
    if (value.length <= 40 && labelWords.length <= 8 && !/[.!?…][”"']?$/.test(value) &&
        labelWords.every(word => /^(?:[A-Z0-9]|of$|the$|a$|an$|and$|at$|in$|on$|to$|for$)/.test(word)) &&
        !knownDamagedOpening(value) && !legacyBadIOpening(value)) return true;
    // Book OCR Studio exports text-message exchanges as prose paragraphs with
    // uppercase speaker labels. They precede, but are not, the narrative start.
    return /\b(?:SABRINA|TUCKER)\b/.test(value) && value.length < 900;
  }

  function damagedOpeningOffset(text) {
    const full = String(text || "").trim();
    if (knownDamagedOpening(full) || legacyBadIOpening(full)) return 0;
    // Some exported pages contain a text-message prelude and the narrative
    // opening in one paragraph. Find a known damaged opening immediately after
    // punctuation without scanning arbitrary lowercase words in ordinary prose.
    const matches = full.matchAll(/(?:^|[.!?;:)\]])\s+[“”"'‘’]?([a-z][\p{L}’'-]*)/gu);
    for (const match of matches) {
      const wordOffset = match.index + match[0].lastIndexOf(match[1]);
      if (knownDamagedOpening(full.slice(wordOffset))) return wordOffset;
    }
    return -1;
  }

  function dropcapRawDiagnostic(opening) {
    try {
      const page = opening?.page;
      const items = Array.isArray(page?.rawOcrItems) ? page.rawOcrItems : [];
      if (!items.length) return { summary: "No raw Paddle detections saved for this page.", tokens: [] };

      const info = firstWordInfo(opening?.text || "");
      const firstWord = String(info?.word || "").toLowerCase();

      const cleanItems = items
        .map((item, index) => ({
          index,
          text: String(item?.text || "").trim(),
          score: Number(item?.score ?? 0),
          box: item?.box ? {
            x:Number(item.box.x), y:Number(item.box.y), w:Number(item.box.w), h:Number(item.box.h),
            cx:Number(item.box.cx), cy:Number(item.box.cy)
          } : null
        }))
        .filter(item => item.text && item.box &&
          [item.box.x,item.box.y,item.box.w,item.box.h,item.box.cx,item.box.cy].every(Number.isFinite));

      if (!cleanItems.length) return { summary: "Raw detections exist, but none have usable box geometry.", tokens: [] };

      let target = cleanItems.find(item => {
        const t = item.text.replace(/^[“”"'‘’([{—–-]+/, "").toLowerCase();
        return firstWord && (t.startsWith(firstWord) || t.includes(firstWord));
      });

      if (!target) {
        return {
          summary: `Raw detections: ${cleanItems.length}. Could not match damaged opening “${info?.word || "?"}” to a raw token.`,
          tokens: cleanItems.slice(0, 12).map(item => ({ ...item, relation:"unmatched" }))
        };
      }

      const typicalH = median(cleanItems.map(item => item.box.h).filter(h => h > 2)) || 28;

      const nearby = cleanItems
        .filter(item => item.index !== target.index)
        .map(item => {
          const dx = item.box.cx - target.box.cx;
          const dy = item.box.cy - target.box.cy;
          const leftGap = target.box.x - (item.box.x + item.box.w);
          const distance = Math.hypot(dx, dy);
          return {
            ...item,
            dx, dy, leftGap, distance,
            isSingleCapital:/^[A-Z]$/u.test(item.text.replace(/[“”"'‘’]/g, "")),
            isLeft:item.box.x < target.box.x,
            tall:item.box.h >= typicalH * 1.15
          };
        })
        .filter(item =>
          Math.abs(item.dy) <= typicalH * 3.5 ||
          (item.isLeft && Math.abs(item.leftGap) <= typicalH * 5)
        )
        .sort((a,b) => a.distance - b.distance)
        .slice(0, 16);

      return {
        summary: `Matched raw opening token “${target.text}” (#${target.index}). ${nearby.length} nearby raw token${nearby.length===1?"":"s"} shown.`,
        target,
        tokens: nearby
      };
    } catch (err) {
      return { summary: `Raw diagnostic failed: ${err?.message || err}`, tokens: [] };
    }
  }

  function buildDropcapCandidate(opening, id, { legacyRetry = false } = {}) {
    const info = firstWordInfo(opening.text);
    if (!info) return null;

    const pageText = state.importedEpub
      ? Array.from(opening.doc.dom.querySelectorAll("p, div"))
        .map(element => element.textContent.trim()).filter(Boolean).join("\n")
      : opening.page.text;

    // Dropcap Rescue 2.2.0 could incorrectly glue an ordinary prose “I” to
    // the damaged opening. Recognize only known repair shapes so that valid
    // words beginning with I are never broadly rewritten.
    if (!legacyRetry && /^I\p{Ll}/u.test(info.word)) {
      const withoutBadI = `${opening.text.slice(0, info.start)}${info.word.slice(1)}${opening.text.slice(info.end)}`;
      if (knownDamagedOpening(withoutBadI)) {
        const recovered = buildDropcapCandidate({ ...opening, text: withoutBadI }, id, { legacyRetry: true });
        if (recovered) {
          recovered.before = opening.text;
          recovered.reason = `A previous Dropcap Rescue appears to have attached a prose “I” to this opening. ${recovered.reason}`;
          recovered.confidence = "ambiguous";
          return recovered;
        }
      }
    }
    if (!/^\p{Ll}/u.test(info.word)) {
      const openingInitial = info.word.charAt(0);
      if (!/^[A-Z]$/.test(openingInitial) || openingInitial === "I") return null;
      const duplicate = standaloneFragment(pageText, opening.text, openingInitial, false);
      if (!duplicate || duplicate.value !== openingInitial) return null;
      let cleaned = removeDetachedToken(opening.text, duplicate, info.end);
      if (cleaned === opening.text) return null;
      if (opening.fullText && opening.startOffset > 0) cleaned = `${opening.fullText.slice(0, opening.startOffset)}${cleaned}`;
      return {
        id, ...opening, info, fragment: duplicate,
        confidence: duplicate.source === "line" && duplicate.distance <= 1 ? "high" : "ambiguous",
        reason: `The opening already begins with “${openingInitial},” and another standalone “${openingInitial}” appears later. The proposal removes only the duplicate.`,
        before: opening.fullText || opening.text, proposed: cleaned, status: "pending"
      };
    }
    const dictionaryProposal = COMMON_DROPCAP_WORDS.get(info.word.toLowerCase()) || "";
    const fixedPhraseProposal = COMMON_DROPCAP_PHRASES.find(item => item.pattern.test(opening.text));
    const firstPersonProposal = FIRST_PERSON_OPENING_VERBS.has(info.word.toLowerCase())
      ? { missing: "I", replace: text => `I ${text}`, firstPerson: true }
      : null;
    const phraseProposal = fixedPhraseProposal || firstPersonProposal;
    const contractionProposal = /^['’]m\b/i.test(opening.text);
    const expectedInitial = contractionProposal
      ? "I"
      : phraseProposal?.missing || dictionaryProposal.charAt(0) || "";
    let geometryFragment = null;
    const geometryEnabled = els.geometryAssist ? els.geometryAssist.checked : true;
    if (!state.importedEpub && geometryEnabled) {
      try {
        geometryFragment = geometryDropcapFragment(opening, expectedInitial);
      } catch (err) {
        console.warn("Geometry Dropcap Rescue fallback", err, opening?.pageIndex);
        geometryFragment = null;
      }
    }
    const fragment = geometryFragment ||
      standaloneFragment(pageText, opening.text, expectedInitial, contractionProposal);
    const latinFragment = fragment && /^\p{Lu}$/u.test(fragment.value) ? fragment.value : "";
    let proposedWord = "";
    let confidence = "ambiguous";
    let reason = "The chapter-opening word begins with a lowercase letter, but no reliable detached letter was found.";

    if (contractionProposal) {
      proposedWord = info.word;
      reason = latinFragment === "I"
        ? "A detached capital “I” matches the missing start of the opening contraction."
        : "The opening contraction appears to be missing “I”; please verify the suggestion.";
      confidence = latinFragment === "I" && (
        (fragment.source === "line" && fragment.distance <= 1) ||
        ((fragment.source === "geometry-line" || fragment.source === "raw-geometry") && Number(fragment.geometryScore || 0) >= 7)
      ) ? "high" : "ambiguous";
    } else if (phraseProposal) {
      proposedWord = info.word;
      reason = phraseProposal.firstPerson
        ? "This chapter may begin with a standalone first-person “I” before the opening verb; please verify the suggestion."
        : latinFragment === expectedInitial
          ? `A detached capital “${expectedInitial}” matches this opening phrase.`
          : `This opening phrase appears to be missing “${expectedInitial}”; please verify the suggestion.`;
      // A normal pronoun “I” inside prose is never strong evidence. Only a
      // separate adjacent OCR line can raise an I-based repair to high.
      confidence = latinFragment === expectedInitial && (
        (fragment.source === "line" && fragment.distance <= 1) ||
        ((fragment.source === "geometry-line" || fragment.source === "raw-geometry") && Number(fragment.geometryScore || 0) >= 7)
      ) ? "high" : "ambiguous";
    } else if (dictionaryProposal) {
      proposedWord = dictionaryProposal;
      const matches = latinFragment.toLocaleUpperCase() === expectedInitial.toLocaleUpperCase();
      confidence = matches && (
        fragment.distance <= 2 ||
        ((fragment.source === "geometry-line" || fragment.source === "raw-geometry") && Number(fragment.geometryScore || 0) >= 7)
      ) ? "high" : "ambiguous";
      const punctuationNote = info.prefix ? ` Opening punctuation “${info.prefix}” will be preserved.` : "";
      reason = matches
        ? `A detached capital “${latinFragment}” matches the missing start of “${dictionaryProposal}.”${punctuationNote}`
        : fragment
          ? `A stray “${fragment.value}” may be the misread decorative letter. “${dictionaryProposal}” is a review suggestion.${punctuationNote}`
          : `“${dictionaryProposal}” is a review suggestion; no reliable detached letter was found.${punctuationNote}`;
    } else if (latinFragment) {
      proposedWord = `${latinFragment}${info.word}`;
      const geometryHigh = (fragment.source === "geometry-line" || fragment.source === "raw-geometry") &&
        Number(fragment.geometryScore || 0) >= 7;
      confidence = (fragment.source === "line" && fragment.distance <= 1) || geometryHigh
        ? "high" : "ambiguous";
      reason = (fragment.source === "geometry-line" || fragment.source === "raw-geometry")
        ? confidence === "high"
          ? `Saved Paddle geometry places a detached capital “${latinFragment}” beside the damaged opening.`
          : `Saved Paddle geometry found a nearby capital “${latinFragment}”; please verify the reconstruction.`
        : confidence === "high"
          ? `A detached capital “${latinFragment}” appears beside this opening paragraph.`
          : `A detached capital “${latinFragment}” appears elsewhere in this chapter; please verify it.`;
    } else {
      // New hard rule: a lowercase first prose word at a marked chapter start
      // is itself enough evidence that a decorative initial may have been lost.
      // Do not silently suppress it just because Studio cannot infer the letter.
      proposedWord = info.word;
      confidence = "ambiguous";
      reason = "This marked chapter opening begins with a lowercase word. The drop cap may be missing; review and edit the first word directly.";
    }

    let proposedText;
    if (contractionProposal) proposedText = `I${opening.text}`;
    else if (phraseProposal) proposedText = phraseProposal.replace(opening.text);
    else proposedText = `${opening.text.slice(0, info.start)}${proposedWord}${opening.text.slice(info.end)}`;
    const mayRemoveFragment = fragment && (
      (fragment.value.toLocaleUpperCase() === expectedInitial.toLocaleUpperCase() &&
        !(expectedInitial === "I" && fragment.source === "token")) ||
      (expectedInitial && !/^[A-Za-z]$/u.test(fragment.value))
    );
    if (mayRemoveFragment) proposedText = removeDetachedToken(proposedText, fragment, info.start + proposedWord.length);
    proposedText = repairOpeningDialogueQuote(proposedText, info, proposedWord);
    if (opening.fullText && opening.startOffset > 0) {
      proposedText = `${opening.fullText.slice(0, opening.startOffset)}${proposedText}`;
    }
    return {
      id, ...opening, info, fragment, confidence, reason,
      before: opening.fullText || opening.text, proposed: proposedText, status: "pending",
      rawDiagnostic: state.importedEpub ? null : dropcapRawDiagnostic(opening)
    };
  }

  function closePageDropcapReview() {
    if (els.pageDropcapDialog.open) els.pageDropcapDialog.close();
    if (state.pageDropcapImageUrl) URL.revokeObjectURL(state.pageDropcapImageUrl);
    state.pageDropcapImageUrl = "";
    state.pageDropcapCandidate = null;
    els.pageDropcapImage.removeAttribute("src");
    els.pageDropcapImageWrap.classList.add("hidden");
  }

  function openPageDropcapReview() {
    if (state.processing || state.currentPageIndex < 0) return;
    syncCurrentEditor();
    const pageIndex = state.currentPageIndex;
    const page = state.pages[pageIndex];
    const opening = openingFromPage(page, pageIndex);
    if (!opening) {
      setStatus(`Page ${pageIndex + 1} has no prose paragraph to analyze.`);
      return;
    }

    const detected = buildDropcapCandidate(opening, `page-${pageIndex + 1}`);
    const candidate = detected || {
      ...opening,
      id: `page-${pageIndex + 1}`,
      fragment: null,
      confidence: "ambiguous",
      reason: "No reliable missing or displaced initial was found. The likely first prose paragraph is shown unchanged; edit it only if you can verify the correction from the source image.",
      before: opening.fullText,
      proposed: opening.fullText,
      status: "pending"
    };
    state.pageDropcapCandidate = candidate;

    els.pageDropcapReason.textContent = candidate.reason;
    els.pageDropcapBefore.textContent = candidate.before;
    els.pageDropcapEdit.value = candidate.proposed;
    if (candidate.fragment?.value) {
      els.pageDropcapOrphan.textContent = `The proposed repair also removes the orphaned “${candidate.fragment.value}” from elsewhere in this paragraph/page.`;
      els.pageDropcapOrphan.classList.remove("hidden");
    } else {
      els.pageDropcapOrphan.textContent = "";
      els.pageDropcapOrphan.classList.add("hidden");
    }

    if (page?.file instanceof Blob) {
      if (state.pageDropcapImageUrl) URL.revokeObjectURL(state.pageDropcapImageUrl);
      state.pageDropcapImageUrl = URL.createObjectURL(page.file);
      els.pageDropcapImage.src = state.pageDropcapImageUrl;
      els.pageDropcapImageWrap.classList.remove("hidden");
    } else {
      els.pageDropcapImageWrap.classList.add("hidden");
    }
    els.pageDropcapDialog.showModal();
    els.pageDropcapEdit.focus();
  }

  function applyPageDropcapReview() {
    const candidate = state.pageDropcapCandidate;
    if (!candidate) return;
    const replacement = els.pageDropcapEdit.value.trim();
    if (!replacement) {
      alert("The proposed paragraph cannot be empty.");
      return;
    }
    const pageNumber = candidate.pageIndex + 1;
    replaceLocalParagraph(candidate, replacement);
    closePageDropcapReview();
    renderReview();
    setStatus(`Dropcap Rescue applied the reviewed correction to page ${pageNumber}. No OCR was run.`);
  }

  function scanDropcaps(pageIndexes = null) {
    syncCurrentEditor();

    const expectedChapterPages = state.importedEpub
      ? state.pages.map((_, pageIndex) => pageIndex).filter(pageIndex => !pageIndexes || pageIndexes.includes(pageIndex))
      : state.pages
          .map((page, pageIndex) => (page.chapterStart || page.chapterCandidate || pageIndex === 0) ? pageIndex : -1)
          .filter(pageIndex => pageIndex >= 0 && (!pageIndexes || pageIndexes.includes(pageIndex)));

    const allowed = pageIndexes ? new Set(pageIndexes) : null;
    const allOpenings = likelyOpeningParagraphs();
    const openings = allowed ? allOpenings.filter(opening => allowed.has(opening.pageIndex)) : allOpenings;
    const evaluatedPages = new Set(openings.map(opening => opening.pageIndex));

    state.dropcapCandidates = openings
      .map((opening, index) => buildDropcapCandidate(opening, index + 1))
      .filter(Boolean)
      .filter(candidate => {
        if (state.importedEpub) return true;
        const page = state.pages[candidate.pageIndex];
        if (!page) return false;

        // Current repaired text is authoritative. Geometry may suggest where to
        // inspect, but it may not resurrect an already-fixed opening.
        const currentOpening = openingFromPage(page, candidate.pageIndex);
        if (!currentOpening) return false;
        return Boolean(buildDropcapCandidate(currentOpening, candidate.id));
      });

    const missedPages = expectedChapterPages.filter(pageIndex => !evaluatedPages.has(pageIndex));
    state.lastDropcapAudit = {
      expected: expectedChapterPages.length,
      evaluated: evaluatedPages.size,
      missedPages,
      candidates: state.dropcapCandidates.length
    };

    renderDropcapResults();
    const count = state.dropcapCandidates.length;
    const audit = state.lastDropcapAudit;
    if (missedPages.length) {
      setStatus(`Dropcap Rescue INCOMPLETE: evaluated ${audit.evaluated} of ${audit.expected} chapter starts. ${missedPages.length} chapter start${missedPages.length===1?" was":"s were"} not evaluated.`);
    } else {
      setStatus(count
        ? `Dropcap Rescue evaluated all ${audit.evaluated} chapter starts and found ${count} opening${count===1?"":"s"} to review. No OCR was run.`
        : `Dropcap Rescue evaluated all ${audit.evaluated} chapter starts and found no unresolved drop-cap candidates.`);
    }
    return state.dropcapCandidates;
  }

  function replaceLocalParagraph(candidate, replacement) {
    const page = state.pages[candidate.pageIndex];
    if (!page) return false;
    const originalText = String(page.text || "");
    const blocks = normalizedPageText(originalText).split(/\n{2,}/);
    const blockIndex = Number.isInteger(candidate.sourceBlockIndex)
      ? candidate.sourceBlockIndex : candidate.paragraphIndex;
    let replaced = false;

    // Prefer the saved block only when it still contains the candidate's current
    // paragraph. Repair/rebuild passes can change block indexes.
    if (blocks[blockIndex]) {
      const blockBody = String(blocks[blockIndex]);
      const expected = String(candidate.text || candidate.before || "").trim();
      if (!expected || blockBody.includes(expected) || blockBody.trim() === expected) {
        blocks[blockIndex] = candidate.leadingMetadataLines?.length
          ? `${candidate.leadingMetadataLines.join("\n")}\n${replacement}`
          : replacement;
        replaced = true;
      }
    }

    let nextText = replaced ? blocks.join("\n\n") : originalText;

    // Fallback to the actual current candidate text instead of trusting a stale
    // paragraph index.
    if (!replaced) {
      const needles = [candidate.text, candidate.before]
        .map(v => String(v || "").trim()).filter(Boolean);
      for (const needle of needles) {
        const pos = nextText.indexOf(needle);
        if (pos >= 0) {
          nextText = nextText.slice(0, pos) + replacement + nextText.slice(pos + needle.length);
          replaced = true;
          break;
        }
      }
    }
    if (!replaced) return false;

    if (candidate.fragment?.value) {
      const escaped = candidate.fragment.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (candidate.fragment.source === "line" || (candidate.fragment.source === "geometry-line" || candidate.fragment.source === "raw-geometry")) {
        const detached = new RegExp(`(^|\\n)\\s*${escaped}\\s*(?=\\n|$)`, "u");
        nextText = nextText.replace(detached, "$1").replace(/\n{3,}/g, "\n\n");
      }
    }
    if (!commitPageText(candidate.pageIndex, nextText)) return false;
    return String(state.pages[candidate.pageIndex]?.text || "").includes(replacement);
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
      const applied = replaceLocalParagraph(candidate, clean);
      if (!applied) return false;
      candidate.text = clean;
    }
    candidate.status = "accepted";
    saveCheckpoint();
    renderDropcapResults();
    return true;
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
    if (els.dropcapResults) els.dropcapResults.innerHTML = "";
    const pending = candidates.filter(c => c.status === "pending");
    const highPending = pending.filter(c => c.confidence === "high");
    if (els.dropcapSummary) {
      els.dropcapSummary.textContent = candidates.length
        ? `${pending.length} to review · ${candidates.length - pending.length} resolved`
        : "No candidates";
    }
    if (els.acceptHighDropcaps) els.acceptHighDropcaps.disabled = !highPending.length;
    els.dropcapEmpty?.classList.toggle("hidden", candidates.length > 0);
    if (!candidates.length && els.dropcapEmpty) els.dropcapEmpty.textContent = "No likely drop-cap failures were found. Nothing was changed.";

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
    els.dropcapSection?.classList.remove("hidden");
    els.guidedRepairSection?.classList.remove("hidden");
    els.advancedSection?.classList.remove("hidden");
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

  function italicSlantScore(canvas, box) {
    if (!canvas || !box) return { italic: false, slant: 0, gain: 0 };
    const padX = 2, padY = 1;
    const x0 = Math.max(0, Math.floor(box.x - padX));
    const y0 = Math.max(0, Math.floor(box.y - padY));
    const w = Math.min(canvas.width - x0, Math.max(8, Math.ceil(box.w + padX * 2)));
    const h = Math.min(canvas.height - y0, Math.max(8, Math.ceil(box.h + padY * 2)));
    if (w < 20 || h < 10) return { italic: false, slant: 0, gain: 0 };
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const data = ctx.getImageData(x0, y0, w, h).data;
    const gray = new Uint8Array(w * h);
    let sum = 0;
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const g = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      gray[j] = g; sum += g;
    }
    const mean = sum / gray.length;
    const threshold = Math.max(70, Math.min(205, mean - 38));
    const rows = [];
    let darkCount = 0;
    for (let y = 0; y < h; y++) {
      const xs = [];
      for (let x = 0; x < w; x++) {
        if (gray[y * w + x] < threshold) { xs.push(x); darkCount++; }
      }
      rows.push(xs);
    }
    if (darkCount < Math.max(40, w * h * 0.01)) return { italic: false, slant: 0, gain: 0 };
    const mid = (h - 1) / 2;
    const candidates = [-0.32,-0.28,-0.24,-0.20,-0.16,-0.12,-0.08,-0.04,0,0.04,0.08,0.12,0.16,0.20,0.24,0.28,0.32];
    const scoreFor = (slant) => {
      let overlap = 0, possible = 0;
      let prev = null;
      for (let y = 0; y < h; y++) {
        if (!rows[y].length) continue;
        const shift = Math.round(slant * (y - mid));
        const cur = new Set(rows[y].map(x => x - shift));
        if (prev) {
          possible += Math.min(prev.size, cur.size);
          for (const x of cur) if (prev.has(x) || prev.has(x - 1) || prev.has(x + 1)) overlap++;
        }
        prev = cur;
      }
      return possible ? overlap / possible : 0;
    };
    let bestSlant = 0, bestScore = -1;
    let zeroScore = 0;
    for (const slant of candidates) {
      const score = scoreFor(slant);
      if (slant === 0) zeroScore = score;
      if (score > bestScore) { bestScore = score; bestSlant = slant; }
    }
    const gain = bestScore - zeroScore;
    // Conservative by design: this is meant to catch obviously slanted full
    // OCR lines, not guess at ordinary prose or mixed roman/italic lines.
    const italic = Math.abs(bestSlant) >= 0.12 && gain >= 0.018 && bestScore >= 0.38;
    return { italic, slant: bestSlant, gain, score: bestScore, zeroScore };
  }

  function estimateWordBoxes(line) {
    const text = String(line?.text || "");
    const box = line?.box;
    if (!text.trim() || !box || box.w < 12) return [];
    const matches = [...text.matchAll(/\S+/g)];
    if (!matches.length) return [];
    // Character-position projection is intentionally simple: Paddle gives us
    // a line box, so project token offsets across that box and leave a small
    // inset to avoid neighboring glyphs. This is robust enough for style
    // scoring without pretending we have word-level OCR boxes.
    const n = Math.max(1, text.length);
    return matches.map(m => {
      const start = m.index || 0, end = start + m[0].length;
      const left = box.x + box.w * (start / n);
      const right = box.x + box.w * (end / n);
      const inset = Math.min(2, Math.max(0, (right-left) * 0.04));
      return { text:m[0], start, end, box:{ x:left+inset, y:box.y, w:Math.max(6,right-left-inset*2), h:box.h } };
    });
  }

  function buildItalicText(text, wordResults) {
    if (!wordResults?.length) return text;
    let out = "", pos = 0, inItalic = false;
    for (const wr of wordResults) {
      out += text.slice(pos, wr.start);
      if (wr.italic && !inItalic) { out += "[[i]]"; inItalic = true; }
      if (!wr.italic && inItalic) { out += "[[/i]]"; inItalic = false; }
      out += text.slice(wr.start, wr.end);
      pos = wr.end;
    }
    if (inItalic) out += "[[/i]]";
    out += text.slice(pos);
    return out;
  }

  function median(values) {
    const a = values.filter(Number.isFinite).slice().sort((x,y)=>x-y);
    if (!a.length) return 0;
    const m = Math.floor(a.length/2);
    return a.length % 2 ? a[m] : (a[m-1]+a[m])/2;
  }

  function groupItalicRuns(scored, lineResult, lineText, surroundingLineResults = []) {
    const runs = [];
    const alphaWords = scored.filter(w=>w.letters>=2);
    const allCaps = /^[^a-z]*[A-Z][^a-z]*$/.test(String(lineText||''));

    // Route A: true full-line emphasis. Absolute slant alone produced the stale
    // false positive seen in the IHOL regression corpus ("Ruthless but beautiful.").
    // A full italic line must now also stand out from nearby body lines. This is
    // font-adaptive and prevents a naturally slanted roman face from being
    // accepted merely because it crosses a global threshold.
    const surroundingAbsSlant = median(surroundingLineResults.map(r=>Math.abs(r?.slant||0)));
    const surroundingGain = median(surroundingLineResults.map(r=>r?.gain||0));
    const lineAbsSlant = Math.abs(lineResult?.slant||0);
    const lineGain = lineResult?.gain||0;
    const fullLineRelative = surroundingLineResults.length < 2 ||
      (lineAbsSlant - surroundingAbsSlant >= 0.10 && lineGain - surroundingGain >= 0.0025);
    const fullLineEvidence = alphaWords.length >= 2 && !allCaps &&
      lineAbsSlant >= 0.22 && lineGain >= 0.0045 && fullLineRelative &&
      String(lineText||'').replace(/[^A-Za-z]/g,'').length >= 8;
    if (fullLineEvidence) {
      alphaWords.forEach(w => { w.italic = true; });
      runs.push({ startWord:0, endWord:Math.max(0,scored.length-1), wordCount:alphaWords.length,
        sign:Math.sign(lineResult?.slant||0), avgGain:lineResult?.gain||0,
        avgAbsSlant:Math.abs(lineResult?.slant||0), neighborWordCount:0,
        neighborAbsSlant:0, neighborGain:0, slantLift:0, gainLift:0,
        surroundingLineCount:surroundingLineResults.length,
        surroundingAbsSlant,
        surroundingGain,
        surroundingSlantLift:0, surroundingGainLift:0,
        relativeEvidence:false, surroundingEvidence:false,
        fullLineEvidence:true, accepted:true, route:'full-line' });
      return runs;
    }

    // Route B: inline emphasis. Slant by itself proved noisy, so an inline run
    // must be exceptional relative to BOTH roman words on the same line and
    // nearby OCR lines on the page.
    let i = 0;
    while (i < scored.length) {
      if (!scored[i].candidate) { i++; continue; }
      const sign = Math.sign(scored[i].slant || 0);
      let j = i + 1;
      while (j < scored.length && scored[j].candidate && Math.sign(scored[j].slant || 0) === sign) j++;
      const words = scored.slice(i, j);
      const avgGain = words.reduce((a,w)=>a+(w.gain||0),0) / words.length;
      const avgAbsSlant = words.reduce((a,w)=>a+Math.abs(w.slant||0),0) / words.length;

      const neighbors = scored.filter((_,k)=>k<i || k>=j).filter(w=>w.letters>=2);
      const neighborAbsSlant = median(neighbors.map(w=>Math.abs(w.slant||0)));
      const neighborGain = median(neighbors.map(w=>w.gain||0));
      const slantLift = avgAbsSlant - neighborAbsSlant;
      const gainLift = avgGain - neighborGain;
      const surroundingSlantLift = avgAbsSlant - surroundingAbsSlant;
      const surroundingGainLift = avgGain - surroundingGain;

      // Adaptive evidence matters more than a book-independent absolute
      // slant number. Italic and roman glyphs from the same font can both be
      // mildly slanted; the useful signal is the lift against nearby roman text.
      const relativeEvidence = neighbors.length >= 2 && slantLift >= 0.09 && gainLift >= 0.0030;
      const surroundingEvidence = surroundingLineResults.length >= 2 &&
        surroundingSlantLift >= 0.09 && surroundingGainLift >= 0.0030;
      const runCoverage = scored.length ? words.length / scored.length : 0;
      const adaptiveEvidence = relativeEvidence || surroundingEvidence;

      const acceptedLong = words.length >= 3 && runCoverage <= 0.72 &&
        avgGain >= 0.0070 && avgAbsSlant >= 0.20 && adaptiveEvidence;
      // Short emphasis is common in novels. Keep it precision-biased, but no
      // longer require extreme values that real one/two-word italics rarely hit.
      const acceptedShort = words.length >= 1 && words.length <= 2 && runCoverage <= 0.55 &&
        avgGain >= 0.0090 && avgAbsSlant >= 0.24 &&
        slantLift >= 0.11 && gainLift >= 0.0040 &&
        (surroundingLineResults.length < 2 || surroundingSlantLift >= 0.08) &&
        adaptiveEvidence;
      const accepted = acceptedLong || acceptedShort;
      runs.push({ startWord:i, endWord:j-1, wordCount:words.length, sign, avgGain, avgAbsSlant,
        neighborWordCount:neighbors.length, neighborAbsSlant, neighborGain, slantLift, gainLift,
        surroundingLineCount:surroundingLineResults.length, surroundingAbsSlant, surroundingGain,
        surroundingSlantLift, surroundingGainLift, runCoverage,
        relativeEvidence, surroundingEvidence, fullLineEvidence:false,
        accepted, route:'inline' });
      if (accepted) for (let k=i;k<j;k++) scored[k].italic = true;
      i = j;
    }
    return runs;
  }

  async function autoScanItalics({ rebuildText = true, progressCallback = null } = {}) {
    if (!state.pages.length || !state.files.length) {
      setStatus("Load and OCR screenshot pages before running the automatic italic scan.");
      return;
    }
    syncCurrentEditor();
    els.autoItalicScan.disabled = true;
    let markedRuns = 0, markedWords = 0, scannedWords = 0, scannedLines = 0, projectedItalicPages = 0;
    try {
      for (let index = 0; index < state.pages.length; index++) {
        const page = state.pages[index];
        if (!Array.isArray(page.layoutLines) || !page.layoutLines.length) continue;
        const file = page.file || state.files[index];
        if (!file) continue;
        const italicPct = ((index + 1) / Math.max(1, state.pages.length)) * 100;
        if (typeof progressCallback === "function") {
          progressCallback(index + 1, state.pages.length, italicPct);
        } else {
          setStatus(`Automatic italic scan 2.5 regression hybrid: page ${index + 1} of ${state.pages.length}…`);
        }
        const img = await loadImageFromFile(file);
        const canvas = makeCroppedCanvas(img);
        const lineScores = page.layoutLines.map(line => italicSlantScore(canvas, line.box));
        for (let lineIndex = 0; lineIndex < page.layoutLines.length; lineIndex++) {
          const line = page.layoutLines[lineIndex];
          scannedLines++;
          line.italicAuto = false;
          line.italicText = null;
          line.italicMeta = null;
          line.italicWordMeta = [];
          line.italicRunMeta = [];
          const text = String(line.text || "").trim();
          if (text.length < 2 || isSceneMarkerText(text)) continue;

          const lineResult = lineScores[lineIndex];
          line.italicMeta = lineResult;

          const words = estimateWordBoxes(line);
          const prelim = words.map(w => {
            const r = italicSlantScore(canvas, w.box);
            scannedWords++;
            const letters = w.text.replace(/[^A-Za-z]/g, "").length;
            // v2.7.56: do not discard potential italics before the adaptive
            // run classifier gets to compare them with the surrounding roman
            // text. The former 0.24/0.008 gate eliminated nearly every real
            // inline run in the regression corpus. Keep a permissive geometry
            // gate here; acceptance below still requires coherent directional
            // and relative evidence.
            const minGain = letters <= 3 ? 0.0055 : 0.0040;
            const candidate = letters >= 2 && Math.abs(r.slant) >= 0.14 && r.gain >= minGain && r.score >= 0.70;
            return { ...w, ...r, letters, candidate, italic:false };
          });

          const surroundingLineResults = [];
          for (const delta of [-2,-1,1,2]) {
            const otherIndex = lineIndex + delta;
            if (otherIndex < 0 || otherIndex >= page.layoutLines.length) continue;
            const otherText = String(page.layoutLines[otherIndex]?.text || '').trim();
            if (!otherText || isSceneMarkerText(otherText) || /^[^a-z]*[A-Z][^a-z]*$/.test(otherText)) continue;
            surroundingLineResults.push(lineScores[otherIndex]);
          }
          const runs = groupItalicRuns(prelim, lineResult, text, surroundingLineResults);
          line.italicRunMeta = runs;
          line.italicWordMeta = prelim.map(({text,start,end,letters,candidate,italic,slant,gain,score,zeroScore}) => ({text,start,end,letters,candidate,italic,slant,gain,score,zeroScore}));
          line.italicText = buildItalicText(text, prelim);
          const acceptedRuns = runs.filter(r=>r.accepted).length;
          const acceptedWords = prelim.filter(x=>x.italic).length;
          markedRuns += acceptedRuns;
          markedWords += acceptedWords;
          line.italicAuto = acceptedRuns > 0;
        }
        const projected = projectItalicEvidenceToPage(page);
        if (projected) {
          projectedItalicPages++;
          // Save the formatted current text into the durable overlay without
          // changing manual-page authority. Later repair stages may reapply the
          // overlay, so it must contain the newest italic markers too.
          saveRepairOverlayPage(index);
        }
        canvas.width = 1; canvas.height = 1;
      }
      // Paragraph reconstruction already ran before the italic stage in Guided
      // Repair. Never rebuild from OCR geometry here: doing so skipped manual
      // pages and allowed later overlays to erase formatting. Italic evidence is
      // projected onto the authoritative current page text instead.
      saveCheckpoint();
      if (els.italicStatus) els.italicStatus.textContent = `${markedRuns} run${markedRuns === 1 ? "" : "s"} · ${markedWords} words`;
      setStatus(`Automatic italic scan 2.5 checked ${scannedWords} words across ${scannedLines} OCR lines and marked ${markedRuns} hybrid run${markedRuns === 1 ? "" : "s"} (${markedWords} words). Formatting evidence was projected onto ${projectedItalicPages} current page${projectedItalicPages === 1 ? "" : "s"} without rebuilding repaired text.`);
      return { markedRuns, markedWords, scannedWords, scannedLines, projectedItalicPages };
    } catch (err) {
      console.error(err);
      setStatus(`Automatic italic scan failed: ${err.message || err}`);
      return null;
    } finally {
      els.autoItalicScan.disabled = false;
      renderReview();
    }
  }

  function downloadItalicDiagnostics() {
    const lines = [];
    const words = [];
    const runs = [];
    state.pages.forEach((page, pageIndex) => {
      (page.layoutLines || []).forEach((line, lineIndex) => {
        if (!line.italicMeta && !line.italicWordMeta?.length) return;
        const base = {
          pageIndex,
          pageNumber: pageIndex + 1,
          fileName: page.fileName || state.files[pageIndex]?.name || "",
          lineIndex,
          text: line.text || "",
          box: line.box || null,
        };
        lines.push({ ...base, markedItalic: !!line.italicAuto, ...(line.italicMeta || {}) });
        (line.italicWordMeta || []).forEach((word, wordIndex) => words.push({ ...base, wordIndex, ...word }));
        (line.italicRunMeta || []).forEach((run, runIndex) => runs.push({ ...base, runIndex, ...run }));
      });
    });
    if (!words.length && !lines.length) {
      setStatus("Run Auto italic scan first so Studio has italic scores to export.");
      return;
    }
    const rankedLines = [...lines].sort((a,b) => (b.gain || 0) - (a.gain || 0));
    const rankedWords = [...words].sort((a,b) => (b.gain || 0) - (a.gain || 0));
    const payload = {
      format: "book-ocr-studio-italic-diagnostics-v5",
      buildVersion: BUILD_VERSION,
      exportedAt: new Date().toISOString(),
      summary: {
        pages: state.pages.length,
        scoredLines: lines.length,
        scoredWords: words.length,
        candidateWords: words.filter(x => x.candidate).length,
        markedWords: words.filter(x => x.italic).length,
        candidateRuns: runs.length,
        markedRuns: runs.filter(x => x.accepted).length,
      },
      thresholds: {
        wordMinAbsSlant: 0.14,
        wordMinGainNormal: 0.0040,
        wordMinGainShort: 0.0055,
        wordMinScore: 0.70,
        runMinWords: 3,
        runMinAverageGain: 0.0070,
        runMinAverageAbsSlant: 0.20,
        sameSlantDirectionRequired: true,
        relativeToLineSlantLift: 0.09,
        relativeToLineGainLift: 0.0030,
        surroundingLineSlantLift: 0.09,
        surroundingLineGainLift: 0.0030,
        inlineRunMaxCoverage: 0.72,
        fullLineMinAbsSlant: 0.22,
        fullLineMinGain: 0.0045,
        automaticSingleWordItalics: true,
      },
      topLineCandidatesByGain: rankedLines.slice(0, 100),
      topWordCandidatesByGain: rankedWords.slice(0, 250),
      acceptedRuns: runs.filter(x => x.accepted),
      rejectedRuns: runs.filter(x => !x.accepted),
      lines,
      words,
      runs,
    };
    const safeTitle = cleanFilename(els.bookTitle?.value || "book");
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"}), `${safeTitle}-italic-diagnostics.json`);
    setStatus(`Downloaded word-level italic diagnostics: ${words.length} words, ${runs.length} candidate runs, ${runs.filter(x=>x.accepted).length} accepted. This file now reflects the same decisions the EPUB exporter uses.`);
  }



  function isReferenceTwentyPagePack() {
    if (state.pages.length !== 20) return false;
    const names = state.pages.map((page, index) => String(page.fileName || state.files[index]?.name || "").toUpperCase());
    return names.every((name, index) => name.includes(`IMG_${2701 + index}`));
  }

  function renderRegressionReport(report) {
    state.lastRegressionReport = report;
    if (!els.regressionResults) return;
    els.regressionResults.innerHTML = "";
    els.regressionResults.classList.remove("hidden");
    report.checks.forEach(check => {
      const row = document.createElement("div");
      row.className = `regression-row ${check.status}`;
      const icon = document.createElement("div");
      icon.className = "regression-icon";
      icon.textContent = check.status === "pass" ? "✓" : check.status === "warn" ? "!" : "×";
      const text = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = check.name;
      const detail = document.createElement("div");
      detail.textContent = check.detail;
      text.append(title, detail);
      row.append(icon, text);
      els.regressionResults.appendChild(row);
    });
    const failed = report.checks.filter(c => c.status === "fail").length;
    const warned = report.checks.filter(c => c.status === "warn").length;
    if (els.regressionStatus) els.regressionStatus.textContent = failed ? `${failed} failed` : warned ? `PASS · ${warned} note${warned===1?"":"s"}` : "PASS";
  }

  function runRegressionCheck() {
    syncCurrentEditor();
    const checks = [];
    const add = (name, status, detail) => checks.push({ name, status, detail });
    const pages = state.pages;
    if (!pages.length) {
      add("Project loaded", "fail", "No processed pages are available to inspect.");
      const report = { buildVersion: BUILD_VERSION, runAt: new Date().toISOString(), checks };
      renderRegressionReport(report);
      setStatus("Regression check cannot run until pages are processed.");
      return report;
    }

    const emptyPages = pages.map((p,i) => normalizedPageText(p.text) ? -1 : i + 1).filter(n => n > 0);
    add("Page continuity", emptyPages.length ? "fail" : "pass", emptyPages.length ? `Empty processed pages: ${emptyPages.join(", ")}.` : `${pages.length} processed pages contain text.`);

    let duplicateAdjacent = 0;
    for (let i=1;i<pages.length;i++) {
      const a = stripItalicMarkers(normalizedPageText(pages[i-1].text));
      const b = stripItalicMarkers(normalizedPageText(pages[i].text));
      if (a && b && a === b) duplicateAdjacent++;
    }
    add("Adjacent duplicate pages", duplicateAdjacent ? "fail" : "pass", duplicateAdjacent ? `${duplicateAdjacent} adjacent page pair${duplicateAdjacent===1?"":"s"} contain identical text.` : "No exact adjacent duplicate-page text found.");

    const paragraphs = pages.flatMap(p => exportParagraphs(p.text));
    const largest = paragraphs.reduce((m,p) => Math.max(m, stripItalicMarkers(p).length), 0);
    const giant = paragraphs.filter(p => stripItalicMarkers(p).length > 2000).length;
    add("Paragraph reconstruction", giant ? "fail" : "pass", `${paragraphs.length} paragraph blocks; largest ${largest.toLocaleString()} characters${giant ? `; ${giant} giant block${giant===1?"":"s"} over 2,000 characters` : ""}.`);

    const allText = pages.map(p => p.text || "").join("\n");
    const rawEllipses = (allText.match(/(?:\.\s*){3}/g) || []).length;
    const rawScene = (allText.match(/[①-⑳]/g) || []).length;
    add("Safe cleanup normalization", rawEllipses || rawScene ? "fail" : "pass", rawEllipses || rawScene ? `${rawEllipses} unnormalized dot-ellipsis pattern${rawEllipses===1?"":"s"}; ${rawScene} raw circled scene marker${rawScene===1?"":"s"}.` : "No raw dot-ellipsis patterns or circled scene markers remain.");

    const sceneBreaks = pages.reduce((n,p) => n + exportParagraphs(p.text).filter(x => x.trim() === "* * *").length, 0);
    add("Scene breaks", sceneBreaks ? "pass" : "warn", sceneBreaks ? `${sceneBreaks} semantic scene break${sceneBreaks===1?"":"s"} found.` : "No semantic scene breaks found in this sample; that may be valid for the book.");

    const repair = globalThis.BookOcrEpubPolish?.repairSplitLigatures;
    let unresolvedLigatures = 0, ambiguousLigatures = 0;
    if (typeof repair === "function") {
      pages.forEach(page => {
        const r = repair(page.text || "");
        unresolvedLigatures += r.fixedCount || 0;
        ambiguousLigatures += r.ambiguousCount || 0;
      });
      add("Split ligatures", unresolvedLigatures ? "fail" : "pass", unresolvedLigatures ? `${unresolvedLigatures} high-confidence repair${unresolvedLigatures===1?"":"s"} still available; ${ambiguousLigatures} uncertain candidate${ambiguousLigatures===1?"":"s"}.` : `No high-confidence split-ligature repairs remain; ${ambiguousLigatures} uncertain candidate${ambiguousLigatures===1?"":"s"} left untouched.`);
    } else add("Split ligatures", "warn", "Ligature inspection helper is unavailable in this session.");

    const layoutPages = pages.filter(p => Array.isArray(p.layoutLines) && p.layoutLines.length);
    const profile = state.bookLayoutProfile || (layoutPages.length ? buildBookLayoutProfile(layoutPages) : null);
    if (profile) {
      const sane = Number.isFinite(profile.bodyLeft) && Number.isFinite(profile.indentLeft) && profile.indentLeft > profile.bodyLeft && (profile.indentLeft - profile.bodyLeft) >= Math.max(10, (profile.typicalH || 20) * 0.45);
      add("Layout profile", sane ? "pass" : "fail", `${layoutPages.length}/${pages.length} layout pages · body ${Math.round(profile.bodyLeft)} / indent ${Math.round(profile.indentLeft)}.`);
    } else add("Layout profile", "warn", "No saved OCR geometry is available for this project.");

    const openings = likelyOpeningParagraphs();
    const dropCandidates = openings.map((opening,index) => buildDropcapCandidate(opening,index+1)).filter(Boolean);
    const highDropcaps = dropCandidates.filter(c => c.confidence === "high").length;
    add("Dropcap Rescue", highDropcaps ? "fail" : (dropCandidates.length ? "warn" : "pass"), highDropcaps ? `${highDropcaps} high-confidence dropcap repair${highDropcaps===1?"":"s"} still pending.` : dropCandidates.length ? `${dropCandidates.length} uncertain opening candidate${dropCandidates.length===1?"":"s"} remains for review.` : "No likely missing dropcaps detected.");

    const italicRuns = [];
    let markedWords = 0, scoredWords = 0;
    pages.forEach(page => (page.layoutLines || []).forEach(line => {
      (line.italicWordMeta || []).forEach(w => { scoredWords++; if (w.italic) markedWords++; });
      (line.italicRunMeta || []).filter(r => r.accepted).forEach(r => italicRuns.push(r));
    }));
    if (scoredWords) {
      const badShortInline = italicRuns.filter(r => r.route === "inline" && (r.wordCount || 0) < 3).length;
      const ratio = markedWords / scoredWords;
      const status = badShortInline || ratio > 0.02 ? "fail" : "pass";
      add("Italic sanity", status, `${italicRuns.length} accepted run${italicRuns.length===1?"":"s"}, ${markedWords}/${scoredWords} scored words marked${badShortInline ? `; ${badShortInline} short inline run${badShortInline===1?"":"s"} violated the 3-word rule` : ""}.`);
    } else add("Italic sanity", "warn", "Auto Italic Scan has not been run for this project.");

    if (isReferenceTwentyPagePack() && profile) {
      const bodyOk = profile.bodyLeft >= 115 && profile.bodyLeft <= 135;
      const indentOk = profile.indentLeft >= 150 && profile.indentLeft <= 170;
      const sceneOk = sceneBreaks >= 1;
      add("20-page reference pack", bodyOk && indentOk && sceneOk ? "pass" : "fail", `IMG_2701–IMG_2720 recognized · expected body ≈125 / indent ≈161; got ${Math.round(profile.bodyLeft)} / ${Math.round(profile.indentLeft)}; scene breaks ${sceneBreaks}.`);
    }

    const report = { buildVersion: BUILD_VERSION, runAt: new Date().toISOString(), pageCount: pages.length, checks };
    renderRegressionReport(report);
    const failed = checks.filter(c => c.status === "fail").length;
    const warned = checks.filter(c => c.status === "warn").length;
    setStatus(failed ? `Regression check found ${failed} failure${failed===1?"":"s"} and ${warned} note${warned===1?"":"s"}. Nothing was changed.` : `Regression check PASS${warned ? ` with ${warned} note${warned===1?"":"s"}` : ""}. Nothing was changed.`);
    return report;
  }



  function pageBlocks(page) {
    return normalizedPageText(page?.text || "").split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  }

  function writePageBlocks(page, blocks) {
    page.text = blocks.filter(Boolean).join("\n\n");
    page.chapterCandidate = chapterHeuristic(page.text);
  }

  function isStructuralBlock(text) {
    const s = stripItalicMarkers(String(text || "")).trim();
    return !s || s === "* * *" ||
      /^(?:CHAPTER\b|PROLOGUE\b|EPILOGUE\b)/i.test(s) ||
      /^[A-Z][A-Z .'-]{2,}$/.test(s);
  }

  function autoMergeStrongContinuations() {
    let merged = 0;
    state.pages.forEach(page => {
      const blocks = pageBlocks(page);
      let changed = false;
      for (let i = 0; i < blocks.length - 1; ) {
        const a = stripItalicMarkers(blocks[i]).trim();
        const b = stripItalicMarkers(blocks[i + 1]).trim();
        const aEndsOpen = /[A-Za-z0-9,;:]$/.test(a) && !/[.!?…]["”'’)]?$/.test(a);
        const bContinues = /^[“"‘']?[a-z]/.test(b);
        if (!isStructuralBlock(a) && !isStructuralBlock(b) && aEndsOpen && bContinues) {
          blocks[i] = `${blocks[i].trim()} ${blocks[i + 1].trim()}`.replace(/\s+/g, " ");
          blocks.splice(i + 1, 1);
          merged++;
          changed = true;
          continue;
        }
        i++;
      }
      if (changed) writePageBlocks(page, blocks);
    });
    if (merged) {
      saveCheckpoint();
      renderReview();
    }
    return merged;
  }

  function finalIssueKey(issue) {
    const page = state.pages[issue?.pageIndex];
    const file = page?.file?.name || page?.fileName || issue?.fileName || "";
    const normalizedText = String(issue?.fullText || issue?.current || "")
      .replace(/\s+/g, " ").trim().toLowerCase().slice(0, 500);
    return [
      issue?.type || "issue", normalizedStem(file),
      Number.isFinite(Number(issue?.pageIndex)) ? Number(issue.pageIndex) : -1,
      Number.isFinite(Number(issue?.paraIndex)) ? Number(issue.paraIndex) : -1,
      normalizedText
    ].join("|");
  }

  function jumpToPage(pageIndex) {
    if (!Number.isInteger(pageIndex) || !state.pages[pageIndex]) return;
    state.reviewMode = "all";
    state.currentPageIndex = pageIndex;
    renderReview();
    els.reviewSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    setStatus(`Opened page ${pageIndex + 1} for manual review.`);
  }


  function guidedRepairChapters() {
    const starts = state.pages
      .map((page, pageIndex) => page.chapterStart ? pageIndex : -1)
      .filter(pageIndex => pageIndex >= 0);
    if (!starts.length && state.pages.length) starts.push(0);
    return starts.map((start, index) => ({
      start,
      end: index + 1 < starts.length ? starts[index + 1] : state.pages.length,
      number: index + 1
    }));
  }

  function currentGuidedRepairChapter() {
    const chapters = guidedRepairChapters();
    if (!chapters.length) return null;
    state.guidedRepairChapterIndex = clamp(state.guidedRepairChapterIndex || 0, 0, chapters.length - 1);
    return chapters[state.guidedRepairChapterIndex];
  }

  function guidedRepairPageIndexes() {
    if (state.guidedRepairMode !== "chapter") return state.pages.map((_, i) => i);
    const chapter = currentGuidedRepairChapter();
    if (!chapter) return [];
    return Array.from({ length: chapter.end - chapter.start }, (_, i) => chapter.start + i);
  }

  function updateGuidedRepairModeUi() {
    const chapterMode = state.guidedRepairMode === "chapter";
    els.repairModeWhole?.classList.toggle("active", !chapterMode);
    els.repairModeChapter?.classList.toggle("active", chapterMode);
    els.repairChapterNav?.classList.toggle("hidden", !chapterMode);

    const chapters = guidedRepairChapters();
    const chapter = currentGuidedRepairChapter();
    if (els.repairChapterStatus) {
      els.repairChapterStatus.textContent = chapter
        ? `Chapter ${chapter.number} of ${chapters.length}`
        : "No chapters";
    }
    if (els.repairChapterPrev) els.repairChapterPrev.disabled = !chapterMode || state.guidedRepairChapterIndex <= 0;
    if (els.repairChapterNext) els.repairChapterNext.disabled = !chapterMode || state.guidedRepairChapterIndex >= chapters.length - 1;
  }

  function setGuidedRepairMode(mode) {
    state.guidedRepairMode = mode === "chapter" ? "chapter" : "whole";
    updateGuidedRepairModeUi();
    renderRepairReview();
    saveCheckpoint();
  }

  function moveGuidedRepairChapter(delta) {
    const chapters = guidedRepairChapters();
    if (!chapters.length) return;
    state.guidedRepairChapterIndex = clamp((state.guidedRepairChapterIndex || 0) + delta, 0, chapters.length - 1);
    updateGuidedRepairModeUi();
    renderRepairReview();
    saveCheckpoint();
  }

  function renderRepairReview() {
    if (!els.repairReview || !els.repairReviewToggle || !els.repairReviewList) return;
    const repairState = getRepairReviewState();
    const { ligatures, dropcaps, total } = repairState;

    els.repairReview.classList.toggle("hidden", total === 0);
    els.repairReviewToggle.textContent = `Review repairs (${total})`;
    els.repairReviewList.innerHTML = "";

    dropcaps.forEach(candidate => {
      const item = document.createElement("div");
      item.className = "ligature-review-item";
      item.innerHTML = `<strong>Dropcap · Page ${candidate.pageIndex + 1}</strong>
        <p class="hint">${escapeHtml(candidate.reason || "Uncertain chapter-opening repair.")}</p>
        <p class="ligature-context"><b>Current:</b> ${escapeHtml(excerpt(candidate.before || candidate.text || ""))}</p>
        ${candidate.rawDiagnostic ? `<details class="dropcap-raw-diagnostic">
          <summary>Raw Paddle diagnostic</summary>
          <p class="hint">${escapeHtml(candidate.rawDiagnostic.summary || "")}</p>
          ${candidate.rawDiagnostic.target ? `<p class="hint"><b>Opening token:</b> ${escapeHtml(candidate.rawDiagnostic.target.text)} · box x${Math.round(candidate.rawDiagnostic.target.box.x)} y${Math.round(candidate.rawDiagnostic.target.box.y)} w${Math.round(candidate.rawDiagnostic.target.box.w)} h${Math.round(candidate.rawDiagnostic.target.box.h)}</p>` : ""}
          ${(candidate.rawDiagnostic.tokens || []).length ? `<div class="dropcap-token-table">${candidate.rawDiagnostic.tokens.map(token =>
            `<div class="dropcap-token-row${token.isSingleCapital ? " capital" : ""}">
              <code>${escapeHtml(token.text)}</code>
              <span>#${token.index}</span>
              <span>x${Math.round(token.box.x)} y${Math.round(token.box.y)}</span>
              <span>${token.isSingleCapital ? "CAP" : ""}${token.isLeft ? " · left" : ""}${token.tall ? " · tall" : ""}</span>
            </div>`).join("")}</div>` : ""}
        </details>` : ""}
        <label class="inline-review-editor">
          <span>Correction</span>
          <textarea class="dropcap-inline-edit" rows="4" aria-label="Edit this dropcap correction">${escapeHtml(candidate.proposed || candidate.before || "")}</textarea>
        </label>
        <div class="actions">
          <button class="button secondary apply" type="button">Apply correction</button>
          <button class="button ghost discard" type="button">Keep as-is</button>
          <button class="button ghost page" type="button">Open page (optional)</button>
        </div>`;
      item.querySelector(".apply").addEventListener("click", () => {
        const edited = item.querySelector(".dropcap-inline-edit")?.value || "";
        const applied = applyDropcap(candidate, edited);
        if (!applied) {
          setStatus(`Correction could not be applied and durably saved on page ${candidate.pageIndex + 1}. The review item was kept open.`);
          return;
        }
        const reviewedPage = state.pages[candidate.pageIndex];
        if (reviewedPage) reviewedPage.manualEdited = true;
        saveRepairOverlayPage(candidate.pageIndex, { manualEdited: true });
        saveCheckpoint();
        refreshDownstreamRepairState();
        setStatus(`Applied and durably saved the reviewed dropcap correction on page ${candidate.pageIndex + 1}.`);
      });
      item.querySelector(".discard").addEventListener("click", () => {
        rejectDropcap(candidate);
        saveCheckpoint();
        refreshDownstreamRepairState();
        setStatus(`Kept the current text for the dropcap candidate on page ${candidate.pageIndex + 1}.`);
      });
      item.querySelector(".page").addEventListener("click", () => jumpToPage(candidate.pageIndex));
      els.repairReviewList.appendChild(item);
    });

    ligatures.forEach(c => {
      const item = document.createElement("div");
      item.className = "ligature-review-item";
      item.innerHTML = `<strong>Split ligature · ${escapeHtml(c.fileName)}</strong>
        <p class="ligature-context">${escapeHtml(c.context)}</p>
        <p class="hint">Candidate: <b>${escapeHtml(c.original)}</b> → <b>${escapeHtml(c.joined)}</b></p>
        <div class="actions">
          <button class="button secondary fix" type="button">Fix</button>
          <button class="button ghost keep" type="button">Keep as-is</button>
          <button class="button ghost page" type="button">Open page (optional)</button>
        </div>`;
      item.querySelector(".fix").addEventListener("click", () => {
        const page = state.pages[c.pageIndex];
        const text = page?.text || "";
        const exactAtIndex = text.slice(c.index, c.index + c.original.length) === c.original;
        const pos = exactAtIndex ? c.index : text.indexOf(c.original);
        if (pos >= 0) {
          const nextText = text.slice(0, pos) + c.joined + text.slice(pos + c.original.length);
          commitPageText(c.pageIndex, nextText);
          const reviewedPage = state.pages[c.pageIndex];
          if (reviewedPage) reviewedPage.manualEdited = true;
          saveRepairOverlayPage(c.pageIndex, { manualEdited: true });
          saveCheckpoint();
          refreshDownstreamRepairState();
          setStatus(`Repaired “${c.original}” → “${c.joined}”. Kindle Ready will use the repaired text on its next check.`);
        }
      });
      item.querySelector(".keep").addEventListener("click", () => {
        state.ignoredLigatureCandidates.add(c.key);
        saveCheckpoint();
        refreshDownstreamRepairState();
        setStatus(`Kept “${c.original}” as-is.`);
      });
      item.querySelector(".page").addEventListener("click", () => jumpToPage(c.pageIndex));
      els.repairReviewList.appendChild(item);
    });
  }

  function finalPolishAudit() {
    const issues = [];
    const checks = [];
    const addCheck = (name, status, detail) => checks.push({ name, status, detail });
    const addIssue = (issue) => {
      issue.key = finalIssueKey(issue);
      if (!state.ignoredFinalPolishIssues.has(issue.key)) issues.push(issue);
    };

    let wrapHyphens = 0;
    let alreadyResolvedWrapHyphens = 0;
    state.pages.forEach((page, pageIndex) => {
      // Final Polish operates on repaired/reconstructed page text. Saved line
      // geometry is supporting evidence only and must never resurrect a split
      // that Repair Book has already healed.
      const currentText = String(page.text || "");
      const lines = Array.isArray(page.layoutLines) ? page.layoutLines : [];

      for (let i = 0; i < lines.length - 1; i++) {
        const a = String(lines[i]?.text || "").trim();
        const b = String(lines[i+1]?.text || "").trim();
        const m = a.match(/([A-Za-z]{2,})-$/);
        const n = b.match(/^([a-z][A-Za-z'-]*)/);
        if (!m || !n) continue;

        const left = m[1];
        const right = n[1];
        const suggestion = `${left}${right}`;
        const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        // If Repair Book/reconstruction already produced the joined word in
        // current text, this geometry artifact is resolved and is not review.
        const joinedPattern = new RegExp(`\\b${escapeRe(suggestion)}\\b`, "u");
        if (joinedPattern.test(currentText)) {
          alreadyResolvedWrapHyphens++;
          continue;
        }

        // Only surface a polish item when the repaired text itself still
        // contains a recognizable unresolved form.
        const unresolvedPatterns = [
          new RegExp(`\\b${escapeRe(left)}-\\s*${escapeRe(right)}\\b`, "u"),
          new RegExp(`\\b${escapeRe(left)}\\s*-\\s*${escapeRe(right)}\\b`, "u"),
          new RegExp(`\\b${escapeRe(left)}\\s+${escapeRe(right)}\\b`, "u")
        ];
        let sourceMatch = null;
        for (const pattern of unresolvedPatterns) {
          const found = pattern.exec(currentText);
          if (found) {
            sourceMatch = found;
            break;
          }
        }

        // Geometry alone is not enough to create a Final Polish warning.
        if (!sourceMatch) continue;

        const current = sourceMatch[0];
        const issue = {
          type: "Wrap hyphen",
          pageIndex,
          fileName: page.fileName || page.file?.name || `Page ${pageIndex + 1}`,
          current,
          suggestion,
          left,
          right,
          sourceText: sourceMatch[0],
          sourceStart: sourceMatch.index,
          sourceEnd: sourceMatch.index + sourceMatch[0].length,
          detail: "The repaired book text still contains this geometry-supported line-wrap candidate. Join word changes only this occurrence."
        };
        issue.key = finalIssueKey(issue);
        if (!state.ignoredFinalPolishIssues.has(issue.key)) {
          wrapHyphens++;
          issues.push(issue);
        }
      }
    });
    addCheck("Wrap-hyphen audit", wrapHyphens ? "warn" : "pass",
      wrapHyphens
        ? `${wrapHyphens} unresolved candidate${wrapHyphens===1?"":"s"} remain in repaired text; ${alreadyResolvedWrapHyphens} source wrap${alreadyResolvedWrapHyphens===1?" was":"s were"} already healed upstream.`
        : `No unresolved wrap-hyphens remain in repaired text${alreadyResolvedWrapHyphens ? `; ${alreadyResolvedWrapHyphens} source wrap${alreadyResolvedWrapHyphens===1?" was":"s were"} already healed upstream` : ""}.`);

    // Quote review is intentionally evidence-first. v2.7.52/.53 tried to
    // normalize one left-shift pattern automatically; that could hide a real
    // review item and overfit one book. v2.7.54 surfaces both quote-balance and
    // quote-boundary problems without silently moving quotation marks.
    const normalizeQuoteEvidence = (value) => stripItalicMarkers(String(value || ""))
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    // Detect: narrative/action sentence." Dialogue...
    // If the quote appears while the prefix has balanced double quotes, it is
    // acting like a new opening quote but is attached to the preceding sentence.
    // This is review-only. The suggested edit moves only that quote across the
    // whitespace boundary and preserves every other character/marker.
    const findOpeningQuoteLeftShift = (value) => {
      const raw = String(value || "");
      const re = /([.!?…])(["“”])([ \t]+)(?=[A-Z])/g;
      let match;
      while ((match = re.exec(raw))) {
        const prefix = stripItalicMarkers(raw.slice(0, match.index + 1));
        const priorQuotes = (prefix.match(/["“”]/g) || []).length;
        if (priorQuotes % 2 !== 0) continue; // already inside quoted dialogue
        const openingQuote = match[2] === '"' ? '"' : '“';
        const suggestion = raw.slice(0, match.index) + match[1] + match[3] + openingQuote + raw.slice(match.index + match[0].length);
        return {
          index: match.index,
          original: match[0],
          suggestion,
          current: normalizeQuoteEvidence(raw).slice(Math.max(0, match.index - 100), match.index + 180)
        };
      }
      return null;
    };

    let quoteFlags = 0;
    const oddQuotes = [];
    state.pages.forEach((page, pageIndex) => {
      const paras = exportParagraphs(page.text || "");
      paras.forEach((para, paraIndex) => {
        const plain = stripItalicMarkers(para);
        const dialogueQuotes = (plain.match(/["“”]/g) || []).length;
        if (dialogueQuotes % 2 === 1) {
          oddQuotes.push({
            pageIndex,
            paraIndex,
            paraCount: paras.length,
            text: para,
            plain,
            fileName: page.fileName || page.file?.name || `Page ${pageIndex + 1}`
          });
        }
      });
    });

    const crossPageResolved = new Set();
    for (let i = 0; i < oddQuotes.length - 1; i++) {
      const a = oddQuotes[i];
      const b = oddQuotes[i + 1];
      const sameChapter = !state.pages[b.pageIndex]?.chapterStart;
      const touchesBoundary = a.paraIndex === a.paraCount - 1 && b.paraIndex === 0 && b.pageIndex === a.pageIndex + 1;
      const combinedQuotes = ((a.plain + " " + b.plain).match(/["“”]/g) || []).length;

      if (sameChapter && touchesBoundary && combinedQuotes % 2 === 0) {
        crossPageResolved.add(`${a.pageIndex}|${a.paraIndex}`);
        crossPageResolved.add(`${b.pageIndex}|${b.paraIndex}`);
        i++;
      }
    }

    oddQuotes.forEach(entry => {
      if (crossPageResolved.has(`${entry.pageIndex}|${entry.paraIndex}`)) return;
      // A left-shifted opening quote frequently creates an odd quote count too.
      // Show one boundary card, not two competing warnings for the same cause.
      if (findOpeningQuoteLeftShift(entry.text)) return;
      const issue = {
        type: "Quote balance",
        pageIndex: entry.pageIndex,
        paraIndex: entry.paraIndex,
        fileName: entry.fileName,
        current: entry.plain.slice(0, 260),
        fullText: entry.text,
        detail: `This paragraph has an unmatched dialogue quotation mark after normalizing straight and curly double quotes and checking adjacent page boundaries. Edit only this paragraph or mark it correct.`
      };
      issue.key = finalIssueKey(issue);
      if (!state.ignoredFinalPolishIssues.has(issue.key)) {
        quoteFlags++;
        issues.push(issue);
      }
    });

    addCheck("Quote audit", quoteFlags ? "warn" : "pass",
      quoteFlags
        ? `${quoteFlags} paragraph${quoteFlags===1?"":"s"} still need quote review after cross-page continuations were reconciled.`
        : "No unresolved quote-balance issues remain after cross-page continuation checks.");

    // Quote-boundary drift has two observed forms:
    //   1) "I toss my head... Once I came...   (quote drifted to paragraph start)
    //   2) Isaiah laughs." Range of motion...   (opening quote shifted left)
    // Both stay review-only. Source geometry is supporting evidence when present.
    let quoteBoundaryDrift = 0;
    const narrativeActionLead = /^(?:I|He|She|We|They|My|His|Her|Their)\s+(?:toss|tosses|shake|shakes|shrug|shrugs|nod|nods|laugh|laughs|smile|smiles|sigh|sighs|cross|crosses|turn|turns|look|looks|glance|glances|watch|watches|lean|leans|sit|sits|stand|stands|walk|walks|step|steps|move|moves|pull|pulls|push|pushes|raise|raises|lower|lowers|exhale|exhales|inhale|inhales|huff|huffs|pause|pauses|swallow|swallows|blink|blinks|grab|grabs|take|takes|set|sets|drop|drops|lift|lifts|bring|brings|run|runs|hold|holds|keep|keeps|feel|feels|hear|hears|see|sees|close|closes|open|opens|rest|rests|gesture|gestures|stare|stares|breathe|breathes|clear|clears)\b/i;

    state.pages.forEach((page, pageIndex) => {
      const paras = pageBlocks(page);
      const evidenceLines = (Array.isArray(page.layoutLines) ? page.layoutLines : [])
        .map(line => normalizeQuoteEvidence(line?.text || ""))
        .filter(Boolean);

      paras.forEach((para, paraIndex) => {
        const raw = String(para || "");
        const plain = normalizeQuoteEvidence(raw);

        const leftShift = findOpeningQuoteLeftShift(raw);
        if (leftShift) {
          const issue = {
            type: "Quote boundary drift",
            pageIndex,
            paraIndex,
            fileName: page.fileName || page.file?.name || `Page ${pageIndex + 1}`,
            current: plain.slice(0, 260),
            fullText: para,
            suggestion: leftShift.suggestion,
            evidence: "balanced-prefix boundary",
            detail: `An opening dialogue quote appears attached to the end of the preceding sentence (for example: action sentence.\" Dialogue). Studio has not changed it automatically. Confirm against the screenshot, then move the opening quote if needed.`
          };
          issue.key = finalIssueKey(issue);
          if (!state.ignoredFinalPolishIssues.has(issue.key)) {
            quoteBoundaryDrift++;
            issues.push(issue);
          }
          return;
        }

        // Existing leading-quote drift audit.
        if (!/^["“]/.test(stripItalicMarkers(raw).trim())) return;
        const quoteCount = (plain.match(/"/g) || []).length;
        if (quoteCount < 2 || quoteCount % 2 !== 0) return;

        const m = plain.match(/^"([^.!?]{3,180}[.!?])\s+(.+)$/);
        if (!m) return;
        const firstSentence = m[1].trim();
        const remainder = m[2].trim();
        if (!firstSentence || !remainder || !/[A-Z"“]/.test(remainder[0] || "")) return;

        const probe = firstSentence.slice(0, Math.min(42, firstSentence.length)).toLowerCase();
        let geometryEvidence = false;
        for (let i = 0; i < evidenceLines.length; i++) {
          const line = evidenceLines[i];
          const withoutLeadingQuote = line.replace(/^"\s*/, "");
          if (!withoutLeadingQuote.toLowerCase().startsWith(probe)) continue;
          const sourceStartsQuoted = /^"/.test(line);
          const quoteLater = line.indexOf('"') > 0;
          const nextStartsQuoted = /^"/.test(evidenceLines[i + 1] || "");
          if (!sourceStartsQuoted && (quoteLater || nextStartsQuoted)) {
            geometryEvidence = true;
            break;
          }
        }

        const actionEvidence = narrativeActionLead.test(firstSentence);
        if (!geometryEvidence && !actionEvidence) return;

        const relocated = raw.replace(/^(\s*)["“]([^.!?]{3,180}[.!?])(\s+)(?=\S)/, (all, lead, sentence, gap) => {
          const quote = /“/.test(all[lead.length] || "") ? "“" : '"';
          return `${lead}${sentence}${gap}${quote}`;
        });
        if (relocated === raw) return;

        const issue = {
          type: "Quote boundary drift",
          pageIndex,
          paraIndex,
          fileName: page.fileName || page.file?.name || `Page ${pageIndex + 1}`,
          current: plain.slice(0, 260),
          fullText: para,
          suggestion: relocated,
          evidence: geometryEvidence ? "source geometry" : "narrative-action heuristic",
          detail: `The paragraph has balanced quotes, but its opening quote may have drifted ahead of an action sentence. Evidence: ${geometryEvidence ? "saved OCR line geometry places the quote later" : "the first sentence matches a conservative narrative-action pattern"}. Confirm against the screenshot before moving it.`
        };
        issue.key = finalIssueKey(issue);
        if (!state.ignoredFinalPolishIssues.has(issue.key)) {
          quoteBoundaryDrift++;
          issues.push(issue);
        }
      });
    });

    addCheck("Quote-boundary audit", quoteBoundaryDrift ? "warn" : "pass",
      quoteBoundaryDrift
        ? `${quoteBoundaryDrift} paragraph${quoteBoundaryDrift===1?"":"s"} may have a misplaced opening dialogue quote and need screenshot confirmation.`
        : "No likely quote-boundary drift detected.");

    let terminalPunctuation = 0;
    state.pages.forEach((page, pageIndex) => {
      const paras = pageBlocks(page);
      paras.forEach((para, paraIndex) => {
        const plain = stripItalicMarkers(para).trim();
        if (!plain || isStructuralBlock(plain)) return;
        // Full-book source QA exposed systematic loss of paragraph-ending
        // periods. Do not invent punctuation automatically. Surface prose that
        // ends in a letter/number so the screenshot can confirm the mark.
        if (/[A-Za-z0-9)]$/.test(plain)) {
          addIssue({
            type: "Terminal punctuation",
            pageIndex,
            paraIndex,
            fileName: page.fileName || page.file?.name || `Page ${pageIndex + 1}`,
            current: plain.slice(-260),
            fullText: para,
            suggestion: `${para}.`,
            detail: "This prose paragraph ends without terminal punctuation. Full-book QA found Paddle systematically dropping final periods. Confirm against the screenshot, then add the period or keep as-is."
          });
          terminalPunctuation++;
        }
      });
    });
    addCheck("Terminal-punctuation audit", terminalPunctuation ? "warn" : "pass",
      terminalPunctuation
        ? `${terminalPunctuation} prose paragraph${terminalPunctuation===1?"":"s"} end without terminal punctuation and need source-image confirmation.`
        : "No prose paragraphs end with a bare letter/number.");

    let falseWordBoundaries = 0;
    state.pages.forEach((page, pageIndex) => {
      const paras = pageBlocks(page);
      paras.forEach((para, paraIndex) => {
        const plain = stripItalicMarkers(para);
        // Regression cases: resent. ment / expres. sion / assist. ant.
        // Review only: lowercase after a period can occasionally be legitimate.
        const match = /\b([A-Za-z]{2,})\.\s+([a-z]{2,})\b/.exec(plain);
        if (!match) return;
        const joined = `${match[1]}${match[2]}`;
        addIssue({
          type: "False word boundary",
          pageIndex,
          paraIndex,
          fileName: page.fileName || page.file?.name || `Page ${pageIndex + 1}`,
          current: match[0],
          fullText: para,
          left: match[1],
          right: match[2],
          suggestion: joined,
          detail: "Possible OCR-created sentence boundary inside one word. Regression QA found examples such as resent. ment, expres. sion, and assist. ant. Confirm against the screenshot before joining."
        });
        falseWordBoundaries++;
      });
    });
    addCheck("False-word-boundary audit", falseWordBoundaries ? "warn" : "pass",
      falseWordBoundaries
        ? `${falseWordBoundaries} possible split-word sentence boundar${falseWordBoundaries===1?"y":"ies"} need source confirmation.`
        : "No likely period-inside-word splits found.");

    let possibleSceneBreaks = 0;
    state.pages.forEach((page, pageIndex) => {
      const lines = Array.isArray(page.layoutLines) ? page.layoutLines : [];
      if (lines.length < 3 || String(page.text || "").includes("* * *")) return;
      const hs = lines.map(l => Number(l?.box?.h)).filter(h => Number.isFinite(h) && h > 2);
      const typical = median(hs) || 0;
      if (!typical) return;
      let best = null;
      for (let i = 1; i < lines.length; i++) {
        const a = lines[i-1], b = lines[i];
        if (!a?.box || !b?.box) continue;
        const gap = Number(b.box.y) - (Number(a.box.y) + Number(a.box.h));
        if (gap < typical * 1.75) continue;
        const aText = String(a.text || "").trim();
        const bText = String(b.text || "").trim();
        if (aText.length < 8 || bText.length < 8) continue;
        if (/^(?:chapter\b|prologue\b|epilogue\b)/i.test(aText + " " + bText)) continue;
        if (!best || gap > best.gap) best = { gap, aText, bText };
      }
      if (!best) return;
      addIssue({
        type: "Possible scene break",
        pageIndex,
        paraIndex: -1,
        fileName: page.fileName || page.file?.name || `Page ${pageIndex + 1}`,
        current: `${best.aText.slice(-90)}  ⟂  ${best.bText.slice(0,90)}`,
        beforeText: best.aText,
        afterText: best.bText,
        detail: `A ${Math.round(best.gap / typical * 10) / 10}× line-height vertical gap appears between prose lines, but no semantic scene break is stored. Baseball/ornament scene dividers were lost on multiple IHOL pages. Confirm visually.`
      });
      possibleSceneBreaks++;
    });
    addCheck("Scene-break geometry audit", possibleSceneBreaks ? "warn" : "pass",
      possibleSceneBreaks
        ? `${possibleSceneBreaks} page${possibleSceneBreaks===1?"":"s"} have unusually large internal gaps without a semantic scene break.`
        : "No suspicious large internal gaps without scene markers found.");

    let fragments = 0;
    state.pages.forEach((page, pageIndex) => {
      const paras = pageBlocks(page);
      paras.forEach((para, paraIndex) => {
        const plain = stripItalicMarkers(para).trim();
        const messageSpeakerLabel = /^(?:ME|YOU|SABRINA|TUCKER)$/i.test(plain);
        if (plain && plain !== "* * *" && plain.length <= 24 &&
            !messageSpeakerLabel &&
            !/^(?:CHAPTER\b|PROLOGUE\b|EPILOGUE\b)/i.test(plain) &&
            !/^[A-Z][A-Z .'-]{2,}$/.test(plain) &&
            !/[.!?…"”']$/.test(plain)) {
          const issue = {
            type: "Short paragraph",
            pageIndex,
            paraIndex,
            fileName: page.fileName || page.file?.name || `Page ${pageIndex + 1}`,
            current: plain,
            detail: `Paragraph ${paraIndex + 1} is only ${plain.length} characters and has no terminal punctuation.`
          };
          issue.key = finalIssueKey(issue);
          if (!state.ignoredFinalPolishIssues.has(issue.key)) {
            fragments++;
            issues.push(issue);
          }
        }
      });
    });
    addCheck("Paragraph-fragment audit", fragments ? "warn" : "pass",
      fragments ? `${fragments} short fragment${fragments===1?"":"s"} left for review.` : "No unresolved suspicious tiny paragraph fragments found.");

    const chapters = state.pages.filter(p => p.chapterStart).length;
    addCheck("Chapter structure", chapters ? "pass" : "warn",
      chapters ? `${chapters} chapter start${chapters===1?"":"s"} marked for EPUB navigation.` : "No chapter starts are marked.");

    return { issues, checks };
  }

  function renderFinalPolishReport(report) {
    if (!els.finalPolishResults) return;
    els.finalPolishResults.innerHTML = "";
    report.checks.forEach(check => {
      const row = document.createElement("div");
      row.className = `regression-row final-polish-row ${check.status}`;
      row.innerHTML = `<strong>${escapeHtml(check.name)}</strong><span>${escapeHtml(check.detail)}</span>`;
      els.finalPolishResults.appendChild(row);
    });
    els.finalPolishResults.classList.remove("hidden");

    if (!els.finalPolishReview || !els.finalPolishReviewList || !els.finalPolishReviewToggle) return;
    els.finalPolishReviewList.innerHTML = "";

    report.issues.forEach(issue => {
      const item = document.createElement("div");
      item.className = "ligature-review-item";
      item.innerHTML = `<strong>${escapeHtml(issue.type)} · ${escapeHtml(issue.fileName)}</strong>
        ${issue.current ? `<p class="ligature-context">${escapeHtml(issue.current)}</p>` : ""}
        ${issue.suggestion ? `<p class="hint">Suggested: <b>${escapeHtml(issue.suggestion)}</b></p>` : ""}
        <p class="hint">${escapeHtml(issue.detail)}</p>
        <div class="actions issue-actions"></div>`;

      const actions = item.querySelector(".issue-actions");
      const button = (label, cls, fn) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `button ${cls}`;
        b.textContent = label;
        b.addEventListener("click", fn);
        actions.appendChild(b);
      };

      if (issue.type === "Wrap hyphen") {
        button("Join word", "secondary", () => {
          const page = state.pages[issue.pageIndex];
          if (!page) return;

          const before = String(page.text || "");
          const left = String(issue.left || "");
          const right = String(issue.right || "");
          const suggestion = String(issue.suggestion || `${left}${right}`);

          const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const patterns = [
            new RegExp(`${escapeRe(left)}-\\s*${escapeRe(right)}`, "u"),
            new RegExp(`${escapeRe(left)}\\s*-\\s*${escapeRe(right)}`, "u"),
            new RegExp(`${escapeRe(left)}\\s+${escapeRe(right)}`, "u")
          ];

          let match = null;
          for (const pattern of patterns) {
            const found = pattern.exec(before);
            if (found) {
              match = found;
              break;
            }
          }

          if (!match) {
            const card = actions.closest(".ligature-review-item");
            let note = card?.querySelector(".join-inline-status");
            if (!note && card) {
              note = document.createElement("p");
              note.className = "hint join-inline-status";
              card.appendChild(note);
            }
            if (note) {
              note.textContent = `Couldn’t locate “${issue.current}” in the current text. Nothing changed.`;
            }
            setStatus(`Couldn’t locate “${issue.current}” in the current text. Nothing changed.`);
            return;
          }

          const start = match.index;
          const end = start + match[0].length;
          const nextText = before.slice(0, start) + suggestion + before.slice(end);
          commitPageText(issue.pageIndex, nextText);
          const reviewedPage = state.pages[issue.pageIndex];
          if (reviewedPage) reviewedPage.manualEdited = true;
          saveRepairOverlayPage(issue.pageIndex, { manualEdited: true });

          const joinedText = match[0];
          setStatus(`Joined “${joinedText}” → “${suggestion}”.`);

          state.ignoredFinalPolishIssues.add(issue.key);
          saveCheckpoint();
          const report = runFinalPolish();
          if (report && els.finalPolishReview) {
            els.finalPolishReview.open = true;
          }
        });
        button("Keep hyphen", "ghost", () => {
          state.ignoredFinalPolishIssues.add(issue.key);
          saveCheckpoint();
          runFinalPolish();
          setStatus(`Kept “${issue.current}” unchanged.`);
        });
        button("Open page (optional)", "ghost", () => jumpToPage(issue.pageIndex));
      } else if (issue.type === "Quote balance" || issue.type === "Quote boundary drift") {
        const quotePage = state.pages[issue.pageIndex];
        const quoteBlocks = pageBlocks(quotePage);
        const previousParagraph = issue.paraIndex > 0 ? quoteBlocks[issue.paraIndex - 1] : "";
        const nextParagraph = issue.paraIndex < quoteBlocks.length - 1 ? quoteBlocks[issue.paraIndex + 1] : "";
        const context = document.createElement("div");
        context.className = "quote-review-context";
        const contextPart = (label, text, flagged = false) => {
          const part = document.createElement("div");
          part.className = `quote-context-part${flagged ? " flagged" : ""}`;
          const heading = document.createElement("div");
          heading.className = "quote-context-label";
          heading.textContent = label;
          const body = document.createElement("div");
          body.className = "quote-context-text";
          body.textContent = text || "(none)";
          part.append(heading, body);
          return part;
        };
        context.append(
          contextPart("Previous paragraph", previousParagraph),
          contextPart("Flagged paragraph", issue.fullText || issue.current || "", true),
          contextPart("Next paragraph", nextParagraph)
        );
        actions.before(context);

        const editor = document.createElement("label");
        editor.className = "inline-review-editor";
        editor.innerHTML = `<span>Edit this paragraph</span>
          <textarea class="quote-inline-edit" rows="4" aria-label="Edit this quote paragraph">${escapeHtml(issue.fullText || issue.current || "")}</textarea>`;
        actions.before(editor);

        if (issue.type === "Quote boundary drift" && issue.suggestion) {
          button("Move opening quote", "secondary", () => {
            const page = state.pages[issue.pageIndex];
            const blocks = pageBlocks(page);
            if (!page || !blocks[issue.paraIndex]) return;
            blocks[issue.paraIndex] = issue.suggestion;
            writePageBlocks(page, blocks);
            saveRepairOverlayPage(issue.pageIndex, { manualEdited: true });
            saveCheckpoint();
            renderReview();
            const report = runFinalPolish();
            if (report && els.finalPolishReview) els.finalPolishReview.open = true;
            setStatus("Moved the opening quote after the action sentence and saved the paragraph.");
          });
        }

        button("Apply paragraph edit", "secondary", () => {
          const page = state.pages[issue.pageIndex];
          const blocks = pageBlocks(page);
          const edited = editor.querySelector(".quote-inline-edit")?.value || "";
          if (!page || !blocks[issue.paraIndex] || !edited.trim()) return;
          blocks[issue.paraIndex] = edited.trim();
          writePageBlocks(page, blocks);
          page.manualEdited = true;
          saveRepairOverlayPage(issue.pageIndex, { manualEdited: true });
          saveCheckpoint();
          renderReview();
          const report = runFinalPolish();
          if (report && els.finalPolishReview) els.finalPolishReview.open = true;
          setStatus("Applied the quote correction and saved it.");
        });
        button("Looks correct", "ghost", () => {
          state.ignoredFinalPolishIssues.add(issue.key);
          saveCheckpoint();
          const report = runFinalPolish();
          if (report && els.finalPolishReview) els.finalPolishReview.open = true;
          setStatus("Quote warning saved as correct.");
        });
        button("Open page (optional)", "ghost", () => jumpToPage(issue.pageIndex));
      } else if (issue.type === "False word boundary") {
        button("Join fragments", "secondary", () => {
          const page = state.pages[issue.pageIndex];
          const blocks = pageBlocks(page);
          if (!page || !blocks[issue.paraIndex]) return;
          const pattern = new RegExp(`\\b${String(issue.left).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\s+${String(issue.right).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
          blocks[issue.paraIndex] = blocks[issue.paraIndex].replace(pattern, issue.suggestion);
          commitPageText(issue.pageIndex, blocks.filter(Boolean).join("\n\n"));
          const reviewedPage = state.pages[issue.pageIndex];
          if (reviewedPage) reviewedPage.manualEdited = true;
          saveRepairOverlayPage(issue.pageIndex, { manualEdited: true });
          state.ignoredFinalPolishIssues.add(issue.key);
          saveCheckpoint();
          const report = runFinalPolish();
          if (report && els.finalPolishReview) els.finalPolishReview.open = true;
          setStatus(`Joined “${issue.current}” → “${issue.suggestion}”.`);
        });
        button("Looks correct", "ghost", () => {
          state.ignoredFinalPolishIssues.add(issue.key);
          saveCheckpoint();
          const report = runFinalPolish();
          if (report && els.finalPolishReview) els.finalPolishReview.open = true;
          setStatus("Saved this possible split as correct.");
        });
        button("Open page (optional)", "ghost", () => jumpToPage(issue.pageIndex));
      } else if (issue.type === "Possible scene break") {
        button("Insert scene break", "secondary", () => {
          const page = state.pages[issue.pageIndex];
          const blocks = pageBlocks(page);
          if (!page || blocks.length < 2) return;
          const norm = (v) => stripItalicMarkers(String(v || "")).replace(/\s+/g, " ").trim();
          const before = norm(issue.beforeText);
          const after = norm(issue.afterText);
          const beforeTail = before.slice(-Math.min(44, before.length));
          const afterHead = after.slice(0, Math.min(44, after.length));
          let insertAt = -1;
          for (let i = 0; i < blocks.length - 1; i++) {
            const a = norm(blocks[i]);
            const b = norm(blocks[i + 1]);
            if (a.includes(beforeTail) && b.includes(afterHead)) { insertAt = i + 1; break; }
          }
          if (insertAt < 0) {
            setStatus("Couldn’t safely locate the two paragraphs around this possible scene break. Open the page and add it manually.");
            jumpToPage(issue.pageIndex);
            return;
          }
          blocks.splice(insertAt, 0, "* * *");
          commitPageText(issue.pageIndex, blocks.filter(Boolean).join("\n\n"));
          const reviewedPage = state.pages[issue.pageIndex];
          if (reviewedPage) reviewedPage.manualEdited = true;
          saveRepairOverlayPage(issue.pageIndex, { manualEdited: true });
          state.ignoredFinalPolishIssues.add(issue.key);
          saveCheckpoint();
          const report = runFinalPolish();
          if (report && els.finalPolishReview) els.finalPolishReview.open = true;
          setStatus("Inserted a semantic scene break between the source-confirmed paragraphs.");
        });
        button("Looks correct", "ghost", () => {
          state.ignoredFinalPolishIssues.add(issue.key);
          saveCheckpoint();
          const report = runFinalPolish();
          if (report && els.finalPolishReview) els.finalPolishReview.open = true;
          setStatus("Saved this large gap as not a scene break.");
        });
        button("Open page", "secondary", () => jumpToPage(issue.pageIndex));
      } else if (issue.type === "Terminal punctuation") {
        button("Add period", "secondary", () => {
          const page = state.pages[issue.pageIndex];
          const blocks = pageBlocks(page);
          if (!page || !blocks[issue.paraIndex]) return;
          const current = blocks[issue.paraIndex].trim();
          if (/[.!?…]["”'’)]?$/.test(stripItalicMarkers(current))) return;
          blocks[issue.paraIndex] = `${current}.`;
          commitPageText(issue.pageIndex, blocks.filter(Boolean).join("\n\n"));
          const reviewedPage = state.pages[issue.pageIndex];
          if (reviewedPage) reviewedPage.manualEdited = true;
          saveRepairOverlayPage(issue.pageIndex, { manualEdited: true });
          state.ignoredFinalPolishIssues.add(issue.key);
          saveCheckpoint();
          const report = runFinalPolish();
          if (report && els.finalPolishReview) els.finalPolishReview.open = true;
          setStatus("Added the source-confirmed paragraph-ending period and saved it.");
        });
        button("Looks correct", "ghost", () => {
          state.ignoredFinalPolishIssues.add(issue.key);
          saveCheckpoint();
          const report = runFinalPolish();
          if (report && els.finalPolishReview) els.finalPolishReview.open = true;
          setStatus("Saved this paragraph ending as correct.");
        });
        button("Open page (optional)", "ghost", () => jumpToPage(issue.pageIndex));
      } else if (issue.type === "Short paragraph") {
        button("Merge previous", "secondary", () => {
          const page = state.pages[issue.pageIndex];
          const blocks = pageBlocks(page);
          const i = issue.paraIndex;
          if (page && i > 0 && blocks[i]) {
            blocks[i - 1] = `${blocks[i - 1]} ${blocks[i]}`.replace(/\s+/g, " ");
            blocks.splice(i, 1);
            writePageBlocks(page, blocks);
            page.manualEdited = true;
            saveRepairOverlayPage(issue.pageIndex, { manualEdited: true });
            saveCheckpoint();
            renderReview();
            runFinalPolish();
          }
        });
        button("Merge next", "secondary", () => {
          const page = state.pages[issue.pageIndex];
          const blocks = pageBlocks(page);
          const i = issue.paraIndex;
          if (page && i >= 0 && i < blocks.length - 1) {
            blocks[i] = `${blocks[i]} ${blocks[i + 1]}`.replace(/\s+/g, " ");
            blocks.splice(i + 1, 1);
            writePageBlocks(page, blocks);
            page.manualEdited = true;
            saveRepairOverlayPage(issue.pageIndex, { manualEdited: true });
            saveCheckpoint();
            renderReview();
            runFinalPolish();
          }
        });
        button("Keep separate", "ghost", () => {
          state.ignoredFinalPolishIssues.add(issue.key);
          saveCheckpoint();
          runFinalPolish();
        });
        button("Open page (optional)", "ghost", () => jumpToPage(issue.pageIndex));
      }

      els.finalPolishReviewList.appendChild(item);
    });

    els.finalPolishReview.classList.toggle("hidden", report.issues.length === 0);
    els.finalPolishReviewToggle.textContent = `Review polish (${report.issues.length})`;
  }

  function restoreFinalPolishReviewUi() {
    if (!state.pages.length || !state.repairBookHasRun) return;
    try {
      const audit = finalPolishAudit();
      if (!audit || !Array.isArray(audit.issues)) return;
      const report = { buildVersion: BUILD_VERSION, runAt: new Date().toISOString(),
        fixedCount: 0, punctuationSpacing: 0, quoteSpacing: 0, dashSpacing: 0,
        continuationMerges: 0, restoredReview: true, ...audit };
      state.lastFinalPolishReport = report;
      renderFinalPolishReport(report);
      if (els.finalPolishStatus) els.finalPolishStatus.textContent =
        audit.issues.length ? `${audit.issues.length} review` : "0 review";
    } catch (err) {
      console.warn("Could not restore Final Polish review UI", err);
    }
  }

  function runFinalPolish() {
    if (!state.pages.length || state.processing) {
      setStatus("Process or import a book before running Final Polish.");
      return;
    }
    syncCurrentEditor();
    setGuidedProgress("Polish 1/4 · Continuations", 0);
    const polish = globalThis.BookOcrEpubPolish?.finalPolishText;
    if (typeof polish !== "function") {
      setStatus("Final Polish helper did not load. Refresh and try again.");
      return;
    }

    const continuationMerges = autoMergeStrongContinuations();
    setGuidedProgress("Polish 1/4 · Continuations", 100);

    let fixedCount = 0, punctuationSpacing = 0, quoteSpacing = 0, dashSpacing = 0;
    for (let pageIndex = 0; pageIndex < state.pages.length; pageIndex++) {
      setGuidedProgress("Polish 2/4 · Safe cleanup",
        ((pageIndex + 1) / Math.max(1, state.pages.length)) * 100,
        `page ${pageIndex + 1}/${state.pages.length}`);
      const page = state.pages[pageIndex];
      const beforeText = String(page.text || "");
      const result = polish(beforeText);
      page.text = result.text;
      if (page.text !== beforeText) saveRepairOverlayPage(pageIndex);
      fixedCount += result.fixedCount || 0;
      punctuationSpacing += result.punctuationSpacing || 0;
      quoteSpacing += result.quoteSpacing || 0;
      dashSpacing += result.dashSpacing || 0;
    }
    saveCheckpoint();
    renderReview();

    setGuidedProgress("Polish 3/4 · Audit", 0);
    const audit = finalPolishAudit();
    setGuidedProgress("Polish 3/4 · Audit", 100);
    state.finalPolishHasRun = true;
    const report = {
      buildVersion: BUILD_VERSION,
      runAt: new Date().toISOString(),
      fixedCount,
      punctuationSpacing,
      quoteSpacing,
      dashSpacing,
      continuationMerges,
      ...audit
    };
    report.checks.unshift({
      name: "Paragraph continuations",
      status: "pass",
      detail: continuationMerges
        ? `${continuationMerges} high-confidence broken paragraph continuation${continuationMerges===1?" was":"s were"} merged automatically.`
        : "No high-confidence broken paragraph continuations needed merging."
    });
    state.lastFinalPolishReport = report;
    saveCheckpoint();
    setGuidedProgress("Polish 4/4 · Review queue", 50);
    renderFinalPolishReport(report);
    setGuidedProgress("Polish complete", 100);

    const notes = audit.checks.filter(c => c.status === "warn").length;
    if (els.finalPolishStatus) {
      els.finalPolishStatus.textContent = `${fixedCount} safe fix${fixedCount===1?"":"es"} · ${audit.issues.length} review`;
    }
    setStatus(`Final Polish complete: ${fixedCount} safe Kindle-first cleanup fix${fixedCount===1?"":"es"} applied. ${audit.issues.length} uncertain item${audit.issues.length===1?"":"s"} left untouched for review${notes ? ` across ${notes} audit categor${notes===1?"y":"ies"}` : ""}.`);
    return report;
  }

  async function repairBookGuided() {
    if (!state.pages.length || state.processing) {
      setStatus("Process or import a book before running Guided Repair.");
      return;
    }

    const chapterMode = state.guidedRepairMode === "chapter";
    const chapter = chapterMode ? currentGuidedRepairChapter() : null;
    const pageIndexes = chapterMode ? guidedRepairPageIndexes() : null;
    const originalLabel = els.repairBook?.textContent || "Repair Book";
    let repairStage = "startup";
    if (els.repairDiagnostic) {
      els.repairDiagnostic.textContent = "";
      els.repairDiagnostic.classList.add("hidden");
    }

    if (els.repairBook) {
      els.repairBook.disabled = true;
      els.repairBook.textContent = chapterMode ? "Repairing chapter…" : "Repairing…";
    }
    if (els.repairBookStatus) els.repairBookStatus.textContent = "Running · 1/5";
    setGuidedProgress("1/5 · Rebuild", 0);

    try {
      repairStage = "sync current editor";
      syncCurrentEditor();

      let rebuiltCount = 0;
      let italics = null;

      if (chapterMode) {
        // Paragraph geometry and italic analysis were already produced by OCR.
        // Chapter mode intentionally avoids whole-book rebuild/rescan so it
        // stays fast, local, and cannot disturb repaired text in other chapters.
        setStatus(`Guided Repair · Chapter ${chapter.number}: preserving paragraph geometry and existing italic analysis…`);
      } else {
        setStatus(state.repairBookHasRun
          ? "Guided Repair 1/5 · Preserving already repaired paragraph text…"
          : "Guided Repair 1/5 · Rebuilding paragraph structure…");
        repairStage = "paragraph rebuild";
        rebuiltCount = state.repairBookHasRun
          ? 0
          : rebuildParagraphsFromSavedGeometry({ confirmOverwrite: false });
        setGuidedProgress("1/5 · Rebuild", 100);

        setStatus(state.repairBookHasRun
          ? "Guided Repair 2/5 · Rechecking italics without rebuilding repaired text…"
          : "Guided Repair 2/5 · Scanning conservative italics…");
        repairStage = "automatic italic scan";
        if (els.repairBookStatus) els.repairBookStatus.textContent = "Running · 2/5";
        italics = await autoScanItalics({
          rebuildText: !state.repairBookHasRun,
          progressCallback: (current, total, pct) =>
            setGuidedProgress("2/5 · Italics", pct, `page ${current}/${total}`)
        });
      }

      setGuidedProgress("Repair complete", 100);
      setStatus(chapterMode
        ? `Guided Repair · Chapter ${chapter.number}: applying safe cleanup…`
        : "Guided Repair 3/5 · Applying safe text cleanup…");
      repairStage = "safe text cleanup";
      if (els.repairBookStatus) els.repairBookStatus.textContent = "Running · 3/5";
      setGuidedProgress("3/5 · Cleanup", 0);
      const polishStats = applySafePolishToProject(pageIndexes) || { fixedCount:0 };
      setGuidedProgress("3/5 · Cleanup", 100);

      setStatus(chapterMode
        ? `Guided Repair · Chapter ${chapter.number}: repairing split ligatures…`
        : "Guided Repair 4/5 · Repairing high-confidence split ligatures…");
      repairStage = "split-ligature repair";
      if (els.repairBookStatus) els.repairBookStatus.textContent = "Running · 4/5";
      setGuidedProgress("4/5 · Ligatures", 0);
      const ligatureStats = runSplitLigaturePolish(pageIndexes) || { fixedCount:0, ambiguousCount:0 };
      setGuidedProgress("4/5 · Ligatures", 100);

      setStatus(chapterMode
        ? `Guided Repair · Chapter ${chapter.number}: checking chapter opening…`
        : "Guided Repair 5/5 · Running Dropcap Rescue across every chapter start…");
      if (els.geometryAssist?.checked && !state.importedEpub) {
        repairStage = "Dropcap Rescue · raw Paddle detections";
        if (els.repairBookStatus) els.repairBookStatus.textContent = "Running · 5/5";
        await hydrateRawDropcapDetections(pageIndexes,
          (current, total, pct, pageNumber) =>
            setGuidedProgress("5/5 · Dropcaps", pct, `chapter ${current}/${total} · page ${pageNumber}`));
      }

      // Manual Review edits are authoritative. Chapter-start re-OCR may
      // temporarily replace page.text, so restore the durable edited-page
      // overlay before Dropcap Rescue inspects or modifies chapter openings.
      applyRepairOverlay();

      repairStage = els.geometryAssist?.checked ? "Dropcap Rescue · geometry on" : "Dropcap Rescue · geometry off";
      setGuidedProgress("5/5 · Dropcaps", 100, "reconstructing");
      scanDropcaps(pageIndexes);

      const dropcapAudit = state.lastDropcapAudit || { expected:0, evaluated:0, missedPages:[] };
      if (dropcapAudit.missedPages.length) {
        throw new Error(`Dropcap Rescue evaluated only ${dropcapAudit.evaluated} of ${dropcapAudit.expected} expected chapter starts.`);
      }

      const high = state.dropcapCandidates.filter(c =>
        c.status === "pending" &&
        c.confidence === "high" &&
        (!pageIndexes || pageIndexes.includes(c.pageIndex))
      );
      repairStage = "auto-apply high-confidence dropcaps";
      high.forEach(candidate => applyDropcap(candidate, candidate.proposed));

      repairStage = "save repaired checkpoint";

      // Last writer wins: OCR < automated repair < user manual edits.
      // Reapply once more after all automatic dropcap work, then checkpoint.
      applyRepairOverlay();

      state.repairBookHasRun = true;
      saveCheckpoint();
      repairStage = "render repaired results";
      renderReview();
      renderDropcapResults();
      renderRepairReview();
      updateGuidedRepairModeUi();

      const repairState = getRepairReviewState();
      const repairReviewCount = repairState.total;

      if (els.repairBookStatus) {
        els.repairBookStatus.textContent = chapterMode
          ? `Chapter ${chapter.number} · ${repairReviewCount} review`
          : `Done · ${repairReviewCount} review · ${dropcapAudit.evaluated}/${dropcapAudit.expected} chapter starts`;
      }

      setStatus(chapterMode
        ? `Chapter ${chapter.number} repaired: ${repairState.dropcapCount} dropcap and ${repairState.ligatureCount} split-ligature review item${repairReviewCount===1?"":"s"} remain in this chapter.`
        : `Guided Repair complete: ${dropcapAudit.evaluated}/${dropcapAudit.expected} chapter starts evaluated, ${high.length} high-confidence dropcaps accepted, ${repairState.dropcapCount} dropcaps and ${repairState.ligatureCount} split-ligatures left for Review repairs. ${rebuiltCount} pages rebuilt; ${italics?.markedRuns || 0} italic runs; ${polishStats.fixedCount || 0} safe cleanup fixes.`);
    } catch (err) {
      console.error("Guided Repair failed", { stage: repairStage, error: err });
      const message = err?.message || String(err);
      const stackLine = String(err?.stack || "").split("\n")[1]?.trim() || "";
      if (els.repairBookStatus) els.repairBookStatus.textContent = `Stopped · ${repairStage}`;
      if (els.repairDiagnostic) {
        els.repairDiagnostic.textContent =
          `Stage: ${repairStage}\nError: ${message}${stackLine ? `\n${stackLine}` : ""}\nGeometry assist: ${els.geometryAssist?.checked ? "ON" : "OFF"}`;
        els.repairDiagnostic.classList.remove("hidden");
      }
      setGuidedProgress(`Stopped · ${repairStage}`);
      setStatus(`Guided Repair stopped at ${repairStage}: ${message}`);
    } finally {
      if (els.repairBook) {
        els.repairBook.disabled = false;
        els.repairBook.textContent = originalLabel;
      }
      updateNavigationControls();
      updateGuidedRepairModeUi();
    }
  }

  function applySafePolishToProject(pageIndexes = null) {
    const polish = globalThis.BookOcrEpubPolish?.safePolishText;
    if (typeof polish !== "function") {
      setStatus("Safe polish helper did not load. Refresh and try again.");
      return;
    }
    syncCurrentEditor();
    let fixedCount = 0;
    let ellipsisCount = 0;
    let sceneCount = 0;
    let quoteCount = 0;
    let strayQuoteApostrophes = 0;
    let quoteSpaces = 0;
    let droppedPronounI = 0;
    let digitLContractions = 0;
    let openingQuoteSpaces = 0;
    let missingPostQuoteSpaces = 0;
    const selected = pageIndexes ? new Set(pageIndexes) : null;
    for (let pageIndex = 0; pageIndex < state.pages.length; pageIndex++) {
      if (selected && !selected.has(pageIndex)) continue;
      const page = state.pages[pageIndex];
      const beforeText = String(page.text || "");
      const result = polish(beforeText);
      page.text = result.text;
      if (page.text !== beforeText) saveRepairOverlayPage(pageIndex);
      fixedCount += result.fixedCount || 0;
      ellipsisCount += result.ellipsisCount || 0;
      sceneCount += result.sceneCount || 0;
      quoteCount += result.quoteCount || 0;
      strayQuoteApostrophes += result.strayQuoteApostrophes || 0;
      quoteSpaces += result.quoteSpaces || 0;
      droppedPronounI += result.droppedPronounI || 0;
      digitLContractions += result.digitLContractions || 0;
      openingQuoteSpaces += result.openingQuoteSpaces || 0;
      missingPostQuoteSpaces += result.missingPostQuoteSpaces || 0;
    }
    saveCheckpoint();
    renderReview();
    if (els.polishStatus) els.polishStatus.textContent = `${fixedCount} safe fix${fixedCount === 1 ? "" : "es"}`;
    setStatus(`Safe text cleanup applied ${ellipsisCount} ellipsis normalization${ellipsisCount === 1 ? "" : "s"}, ${sceneCount} scene-divider normalization${sceneCount === 1 ? "" : "s"}, ${quoteCount + strayQuoteApostrophes} quote repair${quoteCount + strayQuoteApostrophes === 1 ? "" : "s"}, ${quoteSpaces + openingQuoteSpaces + missingPostQuoteSpaces} quote-spacing fix${quoteSpaces + openingQuoteSpaces + missingPostQuoteSpaces === 1 ? "" : "es"}, ${droppedPronounI} dropped-I repair${droppedPronounI === 1 ? "" : "s"}, and ${digitLContractions} digit/l contraction repair${digitLContractions === 1 ? "" : "s"}. No spelling or prose rewrites were performed.`);
    return { fixedCount, ellipsisCount, sceneCount, quoteCount, strayQuoteApostrophes, quoteSpaces, droppedPronounI, digitLContractions, openingQuoteSpaces, missingPostQuoteSpaces };
  }

  function repairTextNodesInParagraph(paragraph, repair) {
    const walker = paragraph.ownerDocument.createTreeWalker(paragraph, 4);
    let fixedCount = 0;
    let ambiguousCount = 0;
    let node = walker.nextNode();
    while (node) {
      const result = repair(node.nodeValue);
      if (result.fixedCount) node.nodeValue = result.text;
      fixedCount += result.fixedCount;
      ambiguousCount += result.ambiguousCount;
      node = walker.nextNode();
    }
    return { fixedCount, ambiguousCount };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function ligatureCandidateContext(text, candidate) {
    const start = Math.max(0, candidate.index - 70);
    const end = Math.min(text.length, candidate.index + candidate.original.length + 70);
    return text.slice(start, end).replace(/\s+/g, " ").trim();
  }

  function stableLigatureCandidateKey(candidate, pageIndex, context = "") {
    // One decision belongs to one exact occurrence. Preserve punctuation/case
    // and only normalize whitespace so two similar repairs on the same page
    // cannot accidentally suppress one another.
    const normalizedContext = String(context || "")
      .replace(/\s+/g, " ")
      .trim();
    return `v3|${pageIndex}|${candidate.original}|${candidate.joined}|${normalizedContext}`;
  }

  function legacyLigatureCandidateKey(candidate, pageIndex) {
    return `${pageIndex}|${candidate.index}|${candidate.original}|${candidate.joined}`;
  }

  function isLigatureCandidateIgnored(candidate, pageIndex, context) {
    const ignored = state.ignoredLigatureCandidates || new Set();

    // Current exact-occurrence identity.
    if (ignored.has(stableLigatureCandidateKey(candidate, pageIndex, context))) return true;

    // Compatibility with v2.7.19 exact context keys only. Recreate that key
    // precisely; do not use page/pattern-wide matching.
    const v2Context = String(context || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .trim();
    const v2Key = `v2|${pageIndex}|${candidate.original}|${candidate.joined}|${v2Context}`;
    if (ignored.has(v2Key)) return true;

    // Compatibility with v2.7.18 only when the exact old character index still
    // identifies this occurrence. No fuzzy migration.
    return ignored.has(legacyLigatureCandidateKey(candidate, pageIndex));
  }

  function rememberIgnoredLigature(candidate, pageIndex, context) {
    state.ignoredLigatureCandidates.add(stableLigatureCandidateKey(candidate, pageIndex, context));
  }

  function collectUncertainLigatures(pageIndexes = null) {
    const list = globalThis.BookOcrEpubPolish?.listSplitLigatureCandidates;
    if (!list) return [];
    const allowed = pageIndexes ? new Set(pageIndexes) : null;
    const found = [];
    state.pages.forEach((page, pageIndex) => {
      if (allowed && !allowed.has(pageIndex)) return;
      const text = page.text || "";
      list(text).forEach(candidate => {
        const context = ligatureCandidateContext(text, candidate);
        if (isLigatureCandidateIgnored(candidate, pageIndex, context)) return;
        const key = stableLigatureCandidateKey(candidate, pageIndex, context);
        found.push({
          ...candidate,
          key,
          pageIndex,
          fileName: page.fileName || page.file?.name || `Page ${pageIndex + 1}`,
          context
        });
      });
    });
    return found;
  }

  function getRepairReviewState() {
    const pageIndexes = state.guidedRepairMode === "chapter" ? guidedRepairPageIndexes() : null;
    const allowed = pageIndexes ? new Set(pageIndexes) : null;
    const ligatures = collectUncertainLigatures(pageIndexes);
    const dropcaps = (state.dropcapCandidates || []).filter(c =>
      c.status === "pending" && (!allowed || allowed.has(c.pageIndex))
    );
    return {
      ligatures,
      dropcaps,
      ligatureCount: ligatures.length,
      dropcapCount: dropcaps.length,
      total: ligatures.length + dropcaps.length
    };
  }

  function renderLigatureReview() {
    syncCurrentEditor();

    const details = els.ligatureReviewDetails;
    const toggle = els.ligatureReviewSummaryToggle;
    if (!details || !toggle || !els.ligatureReviewList || !els.ligatureReviewSummary) return;

    const candidates = collectUncertainLigatures();
    details.classList.toggle("hidden", candidates.length === 0);
    toggle.textContent = `Review uncertain (${candidates.length})`;

    els.ligatureReviewSummary.textContent = candidates.length
      ? `${candidates.length} uncertain candidate${candidates.length===1?"":"s"}. Nothing changes unless you press Repair. Keep as-is dismisses that candidate for this session.`
      : "No uncertain split-ligature candidates remain.";
    els.ligatureReviewList.innerHTML = "";

    candidates.forEach((c) => {
      const item = document.createElement("div");
      item.className = "ligature-review-item";
      const safeContext = escapeHtml(c.context);
      const markedContext = safeContext.replace(
        escapeHtml(c.original),
        `<span class="ligature-candidate">${escapeHtml(c.original)}</span>`
      );

      item.innerHTML = `<strong>${escapeHtml(c.fileName)}</strong>
        <p class="ligature-context">${markedContext}</p>
        <p class="hint">Candidate: <b>${escapeHtml(c.original)}</b> → <b>${escapeHtml(c.joined)}</b> · ${escapeHtml(c.family || "ligature")} family</p>
        <div class="actions">
          <button class="button ghost keep" type="button">Keep as-is</button>
          <button class="button secondary repair" type="button">Repair</button>
        </div>`;

      item.querySelector(".keep").addEventListener("click", (event) => {
        event.preventDefault();
        rememberIgnoredLigature(c, c.pageIndex, c.context);
        saveCheckpoint();
        refreshDownstreamRepairState();
        setStatus(`Kept “${c.original}” as-is. Repair review now owns that resolved decision.`);
      });

      item.querySelector(".repair").addEventListener("click", (event) => {
        event.preventDefault();
        const page = state.pages[c.pageIndex];
        const text = page?.text || "";
        const exactAtIndex = text.slice(c.index, c.index + c.original.length) === c.original;
        const pos = exactAtIndex ? c.index : text.indexOf(c.original);
        if (pos >= 0) {
          const nextText = text.slice(0, pos) + c.joined + text.slice(pos + c.original.length);
          commitPageText(c.pageIndex, nextText);
          refreshDownstreamRepairState();
          setStatus(`Repaired uncertain split-ligature candidate “${c.original}” → “${c.joined}”. Kindle Ready will use the repaired text on its next check.`);
        } else {
          setStatus(`Could not locate “${c.original}” again; rerun split-ligature inspection.`);
        }
      });

      els.ligatureReviewList.appendChild(item);
    });
  }

  function updateLigatureReviewButton() {
    renderLigatureReview();
  }

  function runSplitLigaturePolish(pageIndexes = null) {
    const repair = globalThis.BookOcrEpubPolish?.repairSplitLigatures;
    if (!repair) {
      alert("Split Ligature Repair did not load. Refresh the app and try again.");
      return;
    }
    syncCurrentEditor();
    let fixedCount = 0;
    let ambiguousCount = 0;

    if (state.importedEpub) {
      state.importedEpub.documents.forEach((doc, index) => {
        let documentFixed = 0;
        doc.dom.querySelectorAll("p").forEach(paragraph => {
          const result = repairTextNodesInParagraph(paragraph, repair);
          documentFixed += result.fixedCount;
          fixedCount += result.fixedCount;
          ambiguousCount += result.ambiguousCount;
        });
        if (documentFixed) doc.changed = true;
        state.pages[index].text = Array.from(doc.dom.querySelectorAll("p"))
          .map(paragraph => paragraph.textContent.trim()).filter(Boolean).join("\n\n");
      });
    } else {
      const allowed = pageIndexes ? new Set(pageIndexes) : null;
      state.pages.forEach((page, pageIndex) => {
        if (allowed && !allowed.has(pageIndex)) return;
        const result = repair(page.text || "");
        page.text = result.text;
        fixedCount += result.fixedCount;
        ambiguousCount += result.ambiguousCount;
      });
      saveCheckpoint();
      renderReview();
    }

    const fixedLabel = `${fixedCount} high-confidence split ligature${fixedCount === 1 ? "" : "s"} repaired`;
    const ambiguousLabel = `${ambiguousCount} uncertain candidate${ambiguousCount === 1 ? "" : "s"} left unchanged`;
    els.ligatureStatus.textContent = `${fixedCount} fixed · ${ambiguousCount} review`;
    updateLigatureReviewButton();
    setStatus(`${fixedLabel}; ${ambiguousLabel}. No OCR was run.`);
    return { fixedCount, ambiguousCount };
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
    const text = paragraphs.map(stripItalicMarkers).join("\n\n");
    const title = cleanFilename(els.bookTitle.value || "book");
    downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), `${title}.txt`);
  }


  function sectionParagraphs(section) {
    const out=[];
    for (let pageIndex = section.start; pageIndex < section.end; pageIndex++) {
      const page = state.pages[pageIndex];
      let pageText = page?.text || "";
      if (pageIndex === section.start && page?.chapterStart) {
        pageText = stripExportedChapterHeading(pageText, section.title);
      }
      const paragraphs = exportParagraphs(pageText);
      if (!paragraphs.length) continue;

      const firstParagraphIsSceneBreak = String(paragraphs[0] || "").trim() === "* * *";
      const previousExportIsSceneBreak = String(out[out.length - 1]?.text || "").trim() === "* * *";
      const canJoinAcrossPage = pageIndex > section.start
        && out.length
        && !page?.chapterStart
        && !firstParagraphIsSceneBreak
        && !previousExportIsSceneBreak
        && page?.layoutMeta
        && page.layoutMeta.firstStartsIndented === false
        && page.layoutMeta.firstIsFurniture === false
        && state.pages[pageIndex - 1]?.layoutMeta?.lastIsFurniture !== true;

      if (canJoinAcrossPage) {
        out[out.length - 1].text = joinParagraphLines([out[out.length - 1].text, paragraphs[0]]);
        paragraphs.shift();
      }
      paragraphs.forEach((text, paragraphIndex) => out.push({ text, pageIndex, paragraphIndex }));
    }
    return out;
  }


  function kindleReadyChecks() {
    syncCurrentEditor();
    // Final authority pass: accepted geometry-derived emphasis must be present
    // in page.text before preflight counts what the EPUB will serialize.
    ensureItalicEvidenceProjected();

    const checks = [];
    const add = (name, status, detail) => checks.push({ name, status, detail });

    const pagesWithText = state.pages.filter(p => normalizedPageText(p.text || "")).length;
    const emptyPages = Math.max(0, state.pages.length - pagesWithText);
    add("Book text", pagesWithText && !emptyPages ? "pass" : (pagesWithText ? "warn" : "fail"),
      pagesWithText
        ? (emptyPages ? `${pagesWithText}/${state.pages.length} pages contain text; ${emptyPages} empty page${emptyPages===1?"":"s"} need review.` : `${pagesWithText}/${state.pages.length} processed pages contain text.`)
        : "No repaired OCR text is available to export.");

    const title = String(els.bookTitle?.value || "").trim();
    const author = String(els.bookAuthor?.value || "").trim();
    add("Title metadata", title ? "pass" : "fail", title ? `Title: ${title}` : "Add the book title before export.");
    add("Author metadata", author ? "pass" : "warn", author ? `Author: ${author}` : "Author is blank. Kindle can accept the EPUB, but metadata will be incomplete.");

    add("Cover", state.coverFile ? "pass" : "warn",
      state.coverFile ? `Cover image selected: ${state.coverFile.name}` : "No cover selected. The EPUB will still work, but Kindle library presentation will be plainer.");

    const sections = chapterSections();
    const markedStarts = state.pages.filter(p => p.chapterStart).length;
    const titles = sections.map(s => String(s.title || "").trim()).filter(Boolean);
    const duplicateTitles = titles.filter((t, i) => titles.indexOf(t) !== i);
    add("Chapter navigation", sections.length && !duplicateTitles.length ? "pass" : "warn",
      duplicateTitles.length
        ? `${sections.length} navigation entries generated, but duplicate chapter titles were found: ${[...new Set(duplicateTitles)].join(", ")}.`
        : markedStarts
          ? `${sections.length} EPUB navigation entr${sections.length===1?"y":"ies"} generated from ${markedStarts} marked chapter start${markedStarts===1?"":"s"}.`
          : `${sections.length} fallback EPUB navigation entry will be generated. No explicit chapter starts are marked.`);

    // Repair Book owns repair resolution. Kindle Ready consumes that canonical
    // stage state instead of running a separate repair-discovery/counting path.
    const repairState = getRepairReviewState();
    const dropcapAudit = state.lastDropcapAudit;
    if (dropcapAudit) {
      const complete = dropcapAudit.evaluated === dropcapAudit.expected && !dropcapAudit.missedPages.length;
      add("Dropcap scan coverage", complete ? "pass" : "fail",
        complete
          ? `${dropcapAudit.evaluated}/${dropcapAudit.expected} chapter starts were evaluated by Dropcap Rescue.`
          : `${dropcapAudit.evaluated}/${dropcapAudit.expected} chapter starts were evaluated; Repair Book must be rerun before export.`);
    }
    add("Repair review", repairState.total ? "fail" : "pass",
      repairState.total
        ? `${repairState.total} unresolved Repair Book item${repairState.total===1?"":"s"} remain (${repairState.dropcapCount} dropcap, ${repairState.ligatureCount} split-ligature).`
        : "No unresolved Repair Book items remain.");

    let polishIssues = [];
    try {
      polishIssues = finalPolishAudit()?.issues || [];
    } catch (_) {
      polishIssues = [];
    }
    add("Polish review", polishIssues.length ? "fail" : "pass",
      polishIssues.length
        ? `${polishIssues.length} unresolved Final Polish item${polishIssues.length===1?"":"s"} remain.`
        : "No unresolved Final Polish items remain.");

    const combined = state.pages.map(p => String(p.text || "")).join("\n");
    const openItalic = (combined.match(/\[\[i\]\]/gi) || []).length;
    const closeItalic = (combined.match(/\[\[\/i\]\]/gi) || []).length;
    add("Italic markup", openItalic === closeItalic ? "pass" : "fail",
      openItalic === closeItalic
        ? `${openItalic} semantic italic run${openItalic===1?"":"s"} will export as <em>.`
        : `Italic markers are unbalanced (${openItalic} opens / ${closeItalic} closes).`);

    const sceneBreaks = state.pages.reduce((n, p) => n + ((String(p.text || "").match(/^\s*\* \* \*\s*$/gm) || []).length), 0);
    add("Scene breaks", "pass",
      sceneBreaks ? `${sceneBreaks} semantic scene break${sceneBreaks===1?"":"s"} will export as EPUB separators.` : "No semantic scene breaks are present in this batch.");

    add("Kindle-safe structure", "pass",
      "Exporter uses a reflowable EPUB 3 package with nav.xhtml, ordered spine entries, semantic paragraphs/emphasis, and simple relative CSS suitable for Send to Kindle.");

    const failCount = checks.filter(c => c.status === "fail").length;
    const warnCount = checks.filter(c => c.status === "warn").length;
    return { checks, failCount, warnCount, ready: failCount === 0 };
  }

  function renderKindleReady(report) {
    if (!els.kindleReadyResults || !els.kindleReadyStatus) return;
    els.kindleReadyResults.innerHTML = "";

    report.checks.forEach(check => {
      const row = document.createElement("div");
      row.className = `regression-row kindle-ready-row ${check.status}`;
      const icon = check.status === "pass" ? "✓" : check.status === "warn" ? "!" : "×";
      row.innerHTML = `<span class="regression-icon">${icon}</span><strong>${escapeHtml(check.name)}</strong><span>${escapeHtml(check.detail)}</span>`;
      els.kindleReadyResults.appendChild(row);
    });

    els.kindleReadyResults.classList.remove("hidden");
    if (report.ready) {
      els.kindleReadyStatus.textContent = report.warnCount ? `READY · ${report.warnCount} note${report.warnCount===1?"":"s"}` : "KINDLE READY ✓";
    } else {
      els.kindleReadyStatus.textContent = `${report.failCount} blocking · ${report.warnCount} note${report.warnCount===1?"":"s"}`;
    }
  }

  function runKindleReadyCheck() {
    if (!state.pages.length || state.processing) {
      setStatus("Process or import a book before running Kindle Ready.");
      return;
    }
    const report = kindleReadyChecks();
    renderKindleReady(report);
    setStatus(report.ready
      ? `Kindle Ready preflight passed${report.warnCount ? ` with ${report.warnCount} non-blocking note${report.warnCount===1?"":"s"}` : ""}.`
      : `Kindle Ready preflight found ${report.failCount} blocking item${report.failCount===1?"":"s"}.`);
    return report;
  }

  async function buildEpub() {
    if (!window.JSZip) throw new Error("JSZip did not load.");
    if (state.importedEpub) {
      await exportRepairedImportedEpub();
      return;
    }
    syncCurrentEditor();
    // Do not trust an earlier scan/projection to still be reflected after later
    // Repair/Polish edits. Re-project accepted italic evidence onto the latest
    // authoritative wording immediately before serialization.
    ensureItalicEvidenceProjected();
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
      const bodyParagraphs = sectionParagraphs(section).map(({ text, pageIndex, paragraphIndex }) => {
        if (String(text || "").trim() === "* * *") return `<hr id="p-${pageIndex + 1}-${paragraphIndex + 1}" class="scene-break"/>`;
        const html = paragraphToEpubHtml(text);
        return html.replace("<p>", `<p id="p-${pageIndex + 1}-${paragraphIndex + 1}">`);
      });

      const hasHeading = Boolean(String(section.title || "").trim());
      const headingHtml = hasHeading ? `<h1>${escapeXml(section.title)}</h1>` : "";
      const sectionType = section.nav ? "chapter" : "bodymatter";

      zip.file(`EPUB/${fileName}`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(section.title || title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <section epub:type="${sectionType}">
    ${headingHtml}
    ${bodyParagraphs.join("\n    ")}
  </section>
</body>
</html>`);

      manifest.push(`    <item id="${itemId}" href="${fileName}" media-type="application/xhtml+xml"/>`);
      spine.push(`    <itemref idref="${itemId}"/>`);
      if (section.nav && hasHeading) navItems.push(`<li><a href="${fileName}">${escapeXml(section.title)}</a></li>`);
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

    zip.file("EPUB/style.css", `
body{
  font-family:serif;
  line-height:1.45;
  margin:5%;
}
h1{
  font-size:1.5em;
  margin:0 0 1.5em;
  text-align:left;
}
p{
  display:block;
  margin:0;
  text-indent:1.2em;
  white-space:normal;
}
h1 + p,
section > p:first-of-type,
.scene-break + p{
  text-indent:0;
}
em{
  font-style:italic;
}
.scene-break{
  border:0;
  text-align:center;
  margin:1.5em 0;
}
.scene-break:after{
  content:"* * *";
}
`);

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

    downloadBlob(blob, `${safeTitle}.epub`);
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


  function syncCropPresetUi() {
    const top = Number(els.cropTop?.value || 0);
    const bottom = Number(els.cropBottom?.value || 0);
    const sides = Number(els.cropSides?.value || 0);

    let active = "custom";
    if (top === 0 && bottom === 0 && sides === 0) active = "none";
    else if (top === 0 && bottom === 75 && sides === 0) active = "cloud";
    else if (top === 130 && bottom === 0 && sides === 0) active = "kindle";

    document.querySelectorAll("[data-preset]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.preset === active);
    });
  }

  document.querySelectorAll("[data-preset]").forEach(btn => {
    btn.addEventListener("click", () => {
      const preset = btn.dataset.preset;
      if (preset === "cloud") {
        els.cropTop.value = 0;
        els.cropBottom.value = 75;
        els.cropSides.value = 0;
      } else if (preset === "kindle") {
        els.cropTop.value = 130;
        els.cropBottom.value = 0;
        els.cropSides.value = 0;
      } else if (preset === "none") {
        els.cropTop.value = 0;
        els.cropBottom.value = 0;
        els.cropSides.value = 0;
      }
      syncCropPresetUi();
      updatePreview();
    });
  });

  [els.cropTop, els.cropBottom, els.cropSides].forEach(input => input.addEventListener("input", () => {
    syncCropPresetUi();
    updatePreview();
  }));

  syncCropPresetUi();

  [els.bookTitle, els.bookAuthor].forEach(input => input?.addEventListener("input", () => {
    if (state.files.length) saveCheckpoint();
  }));

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
    state.repairBookHasRun = false;
    state.ignoredLigatureCandidates = new Set();
    state.ignoredFinalPolishIssues = new Set();
    state.files = Array.from(els.imageInput.files || []).sort(naturalSort);
    state.pages = [];
    state.currentPageIndex = -1;
    const restored = state.files.length ? restoreCheckpointIfMatching() : 0;
    if (restored && state.currentPageIndex < 0) state.currentPageIndex = restored - 1;
    els.fileCount.textContent = `${state.files.length} page${state.files.length === 1 ? "" : "s"} loaded`;
    els.processBtn.disabled = !state.files.length || restored >= state.files.length;
    els.freshPaddleBtn.disabled = !state.files.length;
    setPostOcrSectionsVisible(restored > 0);
    renderThumbs();
    renderReview();
    refreshParagraphRebuildUi();
    syncCropPresetUi();
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
    state.repairBookHasRun = false;
    state.ignoredLigatureCandidates = new Set();
    state.ignoredFinalPolishIssues = new Set();
    clearCheckpoint();
    els.fileCount.textContent = "0 pages loaded";
    els.processBtn.disabled = true;
    els.freshPaddleBtn.disabled = true;
    setPostOcrSectionsVisible(false);
    renderThumbs();
    renderReview();
    refreshParagraphRebuildUi();
    syncCropPresetUi();
    updatePreview();
    setStatus("Add screenshots to begin.");
  });

  els.freshPaddleBtn.addEventListener("click", restartFreshWithPaddle);

  els.processBtn.addEventListener("click", async () => {
    setPostOcrSectionsVisible(true);
    await processAllPages();
  });
  els.prevPageBtn.addEventListener("click", goToPreviousPage);
  els.nextPageBtn.addEventListener("click", goToNextPage);
  els.pageDropcapBtn.addEventListener("click", openPageDropcapReview);
  els.markItalicBtn?.addEventListener("click", markSelectedItalic);
  els.clearItalicBtn?.addEventListener("click", clearItalicMarksOnPage);
  els.closePageDropcap.addEventListener("click", closePageDropcapReview);
  els.cancelPageDropcap.addEventListener("click", closePageDropcapReview);
  els.applyPageDropcap.addEventListener("click", applyPageDropcapReview);
  els.pageDropcapDialog.addEventListener("cancel", event => {
    event.preventDefault();
    closePageDropcapReview();
  });
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
  updateGuidedRepairModeUi();
    }
  });

  document.getElementById("redetectChaptersBtn")?.addEventListener("click", redetectExistingChapterStarts);
  els.downloadTxt.addEventListener("click", downloadTxt);
  els.downloadEpub.addEventListener("click", downloadEpub);
  els.repairBook?.addEventListener("click", repairBookGuided);
  els.repairModeWhole?.addEventListener("click", () => setGuidedRepairMode("whole"));
  els.repairModeChapter?.addEventListener("click", () => setGuidedRepairMode("chapter"));
  els.repairChapterPrev?.addEventListener("click", () => moveGuidedRepairChapter(-1));
  els.repairChapterNext?.addEventListener("click", () => moveGuidedRepairChapter(1));
  els.runRegression?.addEventListener("click", runRegressionCheck);
  els.runKindleReady?.addEventListener("click", runKindleReadyCheck);
  els.finalPolish?.addEventListener("click", runFinalPolish);
  els.safePolish?.addEventListener("click", applySafePolishToProject);
  els.autoItalicScan?.addEventListener("click", autoScanItalics);
  els.downloadItalicDiagnostics?.addEventListener("click", downloadItalicDiagnostics);
  els.repairLigatures.addEventListener("click", runSplitLigaturePolish);

  els.rebuildParagraphs?.addEventListener("click", () => rebuildParagraphsFromSavedGeometry({ confirmOverwrite: true }));
  els.downloadLayoutDiagnostics?.addEventListener("click", downloadLayoutDiagnostics);
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
