(() => {
  "use strict";

  const BUILD_VERSION = "209";
  console.info(`Book OCR Studio ${BUILD_VERSION} loaded`);

  const $ = (id) => document.getElementById(id);
  const buildIdentifier = $("buildIdentifier");
  if (buildIdentifier) buildIdentifier.textContent = `BUILD ${BUILD_VERSION}`;

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
    sourceProfile: "cloud-iowan",
    cropPreviewIndex: 0,
    italicCalibrationReviewSet: [],
    italicCalibrationLabels: {},
    italicLearningProfile: null,
    italicReviewSelectionMode: "learned",
    italicHuntSeenKeys: new Set(),
    italicReviewHistory: [],
    italicVisualFeatureStudy: null,
    italicHeldOutValidation: null,
    italicValidationEvidenceByPhysical: new Map(),
    italicHuntSessionServedTexts: new Set(),
    italicLineHuntSeenLines: new Set(),
    iowanReferenceAtlasStudy: null,
    visualItalicResults: [],
    visualItalicSession: null,
    visualItalicReviewIndex: 0,
    visualItalicLabels: [],
    visualItalicDiversityBand: null,
    visualItalicDiversitySeenTexts: new Set(),
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
    sourceProfile: $("sourceProfile"),
    previewPrev: $("previewPrev"),
    previewNext: $("previewNext"),
    previewSample: $("previewSample"),
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
    exportItalicCalibrationLabels: $("exportItalicCalibrationLabels"),
    exportItalicLearning: $("exportItalicLearning"),
    importItalicLearning: $("importItalicLearning"),
    importItalicLearningFile: $("importItalicLearningFile"),
    resetItalicLearning: $("resetItalicLearning"),
    italicLearningStatus: $("italicLearningStatus"),
    italicCalibrationReview: $("italicCalibrationReview"),
    italicCalibrationReviewList: $("italicCalibrationReviewList"),
    italicReviewLearnedBtn: $("italicReviewLearnedBtn"),
    italicReviewRandomBtn: $("italicReviewRandomBtn"),
    italicReviewHuntBtn: $("italicReviewHuntBtn"),
    visualItalicBtn: $("visualItalicBtn"),
    exportVisualItalic: $("exportVisualItalic"),
    visualItalicReview: $("visualItalicReview"),
    visualItalicStatus: $("visualItalicStatus"),
    visualItalicStatus: $("visualItalicStatus"),
    italicLineHuntBtn: $("italicLineHuntBtn"),
    italicValidationBtn: $("italicValidationBtn"),
    italicCropExportBtn: $("italicCropExportBtn"),\n    neuralItalicN1Btn: $("neuralItalicN1Btn"), neuralItalicN1Input: $("neuralItalicN1Input"), neuralItalicN1Status: $("neuralItalicN1Status"),
    italicPixelStudyBtn: $("italicPixelStudyBtn"),
    italicReferenceAtlasBtn: $("italicReferenceAtlasBtn"),
    tesseractSidecarBtn: $("tesseractSidecarBtn"),
    exportItalicValidation: $("exportItalicValidation"),
    italicCalibrationProgress: $("italicCalibrationProgress"),
    italicReviewModeTitle: $("italicReviewModeTitle"),
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
        sourceProfile: state.sourceProfile || "cloud-iowan",
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
    if (typeof saved.sourceProfile === "string") {
      state.sourceProfile = saved.sourceProfile;
      if (els.sourceProfile) els.sourceProfile.value = saved.sourceProfile;
    }

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

    // v2.7.65: Paddle does not guarantee that fragments on the same visual row
    // arrive left-to-right. A detached punctuation glyph at the far right could
    // therefore be prepended to the line it belonged to (the Iowan regression
    // moved an em dash from "it—giving" to the beginning of the sentence).
    // Cluster rows first, then sort each row strictly by x before joining.
    // Also keep unusually tall decorative initials out of ordinary body rows so
    // a drop cap cannot become an inline orphan such as “Y or A.
    const ordered = lines.slice().sort((a,b) => a.box.cy - b.box.cy || a.box.x - b.box.x);
    const groups = [];
    for (const line of ordered) {
      let group = groups[groups.length - 1];
      const groupH = group ? median(group.items.map(x => x.box.h)) || typicalH : typicalH;
      const heightRatio = group ? Math.max(groupH, line.box.h) / Math.max(1, Math.min(groupH, line.box.h)) : 1;
      if (!group || Math.abs(line.box.cy - group.cy) > typicalH * 0.48 || heightRatio > 1.65) {
        group = { items:[line], cy:line.box.cy };
        groups.push(group);
      } else {
        group.items.push(line);
        group.cy = median(group.items.map(x => x.box.cy));
      }
    }

    let rows = groups.map(group => {
      const row = group.items.slice().sort((a,b) => a.box.x - b.box.x);
      const left = Math.min(...row.map(x => x.box.x));
      const top = Math.min(...row.map(x => x.box.y));
      const right = Math.max(...row.map(x => x.box.x + x.box.w));
      const bottom = Math.max(...row.map(x => x.box.y + x.box.h));
      return {
        text: row.map(x => x.text).join(" ").replace(/\s{2,}/g, " ").trim(),
        score: Math.min(...row.map(x => x.score)),
        box: { x:left, y:top, w:right-left, h:bottom-top, cx:(left+right)/2, cy:(top+bottom)/2 }
      };
    }).sort((a,b) => a.box.y - b.box.y || a.box.x - b.box.x);

    // v2.7.68 CloudLibrary/Iowan: resolve decorative-initial ownership while
    // geometry is still authoritative. Paddle intentionally keeps a very tall
    // dropcap in its own row; the neighboring normal-height row contains the
    // lowercase remainder. If we wait until prose cleanup, both fragments have
    // already become independent text. Merge them here into one logical line.
    //
    // Examples from the frozen Legacy regression set:
    //   “S  + he's totally...  -> “She's totally...
    //   “Y  + ou really...     -> “You really...
    //   A   + few days...      -> A few days...
    if (state.sourceProfile === "cloud-iowan" && rows.length > 1) {
      const consumed = new Set();
      const merged = [];
      const bodyH = median(rows.map(r => r.box.h).filter(h => h > 2 && h < typicalH * 1.6)) || typicalH;

      const glyphInfo = (text) => {
        const m = String(text || "").trim().match(/^([“"'‘’]?)([A-Z])$/u);
        return m ? { prefix:m[1] || "", initial:m[2] } : null;
      };
      const startsLower = (text) => /^\p{Ll}[\p{Ll}’'-]*/u.test(String(text || "").trim());

      for (let i = 0; i < rows.length; i++) {
        if (consumed.has(i)) continue;
        const glyphRow = rows[i];
        const info = glyphInfo(glyphRow.text);
        if (!info || glyphRow.box.h < bodyH * 1.8) continue;

        let best = -1;
        let bestScore = Infinity;
        for (let j = 0; j < rows.length; j++) {
          if (j === i || consumed.has(j)) continue;
          const target = rows[j];
          if (!startsLower(target.text)) continue;
          if (target.box.x <= glyphRow.box.x) continue;
          if (target.box.h > bodyH * 1.6) continue;

          const leftGap = target.box.x - (glyphRow.box.x + glyphRow.box.w);
          if (leftGap < -bodyH * 0.9 || leftGap > bodyH * 5.0) continue;
          const targetMid = target.box.cy;
          const glyphTop = glyphRow.box.y;
          const glyphBottom = glyphRow.box.y + glyphRow.box.h;
          if (targetMid < glyphTop - bodyH * 0.4 || targetMid > glyphBottom + bodyH * 0.4) continue;

          const yDistance = Math.abs(target.box.cy - (glyphRow.box.y + glyphRow.box.h * 0.28));
          const score = Math.max(0, leftGap) + yDistance * 0.45;
          if (score < bestScore) { bestScore = score; best = j; }
        }
        if (best < 0) continue;

        const target = rows[best];
        const targetText = String(target.text || "").trim();
        const firstWord = targetText.match(/^(\p{Ll}[\p{Ll}’'-]*)/u)?.[1] || "";
        let head;
        // Some decorative initials are whole-word initials rather than the
        // first letter of the following OCR token. Preserve that space.
        if ((info.initial === "A" && /^(?:few|couple)$/i.test(firstWord)) ||
            (info.initial === "I" && /^(?:am|have|had|was|will|can|do|did|don't|dont)$/i.test(firstWord))) {
          head = `${info.prefix}${info.initial} ${targetText}`;
        } else {
          head = `${info.prefix}${info.initial}${targetText}`;
        }

        const left = Math.min(glyphRow.box.x, target.box.x);
        const top = Math.min(glyphRow.box.y, target.box.y);
        const right = Math.max(glyphRow.box.x + glyphRow.box.w, target.box.x + target.box.w);
        const bottom = Math.max(glyphRow.box.y + glyphRow.box.h, target.box.y + target.box.h);
        merged.push({
          text: head,
          score: Math.min(glyphRow.score, target.score),
          box: { x:left, y:target.box.y, w:right-left, h:target.box.h, cx:(left+right)/2, cy:target.box.cy },
          decorativeInitialOwned: true
        });
        consumed.add(i);
        consumed.add(best);
      }

      rows.forEach((row, index) => { if (!consumed.has(index)) merged.push(row); });
      rows = merged.sort((a,b) => a.box.y - b.box.y || a.box.x - b.box.x);
    }

    return rows;
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

  function lineStronglyContinuesParagraph(prevText, currentText) {
    const prev = stripItalicMarkers(String(prevText || "")).trim();
    const current = stripItalicMarkers(String(currentText || "")).trim();
    if (!prev || !current) return false;
    if (isSceneMarkerText(prev) || isSceneMarkerText(current)) return false;

    // An ebook paragraph virtually never ends grammatically on these tokens.
    // Treat the following OCR line as continuation even when its x-coordinate
    // happens to fall on the learned first-line-indent lane.
    const barePrev = prev.replace(/[”"'’)]*$/u, "").trim();
    const continuationTail = /(?:[,;:—–-]|\b(?:and|but|or|nor|so|yet|because|although|though|while|when|if|that|which|who|whose|with|to|of|for|from|in|on|at|as|than))$/i.test(barePrev);
    if (!continuationTail) return false;

    // Do not bridge into unmistakable new dialogue or scene furniture.
    if (/^[“"]/.test(current) && /[.!?][”"]?$/.test(prev)) return false;
    return true;
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

      // Indentation is strong evidence, not absolute authority. CloudLibrary
      // can place a continuation line on the paragraph-start lane. Protect
      // syntactically incomplete lines (for example a line ending in "and")
      // from being split into a false new paragraph.
      const syntaxContinuationGuard = !!prev && lineStronglyContinuesParagraph(prev.text, text);

      // v29: CloudLibrary/Iowan can occasionally place a wrapped continuation
      // line directly on the learned paragraph-start lane. Do not split merely
      // because of that x-position when the source geometry and wording both say
      // the sentence is still running. This stays deliberately contextual: the
      // previous line must lack terminal punctuation, the next visual line must
      // begin lowercase (and not with a dialogue quote), and the lines must be
      // vertically adjacent. Real indented paragraph/dialogue starts remain
      // authoritative. Kindle and other profiles keep their existing behavior.
      let geometryContinuationGuard = false;
      if (state.sourceProfile === "cloud-iowan" && prev && !largeGap && !scene && !chapterish && !centered) {
        const prevText = stripItalicMarkers(String(prev.text || "")).trim();
        const currentText = stripItalicMarkers(String(text || "")).trim();
        const prevHasTerminal = /[.!?…][”"'’)]*$/.test(prevText);
        const beginsLowercase = /^[a-z]/.test(currentText);
        const beginsDialogue = /^[“"‘']/.test(currentText);
        const prevBottom = Number(prev.box?.y) + Number(prev.box?.h);
        const sourceGap = Number(line.box?.y) - prevBottom;
        const verticallyAdjacent = Number.isFinite(sourceGap) && sourceGap >= -6 && sourceGap <= Math.max(typicalH * 0.72, 30);
        geometryContinuationGuard = !prevHasTerminal && beginsLowercase && !beginsDialogue && verticallyAdjacent;
      }

      const continuationGuard = syntaxContinuationGuard || geometryContinuationGuard;
      const geometricStart = largeGap || stronglyIndented || (indented && text.length > 1);
      const startsParagraph = !current.length || scene || chapterish || centered || (geometricStart && !continuationGuard);

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

    state.cropPreviewIndex = clamp(Number(state.cropPreviewIndex) || 0, 0, state.files.length - 1);
    const file = state.files[state.cropPreviewIndex];
    const img = await loadImageFromFile(file);
    const crop = getCropSettings(img);
    const maxW = 1000;
    const scale = Math.min(1, maxW / crop.sw);
    const c = els.previewCanvas;
    c.width = Math.round(crop.sw * scale);
    c.height = Math.round(crop.sh * scale);
    const ctx = c.getContext("2d", { alpha: false });
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, c.width, c.height);
    els.previewDims.textContent = `${crop.sw} × ${crop.sh} px`;
    if (els.previewSample) els.previewSample.textContent = `Sample ${state.cropPreviewIndex + 1} of ${state.files.length} · ${file.name}`;
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

  // v36: normalize straight OCR dialogue quotes without changing wording.
  // Opening quotes are recognized only at a true text/whitespace/open-punctuation
  // boundary; every remaining straight double quote is a closing quote. This
  // fixes mixed pairs such as “She's totally checking me out." while preserving
  // apostrophes, em dashes, ellipses, and manual curly quotes already present.
  function normalizeDialogueQuoteTypography(text) {
    return String(text || "")
      .replace(/(^|[\s([{—–])"(?=\S)/gmu, "$1“")
      .replace(/"/g, "”");
  }

  function cleanBodyText(text) {
    const cleaned = (text || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return normalizeDialogueQuoteTypography(cleaned);
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
      page.text = applyProfileKnownOcrCleanup(page.text).text;
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

    // v2.7.61 lifecycle fix: italics are formatting evidence from OCR geometry,
    // not a side effect of Guided Repair. Commit them immediately once the full
    // OCR batch and paragraph profile exist, so an EPUB exported before Repair
    // contains the same detected emphasis as one exported afterward.
    let initialItalics = null;
    try {
      initialItalics = await autoScanItalics({ rebuildText: false });
    } catch (err) {
      console.warn("Initial italic scan after OCR failed", err);
    }

    state.currentPageIndex = 0;
    state.reviewMode = "chapters";
    saveCheckpoint();
    renderReview();
    refreshParagraphRebuildUi();
    const chapters = state.pages.filter(page => page.chapterStart).length;
    const italicNote = initialItalics
      ? ` Italics committed at OCR completion: ${initialItalics.markedRuns} run${initialItalics.markedRuns === 1 ? "" : "s"}.`
      : "";
    setStatus(`Batch OCR complete: ${state.pages.length} pages processed. Book-level paragraph profile applied automatically. Strict chapter detection found ${chapters} chapter start page${chapters === 1 ? "" : "s"} for review.${italicNote}`);
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
    ["kay", "Okay"], ["ucker's", "Tucker's"], ["ou", "You"]
  ]);

  const COMMON_DROPCAP_PHRASES = [
    { pattern: /^e suck\b/i, missing: "W", replace: text => text.replace(/^e\b/i, "We") },
    { pattern: /^couple days\b/i, missing: "A", replace: text => `A ${text}` },
    { pattern: /^few days after\b/i, missing: "A", replace: text => `A ${text}` },
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
    if (!proposedWord || /[“"]/.test(info?.prefix || "")) return value;

    // A decorative opening quote often disappears with the drop cap. Restore it
    // only when the paragraph itself contains strong evidence that the opening
    // clause is dialogue: a closing quote followed by a dialogue attribution.
    // This generalizes the earlier This/I-tell special case to openings such as
    // "You really didn't have to do this," Grace's father insists...
    const attribution = /[”"]\s+(?:(?:I|he|she)\s+|(?:[A-Z][\p{L}’'-]*(?:'s|’s)?(?:\s+[A-Z][\p{L}’'-]*)?)\s+)(?:say|says|said|ask|asks|asked|tell|tells|told|reply|replies|replied|answer|answers|answered|insist|insists|insisted|murmur|murmurs|murmured|whisper|whispers|whispered|add|adds|added|explain|explains|explained|admit|admits|admitted|announce|announces|announced)\b/iu;
    const early = value.slice(0, 280);
    if (attribution.test(early) && /^[A-Z]/u.test(value)) {
      return `"${value}`;
    }
    return value;
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
    const head = text.slice(0, firstWordEnd);
    const tail = text.slice(firstWordEnd);

    // v2.7.64: CloudLibrary decorative initials are often recovered from raw
    // geometry rather than a reconstructed text token. Once the semantic
    // initial has been restored, remove one later standalone copy of that same
    // glyph from the paragraph. This prevents shapes such as “R Hearing...”
    // or “Y hood...” from surviving alongside the corrected opening.
    if (["token", "line", "geometry-line", "raw-geometry"].includes(fragment.source)) {
      const cleanedTail = tail
        .replace(new RegExp(`(^|\\s)[“”"'‘’]?${escaped}[“”"'‘’]?(?=\\s|[.,!?;:]|$)`, "u"), "$1")
        .replace(/ {2,}/g, " ");
      return head + cleanedTail;
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

  function compositeDropcapPrefixRepair(opening) {
    // v2.7.66 CloudLibrary/Iowan: Paddle often returns the oversized opening
    // glyph as its own OCR item, but paragraph reconstruction can still place
    // it directly before the lowercase remainder: “S he's..., “Y ou..., etc.
    // Treat that as one logical opening only when raw geometry proves that the
    // single capital is a tall, left-side decorative glyph beside the remainder.
    if (state.sourceProfile !== "cloud-iowan" || state.importedEpub) return null;
    const text = String(opening?.text || "");
    const match = text.match(/^([“"'‘’]?)([A-Z])\s+(\p{Ll}[\p{Ll}’'-]*)(\b|(?=[,.;:!?]))/u);
    if (!match) return null;

    const [, prefix, initial, remainderWord] = match;
    const page = opening?.page;
    const items = (Array.isArray(page?.rawOcrItems) && page.rawOcrItems.length
      ? page.rawOcrItems : (Array.isArray(page?.layoutLines) ? page.layoutLines : []))
      .map(item => ({
        text: String(item?.text || "").trim(),
        box: item?.box ? {
          x:Number(item.box.x), y:Number(item.box.y), w:Number(item.box.w), h:Number(item.box.h),
          cx:Number(item.box.cx), cy:Number(item.box.cy)
        } : null
      }))
      .filter(item => item.text && item.box && [item.box.x,item.box.y,item.box.w,item.box.h,item.box.cx,item.box.cy].every(Number.isFinite));
    if (!items.length) return null;

    const typicalH = median(items.map(item => item.box.h).filter(h => h > 2)) || 28;
    const target = items.find(item => {
      const t = item.text.replace(/^[“”"'‘’([{—–-]+/u, "").toLowerCase();
      return t.startsWith(remainderWord.toLowerCase());
    });
    const glyph = items.find(item => {
      const stripped = item.text.replace(/[“”"'‘’]/gu, "").trim();
      if (stripped !== initial || item === target) return false;
      if (!target) return item.box.h >= typicalH * 1.55;
      const leftGap = target.box.x - (item.box.x + item.box.w);
      const verticalOverlap = Math.max(0,
        Math.min(item.box.y + item.box.h, target.box.y + target.box.h * 2.8) -
        Math.max(item.box.y, target.box.y - target.box.h * 1.3));
      return item.box.h >= typicalH * 1.45 && item.box.x < target.box.x &&
        leftGap >= -typicalH * 0.8 && leftGap <= typicalH * 4.5 && verticalOverlap > 0;
    });
    if (!glyph || !target) return null;

    let replacementHead;
    const lowerRemainder = remainderWord.toLowerCase();
    // An opening article/pronoun A/I remains a separate word. This protects
    // the known CloudLibrary shape "A few days..." from becoming "Afew".
    if ((initial === "A" && /^(?:few|couple)\b/i.test(remainderWord)) ||
        (initial === "I" && /^(?:am|have|had|was|will|can|do|did|don't|dont)\b/i.test(remainderWord))) {
      replacementHead = `${initial} ${remainderWord}`;
    } else {
      replacementHead = `${initial}${remainderWord}`;
    }

    const quote = prefix ? '"' : '';
    const consumed = match[0].length;
    const proposed = `${quote}${replacementHead}${text.slice(consumed)}`
      .replace(/^"([A-Z])\s+(?=\p{Ll})/u, '"$1');

    return {
      proposed,
      initial,
      remainderWord: lowerRemainder,
      fragment: {
        value: initial, source: "raw-geometry", distance: 0, geometryScore: 20,
        geometry: { targetText: target.text, targetBox: target.box, fragmentBox: glyph.box, typicalH, raw: true }
      }
    };
  }

  function applyCloudIowanQuotedDropcapOwnership(pageIndexes = null) {
    // v2.7.67: perform the quoted decorative-initial ownership repair directly
    // on chapter-start text before Dropcap Rescue builds review candidates.
    // This is intentionally narrow: CloudLibrary/Iowan only, quoted composite
    // initials only, and only when saved geometry proves the capital is a tall
    // left-side glyph beside the lowercase remainder.
    if (state.sourceProfile !== "cloud-iowan" || state.importedEpub) return 0;
    const allowed = pageIndexes ? new Set(pageIndexes) : null;
    let fixed = 0;

    state.pages.forEach((page, pageIndex) => {
      if (allowed && !allowed.has(pageIndex)) return;
      if (!(page?.chapterStart || page?.chapterCandidate || pageIndex === 0)) return;

      const opening = openingFromPage(page, pageIndex);
      if (!opening) return;
      const text = String(opening.text || "");
      const match = text.match(/^([“"'‘’])([A-Z])\s+(\p{Ll}[\p{Ll}’'-]*)(\b|(?=[,.;:!?]))/u);
      if (!match) return;

      const [, prefix, initial, remainderWord] = match;
      const items = (Array.isArray(page.rawOcrItems) && page.rawOcrItems.length
        ? page.rawOcrItems : (Array.isArray(page.layoutLines) ? page.layoutLines : []))
        .map(item => ({
          text:String(item?.text || "").trim(),
          box:item?.box ? {
            x:Number(item.box.x), y:Number(item.box.y), w:Number(item.box.w), h:Number(item.box.h),
            cx:Number(item.box.cx), cy:Number(item.box.cy)
          } : null
        }))
        .filter(item => item.text && item.box &&
          [item.box.x,item.box.y,item.box.w,item.box.h,item.box.cx,item.box.cy].every(Number.isFinite));
      if (!items.length) return;

      const typicalH = median(items.map(item => item.box.h).filter(h => h > 2)) || 28;
      const target = items.find(item => {
        const normalized = item.text.replace(/^[“”"'‘’([{—–-]+/u, "").toLowerCase();
        return normalized.startsWith(remainderWord.toLowerCase());
      });
      if (!target) return;

      const glyph = items.find(item => {
        const stripped = item.text.replace(/[“”"'‘’]/gu, "").trim();
        if (stripped !== initial || item === target) return false;
        const leftGap = target.box.x - (item.box.x + item.box.w);
        const overlapsY = item.box.y <= target.box.y + target.box.h * 1.5 &&
          (item.box.y + item.box.h) >= target.box.y - target.box.h * 0.5;
        return item.box.h >= typicalH * 1.45 && item.box.x < target.box.x &&
          leftGap >= -typicalH * 1.0 && leftGap <= typicalH * 4.5 && overlapsY;
      });
      if (!glyph) return;

      // Preserve the source quote style and consume only the artificial space
      // between the decorative initial and the lowercase remainder.
      const consumed = match[0].length;
      const repairedOpening = `${prefix}${initial}${remainderWord}${text.slice(consumed)}`;
      const replacement = opening.fullText && opening.startOffset > 0
        ? `${opening.fullText.slice(0, opening.startOffset)}${repairedOpening}`
        : repairedOpening;

      const pseudoCandidate = {
        ...opening,
        text: opening.text,
        before: opening.fullText || opening.text,
        fragment: { value: initial, source:"raw-geometry" }
      };
      if (replaceLocalParagraph(pseudoCandidate, replacement)) fixed += 1;
    });

    return fixed;
  }

  function buildDropcapCandidate(opening, id, { legacyRetry = false } = {}) {
    const composite = compositeDropcapPrefixRepair(opening);
    if (composite) {
      return {
        id, ...opening,
        info: firstWordInfo(opening.text),
        fragment: composite.fragment,
        confidence: "high",
        reason: `Raw Paddle geometry shows decorative “${composite.initial}” as a tall left-side glyph beside the lowercase opening remainder. Studio will treat them as one logical opening character.`,
        before: opening.fullText || opening.text,
        proposed: opening.fullText && opening.startOffset > 0
          ? `${opening.fullText.slice(0, opening.startOffset)}${composite.proposed}`
          : composite.proposed,
        status: "pending",
        rawDiagnostic: dropcapRawDiagnostic(opening)
      };
    }

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
    if (!canvas || !box) return { italic: false, slant: 0, gain: 0, shear: 0, shearStrength: 0 };
    const padX = 2, padY = 1;
    const x0 = Math.max(0, Math.floor(box.x - padX));
    const y0 = Math.max(0, Math.floor(box.y - padY));
    const w = Math.min(canvas.width - x0, Math.max(8, Math.ceil(box.w + padX * 2)));
    const h = Math.min(canvas.height - y0, Math.max(8, Math.ceil(box.h + padY * 2)));
    if (w < 20 || h < 10) return { italic: false, slant: 0, gain: 0, shear: 0, shearStrength: 0 };
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
    if (darkCount < Math.max(40, w * h * 0.01)) return { italic: false, slant: 0, gain: 0, shear: 0, shearStrength: 0 };
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

    // v2.8.0 CloudLibrary/Iowan: overlap-gain is weak on Iowan Old Style,
    // especially for short inline emphasis. Add an independent shear signal
    // from the horizontal movement of each ink row's center. The signal is
    // intentionally exported even when it is not strong enough to mark text so
    // the frozen benchmark can calibrate future builds without another OCR pass.
    const rowCenters = [];
    for (let y = 0; y < h; y++) {
      if (rows[y].length < 2) continue;
      const center = rows[y].reduce((a,x)=>a+x,0) / rows[y].length;
      rowCenters.push({ y, center });
    }
    let shear = 0;
    if (rowCenters.length >= 6) {
      const third = Math.max(2, Math.floor(rowCenters.length / 3));
      const top = median(rowCenters.slice(0, third).map(r=>r.center));
      const bottom = median(rowCenters.slice(-third).map(r=>r.center));
      const topY = median(rowCenters.slice(0, third).map(r=>r.y));
      const bottomY = median(rowCenters.slice(-third).map(r=>r.y));
      const dy = Math.max(1, bottomY - topY);
      shear = (top - bottom) / dy;
    }
    const shearStrength = Math.abs(shear);

    // v37 Iowan calibration: export additional shape measurements so the frozen
    // corpus can compare known italic spans with adjacent roman text. These are
    // diagnostic features only and never create formatting.
    const inkDensity = darkCount / Math.max(1, w * h);
    const occupiedRows = rows.filter(xs => xs.length);
    const rowWidths = occupiedRows.map(xs => Math.max(...xs) - Math.min(...xs) + 1);
    const medianRowWidth = median(rowWidths);
    const upperRows = occupiedRows.slice(0, Math.max(1, Math.floor(occupiedRows.length / 2)));
    const lowerRows = occupiedRows.slice(Math.floor(occupiedRows.length / 2));
    const widthOf = xs => xs.length ? Math.max(...xs) - Math.min(...xs) + 1 : 0;
    const upperMedianWidth = median(upperRows.map(widthOf));
    const lowerMedianWidth = median(lowerRows.map(widthOf));
    const topBottomWidthRatio = lowerMedianWidth ? upperMedianWidth / lowerMedianWidth : 0;
    const edgeSeries = rowCenters.map(({y}) => {
      const xs = rows[y];
      return xs?.length ? { y, left:Math.min(...xs), right:Math.max(...xs) } : null;
    }).filter(Boolean);
    const edgeShear = key => {
      if (edgeSeries.length < 6) return 0;
      const third = Math.max(2, Math.floor(edgeSeries.length / 3));
      const top = median(edgeSeries.slice(0, third).map(r=>r[key]));
      const bottom = median(edgeSeries.slice(-third).map(r=>r[key]));
      const topY = median(edgeSeries.slice(0, third).map(r=>r.y));
      const bottomY = median(edgeSeries.slice(-third).map(r=>r.y));
      return (top - bottom) / Math.max(1, bottomY - topY);
    };
    const leftEdgeShear = edgeShear('left');
    const rightEdgeShear = edgeShear('right');
    const aspectRatio = w / Math.max(1, h);

    // Build 45 positive-control instrumentation. These richer shape features are
    // diagnostic-only. They are exported for known Iowan italic spans and their
    // local roman neighbors; they never create <i> markup.
    const bandOccupancy = [0,1,2,3].map(band => {
      const ya = Math.floor(h * band / 4), yb = Math.max(ya + 1, Math.floor(h * (band + 1) / 4));
      let ink = 0, total = Math.max(1, (yb - ya) * w);
      for (let y=ya; y<yb; y++) ink += rows[y]?.length || 0;
      return ink / total;
    });
    const edgeBandMedian = (key, band) => {
      const ya = h * band / 3, yb = h * (band + 1) / 3;
      return median(edgeSeries.filter(r => r.y >= ya && r.y < yb).map(r => r[key]));
    };
    const leftEdgeBands = [0,1,2].map(b => edgeBandMedian('left', b));
    const rightEdgeBands = [0,1,2].map(b => edgeBandMedian('right', b));
    const centerDeltas = [];
    for (let i=1;i<rowCenters.length;i++) {
      const dy = rowCenters[i].y - rowCenters[i-1].y;
      if (dy > 0) centerDeltas.push((rowCenters[i].center-rowCenters[i-1].center)/dy);
    }
    const orientationHistogram = { left:0, neutral:0, right:0 };
    centerDeltas.forEach(d => { if (d < -0.18) orientationHistogram.left++; else if (d > 0.18) orientationHistogram.right++; else orientationHistogram.neutral++; });
    const orientationTotal = Math.max(1, centerDeltas.length);
    Object.keys(orientationHistogram).forEach(k => orientationHistogram[k] /= orientationTotal);
    const activeCols = new Array(w).fill(false);
    for (let x=0;x<w;x++) {
      let n=0; for (let y=0;y<h;y++) if (gray[y*w+x] < threshold) n++;
      activeCols[x] = n >= Math.max(1, Math.floor(h*0.04));
    }
    const columnComponents=[];
    for (let x=0;x<w;) {
      while(x<w && !activeCols[x]) x++; if(x>=w) break;
      const a=x; while(x<w && activeCols[x]) x++; columnComponents.push(x-a);
    }
    const componentWidthMedian = median(columnComponents);
    const componentWidthSpread = columnComponents.length ? Math.max(...columnComponents)-Math.min(...columnComponents) : 0;

    // Conservative by design: this legacy flag still describes only the old
    // overlap-based full-line signal. Iowan inline acceptance happens later.
    const italic = Math.abs(bestSlant) >= 0.12 && gain >= 0.018 && bestScore >= 0.38;
    return { italic, slant: bestSlant, gain, score: bestScore, zeroScore, shear, shearStrength,
      inkDensity, medianRowWidth, upperMedianWidth, lowerMedianWidth, topBottomWidthRatio,
      leftEdgeShear, rightEdgeShear, aspectRatio, bandOccupancy, leftEdgeBands, rightEdgeBands,
      orientationHistogram, componentCount:columnComponents.length, componentWidthMedian, componentWidthSpread };
  }

  function estimateWordBoxes(line) {
    const text = String(line?.text || "");
    const box = line?.box;
    if (!text.trim() || !box || box.w < 12) return [];
    const matches = [...text.matchAll(/[^\s—–]+/g)];
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

  function estimateInkAlignedWordBoxes(canvas, line) {
    const projected = estimateWordBoxes(line);
    if (!projected.length || !canvas || !line?.box) return projected;
    const tokenCount = projected.length;
    const b = line.box;
    const padX = 2, padY = 1;
    const x0 = Math.max(0, Math.floor(b.x - padX));
    const y0 = Math.max(0, Math.floor(b.y - padY));
    const w = Math.min(canvas.width - x0, Math.max(8, Math.ceil(b.w + padX * 2)));
    const h = Math.min(canvas.height - y0, Math.max(8, Math.ceil(b.h + padY * 2)));
    if (w < 20 || h < 10) return projected;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const data = ctx.getImageData(x0, y0, w, h).data;
    let sum = 0;
    const gray = new Uint8Array(w*h);
    for (let i=0,j=0;i<data.length;i+=4,j++) {
      const g = Math.round(data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114);
      gray[j]=g; sum += g;
    }
    const mean = sum / gray.length;
    const threshold = Math.max(70, Math.min(205, mean - 38));
    const active = new Array(w).fill(false);
    const minDark = Math.max(1, Math.floor(h * 0.045));
    for (let x=0;x<w;x++) {
      let dark=0;
      for (let y=0;y<h;y++) if (gray[y*w+x] < threshold) dark++;
      active[x] = dark >= minDark;
    }
    // Bridge tiny internal glyph gaps, but keep real inter-word whitespace.
    for (let x=1;x<w-1;x++) {
      if (!active[x] && active[x-1] && active[x+1]) active[x]=true;
    }
    let clusters=[];
    for (let x=0;x<w;) {
      while (x<w && !active[x]) x++;
      if (x>=w) break;
      let a=x;
      while (x<w && active[x]) x++;
      clusters.push([a,x-1]);
    }
    if (!clusters.length) return projected;
    // OCR words can contain letters separated by small blank columns. Merge the
    // smallest visual gaps until the number of ink groups matches the OCR token
    // count. If we have fewer groups than tokens, projection is safer.
    while (clusters.length > tokenCount) {
      let best=-1, bestGap=Infinity;
      for (let i=0;i<clusters.length-1;i++) {
        const gap=clusters[i+1][0]-clusters[i][1]-1;
        if (gap < bestGap) { bestGap=gap; best=i; }
      }
      if (best < 0) break;
      clusters.splice(best,2,[clusters[best][0],clusters[best+1][1]]);
    }
    if (clusters.length !== tokenCount) return projected;
    return projected.map((tok,i) => {
      const [a,z]=clusters[i];
      const inset=Math.min(1.5, Math.max(0,(z-a+1)*0.025));
      return { ...tok, box:{
        x:x0+a+inset,
        y:b.y,
        w:Math.max(6,z-a+1-inset*2),
        h:b.h
      }};
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

  function groupItalicRuns(scored, lineResult, lineText, surroundingLineResults = [], profile = "") {
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
    const fullLineRelative = surroundingLineResults.length >= 2 &&
      (lineAbsSlant - surroundingAbsSlant >= 0.11 && lineGain - surroundingGain >= 0.0035);
    // v2.7.60 consensus guard: a truly italic full line should not only score
    // as slanted in aggregate; most of its word boxes should lean in the same
    // direction too. This rejects roman lines whose aggregate silhouette happens
    // to mimic italics (the long-lived "Ruthless but beautiful." false positive).
    const lineSign = Math.sign(lineResult?.slant || 0);
    const consensusWords = alphaWords.filter(w =>
      w.candidate && Math.sign(w.slant || 0) === lineSign &&
      Math.abs(w.slant || 0) >= 0.20 && (w.gain || 0) >= 0.0060
    );
    const wordConsensus = alphaWords.length ? consensusWords.length / alphaWords.length : 0;
    const fullLineEvidence = alphaWords.length >= 2 && !allCaps &&
      lineAbsSlant >= 0.23 && lineGain >= 0.0060 && fullLineRelative &&
      wordConsensus >= 0.60 &&
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
        wordConsensus,
        fullLineEvidence:true, accepted:true, route:'full-line' });
      return runs;
    }

    // v2.8.1 recovery: the v2.8.0 CloudLibrary/Iowan shear experiment is
    // diagnostic-only. We still calculate/export per-word shear and shearStrength,
    // but shear must not create italic markup or accepted runs. Keep the code path
    // disabled here so the measurements remain available for supervised calibration
    // without disturbing the pre-2.8 legacy classifier or Kindle/Georgia behavior.
    if (profile === "cloud-iowan" && alphaWords.length >= 2) {
      const lineRoman = alphaWords;
      const baseShear = median(lineRoman.map(w=>Math.abs(w.shear || 0)));
      const candidateWindows = [];
      for (let start = 0; start < scored.length; start++) {
        if ((scored[start]?.letters || 0) < 2) continue;
        for (let len = 2; len <= 5 && start + len <= scored.length; len++) {
          const ws = scored.slice(start, start + len);
          if (ws.some(w => (w.letters || 0) < 2)) continue;
          const shears = ws.map(w => w.shear || 0);
          const absShears = shears.map(Math.abs);
          const avgAbsShear = absShears.reduce((a,b)=>a+b,0) / len;
          const sign = Math.sign(median(shears.filter(v=>Math.abs(v)>=0.02)));
          const signAgree = sign ? shears.filter(v=>Math.sign(v)===sign && Math.abs(v)>=0.06).length / len : 0;
          const outside = scored.filter((_,k)=>k<start || k>=start+len).filter(w=>(w.letters||0)>=2);
          const outsideShear = median(outside.map(w=>Math.abs(w.shear||0)));
          const shearLift = avgAbsShear - outsideShear;
          const avgGain = ws.reduce((a,w)=>a+(w.gain||0),0)/len;
          const avgAbsSlant = ws.reduce((a,w)=>a+Math.abs(w.slant||0),0)/len;
          const typographySupport = avgGain >= 0.0015 || avgAbsSlant >= 0.14;
          const accepted = len >= 2 && signAgree >= 0.66 &&
            avgAbsShear >= Math.max(0.12, baseShear + 0.035) &&
            shearLift >= 0.035 && typographySupport;
          if (accepted) candidateWindows.push({ start, end:start+len-1, len, sign, avgAbsShear, shearLift, avgGain, avgAbsSlant });
        }
      }
      // Prefer the strongest non-overlapping windows.
      candidateWindows.sort((a,b)=>(b.shearLift*2+b.avgAbsShear)-(a.shearLift*2+a.avgAbsShear));
      const occupied = new Set();
      for (const win of candidateWindows) {
        let overlaps = false;
        for (let k=win.start;k<=win.end;k++) if (occupied.has(k)) overlaps = true;
        if (overlaps) continue;
        // Diagnostic-only: record the coherent shear window, but never mark its
        // words italic and never short-circuit the legacy classifier below.
        for (let k=win.start;k<=win.end;k++) occupied.add(k);
        runs.push({ startWord:win.start, endWord:win.end, wordCount:win.len, sign:win.sign,
          avgGain:win.avgGain, avgAbsSlant:win.avgAbsSlant, avgAbsShear:win.avgAbsShear,
          shearLift:win.shearLift, baseShear, accepted:false, diagnosticOnly:true,
          route:'iowan-shear-diagnostic' });
      }
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
      const relativeEvidence = neighbors.length >= 2 && slantLift >= 0.08 && gainLift >= 0.0028;
      const surroundingEvidence = surroundingLineResults.length >= 2 &&
        surroundingSlantLift >= 0.08 && surroundingGainLift >= 0.0028;
      const runCoverage = scored.length ? words.length / scored.length : 0;
      const adaptiveEvidence = relativeEvidence || surroundingEvidence;

      const acceptedLong = words.length >= 3 && runCoverage <= 0.72 &&
        avgGain >= 0.0082 && avgAbsSlant >= 0.21 &&
        slantLift >= 0.10 && gainLift >= 0.0035 && adaptiveEvidence;

      // Short emphasis is extremely common in fiction, including perfectly
      // ordinary words. Classify by strength and local contrast only. A single
      // word must clear both same-line and surrounding-line evidence; a two-word
      // phrase may pass with both moderate signals or one exceptionally strong
      // relative signal. This is intentionally between .56 and .57.
      // v2.7.60: .59's remaining false positives are dominated by isolated
      // ordinary words. Keep one-word emphasis possible, but require an
      // exceptionally strong, two-context typography signal. Multiword runs keep
      // the .59 thresholds because they are already much more stable.
      // v2.7.62 context consensus: isolated one-word italics remain supported,
      // but require a cleaner roman neighborhood in addition to strong geometry.
      const singletonWordIndex = words.length === 1 ? words[0].wordIndex : -999;
      const neighborPool = scored.filter(r =>
        Math.abs((r.wordIndex ?? -999) - singletonWordIndex) <= 2 &&
        (r.wordIndex ?? -999) !== singletonWordIndex
      );
      const neighborRomanCount = neighborPool.filter(r =>
        Math.abs(r.slant || 0) < 0.16 && (r.gain || 0) < 0.0100
      ).length;
      const neighborItalicLikeCount = neighborPool.filter(r =>
        Math.sign(r.slant || 0) === Math.sign((words.reduce((a,w)=>a+(w.slant||0),0) / Math.max(1,words.length)) || 0) &&
        Math.abs(r.slant || 0) >= 0.18 && (r.gain || 0) >= 0.0065
      ).length;
      const singletonContextClean =
        neighborPool.length === 0 ||
        neighborRomanCount >= Math.max(1, neighborItalicLikeCount + 1);

      const acceptedSingleton = words.length === 1 && runCoverage <= 0.28 &&
        avgGain >= 0.0190 && avgAbsSlant >= 0.33 &&
        slantLift >= 0.19 && gainLift >= 0.0085 &&
        surroundingLineResults.length >= 2 &&
        surroundingSlantLift >= 0.17 && surroundingGainLift >= 0.0065 &&
        relativeEvidence && surroundingEvidence && singletonContextClean;

      const pairHasAnchor = words.length === 2 && words.some(w =>
        Math.abs(w.slant || 0) >= 0.28 && (w.gain || 0) >= 0.0120
      );
      const acceptedPair = words.length === 2 && runCoverage <= 0.50 &&
        avgGain >= 0.0108 && avgAbsSlant >= 0.24 &&
        slantLift >= 0.125 && gainLift >= 0.0046 &&
        surroundingLineResults.length >= 2 && pairHasAnchor &&
        ((relativeEvidence && surroundingEvidence &&
          surroundingSlantLift >= 0.10 && surroundingGainLift >= 0.0036) ||
         (slantLift >= 0.165 && gainLift >= 0.0062 &&
          surroundingSlantLift >= 0.085 && surroundingGainLift >= 0.0030));

      const acceptedShort = acceptedSingleton || acceptedPair;
      const accepted = acceptedLong || acceptedShort;

      // v2.7.62 boundary recovery: allow up to two adjacent words per side,
      // but only when each edge word agrees strongly with the accepted run's
      // direction and magnitude.
      let expandedStart = i;
      let expandedEnd = j - 1;
      if (accepted) {
        const edgeEligible = (w) => {
          if (!w || w.letters < 2) return false;
          if (Math.sign(w.slant || 0) !== sign) return false;
          const absSlant = Math.abs(w.slant || 0);
          const gain = w.gain || 0;

          // v2.7.63 expansion safety:
          // an edge word must have its OWN positive italic evidence.
          // Do not allow an accepted neighboring run to "pull in" flat roman text.
          const ownEvidence =
            w.candidate === true &&
            (w.score || 0) >= 0.72 &&
            absSlant >= 0.18 &&
            gain >= 0.0060;

          const agreesWithRun =
            absSlant >= avgAbsSlant * 0.78 &&
            Math.sign(w.slant || 0) === sign;

          const separatesFromRoman =
            (absSlant - surroundingAbsSlant) >= 0.08 &&
            (gain - surroundingGain) >= 0.0030;

          return ownEvidence && agreesWithRun && separatesFromRoman;
        };
        for (let step = 0; step < 2 && expandedStart > 0; step++) {
          if (!edgeEligible(scored[expandedStart - 1])) break;
          expandedStart--;
        }
        for (let step = 0; step < 2 && expandedEnd + 1 < scored.length; step++) {
          if (!edgeEligible(scored[expandedEnd + 1])) break;
          expandedEnd++;
        }
      }
      runs.push({ startWord:expandedStart, endWord:expandedEnd,
        wordCount:expandedEnd - expandedStart + 1, originalStartWord:i, originalEndWord:j-1,
        boundaryExpanded: accepted && (expandedStart !== i || expandedEnd !== j - 1),
        sign, avgGain, avgAbsSlant,
        neighborWordCount:neighbors.length, neighborAbsSlant, neighborGain, slantLift, gainLift,
        surroundingLineCount:surroundingLineResults.length, surroundingAbsSlant, surroundingGain,
        surroundingSlantLift, surroundingGainLift, runCoverage,
        relativeEvidence, surroundingEvidence, fullLineEvidence:false,
        accepted, route:'inline' });
      if (accepted) for (let k=expandedStart;k<=expandedEnd;k++) scored[k].italic = true;
      i = j;
    }
    return runs;
  }

  function italicMeasurementCacheSignature(){
    // v123: cache the measurement schema, not the app build. Hunt-only deploys
    // should not force a full-book pixel remeasurement.
    return `schema1:${state.sourceProfile||"default"}:${state.pages.length}:`+state.pages.map((p,i)=>{const f=p.file||state.files[i];return [String(f?.name||"").replace(/\s*\(\d+\)(?=\.[^.]+$)/,""),Number(f?.size||0),Number(p?.layoutLines?.length||0)].join(":");}).join("|");
  }
  async function restoreCachedItalicMeasurements(){
    try{
      const db=await openItalicLearningDb();
      const stableKey="typeface:"+italicMeasurementCacheSignature();
      const legacySig=`v122:${state.sourceProfile||"default"}:${state.pages.length}:`+state.pages.map((p,i)=>{const f=p.file||state.files[i];return [String(f?.name||"").replace(/\s*\(\d+\)(?=\.[^.]+$)/,""),Number(f?.size||0),Number(p?.layoutLines?.length||0)].join(":");}).join("|");
      const read=key=>new Promise((resolve,reject)=>{const tx=db.transaction(ITALIC_LEARNING_DB_STORE,"readonly"),req=tx.objectStore(ITALIC_LEARNING_DB_STORE).get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});
      let cached=await read(stableKey),migrated=false;
      if(!cached){cached=await read("typeface:"+legacySig);migrated=!!cached;}
      if(!cached||!Array.isArray(cached.pages)||cached.pages.length!==state.pages.length)return false;
      cached.pages.forEach((p,i)=>(p||[]).forEach((m,j)=>{const line=state.pages[i]?.layoutLines?.[j];if(line&&m){line.italicMeta=m.italicMeta||null;line.italicWordMeta=m.italicWordMeta||[];line.italicRunMeta=m.italicRunMeta||[];line.italicText=m.italicText||null;line.italicAuto=!!m.italicAuto;}}));
      const restored=state.pages.some(p=>(p.layoutLines||[]).some(l=>l.italicWordMeta?.length));
      if(restored&&migrated){try{await new Promise((resolve,reject)=>{const tx=db.transaction(ITALIC_LEARNING_DB_STORE,"readwrite");tx.objectStore(ITALIC_LEARNING_DB_STORE).put({...cached,version:124,cacheSchema:1},stableKey);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}catch(_){}}
      return restored;
    }catch(err){console.warn("Could not restore cached typeface measurements",err);return false;}
  }
  async function cacheItalicMeasurements(){
    try{
      const db=await openItalicLearningDb(),key="typeface:"+italicMeasurementCacheSignature();
      const payload={version:124,cacheSchema:1,pages:state.pages.map(p=>(p.layoutLines||[]).map(l=>({italicMeta:l.italicMeta||null,italicWordMeta:l.italicWordMeta||[],italicRunMeta:l.italicRunMeta||[],italicText:l.italicText||null,italicAuto:!!l.italicAuto})))};
      await new Promise((resolve,reject)=>{const tx=db.transaction(ITALIC_LEARNING_DB_STORE,"readwrite");tx.objectStore(ITALIC_LEARNING_DB_STORE).put(payload,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
    }catch(err){console.warn("Could not cache typeface measurements",err);}
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
          setStatus(`Automatic italic scan ${BUILD_VERSION} ${state.sourceProfile === "cloud-iowan" ? "CloudLibrary/Iowan" : "profile"}: page ${index + 1} of ${state.pages.length}…`);
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

          const words = estimateInkAlignedWordBoxes(canvas, line);
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
            // v2.7.58 calibration: .56 was too permissive (736 runs) and
            // .57 too strict (15 runs). Keep the candidate gate moderately
            // permissive, then let the run-level relative evidence do the real
            // filtering. No lexical/common-word blacklist: novels legitimately
            // italicize short function words, so typography must decide.
            const minGain = letters <= 3 ? 0.0085 : 0.0060;
            const minSlant = letters <= 3 ? 0.20 : 0.17;
            const legacyCandidate = letters >= 2 && Math.abs(r.slant) >= minSlant &&
              r.gain >= minGain && r.score >= 0.72;
            // v2.8.1: Iowan shear is diagnostic-only. Do not let shear promote a
            // word into the automatic candidate pool; retain the measurements below.
            const candidate = legacyCandidate;
            return { ...w, ...r, letters, candidate, italic:false };
          });

          // v37 supervised calibration context. Roman/italic separation is likely
          // relative, so preserve same-line neighborhood baselines per word.
          prelim.forEach((word, wi) => {
            const neighbors = prelim.filter((other, oi) => oi !== wi && Math.abs(oi - wi) <= 2 && (other.letters || 0) >= 2);
            word.localNeighborCount = neighbors.length;
            word.localMedianAbsSlant = median(neighbors.map(x=>Math.abs(x.slant || 0)));
            word.localMedianGain = median(neighbors.map(x=>x.gain || 0));
            word.localMedianAbsShear = median(neighbors.map(x=>Math.abs(x.shear || 0)));
            word.localSlantLift = Math.abs(word.slant || 0) - word.localMedianAbsSlant;
            word.localGainLift = (word.gain || 0) - word.localMedianGain;
            word.localShearLift = Math.abs(word.shear || 0) - word.localMedianAbsShear;
          });

          const surroundingLineResults = [];
          for (const delta of [-2,-1,1,2]) {
            const otherIndex = lineIndex + delta;
            if (otherIndex < 0 || otherIndex >= page.layoutLines.length) continue;
            const otherText = String(page.layoutLines[otherIndex]?.text || '').trim();
            if (!otherText || isSceneMarkerText(otherText) || /^[^a-z]*[A-Z][^a-z]*$/.test(otherText)) continue;
            surroundingLineResults.push(lineScores[otherIndex]);
          }
          const runs = groupItalicRuns(prelim, lineResult, text, surroundingLineResults, state.sourceProfile);
          // v37: CloudLibrary/Iowan is a supervised calibration corpus. No
          // automatic route, legacy or shear, may create <i> markup yet. Keep
          // every candidate/run and measurement for analysis, but force the
          // formatting decision off. Kindle/Georgia and other profiles are unchanged.
          if (state.sourceProfile === "cloud-iowan") {
            prelim.forEach(word => { word.italic = false; });
            runs.forEach(run => {
              if (run.accepted) run.wouldAcceptLegacy = true;
              run.accepted = false;
              run.diagnosticOnly = true;
            });
          }
          line.italicRunMeta = runs;
          line.italicWordMeta = prelim.map(({text,start,end,box,letters,candidate,italic,slant,gain,score,zeroScore,shear,shearStrength,inkDensity,medianRowWidth,upperMedianWidth,lowerMedianWidth,topBottomWidthRatio,leftEdgeShear,rightEdgeShear,aspectRatio,bandOccupancy,leftEdgeBands,rightEdgeBands,orientationHistogram,componentCount,componentWidthMedian,componentWidthSpread,localNeighborCount,localMedianAbsSlant,localMedianGain,localMedianAbsShear,localSlantLift,localGainLift,localShearLift}) => ({text,start,end,box,letters,candidate,italic,slant,gain,score,zeroScore,shear,shearStrength,inkDensity,medianRowWidth,upperMedianWidth,lowerMedianWidth,topBottomWidthRatio,leftEdgeShear,rightEdgeShear,aspectRatio,bandOccupancy,leftEdgeBands,rightEdgeBands,orientationHistogram,componentCount,componentWidthMedian,componentWidthSpread,localNeighborCount,localMedianAbsSlant,localMedianGain,localMedianAbsShear,localSlantLift,localGainLift,localShearLift}));
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
      await cacheItalicMeasurements();
      if (els.italicStatus) els.italicStatus.textContent = `${markedRuns} run${markedRuns === 1 ? "" : "s"} · ${markedWords} words`;
      setStatus(`Automatic italic scan ${BUILD_VERSION} checked ${scannedWords} words across ${scannedLines} OCR lines and marked ${markedRuns} hybrid run${markedRuns === 1 ? "" : "s"} (${markedWords} words). Formatting evidence was projected onto ${projectedItalicPages} current page${projectedItalicPages === 1 ? "" : "s"} without rebuilding repaired text.`);
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

  function downloadItalicDiagnostics(shouldDownload = true) {const __popNow=()=>globalThis.performance?.now?.()??Date.now(),__popT0=__popNow();let __popLast=__popT0;const __popTiming={};const __popMark=n=>{const q=__popNow();__popTiming[n]=Math.round((q-__popLast)*10)/10;__popLast=q;};
    // Build 94: independently instrument the large pre-supervised setup bucket.
    // This timer does not disturb the existing population stage timings.
    let __setupLast=__popT0; const __setupTiming={};
    const __setupMark=n=>{const q=__popNow();__setupTiming[n]=Math.round((q-__setupLast)*10)/10;__setupLast=q;};
    const _itNow=()=>globalThis.performance?.now?.()??Date.now(),_itT0=_itNow();let _itLast=_itT0;const _itDeep={};const _itMark=n=>{const q=_itNow();_itDeep[n]=Math.round((q-_itLast)*10)/10;_itLast=q;};
    
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
    __setupMark("extractAndRankMs");

    // v39 calibration shortlist: compare each word with the roman texture of its
    // own OCR line. Raw shear proved too noisy to lead the ranking in v38, so v39
    // adds robust line-normalized deltas (median + MAD) and a neighbor-consistency
    // bonus. This is still diagnostic-only: it cannot create italic formatting.
    const median = values => {
      const a = values.filter(Number.isFinite).sort((x,y) => x-y);
      if (!a.length) return 0;
      const m = Math.floor(a.length / 2);
      return a.length % 2 ? a[m] : (a[m-1] + a[m]) / 2;
    };
    const robustZ = (value, values) => {
      const med = median(values);
      const mad = median(values.map(v => Math.abs(v - med)));
      return { median: med, mad, z: mad > 1e-6 ? (value - med) / (1.4826 * mad) : 0 };
    };
    const lineGroups = new Map();
    words.forEach(word => {
      const key = `${word.pageIndex ?? word.pageNumber ?? 0}:${word.lineIndex ?? 0}`;
      if (!lineGroups.has(key)) lineGroups.set(key, []);
      lineGroups.get(key).push(word);
    });
    const calibrationWords = words.map(word => {
      const key = `${word.pageIndex ?? word.pageNumber ?? 0}:${word.lineIndex ?? 0}`;
      const peers = lineGroups.get(key) || [];
      const slant = Math.abs(Number(word.slant || 0));
      const gain = Number(word.gain || 0);
      const shear = Math.abs(Number((word.shearStrength ?? word.shear) || 0));
      const density = Number(word.inkDensity || 0);
      const edgeDelta = Math.abs(Number(word.leftEdgeShear || 0) - Number(word.rightEdgeShear || 0));
      const widthRatioDelta = Math.abs(Number(word.topBottomWidthRatio || 1) - 1);
      const slantNorm = robustZ(slant, peers.map(x => Math.abs(Number(x.slant || 0))));
      const gainNorm = robustZ(gain, peers.map(x => Number(x.gain || 0)));
      const shearNorm = robustZ(shear, peers.map(x => Math.abs(Number((x.shearStrength ?? x.shear) || 0))));
      const densityNorm = robustZ(density, peers.map(x => Number(x.inkDensity || 0)));
      const localSlantLift = Number(word.localSlantLift || 0);
      const localGainLift = Number(word.localGainLift || 0);
      const localShearLift = Number(word.localShearLift || 0);
      const wi = Number(word.wordIndex || 0);
      const neighbors = peers.filter(x => Math.abs(Number(x.wordIndex || 0) - wi) === 1);
      const neighborSignal = neighbors.length ? median(neighbors.map(x =>
        Math.max(0, Number(x.localSlantLift || 0)) * 3.0 +
        Math.max(0, Number(x.localGainLift || 0)) * 45.0
      )) : 0;
      // Slant/gain lead. Shear is deliberately only a weak corroborator after v38.
      // Structural measurements remain exported, but do not yet decide formatting.
      const calibrationScore =
        Math.max(0, localSlantLift) * 3.5 +
        Math.max(0, localGainLift) * 50.0 +
        Math.max(0, slantNorm.z) * 0.18 +
        Math.max(0, gainNorm.z) * 0.22 +
        Math.max(0, shearNorm.z) * 0.025 +
        Math.min(Math.max(0, neighborSignal), 1.5) * 0.12 +
        Math.min(edgeDelta, 10) * 0.005 +
        Math.min(widthRatioDelta, 1) * 0.02;
      return {
        ...word,
        calibrationScore,
        calibrationLineNormalized: {
          peerCount: peers.length,
          slant: slantNorm,
          gain: gainNorm,
          shear: shearNorm,
          inkDensity: densityNorm,
          neighborSignal,
        },
        calibrationStructural: { density, edgeDelta, widthRatioDelta, localSlantLift, localGainLift, localShearLift }
      };
    }).sort((a,b) => b.calibrationScore - a.calibrationScore)
      .map((word, index) => ({ ...word, calibrationRank: index + 1 }));
    __setupMark("calibrationWordsMs");


    // Build 49: generic style-sensitive local typography-change diagnostics.
    // Keep glyph/content-sensitive measurements available for diagnostics, but
    // do NOT let letter identity (aspect, component count/width, raw occupancy)
    // dominate the primary typography-change ranking. Production logic remains
    // book/corpus/text agnostic and this pass is diagnostic-only.
    const typographyFeatureVector = w => {
      const occ = Array.isArray(w.bandOccupancy) ? w.bandOccupancy : [];
      const left = Array.isArray(w.leftEdgeBands) ? w.leftEdgeBands : [];
      const right = Array.isArray(w.rightEdgeBands) ? w.rightEdgeBands : [];
      const hist = w.orientationHistogram || {};
      return [
        Math.abs(Number(w.slant || 0)), Number(w.gain || 0),
        Math.abs(Number((w.shearStrength ?? w.shear) || 0)), Number(w.inkDensity || 0),
        Number(w.topBottomWidthRatio || 0), Number(w.leftEdgeShear || 0), Number(w.rightEdgeShear || 0),
        ...[0,1,2,3].map(i=>Number(occ[i]||0)),
        ...[0,1,2].map(i=>Number(left[i]||0)), ...[0,1,2].map(i=>Number(right[i]||0)),
        Number(hist.left||0), Number(hist.neutral||0), Number(hist.right||0),
        Number(w.componentCount||0), Number(w.componentWidthMedian||0), Number(w.componentWidthSpread||0)
      ];
    };
    const typographyFeatureNames = [
      "absSlant","gain","absShear","inkDensity","topBottomWidthRatio","leftEdgeShear","rightEdgeShear",
      "occupancy0","occupancy1","occupancy2","occupancy3",
      "leftEdge0","leftEdge1","leftEdge2","rightEdge0","rightEdge1","rightEdge2",
      "orientationLeft","orientationNeutral","orientationRight",
      "componentCount","componentWidthMedian","componentWidthSpread"
    ];
    // Style-sensitive dimensions drive v49 ranking. Raw density/occupancy and
    // component geometry remain exported as secondary evidence only.
    const styleFeatureIndexes = [0,1,2,4,5,6,11,12,13,14,15,16,17,18,19];
    const vecMean = vs => vs.length ? vs[0].map((_,i)=>vs.reduce((a,v)=>a+Number(v[i]||0),0)/vs.length) : [];
    const featureScale = (peers, idx) => {
      const vals=peers.map(w=>typographyFeatureVector(w)[idx]).filter(Number.isFinite);
      const med=median(vals), mad=median(vals.map(v=>Math.abs(v-med)));
      return Math.max(1e-4, 1.4826*mad, Math.abs(med)*0.035);
    };
    const typographyChangeWindows=[];
    if (state.italicReviewSelectionMode!=="hunt" || shouldDownload) lineGroups.forEach((peers,key)=>{
      const ordered=[...peers].sort((a,b)=>Number(a.wordIndex||0)-Number(b.wordIndex||0));
      if(ordered.length<2) return;
      const vectors=ordered.map(typographyFeatureVector);
      const dims=vectors[0]?.length||0;
      const scales=Array.from({length:dims},(_,i)=>featureScale(ordered,i));
      for(let start=0;start<ordered.length;start++){
        for(let len=1;len<=Math.min(6,ordered.length-start);len++){
          const end=start+len;
          const contextIdx=[];
          for(let i=Math.max(0,start-3);i<start;i++) contextIdx.push(i);
          for(let i=end;i<Math.min(ordered.length,end+3);i++) contextIdx.push(i);
          if(!contextIdx.length) continue;
          const runMean=vecMean(vectors.slice(start,end));
          const ctxMean=vecMean(contextIdx.map(i=>vectors[i]));
          const deltas=runMean.map((v,i)=>(v-ctxMean[i])/scales[i]);
          const styleAbs=styleFeatureIndexes.map(i=>Math.abs(deltas[i]||0)).sort((a,b)=>b-a);
          const styleTop=styleAbs.slice(0,Math.min(7,styleAbs.length)).map(x=>Math.min(x,6));
          const styleChangeMagnitude=styleTop.length?styleTop.reduce((a,b)=>a+b,0)/styleTop.length:0;
          const coherentStyleDimensions=styleFeatureIndexes.filter(i=>Math.abs(deltas[i]||0)>=1.25).length;
          // Retain the old all-feature magnitude only as a diagnostic comparison.
          const allAbs=deltas.map(Math.abs).sort((a,b)=>b-a);
          const allTop=allAbs.slice(0,Math.min(8,allAbs.length)).map(x=>Math.min(x,6));
          const allFeatureChangeMagnitude=allTop.length?allTop.reduce((a,b)=>a+b,0)/allTop.length:0;

          const internalVectors=vectors.slice(start,end);
          let internalConsistency=1;
          let directionalConsistency=1;
          if(internalVectors.length>1){
            const deviations=internalVectors.map(v=>styleFeatureIndexes.reduce((a,i)=>a+Math.min(Math.abs((v[i]-runMean[i])/scales[i]),6),0)/styleFeatureIndexes.length);
            internalConsistency=1/(1+median(deviations));
            // Reward multiword spans only when their words move in the SAME
            // direction from local Roman context across style-sensitive axes.
            const votes=styleFeatureIndexes.map(i=>{
              const ctx=ctxMean[i], scale=scales[i];
              const ds=internalVectors.map(v=>(v[i]-ctx)/scale).filter(Number.isFinite);
              if(!ds.length) return 0;
              const pos=ds.filter(d=>d>=0.6).length, neg=ds.filter(d=>d<=-0.6).length;
              return Math.max(pos,neg)/ds.length;
            });
            directionalConsistency=votes.length?votes.reduce((a,b)=>a+b,0)/votes.length:0;
          }
          const runBonus=len>=2 ? Math.min(0.65,(len-1)*0.13)*internalConsistency*directionalConsistency : 0;
          const singletonPenalty=len===1 ? 0.90 : 1;
          const typographyChangeScore=styleChangeMagnitude*(0.62+0.23*internalConsistency+0.15*directionalConsistency)*singletonPenalty+runBonus;
          typographyChangeWindows.push({
            pageIndex:ordered[0].pageIndex,pageNumber:ordered[0].pageNumber,fileName:ordered[0].fileName,
            lineIndex:ordered[0].lineIndex,startWordIndex:ordered[start].wordIndex,endWordIndex:ordered[end-1].wordIndex,
            wordCount:len,text:ordered.slice(start,end).map(w=>w.text).join(' '),
            leftContext:ordered.slice(Math.max(0,start-3),start).map(w=>w.text).join(' '),
            rightContext:ordered.slice(end,Math.min(ordered.length,end+3)).map(w=>w.text).join(' '),
            fullLineText:ordered.map(w=>w.text).join(' '),contextWordCount:contextIdx.length,
            typographyChangeScore,styleChangeMagnitude,allFeatureChangeMagnitude,internalConsistency,directionalConsistency,
            coherentStyleDimensions,styleFeatureNames:styleFeatureIndexes.map(i=>typographyFeatureNames[i]),
            normalizedStyleFeatureDeltas:Object.fromEntries(styleFeatureIndexes.map(i=>[typographyFeatureNames[i],deltas[i]])),
            normalizedFeatureDeltas:deltas
          });
        }
      }
    });
    typographyChangeWindows.sort((a,b)=>b.typographyChangeScore-a.typographyChangeScore)
      .forEach((r,i)=>r.typographyChangeRank=i+1);
    __setupMark("typographyChangeWindowsMs");


    // Build 50: corpus-generic glyph-composition-matched baseline experiment.
    // Compare a rendered token only with OTHER occurrences of the same OCR token
    // in the document. This removes most letter-identity/word-shape confounding
    // without using any known italic answers, pages, phrases, or book-specific data.
    // Diagnostic-only: it cannot mark or alter italics.
    const normalizeTypographyToken = text => String(text || "")
      .normalize("NFKC").toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    const allTypographyWords = Array.from(lineGroups.values()).flat();
    const tokenOccurrenceMap = new Map();
    allTypographyWords.forEach(w => {
      const token = normalizeTypographyToken(w.text);
      if (!token) return;
      if (!tokenOccurrenceMap.has(token)) tokenOccurrenceMap.set(token, []);
      tokenOccurrenceMap.get(token).push(w);
    });
    const matchedWordEvidence = new Map();
    // v95: this entire same-token glyph-matched pass is diagnostic-only and was
    // consuming ~9 minutes on a 204-page book before Hunt could render. It has
    // never contributed to production review ranking, learned probabilities, or
    // automatic italic decisions. Build it only for an explicit diagnostics
    // download; normal Learned/Random/Hunt/Validation queue construction skips it.
    if (shouldDownload) allTypographyWords.forEach(w => {
      const token = normalizeTypographyToken(w.text);
      const occurrences = (tokenOccurrenceMap.get(token) || []).filter(o => o !== w);
      if (occurrences.length < 2) return; // require at least 3 total observations
      const v = typographyFeatureVector(w);
      const peerVecs = occurrences.map(typographyFeatureVector);
      const baseline = vecMean(peerVecs);
      const deltas = styleFeatureIndexes.map(i => {
        const vals = peerVecs.map(x => Number(x[i] || 0));
        const med = median(vals), mad = median(vals.map(x => Math.abs(x-med)));
        const scale = Math.max(1e-4, 1.4826*mad, Math.abs(med)*0.035);
        return {i, z:(Number(v[i]||0)-baseline[i])/scale};
      });
      const abs = deltas.map(d=>Math.min(Math.abs(d.z),6)).sort((a,b)=>b-a);
      const top = abs.slice(0,Math.min(7,abs.length));
      const magnitude = top.length ? top.reduce((a,b)=>a+b,0)/top.length : 0;
      const coherent = deltas.filter(d=>Math.abs(d.z)>=1.25).length;
      matchedWordEvidence.set(w,{token,peerCount:occurrences.length,magnitude,coherent,
        deltas:Object.fromEntries(deltas.map(d=>[typographyFeatureNames[d.i],d.z]))});
    });
    const glyphMatchedTypographyWindows=[];
    if (shouldDownload) lineGroups.forEach(peers => {
      const ordered=[...peers].sort((a,b)=>Number(a.wordIndex||0)-Number(b.wordIndex||0));
      for(let start=0;start<ordered.length;start++){
        for(let len=1;len<=Math.min(6,ordered.length-start);len++){
          const wordsInRun=ordered.slice(start,start+len);
          const evidence=wordsInRun.map(w=>matchedWordEvidence.get(w)).filter(Boolean);
          if(!evidence.length) continue;
          const coverage=evidence.length/len;
          const mags=evidence.map(e=>e.magnitude);
          const base=mags.reduce((a,b)=>a+b,0)/mags.length;
          const coherentMean=evidence.reduce((a,e)=>a+e.coherent,0)/evidence.length;
          // A run gets extra confidence from multiple independently matched words,
          // but sparse coverage cannot masquerade as a fully corroborated phrase.
          const corroboration=1+Math.min(0.45,Math.max(0,evidence.length-1)*0.15);
          const coverageWeight=0.55+0.45*coverage;
          const score=base*corroboration*coverageWeight;
          glyphMatchedTypographyWindows.push({
            pageIndex:ordered[0].pageIndex,pageNumber:ordered[0].pageNumber,fileName:ordered[0].fileName,
            lineIndex:ordered[0].lineIndex,startWordIndex:ordered[start].wordIndex,endWordIndex:ordered[start+len-1].wordIndex,
            wordCount:len,text:wordsInRun.map(w=>w.text).join(' '),
            leftContext:ordered.slice(Math.max(0,start-3),start).map(w=>w.text).join(' '),
            rightContext:ordered.slice(start+len,Math.min(ordered.length,start+len+3)).map(w=>w.text).join(' '),
            fullLineText:ordered.map(w=>w.text).join(' '),
            glyphMatchedScore:score,matchedWordCount:evidence.length,matchedCoverage:coverage,
            matchedTokens:evidence.map(e=>({token:e.token,peerCount:e.peerCount,magnitude:e.magnitude,coherentStyleDimensions:e.coherent,normalizedStyleFeatureDeltas:e.deltas})),
            baselineMethod:"same-normalized-token/other-document-occurrences/min-3-total"
          });
        }
      }
    });
    glyphMatchedTypographyWindows.sort((a,b)=>b.glyphMatchedScore-a.glyphMatchedScore)
      .forEach((r,i)=>r.glyphMatchedRank=i+1);
    __setupMark("glyphMatchedTypographyMs");

    // v40 supervised calibration: rank contiguous multiword runs using the v39
    // word scores. True book italics are commonly phrases/runs, while noisy
    // roman outliers are often isolated. This remains diagnostic-only.
    const calibrationByKey = new Map(calibrationWords.map(w =>
      [`${w.pageIndex ?? w.pageNumber ?? 0}:${w.lineIndex ?? 0}:${w.wordIndex ?? 0}`, w]));
    const calibrationRuns = [];
    lineGroups.forEach((peers, key) => {
      const ordered = [...peers].sort((a,b) => Number(a.wordIndex||0) - Number(b.wordIndex||0));
      const ranked = ordered.map(w => calibrationByKey.get(`${w.pageIndex ?? w.pageNumber ?? 0}:${w.lineIndex ?? 0}:${w.wordIndex ?? 0}`) || w);
      // Build windows of 1–6 adjacent words. Exporting the windows lets QA compare
      // known visual italic spans directly with neighboring roman phrases.
      for (let start=0; start<ranked.length; start++) {
        for (let len=1; len<=Math.min(6, ranked.length-start); len++) {
          const ws=ranked.slice(start,start+len);
          const scores=ws.map(w=>Number(w.calibrationScore||0));
          const positive=scores.filter(x=>x>0);
          const avg=scores.reduce((a,b)=>a+b,0)/len;
          const min=Math.min(...scores), max=Math.max(...scores);
          const continuity=positive.length/len;
          const multiwordBonus=len>=2 ? Math.min(0.45,(len-1)*0.09)*continuity : 0;
          const runCalibrationScore=avg + Math.max(0,min)*0.20 + multiwordBonus;
          calibrationRuns.push({
            pageIndex:ws[0].pageIndex, pageNumber:ws[0].pageNumber, fileName:ws[0].fileName,
            lineIndex:ws[0].lineIndex, startWordIndex:ws[0].wordIndex, endWordIndex:ws[ws.length-1].wordIndex,
            wordCount:len, text:ws.map(w=>w.text).join(' '), runCalibrationScore,
            averageWordScore:avg, minimumWordScore:min, maximumWordScore:max, positiveWordFraction:continuity,
            words:ws.map(w=>({wordIndex:w.wordIndex,text:w.text,calibrationRank:w.calibrationRank,calibrationScore:w.calibrationScore}))
          });
        }
      }
    });
    calibrationRuns.sort((a,b)=>b.runCalibrationScore-a.runCalibrationScore)
      .forEach((r,i)=>r.runCalibrationRank=i+1);
    __setupMark("calibrationRunsMs");

    // v44 supervised calibration sampler. v43 proved that requiring current
    // italic-correlated corroboration is too strict for Iowan: useful calibration
    // examples can have weak/zero slant, gain, or shear support. Build a diverse
    // HUMAN-LABEL review set instead. Density is still length-aware/capped so
    // tiny glyphs cannot monopolize ranking, but no glyph class is banned.
    // This remains diagnostic-only and never creates <i> markup.
    const alphaCount = text => (String(text || "").match(/[A-Za-z]/g) || []).length;
    const structuralWordScore = w => {
      const c=w.calibrationStructural||{};
      const n=w.calibrationLineNormalized||{};
      const letters=alphaCount(w.text);
      const densityZ=Math.abs(Number(n.inkDensity?.z||0));
      const densityCap=letters<=1?0.07:letters===2?0.12:0.22;
      const density=Math.min(densityZ*0.014,densityCap);
      const edge=Math.min(Math.abs(Number(c.edgeDelta||0)),10)/10;
      const width=Math.min(Math.abs(Number(c.widthRatioDelta||0)),1);
      const slantSupport=Math.max(0,Number(c.localSlantLift||w.localSlantLift||0));
      const gainSupport=Math.max(0,Number(c.localGainLift||w.localGainLift||0));
      const shearSupport=Math.max(0,Number(c.localShearLift||w.localShearLift||0));
      return density + edge*0.30 + width*0.24 +
        Math.min(slantSupport*1.5,0.22) + Math.min(gainSupport*24,0.18) +
        Math.min(shearSupport*0.008,0.04);
    };
    const wordCorroboration = w => {
      const c=w.calibrationStructural||{};
      let signals=0;
      if(Math.max(0,Number(c.localSlantLift||w.localSlantLift||0))>=0.035) signals++;
      if(Math.max(0,Number(c.localGainLift||w.localGainLift||0))>=0.0035) signals++;
      if(Math.max(0,Number(c.localShearLift||w.localShearLift||0))>=2.0) signals++;
      if(Math.abs(Number(c.edgeDelta||0))>=0.08) signals++;
      if(Math.abs(Number(c.widthRatioDelta||0))>=0.08) signals++;
      return signals;
    };
    __setupMark("supervisedPrepMs");
    _itMark("beforeSupervisedMs");
    __popMark("setupMs");
    const supervisedRuns=[];
    lineGroups.forEach((peers,key)=>{
      const ordered=[...peers].sort((a,b)=>Number(a.wordIndex||0)-Number(b.wordIndex||0));
      const ranked=ordered.map(w=>calibrationByKey.get(`${w.pageIndex ?? w.pageNumber ?? 0}:${w.lineIndex ?? 0}:${w.wordIndex ?? 0}`)||w);
      for(let start=0;start<ranked.length;start++){
        for(let len=1;len<=Math.min(5,ranked.length-start);len++){
          const ws=ranked.slice(start,start+len);
          const letters=ws.reduce((a,w)=>a+alphaCount(w.text),0);
          if(letters<1) continue;
          const structural=ws.map(structuralWordScore);
          const structuralAvg=structural.reduce((a,b)=>a+b,0)/len;
          const structuralMin=Math.min(...structural);
          const slantSupport=ws.reduce((a,w)=>a+Math.max(0,Number(w.calibrationStructural?.localSlantLift||w.localSlantLift||0)),0)/len;
          const gainSupport=ws.reduce((a,w)=>a+Math.max(0,Number(w.calibrationStructural?.localGainLift||w.localGainLift||0)),0)/len;
          const shearSupport=ws.reduce((a,w)=>a+Math.max(0,Number(w.calibrationStructural?.localShearLift||w.localShearLift||0)),0)/len;
          const consistency=structural.filter(x=>x>=0.10).length/len;
          const corroboration=ws.reduce((a,w)=>a+wordCorroboration(w),0);
          // Do NOT gate on corroboration. The human labels are what teach us which
          // feature combinations matter. Only discard completely information-free
          // spans, while retaining short I/A/a examples when they carry signal.
          if(structuralAvg<0.015 && corroboration===0) continue;
          const contextBonus=len>=2?Math.min(0.22,(len-1)*0.055)*(0.35+consistency*0.65):0;
          const supervisedScore=structuralAvg + Math.max(0,structuralMin)*0.10 +
            consistency*0.10 + Math.min(slantSupport*1.0,0.12) +
            Math.min(gainSupport*16,0.12) + Math.min(shearSupport*0.004,0.02) + contextBonus;
          const left=ranked.slice(Math.max(0,start-3),start).map(w=>w.text).join(' ');
          const right=ranked.slice(start+len,Math.min(ranked.length,start+len+3)).map(w=>w.text).join(' ');
          const kind=len>=2?'multiword':letters<=1?'short-single':'lexical-single';
          supervisedRuns.push({
            pageIndex:ws[0].pageIndex,pageNumber:ws[0].pageNumber,fileName:ws[0].fileName,lineIndex:ws[0].lineIndex,
            startWordIndex:ws[0].wordIndex,endWordIndex:ws[ws.length-1].wordIndex,wordCount:len,
            text:ws.map(w=>w.text).join(' '),leftContext:left,rightContext:right,fullLineText:ranked.map(w=>w.text).join(' '),
            reviewBox:(()=>{ const boxes=ws.map(w=>w.box).filter(Boolean); if(!boxes.length) return null; const x=Math.min(...boxes.map(b=>b.x)); const y=Math.min(...boxes.map(b=>b.y)); const r=Math.max(...boxes.map(b=>b.x+b.w)); const bt=Math.max(...boxes.map(b=>b.y+b.h)); return {x,y,w:r-x,h:bt-y}; })(),
            supervisedScore,structuralAverage:structuralAvg,structuralMinimum:structuralMin,structuralConsistency:consistency,
            slantSupport,gainSupport,shearSupport,corroborationSignals:corroboration,sampleKind:kind,
            words:ws.map((w,i)=>({wordIndex:w.wordIndex,text:w.text,structuralScore:structural[i],
              inkDensityZ:w.calibrationLineNormalized?.inkDensity?.z||0,edgeDelta:w.calibrationStructural?.edgeDelta||0,
              widthRatioDelta:w.calibrationStructural?.widthRatioDelta||0,localSlantLift:w.calibrationStructural?.localSlantLift||w.localSlantLift||0,
              localGainLift:w.calibrationStructural?.localGainLift||w.localGainLift||0,localShearLift:w.calibrationStructural?.localShearLift||w.localShearLift||0,
              corroborationSignals:wordCorroboration(w)}))
          });
        }
      }
    });
    // Build 56: positive-example hunt. The older supervised pool intentionally
    // discarded visually quiet words, which means an italic the hand-built detector
    // failed to notice could never be reviewed. Add a spoiler-safe singleton for
    // EVERY OCR word that has a box. This is generic typography acquisition only:
    // no word text, book location, or known answer influences eligibility/ranking.
    const supervisedSingletonKeys=new Set(supervisedRuns.filter(r=>r.wordCount===1)
      .map(r=>`${r.pageIndex}:${r.lineIndex}:${r.startWordIndex}`));
    calibrationWords.forEach(w=>{
      const sk=`${w.pageIndex}:${w.lineIndex}:${w.wordIndex}`;
      if(supervisedSingletonKeys.has(sk) || !w.box) return;
      const structural=structuralWordScore(w);
      supervisedRuns.push({
        pageIndex:w.pageIndex,pageNumber:w.pageNumber,fileName:w.fileName,lineIndex:w.lineIndex,
        startWordIndex:w.wordIndex,endWordIndex:w.wordIndex,wordCount:1,text:w.text||"",
        leftContext:"",rightContext:"",fullLineText:"",reviewBox:{...w.box},
        supervisedScore:structural,structuralAverage:structural,structuralMinimum:structural,structuralConsistency:structural>=0.10?1:0,
        slantSupport:Math.max(0,Number(w.calibrationStructural?.localSlantLift||w.localSlantLift||0)),
        gainSupport:Math.max(0,Number(w.calibrationStructural?.localGainLift||w.localGainLift||0)),
        shearSupport:Math.max(0,Number(w.calibrationStructural?.localShearLift||w.localShearLift||0)),
        corroborationSignals:wordCorroboration(w),sampleKind:alphaCount(w.text)<=1?'short-single':'lexical-single',
        words:[{wordIndex:w.wordIndex,text:w.text||"",structuralScore:structural,
          inkDensityZ:w.calibrationLineNormalized?.inkDensity?.z||0,edgeDelta:w.calibrationStructural?.edgeDelta||0,
          widthRatioDelta:w.calibrationStructural?.widthRatioDelta||0,localSlantLift:w.calibrationStructural?.localSlantLift||w.localSlantLift||0,
          localGainLift:w.calibrationStructural?.localGainLift||w.localGainLift||0,localShearLift:w.calibrationStructural?.localShearLift||w.localShearLift||0,
          corroborationSignals:wordCorroboration(w)}]
      });
      supervisedSingletonKeys.add(sk);
    });

    // Build 59: learned-vs-random review. Learned mode ranks the entire unseen
    // generic OCR specimen population using only saved visual typography labels.
    // Random mode remains available as the unbiased bootstrap/fallback path.
    const profile=currentItalicLearningProfile();
    const learnedExamples=(profile.examples||[]).filter(x=>Array.isArray(x.vector)&&x.vector.length===ITALIC_FEATURE_NAMES.length);
    const sessionSignature=checkpointSignature().map(signatureFileName).join("|");
    const trainedById=new Map(learnedExamples.map(x=>[String(x.id||""),x]));
    const previouslyTrainedIds=new Set(trainedById.keys());
    // v83: persisted example IDs contain the session signature plus the physical
    // OCR coordinates. File names/session signatures can legitimately change when
    // the same saved sample is reloaded, and the candidate builder can represent a
    // reviewed word as a different-sized window. Index labels by page/line/start
    // word as well as exact ID so retrospective validation can reconnect to the
    // physical specimen without depending on either of those unstable details.
    const physicalTrainingKeyFromId=id=>{
      const tail=String(id||"").split("::").pop()||"";
      const m=tail.match(/^(\d+):(\d+):(\d+):(\d+)$/);
      return m?`${m[1]}:${m[2]}:${m[3]}`:null;
    };
    const physicalRunKey=run=>`${run.pageIndex}:${run.lineIndex}:${run.startWordIndex}`;
    const trainedByPhysical=new Map();
    for(const ex of learnedExamples){
      const k=physicalTrainingKeyFromId(ex.id);
      if(k && !trainedByPhysical.has(k)) trainedByPhysical.set(k,ex);
    }

    // v86 performance surgery: do NOT run the learned classifier across every
    // overlapping legacy window. A typical book can create ~76k windows that
    // collapse to only ~3k physical specimens. Training suppression/validation
    // attachment need IDs only; learned probability is computed once later,
    // after eligibility + physical-word dedupe, on the specimens review can
    // actually surface. This preserves ranking behavior while removing the
    // dominant O(legacy-windows × learner) cost measured in v85.
    supervisedRuns.forEach(run=>{
      const sid=`${sessionSignature}::${italicCalibrationKey(run)}`;
      const trainedExact=trainedById.get(sid);
      const trainedPhysical=trainedByPhysical.get(physicalRunKey(run));
      run.alreadyTrained=previouslyTrainedIds.has(sid)||!!trainedPhysical;
      // Ground truth is attached only as evaluation metadata. No production score,
      // eligibility rule, or rank reads validationLabel.
      if(state.italicReviewSelectionMode==="validation"){
        const trained=trainedExact||trainedPhysical;
        run.validationLabel=(trained?.label==="ITALIC"||trained?.label==="ROMAN")?trained.label:null;
        run.validationMatch=trainedExact?"exact-id":(trainedPhysical?"physical-word":null);
      } else {
        run.validationLabel=null;
        run.validationMatch=null;
      }
    });

    _itMark("supervisedBuildMs");
    __popMark("candidateGenerationMs");
    const eligibleRuns=supervisedRuns.filter(r=>{
      const validationMode=state.italicReviewSelectionMode==="validation";
      if((!validationMode && r.alreadyTrained) || !r.reviewBox || (!validationMode && state.italicCalibrationLabels[italicCalibrationKey(r)])) return false;
      const text=String(r.text||r.words?.map(w=>w?.text||"").join(" ")||"").normalize("NFKC");
      // Review/training requires real alphanumeric content. Punctuation may ride
      // along with text, but punctuation/symbol-only crops never enter any mode.
      return /[\p{L}\p{N}]/u.test(text);
    });

    // Context is hidden evidence for the physical word, not a competing review
    // card. Normal Hunt therefore remains spoiler-safe and single-word-first.
    const hiddenContextByWord=new Map();
    for(const span of supervisedRuns){
      const wc=Math.max(1,Number(span.wordCount||0),Math.abs(Number(span.endWordIndex)-Number(span.startWordIndex))+1);
      if(wc<2)continue;
      const continuity=Math.max(0,Math.min(1,Number(span.structuralConsistency||0)));
      // A generated overlapping window is not evidence by itself. Require every
      // word in the span to carry the existing structural signal so ordinary
      // prose does not receive a near-universal context bonus.
      if(continuity<1||Number(span.structuralMinimum||0)<.10)continue;
      const phraseBonus=Math.min(.055,.014*(wc-1))*(.45+.55*continuity);
      for(const wordKey of italicCalibrationWordKeys(span)){
        const prior=hiddenContextByWord.get(wordKey);
        if(!prior||phraseBonus>prior.phraseBonus)hiddenContextByWord.set(wordKey,{phraseBonus,spanWordCount:wc,structuralConsistency:continuity,source:"overlapping-run"});
      }
    }

    // Build 65: deduplicate BEFORE learned ranking/random shuffle.
    // The legacy candidate builder intentionally creates many overlapping windows
    // around the same OCR words. Review needs one physical OCR specimen, not every
    // possible window containing it.
    _itMark("eligibleFilterMs");
    __popMark("eligibilityMs");
    const dedupedByPhysicalWord=new Map();
    eligibleRuns.forEach(run=>{
      const wordKeys=italicCalibrationWordKeys(run);
      // Prefer a single-word specimen. Multiword windows are kept only when there
      // is no single-word representation for their first physical word.
      const physicalKey=wordKeys.length ? wordKeys[0] : italicCalibrationKey(run);
      const current=dedupedByPhysicalWord.get(physicalKey);
      if(!current){
        dedupedByPhysicalWord.set(physicalKey,run);
        return;
      }
      const currentKeys=italicCalibrationWordKeys(current);
      const runSingle=wordKeys.length===1, currentSingle=currentKeys.length===1;
      if(runSingle && !currentSingle){
        dedupedByPhysicalWord.set(physicalKey,run);
        return;
      }
      if(runSingle===currentSingle){
        // For equivalent representations keep the tighter crop, then stronger
        // typography measurement as a deterministic tie-breaker.
        const area=r=>Math.max(1,Number(r.reviewBox?.w??r.reviewBox?.width??0))*Math.max(1,Number(r.reviewBox?.h??r.reviewBox?.height??0));
        const a=area(run), b=area(current);
        if(a<b || (a===b && Number(run.supervisedScore||0)>Number(current.supervisedScore||0))){
          dedupedByPhysicalWord.set(physicalKey,run);
        }
      }
    });
    _itMark("dedupeMs");
    __popMark("dedupeMs");
    const supervisedReviewSet=[...dedupedByPhysicalWord.values()];
    supervisedReviewSet.forEach(run=>{
      const wordKey=italicCalibrationWordKeys(run)[0];
      run.hiddenContext=hiddenContextByWord.get(wordKey)||{phraseBonus:0,spanWordCount:1,structuralConsistency:0,source:null};
    });
    // v70: score only unique physical OCR specimens, never the overlapping legacy windows.
    // v89: split the old reviewOrdering bucket around the learned-probability pass.
    // v87-v88 showed ~105 s here even in Hunt, while Hunt's own scorer took only
    // ~150 ms. These marks intentionally change no ranking or learning behavior.
    const __learnedProbT0=__popNow();
    if(state.italicReviewSelectionMode!=="hunt"){
      supervisedReviewSet.forEach(run=>{ run.learnedItalicProbability=cachedItalicLearnedProbability(run); });
    }
    const __learnedProbT1=__popNow();
    __popTiming.learnedProbabilityPassMs=Math.round((__learnedProbT1-__learnedProbT0)*10)/10;
    __popLast=__learnedProbT1;

    if((state.italicReviewSelectionMode==="learned"||state.italicReviewSelectionMode==="validation") && learnedExamples.filter(x=>x.label==="ITALIC").length>=2){
      _itMark("scoreAndPrepMs");
      const __learnedSortT0=__popNow();
    supervisedReviewSet.sort((a,b)=>{
        const ap=Number.isFinite(a.learnedItalicProbability)?a.learnedItalicProbability:-1;
        const bp=Number.isFinite(b.learnedItalicProbability)?b.learnedItalicProbability:-1;
        const aUnsupportedSingle=italicGlyphClassFromRun(a).startsWith("single:") && ap<=0.01;
        const bUnsupportedSingle=italicGlyphClassFromRun(b).startsWith("single:") && bp<=0.01;
        if(aUnsupportedSingle!==bUnsupportedSingle) return aUnsupportedSingle?1:-1;
        if(bp!==ap) return bp-ap;
        return Number(b.supervisedScore||0)-Number(a.supervisedScore||0);
      });
      const __learnedSortT1=__popNow();
      __popTiming.learnedReviewSortMs=Math.round((__learnedSortT1-__learnedSortT0)*10)/10;
      const __reasonT0=__popNow();
      supervisedReviewSet.forEach(r=>r.activeLearningReason="learned-ranked");
      __popTiming.reviewReasonPrepMs=Math.round((__popNow()-__reasonT0)*10)/10;
    } else if(state.italicReviewSelectionMode==="hunt") {
      // v88 performance surgery: Hunt immediately replaces this provisional
      // order with its own scored/diversified acquisition order below. The old
      // bootstrap path nevertheless performed one crypto.getRandomValues call
      // per specimen (~2.9k calls), which v87 measured as ~105 seconds in this
      // browser. Skipping that throwaway shuffle changes no Hunt ranking or
      // eligibility; it only removes work whose result was never consumed.
      const __reasonT0=__popNow();
      supervisedReviewSet.forEach(r=>r.activeLearningReason="hunt-pending");
      __popTiming.reviewReasonPrepMs=Math.round((__popNow()-__reasonT0)*10)/10;
    } else {
      // Preserve the unbiased random-bootstrap behavior for Standard review.
      // Use one cryptographic seed instead of thousands of synchronous crypto
      // calls, then Fisher-Yates with a tiny deterministic PRNG.
      let seed=(Date.now()>>>0)^0x9e3779b9;
      if(globalThis.crypto?.getRandomValues){
        const a=new Uint32Array(1); globalThis.crypto.getRandomValues(a); seed=a[0]>>>0;
      }
      const rand=()=>{ seed=(seed+0x6D2B79F5)|0; let t=seed; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; };
      for(let i=supervisedReviewSet.length-1;i>0;i--){
        const j=Math.floor(rand()*(i+1));
        [supervisedReviewSet[i],supervisedReviewSet[j]]=[supervisedReviewSet[j],supervisedReviewSet[i]];
      }
      supervisedReviewSet.forEach(r=>r.activeLearningReason="random-bootstrap");
    }
    const __reviewOrderEnd=__popNow();
    __popTiming.reviewOrderingResidualMs=Math.round((__reviewOrderEnd-__popLast)*10)/10;
    __popTiming.reviewOrderingMs=Math.round((__reviewOrderEnd-__learnedProbT0)*10)/10;
    __popLast=__reviewOrderEnd;
    // v81 validation bridge: preserve comparable ranks for all three review paths
    // over the same deduplicated specimen population. These ranks are diagnostic
    // only and never feed ground-truth answers back into production detection.
    const standardOrder=[...supervisedReviewSet].sort((a,b)=>Number(b.supervisedScore||0)-Number(a.supervisedScore||0));
    standardOrder.forEach((r,i)=>r.validationStandardRank=i+1);
    const learnedOrder=[...supervisedReviewSet].sort((a,b)=>{
      const ap=Number.isFinite(a.learnedItalicProbability)?a.learnedItalicProbability:-1;
      const bp=Number.isFinite(b.learnedItalicProbability)?b.learnedItalicProbability:-1;
      return bp!==ap?bp-ap:Number(b.supervisedScore||0)-Number(a.supervisedScore||0);
    });
    learnedOrder.forEach((r,i)=>r.validationLearnedRank=i+1);

    __popMark("validationOrdersMs");
    if(state.italicReviewSelectionMode==="hunt"||state.italicReviewSelectionMode==="validation"){
      const __huntT0=(globalThis.performance?.now?.()??Date.now());
      // v81: validation executes the exact Hunt acquisition path too, so one
      // control-label pass can measure Standard, Learned, and Hunt together. Keep the existing
      // learned labels intact, but avoid spending review time on low-information
      // glyph/ornament crops and avoid the old O(queue * picked * target) selector.
      const labeled=(profile.examples||[]).filter(x=>
        (x.label==="ITALIC"||x.label==="ROMAN") &&
        Array.isArray(x.vector) && x.vector.length===ITALIC_FEATURE_NAMES.length
      );
      const positives=labeled.filter(x=>x.label==="ITALIC");
      const negatives=labeled.filter(x=>x.label==="ROMAN");
      const persistedGlyphs=(profile.examples||[]).filter(x=>x.label==="GLYPH");
      const persistedFragments=(profile.examples||[]).filter(x=>x.label==="FRAGMENT");
      // v123: normalize legacy specimen text too. Older labels may not have
      // normalizedText, which allowed already-reviewed words to reappear.
      const normalizedStoredText=x=>String(x?.normalizedText||x?.text||x?.specimenText||"")
        .normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
      const knownTexts=new Set([
        ...labeled.map(normalizedStoredText),
        ...persistedGlyphs.map(normalizedStoredText),
        ...persistedFragments.map(normalizedStoredText)
      ].filter(Boolean));
      const huntDiag={seen:0,idRejected:0,splitRejected:0,lexicalRejected:0,textRejected:0,shapeRejected:0,accepted:0,top:[],preRankingAudit:{samples:{id:[],split:[],lexical:[],text:[],shape:[]}}};
      const auditReject=(kind,r,extra={})=>{
        const a=huntDiag.preRankingAudit.samples[kind];
        if(Array.isArray(a)&&a.length<50) a.push({text:italicNormalizedSpecimenText(r),pageIndex:r.pageIndex,lineIndex:r.lineIndex,startWordIndex:r.startWordIndex,endWordIndex:r.endWordIndex,wordCount:r.wordCount,reviewBox:r.reviewBox||null,...extra});
      };
      const currentSessionSignature=checkpointSignature().map(signatureFileName).join("|");
      const knownSpecimenIds=new Set((profile.examples||[]).map(x=>String(x.id||"")).filter(Boolean));
      const seenTexts=new Set(), candidates=[];
      // v96: suppress likely OCR-split word fragments before Hunt ranking. A
      // fragment is only rejected when an immediately adjacent OCR token on the
      // same line is essentially touching it, which is strong evidence that OCR
      // divided one printed word into multiple boxes. Keep ordinary short words.
      const lineWordLookup=new Map();
      for(const [lineKey,peers] of lineGroups.entries()){
        const byIndex=new Map();
        for(const w of peers) byIndex.set(Number(w.wordIndex),w);
        lineWordLookup.set(lineKey,byIndex);
      }
      const likelySplitOcrFragment=r=>{
        if(Number(r.wordCount||1)!==1) return false;
        const raw=String(r.text||"").normalize("NFKC");
        if(!/\p{L}/u.test(raw)) return false;
        const key=`${r.pageIndex}:${r.lineIndex}`, byIndex=lineWordLookup.get(key);
        if(!byIndex) return false;
        const w=byIndex.get(Number(r.startWordIndex));
        if(!w?.box) return false;
        const b=w.box, h=Math.max(1,Number(b.h||b.height||0));
        const left=byIndex.get(Number(r.startWordIndex)-1), right=byIndex.get(Number(r.startWordIndex)+1);
        const alpha=x=>/\p{L}/u.test(String(x?.text||""));
        const gapLeft=left?.box ? Number(b.x||0)-(Number(left.box.x||0)+Number(left.box.w||left.box.width||0)) : Infinity;
        const gapRight=right?.box ? Number(right.box.x||0)-(Number(b.x||0)+Number(b.w||b.width||0)) : Infinity;
        const letters=(raw.match(/\p{L}/gu)||[]).length;
        // v123: short OCR shards can have a slightly wider artificial gap than
        // the old 8% threshold. Keep normal words conservative.
        const touching=Math.max(2,h*(letters<=4?.18:.08));
        return (alpha(left)&&gapLeft<=touching)||(alpha(right)&&gapRight<=touching);
      };
      for(const r of supervisedReviewSet){
        huntDiag.seen++;
        const text=italicNormalizedSpecimenText(r);
        const persistedId=`${currentSessionSignature}::${italicCalibrationKey(r)}`;
        if(state.italicReviewSelectionMode!=="validation" && knownSpecimenIds.has(persistedId)){huntDiag.idRejected++;continue;}
        if(likelySplitOcrFragment(r)){huntDiag.splitRejected++;auditReject("split",r);continue;}
        // v115: keep Hunt focused on useful lexical training specimens. Single
        // letters have repeatedly become Unsure, and tiny alphabetic fragments
        // are low-value unless they look like ordinary short words.
        const rawToken=String(r.text||"").normalize("NFKC").trim();
        const rawLetters=(rawToken.match(/\p{L}/gu)||[]);
        if(Number(r.wordCount||1)===1 && rawLetters.length<=1){huntDiag.lexicalRejected++;continue;}
        if(Number(r.wordCount||1)===1 && rawLetters.length<=3 && /[^\p{L}'’\-]/u.test(rawToken)){huntDiag.lexicalRejected++;continue;}
        if(Number(r.wordCount||1)===1 && (/^[’'\-]/u.test(rawToken)||/[’'\-]$/u.test(rawToken))){huntDiag.lexicalRejected++;continue;}
        if(Number(r.wordCount||1)===1){
          const rb=r.box||r.words?.[0]?.box, wb=r.words?.[0]?.box;
          if(rb&&wb&&Number(wb.w)>0){
            const coverage=Math.min(1,Number(rb.w||0)/Number(wb.w||1));
            if(coverage<0.72){huntDiag.shapeRejected++;continue;}
          }
        }
        // v139: typography is occurrence-specific. Do NOT suppress a specimen
        // merely because the same normalized word appeared or was trained elsewhere.
        // "Sydney" in Roman and "Sydney" in italic are different visual evidence.
        // Exact specimen/location dedupe remains handled by the stable specimen-id
        // gates upstream; already-reviewed exact specimens remain excluded there.
        // Keep textRejected as a diagnostic counter, but lexical text itself is no
        // longer an eligibility gate.
        const letterCount=(text.match(/\p{L}/gu)||[]).length;
        if(letterCount<2){huntDiag.lexicalRejected++;auditReject("lexical",r,{letterCount});continue;}
        // v80: reject tiny OCR labels attached to very wide, shallow crops. These
        // are commonly flourishes/rules/ornaments that OCR hallucinates as two
        // letters. Longer lexical specimens remain eligible regardless of shape.
        const bw=Math.max(1,Number(r.reviewBox?.w||r.reviewBox?.width||0));
        const bh=Math.max(1,Number(r.reviewBox?.h||r.reviewBox?.height||0));
        if(letterCount<=2 && bw/bh>=3.25){huntDiag.shapeRejected++;auditReject("shape",r,{letterCount,aspectRatio:bw/bh});continue;}
        candidates.push(r); huntDiag.accepted++;
      }

      // v128 funnel diagnostic: replay every persisted known italic control through
      // the production Hunt eligibility gates without changing ranking. This tells
      // validation which gate would suppress a promising positive.
      const knownItalicFunnel={total:0,accepted:0,rejected:{missingBox:0,fragment:0,shape:0,textSeen:0,lexical:0},controls:[]};
      for(const ex of labeled.filter(x=>x.label==="ITALIC")){
        knownItalicFunnel.total++;
        const t=normalizedStoredText(ex);
        let reason="accepted";
        const rb=ex.reviewBox||ex.box||null;
        if(!rb) reason="missingBox";
        else {
          const raw=String(ex.text||ex.specimenText||"");
          const letters=(t.match(/\p{L}/gu)||[]).length;
          if(letters<2) reason="lexical";
          else if(letters<=2 && Math.max(1,Number(rb.w||rb.width||0))/Math.max(1,Number(rb.h||rb.height||0))>=3.25) reason="shape";
        }
        if(reason==="accepted") knownItalicFunnel.accepted++; else knownItalicFunnel.rejected[reason]=(knownItalicFunnel.rejected[reason]||0)+1;
        knownItalicFunnel.controls.push({text:t,reason});
      }
      huntDiag.knownItalicFunnel=knownItalicFunnel;
      huntDiag.preRankingAudit.counts={seen:huntDiag.seen,idRejected:huntDiag.idRejected,splitRejected:huntDiag.splitRejected,lexicalRejected:huntDiag.lexicalRejected,textRejected:huntDiag.textRejected,shapeRejected:huntDiag.shapeRejected,accepted:huntDiag.accepted};
      huntDiag.preRankingAudit.suspectOptimizations=["v96 split-fragment rejection","persisted/exact-text suppression","<2-letter lexical gate","v80 wide-short shape gate"];

      __popMark("huntEligibilityMs");
      // Compute each candidate vector once. Scale estimation only needs a bounded,
      // evenly-spaced sample of the unseen population; scanning every vector into
      // a giant temporary matrix was pure latency and did not improve Hunt labels.
      // v97: Hunt is now Learned acquisition over unseen specimens. Two consecutive
      // full-book Hunt batches (v95 and v96) each found only 1 italic in 50, while
      // the persisted validation set consistently shows Learned concentrating known
      // positives better than the blended Hunt score. Do not second-guess Learned
      // with neighbor resemblance or diversity reshuffling here. Hunt's job is to
      // clean the unseen population, then preserve Learned order.
      const candidateRows=candidates.map(r=>{const v=italicLearningVector(r);r.learnedItalicProbability=cachedItalicLearnedProbability(r);return {r,v};});
      __popMark("huntVectorizeMs");
      // v122: positive-envelope active acquisition. Roman labels outnumber
      // italics ~30:1, so do not let global class probability dominate discovery.
      // Build robust per-feature positive envelopes from the known italic examples,
      // reward candidates inside several italic ranges, then prefer uncertainty
      // among those plausible positives.
      const qstats=(rows,j)=>{const v=rows.map(x=>Number(x.vector?.[j])||0).sort((a,b)=>a-b),q=p=>v.length?v[Math.min(v.length-1,Math.floor((v.length-1)*p))]:0;return {q10:q(.10),q25:q(.25),m:q(.5),q75:q(.75),q90:q(.90),iqr:Math.max(1e-4,q(.75)-q(.25))};};
      const featureIdx=[0,2,3,8,9,10];
      const posStats=Object.fromEntries(featureIdx.map(j=>[j,qstats(positives,j)]));
      candidateRows.forEach(x=>{
        let envelope=0,closeness=0;
        for(const j of featureIdx){
          const s=posStats[j],v=Number(x.v[j])||0,lo=s.q10-0.75*s.iqr,hi=s.q90+0.75*s.iqr;
          if(v>=lo&&v<=hi) envelope++;
          closeness+=Math.exp(-Math.abs(v-s.m)/(1.5*s.iqr));
        }
        const envelopeRatio=envelope/featureIdx.length, closeRatio=closeness/featureIdx.length;
        const learned=Number.isFinite(x.r.learnedItalicProbability)?x.r.learnedItalicProbability:.5;
        const uncertainty=1-Math.min(1,Math.abs(learned-.5)*2);
        x.positiveEnvelopeScore=.58*envelopeRatio+.32*closeRatio+.10*uncertainty;
        x.r.positiveEnvelopeScore=x.positiveEnvelopeScore;
        // v141: learned probability is the primary production signal. Prototype
        // similarity is only a light secondary boost, preventing the short-word
        // prototype avalanche seen in v139-v140.
        const structural=italicFeatureWeightedProbability(x.r);
        x.r.structuralItalicProbability=structural;
        x.huntPositiveScore=.62*learned+.30*structural+.08*x.positiveEnvelopeScore;
        x.robustItalicNudge=structural;
        x.r.huntPositiveScore=x.huntPositiveScore;
        x.r.huntRobustItalicNudge=0;
      });
      const learnedRanked=candidateRows.sort((a,b)=>{
        if(b.huntPositiveScore!==a.huntPositiveScore)return b.huntPositiveScore-a.huntPositiveScore;
        const ap=Number.isFinite(a.r.learnedItalicProbability)?a.r.learnedItalicProbability:-1;
        const bp=Number.isFinite(b.r.learnedItalicProbability)?b.r.learnedItalicProbability:-1;
        if(bp!==ap)return bp-ap;
        return Number(b.r.supervisedScore||0)-Number(a.r.supervisedScore||0);
      });
      // v131 diagnostic: inspect alternative signals on the actual unseen eligible pool.
      const signalTop=(label,scoreFn)=>({label,top50:candidateRows.map(x=>({x,s:Number(scoreFn(x)||0)})).sort((a,b)=>b.s-a.s).slice(0,50).map(z=>({text:italicNormalizedSpecimenText(z.x.r),score:z.s,learnedScore:Number(z.x.huntPositiveScore||0),slant:Number((z.x.v||[])[3]||0),structuralAverage:Number((z.x.v||[])[0]||0),gainSupport:Number((z.x.v||[])[4]||0)}))});
      huntDiag.unseenEligibleSignalStudy=[
        signalTop("learned",x=>x.huntPositiveScore),
        signalTop("slant+gain",x=>Number((x.v||[])[3]||0)+120*Number((x.v||[])[4]||0)),
        signalTop("slant+structuralAverage+gain",x=>Number((x.v||[])[3]||0)+0.5*Number((x.v||[])[0]||0)+120*Number((x.v||[])[4]||0))
      ];
      __popMark("huntScoreMs");
      __popMark("huntSortMs");

      // Preserve Learned order exactly. Exact normalized-text dedupe, persisted
      // Roman/Italic/Glyph suppression, split-fragment rejection, and the >=2-letter
      // eligibility gate were already applied while building candidates above.
      // No diversity pass is allowed to promote a lower-ranked specimen.
      __popMark("huntDiversityMs");
      huntDiag.top=learnedRanked.slice(0,250).map(x=>({text:italicNormalizedSpecimenText(x.r),specimenKey:italicCalibrationKey(x.r),pageIndex:x.r.pageIndex,lineIndex:x.r.lineIndex,startWordIndex:x.r.startWordIndex,endWordIndex:x.r.endWordIndex,wordCount:x.r.wordCount,glyphClass:italicGlyphClassFromRun(x.r),learnedProbability:x.r.learnedItalicProbability,positivePrototypeScore:x.positiveEnvelopeScore,robustItalicNudge:x.robustItalicNudge,huntPositiveScore:x.huntPositiveScore}));
      state.italicHuntDiagnostics=huntDiag;
      const diverse=[],overflow=[],buckets=new Map();
      for(const x of learnedRanked){
        const v=x.v, bucket=[3,8,9,10].map(j=>Math.round((Number(v[j])||0)*8)).join(":");
        const n=buckets.get(bucket)||0;
        if(n<2){diverse.push(x);buckets.set(bucket,n+1);} else overflow.push(x);
      }
      // v142: preserve every occurrence, but serve by lexical rounds so a
      // repeated Roman word cannot occupy the front of Hunt. This is deferral,
      // never deletion: second/third/etc occurrences remain in later rounds.
      // Multi-word runs receive a modest acquisition bonus based on continuity so
      // genuine phrase candidates can compete with singleton words again.
      const acquisitionRows=learnedRanked.map(x=>{
        const phraseTextWords=italicNormalizedSpecimenText(x.r).split(" ").filter(Boolean).length;
        const spanWords=(Number.isFinite(Number(x.r.startWordIndex))&&Number.isFinite(Number(x.r.endWordIndex)))?Math.abs(Number(x.r.endWordIndex)-Number(x.r.startWordIndex))+1:0;
        const wc=Math.max(1,Number(x.r.wordCount||0),phraseTextWords,spanWords);
        x.r.wordCount=wc;
        const phraseBonus=Math.max(0,Number(x.r.hiddenContext?.phraseBonus||0));
        return {...x,phraseBonus,acquisitionScore:Number(x.r.learnedItalicProbability||0)+phraseBonus};
      }).sort((a,b)=>b.acquisitionScore-a.acquisitionScore ||
        Number(b.r.learnedItalicProbability||0)-Number(a.r.learnedItalicProbability||0));
      const lexicalRounds=[],lexicalCounts=new Map();
      for(const x of acquisitionRows){
        const key=italicNormalizedSpecimenText(x.r)||("__specimen__"+italicCalibrationKey(x.r));
        const round=lexicalCounts.get(key)||0;
        lexicalCounts.set(key,round+1);
        if(!lexicalRounds[round]) lexicalRounds[round]=[];
        lexicalRounds[round].push(x);
      }
      const orderedRows=lexicalRounds.flat();
      const orderedRuns=orderedRows.map(x=>x.r);
      // v143: this vocabulary persists for the entire live Hunt session.
      // Re-ranking after each new label must not promote another occurrence of
      // a word already shown until all first-occurrence vocabulary is exhausted.
      state.italicHuntSessionServedTexts=new Set();
      huntDiag.lexicalDiversity={
        policy:"italic-likelihood + modest phrase acquisition; lexical occurrence rounds",
        occurrenceSpecific:true,
        uniqueNormalizedTexts:lexicalCounts.size,
        maxOccurrencesOfOneText:Math.max(0,...lexicalCounts.values()),
        firstRoundSize:lexicalRounds[0]?.length||0,
        hiddenContextCandidates:orderedRows.filter(x=>Number(x.r.hiddenContext?.phraseBonus||0)>0).length,
        topServed:orderedRows.slice(0,100).map(x=>({text:italicNormalizedSpecimenText(x.r),wordCount:x.r.wordCount,learnedProbability:x.r.learnedItalicProbability,phraseBonus:x.phraseBonus,acquisitionScore:x.acquisitionScore})),
        note:"No occurrence is discarded. Repeated normalized text is deferred to later lexical rounds; phrase bonus is capped at 0.055 so learned italic probability remains dominant."
      };
      supervisedReviewSet.splice(0,supervisedReviewSet.length,...orderedRuns);
      supervisedReviewSet.forEach((r,i)=>{
        r.huntSelectionSource="provisional-pre-canonical-finalizer";
        r.activeLearningReason="provisional-pre-canonical-finalizer";
        r.validationHuntRank=i+1;
      });
      state.italicHuntSelectionSourceByKey=Object.fromEntries(supervisedReviewSet.map(r=>[italicCalibrationKey(r),"provisional-pre-canonical-finalizer"]));
      huntDiag.selectionMix={requested:"v149 structural scalpel: learned + current structural evidence; repeated text deferred; modest phrase acquisition",actualQueue:orderedRows.length};
      state.italicHuntTiming={totalMs:Math.round((globalThis.performance?.now?.()??Date.now())-__huntT0),population:supervisedReviewSet.length,shortlist:supervisedReviewSet.length,picked:supervisedReviewSet.length,learnedBackbone:true,positiveEnvelope:true,diagnostics:huntDiag};
      __popMark("huntReorderMs");
    }

    __popMark("huntBlockMs");
    // v73 diagnostic: freeze the untouched rank BEFORE review removes/reorders anything.
    supervisedReviewSet.forEach((r,index)=>{
      r.originalReviewRank=index+1;
      r.originalLearnedProbability=r.learnedItalicProbability;
      r.originalGeometryProbability=italicGeometryProbability(r);
    });
    state.italicUntouchedTop100=supervisedReviewSet.slice(0,100).map(r=>({
      originalRank:r.originalReviewRank,
      specimenKey:italicCalibrationKey(r),
      learnedProbability:r.originalLearnedProbability,
      geometryProbability:r.originalGeometryProbability,
      glyphClass:italicGlyphClassFromRun(r),
      slantSignal:italicSlantSignal(r),
      vector:italicLearningVector(r),
      reviewBox:r.reviewBox
    }));
    __popMark("untouchedSnapshotMs");
    state.italicGeneralizationTop100=italicReviewGeneralizationSnapshot(supervisedReviewSet.slice(0,100));
    __popMark("generalizationSnapshotMs");


    supervisedReviewSet.forEach(r=>{
      r.reviewLabel=null;
      r.reviewInstruction='Spoiler-safe human typography label: choose ITALIC, ROMAN, GLYPH/DECORATIVE, or UNSURE; Fragment is an independent crop-quality flag.';
    });
    __popMark("reviewMetadataMs");
    // Build 55: mixed-style review specimens can be split into their existing
    // one-word OCR candidates. This is a training-data acquisition tool only:
    // the split is driven solely by OCR word boundaries, never book text or
    // known answers. It lets the human create clean Roman/Italic examples from
    // a mixed crop without teaching the classifier the surrounding story.
    const singletonByWord=new Map();
    supervisedRuns.filter(r=>r.wordCount===1 && r.reviewBox).forEach(r=>singletonByWord.set(`${r.pageIndex}:${r.lineIndex}:${r.startWordIndex}`,r));
    supervisedReviewSet.forEach(r=>{
      r.splitChildren=[];
      if(r.wordCount>1){
        for(let wi=Number(r.startWordIndex);wi<=Number(r.endWordIndex);wi++){
          const child=singletonByWord.get(`${r.pageIndex}:${r.lineIndex}:${wi}`);
          if(child) r.splitChildren.push({...child,activeLearningReason:'human-split',reviewLabel:null});
        }
      }
    });
    __popMark("splitChildrenMs");
    supervisedReviewSet.forEach((r,i)=>r.supervisedRank=i+1);
    state.italicCalibrationReviewSet = supervisedReviewSet;
    renderItalicCalibrationReview();
    __popMark("reviewRenderMs");

    // Build 47: diagnostics are deliberately corpus-agnostic.
    // Human-confirmed examples belong in external QA only; production code and
    // exported measurements never contain book-, page-, phrase-, or answer-key
    // knowledge. The generic word/line/run measurements below are sufficient for
    // an evaluator to join external ground truth without leaking it into detection.

    _itMark("rankFinalizeMs");
    _itDeep.totalMs=Math.round((_itNow()-_itT0)*10)/10;
    state.italicDiagnosticsTiming=_itDeep;
    __popMark("finalizeMs");
    __popTiming.totalMs=Math.round((__popNow()-__popT0)*10)/10;
    __popTiming.setupBreakdown=__setupTiming;
    __popTiming.population={lines:lines.length,words:words.length,legacyWindows:supervisedRuns.length,eligible:eligibleRuns.length,deduped:supervisedReviewSet.length};
    state.italicPopulationTiming=__popTiming;

    const payload = {
      format: "book-ocr-studio-italic-calibration-v18",
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
        candidateWordMinAbsSlantNormal: 0.17,
        candidateWordMinAbsSlantShort: 0.20,
        candidateWordMinGainNormal: 0.0060,
        candidateWordMinGainShort: 0.0085,
        candidateWordMinScore: 0.72,
        longRunMinWords: 3,
        longRunMinAverageGain: 0.0082,
        longRunMinAverageAbsSlant: 0.21,
        longRunMinSlantLift: 0.10,
        longRunMinGainLift: 0.0035,
        singletonMinAverageGain: 0.0180,
        singletonMinAverageAbsSlant: 0.32,
        pairMinAverageGain: 0.0105,
        pairMinAverageAbsSlant: 0.235,
        sameSlantDirectionRequired: true,
        inlineRunMaxCoverage: 0.72,
        fullLineMinAbsSlant: 0.23,
        fullLineMinGain: 0.0060,
        fullLineMinWordConsensus: 0.60,
        boundaryExpansionMaxWordsPerSide: 2,
        boundaryExpansionMinAbsSlant: 0.18,
        boundaryExpansionMinGain: 0.0060,
      boundaryExpansionRequiresCandidateWord: true,
      boundaryExpansionMinScore: 0.72,
        automaticSingleWordItalics: true,
        italicsCommittedImmediatelyAfterBatchOcr: true,
        cloudIowanShearDetector: false,
        cloudIowanShearDiagnosticOnly: true,
        cloudIowanAutomaticItalicsDisabledForCalibration: true,
        cloudIowanCalibrationRankingDiagnosticOnly: true,
        cloudIowanRobustLineNormalizationDiagnosticOnly: true,
        cloudIowanRunCalibrationRankingDiagnosticOnly: true,
        cloudIowanSupervisedReviewSetDiagnosticOnly: true,
        cloudIowanLocalTypographyChangeDiagnosticOnly: true,
        cloudIowanGlyphMatchedRomanBaselineDiagnosticOnly: true,
        cloudIowanSupervisedRankingOrder: "v56-full-ocr-positive-hunt/15-batch/likely-italic+dispersed-exploration/persistent-training+session-label-exclusion",
        calibrationFeatures: ["slant","gain","score","shear","shearStrength","inkDensity","medianRowWidth","upperMedianWidth","lowerMedianWidth","topBottomWidthRatio","leftEdgeShear","rightEdgeShear","aspectRatio","bandOccupancy","leftEdgeBands","rightEdgeBands","orientationHistogram","componentCount","componentWidthMedian","componentWidthSpread","localSlantLift","localGainLift","localShearLift"],
        cloudIowanTokenSplitAtDash: true,
      },
      topLineCandidatesByGain: rankedLines.slice(0, 100),
      topWordCandidatesByGain: rankedWords.slice(0, 250),
      topLocalCalibrationCandidates: calibrationWords.slice(0, 300),
      topRunCalibrationCandidates: calibrationRuns.slice(0, 300),
      topLocalTypographyChangeWindows: typographyChangeWindows.slice(0, 500),
      topGlyphMatchedTypographyChangeWindows: glyphMatchedTypographyWindows.slice(0, 500),
      supervisedCalibrationReviewSet: supervisedReviewSet,
      acceptedRuns: runs.filter(x => x.accepted),
      rejectedRuns: runs.filter(x => !x.accepted),
      lines,
      words,
      runs,
    };
    if (shouldDownload) {
      const safeTitle = cleanFilename(els.bookTitle?.value || "book");
      downloadBlob(new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"}), `${safeTitle}-italic-diagnostics.json`);
      setStatus(`Downloaded word-level italic diagnostics: ${words.length} words, ${runs.length} candidate runs, ${runs.filter(x=>x.accepted).length} accepted. Spoiler-safe review set is ready.`);
    } else {
      setStatus(`Built ${state.italicReviewSelectionMode === "learned" ? "a learned-ranked" : "an unlimited randomized"} spoiler-safe queue from ${supervisedReviewSet.length} unique OCR specimens (${eligibleRuns.length} legacy candidate windows before deduplication).`);
    }
    return payload;
  }

  // Persistent, profile-scoped supervised typography learning. Visual features
  // and labels drive the model; minimal specimen metadata is retained so exports
  // can be grouped and reliably reattached for honest validation.
  const ITALIC_LEARNING_KEY = "bookOcrStudioItalicLearningV1";
  const ITALIC_FEATURE_NAMES = [
    "structuralAverage","structuralMinimum","structuralConsistency","slantSupport","gainSupport","shearSupport",
    "wordCount","meanInkDensityZ","meanAbsEdgeDelta","meanAbsWidthRatioDelta","meanLocalSlantLift","meanLocalGainLift","meanLocalShearLift"
  ];

  function italicLearningVector(run) {
    const ws=Array.isArray(run?.words)?run.words:[];
    const mean=(fn)=>ws.length?ws.reduce((a,w)=>a+Number(fn(w)||0),0)/ws.length:0;
    return [
      Number(run?.structuralAverage||0), Number(run?.structuralMinimum||0), Number(run?.structuralConsistency||0),
      Number(run?.slantSupport||0), Number(run?.gainSupport||0), Number(run?.shearSupport||0), Number(run?.wordCount||ws.length||1),
      mean(w=>Math.abs(Number(w.inkDensityZ||0))), mean(w=>Math.abs(Number(w.edgeDelta||0))), mean(w=>Math.abs(Number(w.widthRatioDelta||0))),
      mean(w=>Math.max(0,Number(w.localSlantLift||0))), mean(w=>Math.max(0,Number(w.localGainLift||0))), mean(w=>Math.max(0,Number(w.localShearLift||0)))
    ].map(v=>Number.isFinite(v)?v:0);
  }

  const ITALIC_LEARNING_DB="bookOcrStudioLearning";
  const ITALIC_LEARNING_DB_STORE="kv";
  let italicLearningStoreCache=null,italicLearningDbReady=null;
  function openItalicLearningDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(ITALIC_LEARNING_DB,1);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(ITALIC_LEARNING_DB_STORE))db.createObjectStore(ITALIC_LEARNING_DB_STORE);};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
  }
  async function readItalicLearningDb(){
    const db=await openItalicLearningDb();
    return await new Promise((resolve,reject)=>{const tx=db.transaction(ITALIC_LEARNING_DB_STORE,"readonly"),req=tx.objectStore(ITALIC_LEARNING_DB_STORE).get("profiles");req.onsuccess=()=>resolve(req.result&&typeof req.result==="object"?req.result:{});req.onerror=()=>reject(req.error);});
  }
  async function writeItalicLearningDb(store){
    const db=await openItalicLearningDb();
    return await new Promise((resolve,reject)=>{const tx=db.transaction(ITALIC_LEARNING_DB_STORE,"readwrite");tx.objectStore(ITALIC_LEARNING_DB_STORE).put(store,"profiles");tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error("IndexedDB transaction aborted"));});
  }
  function legacyItalicLearningStore(){
    try{const x=JSON.parse(localStorage.getItem(ITALIC_LEARNING_KEY)||"{}");return x&&typeof x==="object"?x:{};}catch(_){return {};}
  }
  function loadItalicLearningStore(){return italicLearningStoreCache||legacyItalicLearningStore();}
  async function initializeItalicLearningDb(){
    if(italicLearningDbReady)return italicLearningDbReady;
    italicLearningDbReady=(async()=>{
      const legacy=legacyItalicLearningStore();
      let dbStore={};try{dbStore=await readItalicLearningDb();}catch(err){console.warn("Could not read typography IndexedDB",err);}
      const dbCount=Object.values(dbStore).reduce((n,p)=>n+(Array.isArray(p?.examples)?p.examples.length:0),0);
      const legacyCount=Object.values(legacy).reduce((n,p)=>n+(Array.isArray(p?.examples)?p.examples.length:0),0);
      if(!dbCount&&legacyCount){await writeItalicLearningDb(legacy);dbStore=await readItalicLearningDb();}
      italicLearningStoreCache=dbCount||legacyCount?(dbCount?dbStore:legacy):{};
      state.italicLearningProfile=null;updateItalicLearningUi();
      if(legacyCount&&!dbCount)setStatus(`Typography learning migrated to IndexedDB · ${legacyCount} examples preserved.`);
      return italicLearningStoreCache;
    })().catch(err=>{console.error("Typography IndexedDB initialization failed",err);italicLearningStoreCache=legacyItalicLearningStore();return italicLearningStoreCache;});
    return italicLearningDbReady;
  }
  function saveItalicLearningStore(store){
    italicLearningStoreCache=store;
    const raw=JSON.stringify(store),result={ok:true,pending:true,backend:"IndexedDB",bytes:new Blob([raw]).size,characters:raw.length,error:null};
    state.italicLearningLastSave=result;
    writeItalicLearningDb(store).then(async()=>{
      const verify=await readItalicLearningDb(),verified=JSON.stringify(verify)===raw;
      state.italicLearningLastSave={...result,ok:verified,pending:false,error:verified?null:"IndexedDB readback mismatch"};
      if(!verified)console.warn("Typography IndexedDB verification failed");
    }).catch(err=>{state.italicLearningLastSave={...result,ok:false,pending:false,error:String(err?.name||"Error")+": "+String(err?.message||err)};console.warn("Could not save typography learning to IndexedDB",err);});
    return result;
  }
  function currentItalicLearningProfile() {
    const key=state.sourceProfile||"default";
    // v90 performance surgery: the learning profile is immutable during a Hunt
    // population build. Re-parsing the full localStorage training store for every
    // probability helper multiplied thousands of predictions into minute-scale
    // synchronous work. saveItalicTrainingExample/remove/import already refresh
    // state.italicLearningProfile, so reuse that in-memory profile whenever it is
    // for the active source profile. This changes no vectors, weights, labels, or
    // probability math; it only removes redundant JSON/localStorage reads.
    const cached=state.italicLearningProfile;
    if(cached && cached.sourceProfile===key && Array.isArray(cached.examples)) return cached;
    const store=loadItalicLearningStore();
    const p=store[key]||{version:1,sourceProfile:key,featureNames:ITALIC_FEATURE_NAMES,examples:[]};
    if(!Array.isArray(p.examples)) p.examples=[];
    state.italicLearningProfile=p;
    return p;
  }
  function saveItalicTrainingExample(run,label) {
    if(label!=="ITALIC"&&label!=="ROMAN"&&label!=="GLYPH"&&label!=="FRAGMENT") return; // UNSURE never persists.
    // GLYPH and FRAGMENT are persisted exclusion classes. They are intentionally ignored by the
    // Italic-vs-Roman learner but let review/Hunt remember decorative material and OCR shards.
    const store=loadItalicLearningStore(), key=state.sourceProfile||"default";
    const p=store[key]||{version:1,sourceProfile:key,featureNames:ITALIC_FEATURE_NAMES,examples:[]};
    if(!Array.isArray(p.examples)) p.examples=[];
    const vector=italicLearningVector(run);
    // Same visual specimen can be relabeled without creating duplicate training rows.
    const specimenId=italicCalibrationKey(run);
    const sessionSignature=checkpointSignature().map(signatureFileName).join("|");
    const id=`${sessionSignature}::${specimenId}`;
    const existing=p.examples.find(x=>x.id===id);
    const glyphClass=italicGlyphClassFromRun(run);
    const normalizedText=italicNormalizedSpecimenText(run);
    const normalizedWords=normalizedText.split(" ").filter(Boolean);
    const spanWordCount=(Number.isFinite(Number(run.startWordIndex))&&Number.isFinite(Number(run.endWordIndex)))
      ? Math.abs(Number(run.endWordIndex)-Number(run.startWordIndex))+1 : 0;
    const specimenWordCount=Math.max(Number(run.wordCount||0),spanWordCount,normalizedWords.length,1);
    const sourceBox=run.reviewBox||run.box||null;
    const example={id,sourceRunId:sessionSignature,label,fragment:Boolean(run.reviewIsFragment),vector,glyphClass,slantSignal:italicSlantSignal(run),
      normalizedText,specimenText:normalizedText,wordCount:specimenWordCount,
      sourcePage:run.pageIndex!=null&&Number.isFinite(Number(run.pageIndex))?Number(run.pageIndex):null,
      sourceLine:run.lineIndex!=null&&Number.isFinite(Number(run.lineIndex))?Number(run.lineIndex):null,
      startWordIndex:Number.isFinite(Number(run.startWordIndex))?Number(run.startWordIndex):null,endWordIndex:Number.isFinite(Number(run.endWordIndex))?Number(run.endWordIndex):null,
      reviewBox:sourceBox?{x:Number(sourceBox.x||0),y:Number(sourceBox.y||0),w:Number(sourceBox.w??sourceBox.width??0),h:Number(sourceBox.h??sourceBox.height??0)}:null,
      provenance:String(run.lineHunt?"line-hunt":(state.italicReviewSelectionMode||run.sampleKind||"review")),
      sampleKind:specimenWordCount>1?"multiword":(run.sampleKind||"single-word"),
      createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
    if(existing) Object.assign(existing,example); else p.examples.push(example);
    p.updatedAt=new Date().toISOString(); p.featureNames=ITALIC_FEATURE_NAMES;
    store[key]=p;
    const saveResult=saveItalicLearningStore(store);
    if(saveResult?.ok) state.italicLearningProfile=p;
    return {...(saveResult||{ok:false}),label,id,total:p.examples.length};
  }
  function italicLearningStats() {
    const p=currentItalicLearningProfile(), ex=p.examples||[];
    return {total:ex.length,italic:ex.filter(x=>x.label==="ITALIC").length,roman:ex.filter(x=>x.label==="ROMAN").length,glyph:ex.filter(x=>x.label==="GLYPH").length,fragment:ex.filter(x=>x.label==="FRAGMENT"||x.fragment===true).length};
  }
  function italicGlyphClassFromRun(run) {
    if(run?.glyphClassOverride) return String(run.glyphClassOverride);
    const raw=String(run?.text||run?.words?.map(w=>w?.text||"").join("")||"").normalize("NFKC");
    const glyphs=[...raw].filter(ch=>/\p{L}|\p{N}/u.test(ch));
    if(glyphs.length===1) return `single:${glyphs[0].toLocaleLowerCase()}`;
    if(glyphs.length>=2) return `word:${glyphs.length}`;
    return "other";
  }
  let italicProbabilityCache=new Map();
  let italicProbabilityCacheRevision="";
  function italicLearningRevision(){
    const p=currentItalicLearningProfile();
    const ex=p.examples||[];
    return `${ex.length}:${p.updatedAt||""}`;
  }
  function cachedItalicLearnedProbability(run){
    const revision=italicLearningRevision();
    if(revision!==italicProbabilityCacheRevision){
      italicProbabilityCacheRevision=revision;
      italicProbabilityCache=new Map();
    }
    const key=italicCalibrationKey(run);
    if(italicProbabilityCache.has(key)) return italicProbabilityCache.get(key);
    const value=italicLearnedProbability(run);
    italicProbabilityCache.set(key,value);
    return value;
  }

  function italicSlantSignal(run){
    if(Number.isFinite(Number(run?.slantSignalOverride)))return Number(run.slantSignalOverride);
    const v=italicLearningVector(run);
    if(!Array.isArray(v)||v.length<13)return 0;
    const n=x=>Number.isFinite(Number(x))?Number(x):0;
    const edgeA=n(v[3])-n(v[9]);
    const edgeB=n(v[4])-n(v[10]);
    const edgeC=n(v[5])-n(v[12]);
    const scale=Math.max(.05,Math.abs(n(v[0]))+Math.abs(n(v[1]))+.25);
    return Math.max(-3,Math.min(3,(edgeA*.50+edgeB*.20+edgeC*.30)/scale));
  }

  let italicGeometryCache=null,italicGeometryRevision="";
  function italicGeometryModel(){
    const p=currentItalicLearningProfile(),ex=p.examples||[],rev=`${ex.length}:${p.updatedAt||""}`;
    if(italicGeometryCache&&italicGeometryRevision===rev)return italicGeometryCache;
    const I=[],R=[];
    for(const x of ex){let v=Number(x.slantSignal);
      if(!Number.isFinite(v) && Array.isArray(x.vector) && x.vector.length>=13){
        const n=q=>Number.isFinite(Number(q))?Number(q):0;
        const edgeA=n(x.vector[3])-n(x.vector[9]),edgeB=n(x.vector[4])-n(x.vector[10]),edgeC=n(x.vector[5])-n(x.vector[12]);
        const scale=Math.max(.05,Math.abs(n(x.vector[0]))+Math.abs(n(x.vector[1]))+.25);
        v=Math.max(-3,Math.min(3,(edgeA*.50+edgeB*.20+edgeC*.30)/scale));
      }
      if(!Number.isFinite(v))continue;if(x.label==="ITALIC")I.push(v);else if(x.label==="ROMAN")R.push(v);}
    const stat=a=>{if(!a.length)return null;const mean=a.reduce((x,y)=>x+y,0)/a.length;const sd=Math.max(.05,Math.sqrt(a.reduce((x,y)=>x+(y-mean)**2,0)/Math.max(1,a.length-1)));return{mean,sd,n:a.length};};
    italicGeometryCache={italic:stat(I),roman:stat(R)};italicGeometryRevision=rev;return italicGeometryCache;
  }
  function italicFeatureSeparationReport(){
    const p=currentItalicLearningProfile(), examples=(p.examples||[]).filter(x=>
      (x.label==="ITALIC"||x.label==="ROMAN") &&
      Array.isArray(x.vector) && x.vector.length===ITALIC_FEATURE_NAMES.length
    );
    const I=examples.filter(x=>x.label==="ITALIC"), R=examples.filter(x=>x.label==="ROMAN");
    const stat=(rows,i)=>{
      const a=rows.map(x=>Number(x.vector[i])).filter(Number.isFinite);
      if(!a.length)return null;
      const mean=a.reduce((x,y)=>x+y,0)/a.length;
      const variance=a.reduce((x,y)=>x+(y-mean)**2,0)/Math.max(1,a.length-1);
      return {mean,sd:Math.sqrt(variance),n:a.length};
    };
    const features=ITALIC_FEATURE_NAMES.map((name,i)=>{
      const italic=stat(I,i),roman=stat(R,i);
      if(!italic||!roman)return {index:i,name,italic,roman,separation:null};
      const pooled=Math.sqrt((italic.sd**2+roman.sd**2)/2);
      const signed=pooled>1e-9?(italic.mean-roman.mean)/pooled:0;
      return {
        index:i,name,italic,roman,
        signedSeparation:signed,
        separation:Math.abs(signed),
        italicHigher:italic.mean>roman.mean
      };
    }).sort((a,b)=>(b.separation??-1)-(a.separation??-1));
    return {
      italicCount:I.length,
      romanCount:R.length,
      featureCount:ITALIC_FEATURE_NAMES.length,
      features,
      note:`Build ${BUILD_VERSION}: feature-separation diagnostics now inform Hunt through the cached structural feature model; this table remains descriptive.`
    };
  }

  function italicNormalizedSpecimenText(run){
    return String(run?.text||run?.words?.map(w=>w?.text||"").join(" ")||"")
      .normalize("NFKC").toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
  }
  function italicReviewGeneralizationSnapshot(queue){
    const p=currentItalicLearningProfile(), examples=p.examples||[];
    const trainedItalicTexts=new Set(examples.filter(x=>x.label==="ITALIC")
      .map(x=>String(x.text||x.specimenText||"").normalize("NFKC").toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ")).filter(Boolean));
    const counts=new Map();
    for(const r of queue){
      const t=italicNormalizedSpecimenText(r);
      if(t)counts.set(t,(counts.get(t)||0)+1);
    }
    return queue.map((r,index)=>{
      const text=italicNormalizedSpecimenText(r);
      const words=text?text.split(" ").filter(Boolean):[];
      return {
        originalRank:r.originalReviewRank??index+1,
        specimenKey:italicCalibrationKey(r),
        normalizedText:text,
        wordCount:Math.max(Number(r.wordCount||0),words.length,1),
        specimenType:Math.max(Number(r.wordCount||0),words.length,1)>1?"multi-word":"single-word",
        duplicateTextCount:text?(counts.get(text)||0):0,
        repeatedInQueue:text?(counts.get(text)||0)>1:false,
        appearedInConfirmedItalicTraining:text?trainedItalicTexts.has(text):false,
        learnedProbability:r.learnedItalicProbability,
        featureWeightedProbability:italicFeatureWeightedProbability(r),
        geometryProbability:italicGeometryProbability(r)
      };
    });
  }

  function italicSingleWordTypographyProbability(run){
    const text=italicNormalizedSpecimenText(run);
    const words=text?text.split(" ").filter(Boolean):[];
    if(words.length!==1)return null;
    const p=currentItalicLearningProfile();
    const examples=(p.examples||[]).filter(x=>
      (x.label==="ITALIC"||x.label==="ROMAN") &&
      Array.isArray(x.vector) && x.vector.length===ITALIC_FEATURE_NAMES.length
    );
    const I=examples.filter(x=>x.label==="ITALIC"),R=examples.filter(x=>x.label==="ROMAN");
    if(I.length<10||R.length<40)return null;

    // Same strongest non-duplicate typography features established in v74.
    const chosen=[0,1,5,8,9,4], v=italicLearningVector(run);
    let score=0,n=0;
    for(const i of chosen){
      const vals=rows=>rows.map(x=>Number(x.vector[i])).filter(Number.isFinite);
      const ia=vals(I),ra=vals(R); if(!ia.length||!ra.length)continue;
      const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
      const im=mean(ia),rm=mean(ra);
      const variance=(a,m)=>a.reduce((x,y)=>x+(y-m)**2,0)/Math.max(1,a.length-1);
      const pooled=Math.sqrt((variance(ia,im)+variance(ra,rm))/2);
      const x=Number(v[i]); if(!Number.isFinite(x)||!(pooled>1e-9))continue;
      const midpoint=(im+rm)/2,direction=im>=rm?1:-1;
      score+=Math.max(-2,Math.min(2,direction*(x-midpoint)/pooled)); n++;
    }
    if(!n)return null;
    return 1/(1+Math.exp(-1.35*(score/n)));
  }

  let italicFeatureModelCache=null, italicFeatureModelRevision="";
  function italicFeatureModel(){
    const p=currentItalicLearningProfile(), examples=(p.examples||[]).filter(x=>(x.label==="ITALIC"||x.label==="ROMAN")&&Array.isArray(x.vector)&&x.vector.length===ITALIC_FEATURE_NAMES.length);
    const rev=`${examples.length}:${p.updatedAt||""}`; if(italicFeatureModelCache&&italicFeatureModelRevision===rev)return italicFeatureModelCache;
    const I=examples.filter(x=>x.label==="ITALIC"),R=examples.filter(x=>x.label==="ROMAN");
    // v149: current 114/3857-label evidence. Structural consistency is the
    // strongest separator; structural min/average and slant follow. Do not
    // double-count duplicate local dimensions.
    const chosen=[{i:2,w:1.493},{i:1,w:1.274},{i:0,w:1.274},{i:3,w:1.121},{i:4,w:.669},{i:8,w:.555}];
    const stat=(rows,i)=>{const a=rows.map(x=>Number(x.vector[i])).filter(Number.isFinite);if(!a.length)return null;const mean=a.reduce((x,y)=>x+y,0)/a.length;const variance=a.reduce((x,y)=>x+(y-mean)**2,0)/Math.max(1,a.length-1);return{mean,sd:Math.sqrt(variance)};};
    const features=chosen.map(f=>({...f,is:stat(I,f.i),rs:stat(R,f.i)})).filter(f=>f.is&&f.rs);
    italicFeatureModelCache={ready:I.length>=10&&R.length>=40,features,italicCount:I.length,romanCount:R.length}; italicFeatureModelRevision=rev; return italicFeatureModelCache;
  }
  function italicFeatureWeightedProbability(run){
    const m=italicFeatureModel(); if(!m.ready)return .5; const v=italicLearningVector(run);
    let weighted=0,weights=0;
    for(const f of m.features){const pooled=Math.sqrt((f.is.sd**2+f.rs.sd**2)/2),x=Number(v[f.i]);if(!Number.isFinite(x)||!(pooled>1e-9))continue;const midpoint=(f.is.mean+f.rs.mean)/2,direction=f.is.mean>=f.rs.mean?1:-1,z=direction*(x-midpoint)/pooled;weighted+=Math.max(-2.5,Math.min(2.5,z))*f.w;weights+=f.w;}
    if(!weights)return .5; return 1/(1+Math.exp(-1.45*(weighted/weights)));
  }

  function italicGeometryProbability(run){
    const m=italicGeometryModel();if(!m.italic||!m.roman||m.italic.n<2||m.roman.n<2)return null;
    const x=italicSlantSignal(run),d=(x,z)=>Math.exp(-.5*((x-z.mean)/z.sd)**2)/z.sd,i=d(x,m.italic),r=d(x,m.roman);
    return i+r?i/(i+r):.5;
  }

  // v92: cache the immutable training-side preparation for each glyph class.
  // Cold Hunt previously rebuilt the same filtered example sets, per-feature
  // quantile scales, and class slant means once for every review specimen. Those
  // values depend only on the saved learning profile + glyph class, not on the
  // candidate being scored. Preparing them once preserves the exact learner math
  // while making cold scoring follow the same cheap path as a warm population.
  let italicPreparedLearnerCache=new Map();
  let italicPreparedLearnerRevision="";
  // v138: prevent rare italic positives from being drowned by an ever-growing
  // Roman corpus. Keep every persisted label, but use a deterministic representative
  // Roman subset when preparing the learner. This affects model influence only.
  function balancedItalicLearnerRows(italic,roman){
    if(!italic.length||!roman.length)return {italic,roman,romanTotal:roman.length,romanUsed:roman.length,romanCap:roman.length};
    const cap=Math.min(roman.length,Math.max(40,italic.length*8));
    if(roman.length<=cap)return {italic,roman,romanTotal:roman.length,romanUsed:roman.length,romanCap:cap};
    const keyed=roman.map((x,i)=>({x,k:String(x.id||x.normalizedText||i)})).sort((a,b)=>a.k.localeCompare(b.k));
    const sampled=[];
    for(let i=0;i<cap;i++){
      const idx=Math.min(keyed.length-1,Math.floor((i+.5)*keyed.length/cap));
      sampled.push(keyed[idx].x);
    }
    return {italic,roman:sampled,romanTotal:roman.length,romanUsed:sampled.length,romanCap:cap};
  }

  function preparedItalicLearner(target){
    const p=currentItalicLearningProfile();
    const rev=`${(p.examples||[]).length}:${p.updatedAt||""}`;
    if(rev!==italicPreparedLearnerRevision){
      italicPreparedLearnerRevision=rev;
      italicPreparedLearnerCache=new Map();
    }
    if(italicPreparedLearnerCache.has(target)) return italicPreparedLearnerCache.get(target);
    const all=(p.examples||[]).filter(x=>Array.isArray(x.vector)&&x.vector.length===ITALIC_FEATURE_NAMES.length);
    const single=target.startsWith("single:");
    let ex;
    if(single){
      ex=all.filter(x=>x.glyphClass===target);
    } else {
      const len=Number(target.split(":")[1]||0);
      const classed=all.filter(x=>{
        if(!String(x.glyphClass||"").startsWith("word:")) return false;
        return Math.abs(Number(x.glyphClass.split(":")[1]||0)-len)<=2;
      });
      const legacy=all.filter(x=>!x.glyphClass);
      ex=[...classed,...legacy];
    }
    const italic=ex.filter(x=>x.label==="ITALIC"), romanAll=ex.filter(x=>x.label==="ROMAN");
    const balanced=balancedItalicLearnerRows(italic,romanAll), roman=balanced.roman;
    const effective=[...italic,...roman];
    let scales=null;
    if(italic.length>=2 && roman.length>=2){
      const dims=ITALIC_FEATURE_NAMES.length;
      scales=Array.from({length:dims},(_,i)=>{
        const vals=effective.map(x=>Number(x.vector[i]||0)).filter(Number.isFinite);
        if(!vals.length) return 1e-4;
        const sorted=[...vals].sort((a,b)=>a-b);
        const q=qv=>sorted[Math.min(sorted.length-1,Math.max(0,Math.floor((sorted.length-1)*qv)))];
        return Math.max(1e-4,q(.9)-q(.1),Math.max(...vals)-Math.min(...vals));
      });
    }
    const classSlant=rows=>{
      const vals=rows.map(x=>Number(x.slantSignal)).filter(Number.isFinite);
      return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
    };
    const prepared={single,italic,roman,scales,iMean:classSlant(italic),rMean:classSlant(roman),romanTotal:balanced.romanTotal,romanUsed:balanced.romanUsed,romanCap:balanced.romanCap};
    italicPreparedLearnerCache.set(target,prepared);
    return prepared;
  }

  function italicLearnedProbabilityUncached(run) {
    const target=italicGlyphClassFromRun(run);
    const prepared=preparedItalicLearner(target);
    const {single,italic,roman,scales,iMean,rMean}=prepared;
    // A single I/A/a cannot dominate merely because it resembles unrelated
    // positive examples. It earns ranking only after that SAME glyph has both
    // Roman and italic human labels.
    if(single && (!italic.length || !roman.length)) return 0.01;
    if(italic.length<2 || roman.length<2 || !scales) return single?0.01:null;
    const v=italicLearningVector(run), dims=v.length;
    const dist=x=>{
      let d=0;
      for(let i=0;i<dims;i++){
        const z=(Number(v[i]||0)-Number(x.vector[i]||0))/scales[i];
        d+=Math.min(25,z*z);
      }
      return Math.sqrt(d/dims);
    };
    const affinity=rows=>{
      const near=rows.map(dist).sort((a,b)=>a-b).slice(0,Math.min(7,rows.length));
      return near.reduce((a,d)=>a+1/(.08+d),0)/Math.max(1,near.length);
    };
    const ia=affinity(italic), ra=affinity(roman);
    const raw=ia+ra?ia/(ia+ra):null;
    if(raw==null) return null;
    const support=Math.min(1,Math.min(italic.length,roman.length)/5);
    let learned=.5+(raw-.5)*support;

    // Italic-specific refinement: compare measured slant/shear to human-labeled
    // classes. This is style geometry, never word identity or book content.
    const rs=italicSlantSignal(run);
    if(iMean!=null && rMean!=null && Math.abs(iMean-rMean)>.01){
      const di=Math.abs(rs-iMean), dr=Math.abs(rs-rMean);
      const slantP=(di+dr)>0?dr/(di+dr):.5;
      learned=learned*.72+slantP*.28;
    }
    const geometryP=italicGeometryProbability(run);
    if(geometryP!=null) learned=learned*.68+geometryP*.32;
    return learned;
  }

  let italicFastScoreCache=new Map();
  let italicFastScoreRevision="";
  function italicLearnedProbability(run){
    const p=currentItalicLearningProfile();
    const rev=`${(p.examples||[]).length}:${p.updatedAt||""}`;
    if(rev!==italicFastScoreRevision){italicFastScoreRevision=rev;italicFastScoreCache=new Map();}
    const key=italicCalibrationKey(run);
    if(italicFastScoreCache.has(key))return italicFastScoreCache.get(key);
    const baseLearned=italicLearnedProbabilityUncached(run);
    const featureLearned=italicFeatureWeightedProbability(run);
    // v75: 80% existing learner + 20% feature-separation signal.
    let finalLearned=Math.max(0,Math.min(1,baseLearned*.80+featureLearned*.20));
    const singleWordTypography=italicSingleWordTypographyProbability(run);
    // v77: isolated words were 0/20 in v76. Give typography-only evidence a
    // conservative rescue path without using the word's lexical identity.
    if(singleWordTypography!=null){
      finalLearned=Math.max(0,Math.min(1,finalLearned*.82+singleWordTypography*.18));
    }
    italicFastScoreCache.set(key,finalLearned);
    return finalLearned;
  }

  // Explicit-fold counterparts of the production learner. These preserve the
  // live learner's math while preventing a held-out specimen from entering the
  // model that scores it.
  function italicExampleSlant(example){
    const stored=example?.slantSignal==null?NaN:Number(example.slantSignal);
    if(Number.isFinite(stored))return stored;
    const v=example?.vector;
    if(!Array.isArray(v)||v.length<13)return null;
    const n=x=>Number.isFinite(Number(x))?Number(x):0;
    const scale=Math.max(.05,Math.abs(n(v[0]))+Math.abs(n(v[1]))+.25);
    return Math.max(-3,Math.min(3,((n(v[3])-n(v[9]))*.50+(n(v[4])-n(v[10]))*.20+(n(v[5])-n(v[12]))*.30)/scale));
  }
  function italicFeatureWeightedProbabilityForExamples(run,examples){
    const rows=(examples||[]).filter(x=>(x.label==="ITALIC"||x.label==="ROMAN")&&Array.isArray(x.vector)&&x.vector.length===ITALIC_FEATURE_NAMES.length);
    const I=rows.filter(x=>x.label==="ITALIC"),R=rows.filter(x=>x.label==="ROMAN");
    if(I.length<10||R.length<40)return .5;
    const chosen=[{i:2,w:1.493},{i:1,w:1.274},{i:0,w:1.274},{i:3,w:1.121},{i:4,w:.669},{i:8,w:.555}],v=italicLearningVector(run);
    const stat=(a,i)=>{const xs=a.map(x=>Number(x.vector[i])).filter(Number.isFinite);if(!xs.length)return null;const mean=xs.reduce((s,z)=>s+z,0)/xs.length,variance=xs.reduce((s,z)=>s+(z-mean)**2,0)/Math.max(1,xs.length-1);return{mean,sd:Math.sqrt(variance)};};
    let weighted=0,weights=0;
    for(const f of chosen){const is=stat(I,f.i),rs=stat(R,f.i);if(!is||!rs)continue;const pooled=Math.sqrt((is.sd**2+rs.sd**2)/2),x=Number(v[f.i]);if(!Number.isFinite(x)||!(pooled>1e-9))continue;const z=(is.mean>=rs.mean?1:-1)*(x-(is.mean+rs.mean)/2)/pooled;weighted+=Math.max(-2.5,Math.min(2.5,z))*f.w;weights+=f.w;}
    return weights?1/(1+Math.exp(-1.45*(weighted/weights))):.5;
  }
  function italicSingleWordTypographyProbabilityForExamples(run,examples){
    const text=italicNormalizedSpecimenText(run),words=text?text.split(" ").filter(Boolean):[];
    if(words.length!==1)return null;
    const rows=(examples||[]).filter(x=>(x.label==="ITALIC"||x.label==="ROMAN")&&Array.isArray(x.vector)&&x.vector.length===ITALIC_FEATURE_NAMES.length),I=rows.filter(x=>x.label==="ITALIC"),R=rows.filter(x=>x.label==="ROMAN");
    if(I.length<10||R.length<40)return null;
    const chosen=[0,1,5,8,9,4],v=italicLearningVector(run);let score=0,n=0;
    for(const i of chosen){const vals=a=>a.map(x=>Number(x.vector[i])).filter(Number.isFinite),ia=vals(I),ra=vals(R);if(!ia.length||!ra.length)continue;const mean=a=>a.reduce((s,z)=>s+z,0)/a.length,im=mean(ia),rm=mean(ra),variance=(a,m)=>a.reduce((s,z)=>s+(z-m)**2,0)/Math.max(1,a.length-1),pooled=Math.sqrt((variance(ia,im)+variance(ra,rm))/2),x=Number(v[i]);if(!Number.isFinite(x)||!(pooled>1e-9))continue;score+=Math.max(-2,Math.min(2,(im>=rm?1:-1)*(x-(im+rm)/2)/pooled));n++;}
    return n?1/(1+Math.exp(-1.35*(score/n))):null;
  }
  function italicGeometryProbabilityForExamples(run,examples){
    const values=label=>(examples||[]).filter(x=>x.label===label).map(italicExampleSlant).filter(Number.isFinite);
    const stat=a=>{if(!a.length)return null;const mean=a.reduce((s,z)=>s+z,0)/a.length;return{mean,sd:Math.max(.05,Math.sqrt(a.reduce((s,z)=>s+(z-mean)**2,0)/Math.max(1,a.length-1))),n:a.length};};
    const I=stat(values("ITALIC")),R=stat(values("ROMAN"));if(!I||!R||I.n<2||R.n<2)return null;
    const x=italicSlantSignal(run),density=s=>Math.exp(-.5*((x-s.mean)/s.sd)**2)/s.sd,ip=density(I),rp=density(R);return ip+rp?ip/(ip+rp):.5;
  }
  function italicLearnedProbabilityForExamples(run,trainingExamples){
    const all=(trainingExamples||[]).filter(x=>(x.label==="ITALIC"||x.label==="ROMAN")&&Array.isArray(x.vector)&&x.vector.length===ITALIC_FEATURE_NAMES.length),target=italicGlyphClassFromRun(run),single=target.startsWith("single:");
    let classed;
    if(single)classed=all.filter(x=>x.glyphClass===target);
    else{const len=Number(target.split(":")[1]||0),specific=all.filter(x=>String(x.glyphClass||"").startsWith("word:")&&Math.abs(Number(String(x.glyphClass).split(":")[1]||0)-len)<=2),legacy=all.filter(x=>!x.glyphClass);classed=[...specific,...legacy];}
    const italic=classed.filter(x=>x.label==="ITALIC"),romanAll=classed.filter(x=>x.label==="ROMAN"),balanced=balancedItalicLearnerRows(italic,romanAll),roman=balanced.roman,effective=[...italic,...roman];
    let baseLearned=null;
    if(single&&(!italic.length||!roman.length))baseLearned=.01;
    else if(italic.length>=2&&roman.length>=2){
      const dims=ITALIC_FEATURE_NAMES.length,scales=Array.from({length:dims},(_,i)=>{const vals=effective.map(x=>Number(x.vector[i]||0)).filter(Number.isFinite).sort((a,b)=>a-b);if(!vals.length)return 1e-4;const q=p=>vals[Math.min(vals.length-1,Math.max(0,Math.floor((vals.length-1)*p)))];return Math.max(1e-4,q(.9)-q(.1),vals[vals.length-1]-vals[0]);}),v=italicLearningVector(run);
      const dist=x=>Math.sqrt(v.reduce((sum,n,i)=>{const z=(Number(n||0)-Number(x.vector[i]||0))/scales[i];return sum+Math.min(25,z*z);},0)/dims),affinity=rows=>{const near=rows.map(dist).sort((a,b)=>a-b).slice(0,Math.min(7,rows.length));return near.reduce((a,d)=>a+1/(.08+d),0)/Math.max(1,near.length);};
      const ia=affinity(italic),ra=affinity(roman),raw=ia+ra?ia/(ia+ra):null;
      if(raw!=null){baseLearned=.5+(raw-.5)*Math.min(1,Math.min(italic.length,roman.length)/5);const meanSlant=rows=>{const a=rows.map(x=>Number(x.slantSignal)).filter(Number.isFinite);return a.length?a.reduce((s,z)=>s+z,0)/a.length:null;},im=meanSlant(italic),rm=meanSlant(roman),rs=italicSlantSignal(run);if(im!=null&&rm!=null&&Math.abs(im-rm)>.01){const di=Math.abs(rs-im),dr=Math.abs(rs-rm);baseLearned=baseLearned*.72+(di+dr?dr/(di+dr):.5)*.28;}const geometry=italicGeometryProbabilityForExamples(run,all);if(geometry!=null)baseLearned=baseLearned*.68+geometry*.32;}
    }
    const feature=italicFeatureWeightedProbabilityForExamples(run,all);
    let final=Math.max(0,Math.min(1,baseLearned*.80+feature*.20));
    const typography=italicSingleWordTypographyProbabilityForExamples(run,all);if(typography!=null)final=Math.max(0,Math.min(1,final*.82+typography*.18));
    return final;
  }
  function italicPositiveEnvelopeForExamples(run,examples,learnedProbability=.5){
    const positives=(examples||[]).filter(x=>x.label==="ITALIC"&&Array.isArray(x.vector)),v=italicLearningVector(run),idx=[0,2,3,8,9,10],qstats=j=>{const a=positives.map(x=>Number(x.vector[j])||0).sort((x,y)=>x-y),q=p=>a.length?a[Math.min(a.length-1,Math.floor((a.length-1)*p))]:0;return{q10:q(.1),q25:q(.25),m:q(.5),q75:q(.75),q90:q(.9),iqr:Math.max(1e-4,q(.75)-q(.25))};};
    let envelope=0,closeness=0;for(const j of idx){const s=qstats(j),x=Number(v[j])||0;if(x>=s.q10-.75*s.iqr&&x<=s.q90+.75*s.iqr)envelope++;closeness+=Math.exp(-Math.abs(x-s.m)/(1.5*s.iqr));}
    const learned=Number.isFinite(Number(learnedProbability))?Number(learnedProbability):.5,uncertainty=1-Math.min(1,Math.abs(learned-.5)*2);return .58*(envelope/idx.length)+.32*(closeness/idx.length)+.10*uncertainty;
  }
  function canonicalItalicCandidateScore(run,{trainingExamples=null}={}){
    const examples=trainingExamples||currentItalicLearningProfile().examples||[],learned=trainingExamples?italicLearnedProbabilityForExamples(run,examples):cachedItalicLearnedProbability(run),learnedSafe=Number.isFinite(learned)?learned:.5,pixel=Number(run.pixelItalicProbability),pixelApplied=run.pixelItalicProbability!=null&&Number.isFinite(pixel),pixelWeight=pixelApplied?.10:0,blendedLearned=learnedSafe*(1-pixelWeight)+(pixelApplied?pixel*pixelWeight:0),structural=trainingExamples?italicFeatureWeightedProbabilityForExamples(run,examples):italicFeatureWeightedProbability(run),envelope=italicPositiveEnvelopeForExamples(run,examples,learnedSafe),huntPositiveScore=.62*blendedLearned+.30*structural+.08*envelope,hiddenContextBonus=Math.max(0,Number(run.hiddenContext?.phraseBonus||0)),finalScore=huntPositiveScore+hiddenContextBonus;
    return{learnedProbability:learnedSafe,pixelProbability:pixelApplied?pixel:null,pixelWeight,blendedLearnedProbability:blendedLearned,structuralProbability:structural,positiveEnvelopeScore:envelope,hiddenContextBonus,huntPositiveScore,finalScore};
  }
  function rankCanonicalItalicCandidates(runs,{trainingExamples=null}={}){
    const scored=(runs||[]).map(run=>{const components=canonicalItalicCandidateScore(run,{trainingExamples});Object.assign(run,{learnedItalicProbability:components.learnedProbability,pixelItalicProbability:components.pixelProbability,positiveEnvelopeScore:components.positiveEnvelopeScore,huntPositiveScore:components.huntPositiveScore,finalItalicScore:components.finalScore,finalRankComponents:components});return run;}).sort((a,b)=>Number(b.finalItalicScore)-Number(a.finalItalicScore)||Number(b.supervisedScore||0)-Number(a.supervisedScore||0));
    const preDiversityRank=new Map(scored.map((r,i)=>[r,i+1])),rounds=[],counts=new Map(),totals=new Map();for(const r of scored){const key=italicNormalizedSpecimenText(r)||italicCalibrationKey(r);totals.set(key,(totals.get(key)||0)+1);}for(const r of scored){const key=italicNormalizedSpecimenText(r)||italicCalibrationKey(r),round=counts.get(key)||0;counts.set(key,round+1);r.occurrenceRound=round;r.lexicalOccurrenceCount=totals.get(key)||1;if(!rounds[round])rounds[round]=[];rounds[round].push(r);}
    const ordered=rounds.flat();ordered.forEach((r,i)=>{r.finalServedRank=i+1;r.validationHuntRank=i+1;const c=r.finalRankComponents,affected=["learned-probability","structural-score","positive-envelope"];if(c.pixelWeight>0)affected.push("pixel-assist");if(c.hiddenContextBonus>0)affected.push("hidden-context/run-support");if(r.lexicalOccurrenceCount>1)affected.push("lexical-diversity/occurrence-round");r.finalRankDiagnostics={servedRank:i+1,preDiversityRank:preDiversityRank.get(r),occurrenceRound:r.occurrenceRound,componentsActuallyApplied:affected,components:c,hiddenContext:r.hiddenContext||null};r.huntSelectionSource=affected.join(" + ");r.activeLearningReason="v156-canonical-final-rank";});return ordered;
  }

  function removeItalicTrainingExample(run) {
    const store=loadItalicLearningStore(), key=state.sourceProfile||"default";
    const p=store[key];
    if(!p || !Array.isArray(p.examples)) return;
    const specimenId=italicCalibrationKey(run);
    const sessionSignature=checkpointSignature().map(signatureFileName).join("|");
    const id=`${sessionSignature}::${specimenId}`;
    p.examples=p.examples.filter(x=>x.id!==id);
    p.updatedAt=new Date().toISOString();
    store[key]=p; saveItalicLearningStore(store); state.italicLearningProfile=p;
  }

  function updateItalicLearningUi() {
    const st=italicLearningStats();
    if(els.italicLearningStatus) els.italicLearningStatus.textContent=`Learned: ${st.italic} italic · ${st.roman} Roman${st.glyph?` · ${st.glyph} glyph/decorative`:""}${st.fragment?` · ${st.fragment} fragments`:""}`;
  }
  function exportItalicLearningProfile() {
    const p=currentItalicLearningProfile();
    const payload={format:"book-ocr-studio-italic-learning-v1",buildVersion:BUILD_VERSION,exportedAt:new Date().toISOString(),profile:p};
    downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),`ocr-studio-${cleanFilename(state.sourceProfile||"profile")}-italic-learning.json`);
    setStatus(`Exported ${p.examples.length} persistent typography training examples.`);
  }
  function importItalicLearningProfileFile(file) {
    if(!file) return;
    const reader=new FileReader(); reader.onload=()=>{ try {
      const payload=JSON.parse(String(reader.result||"{}")), p=payload?.profile;
      if(payload?.format!=="book-ocr-studio-italic-learning-v1"||!p||!Array.isArray(p.examples)) throw new Error("Not an OCR Studio italic learning profile");
      if(p.sourceProfile!==state.sourceProfile) throw new Error(`This profile is for ${p.sourceProfile}, not ${state.sourceProfile}`);
      const clean=p.examples.filter(x=>(x.label==="ITALIC"||x.label==="ROMAN"||x.label==="GLYPH"||x.label==="FRAGMENT")&&Array.isArray(x.vector)&&x.vector.length===ITALIC_FEATURE_NAMES.length)
        .map(x=>{
          const box=x.reviewBox||x.cropMetadata||x.box||null;
          const finiteOrUndefined=v=>(v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v)))?Number(v):undefined;
          return {...x,id:String(x.id||crypto.randomUUID()),label:x.label,vector:x.vector.map(Number),
            glyphClass:x.glyphClass==null?undefined:String(x.glyphClass),
            slantSignal:finiteOrUndefined(x.slantSignal),wordCount:finiteOrUndefined(x.wordCount),
            normalizedText:String(x.normalizedText||x.specimenText||""),specimenText:String(x.specimenText||x.normalizedText||""),
            sourcePage:finiteOrUndefined(x.sourcePage??x.pageIndex),sourceLine:finiteOrUndefined(x.sourceLine??x.lineIndex),
            startWordIndex:finiteOrUndefined(x.startWordIndex),endWordIndex:finiteOrUndefined(x.endWordIndex),
            reviewBox:box?{x:Number(box.x||0),y:Number(box.y||0),w:Number(box.w??box.width??0),h:Number(box.h??box.height??0)}:undefined,
            provenance:x.provenance==null?undefined:String(x.provenance),sampleKind:x.sampleKind==null?undefined:String(x.sampleKind),
            createdAt:x.createdAt||new Date().toISOString(),updatedAt:x.updatedAt||new Date().toISOString()};
        });
      const store=loadItalicLearningStore(), cur=currentItalicLearningProfile();
      const byId=new Map((cur.examples||[]).map(x=>[x.id,x])); clean.forEach(x=>byId.set(x.id,x));
      store[state.sourceProfile]={version:1,sourceProfile:state.sourceProfile,featureNames:ITALIC_FEATURE_NAMES,examples:[...byId.values()],updatedAt:new Date().toISOString()};
      saveItalicLearningStore(store);state.italicLearningProfile=store[state.sourceProfile];updateItalicLearningUi(); setStatus(`Imported typography learning profile. ${italicLearningStats().total} examples are now available.`);
    } catch(err){ alert(err.message||err); } }; reader.readAsText(file);
  }
  function resetItalicLearningProfile() {
    const st=italicLearningStats(); if(!st.total) return;
    if(!confirm(`Reset all ${st.total} learned typography examples for ${state.sourceProfile}? This cannot be undone unless you exported them.`)) return;
    const store=loadItalicLearningStore(); delete store[state.sourceProfile]; saveItalicLearningStore(store); state.italicLearningProfile=null; updateItalicLearningUi(); setStatus("Italic learning profile reset for this OCR source profile.");
  }

  function italicCalibrationKey(run) {
    return `${run.pageIndex}:${run.lineIndex}:${run.startWordIndex}:${run.endWordIndex}`;
  }

  // Build 53: once a spoiler-safe specimen is judged, consume its underlying
  // OCR words for this review session. Any overlapping candidate is skipped so
  // the same pixels cannot immediately come back in a differently sized run.
  function italicCalibrationWordKeys(run) {
    const pageIndex = Number(run?.pageIndex);
    const lineIndex = Number(run?.lineIndex);
    const start = Number(run?.startWordIndex);
    const end = Number(run?.endWordIndex);
    if (![pageIndex,lineIndex,start,end].every(Number.isFinite)) return [italicCalibrationKey(run)];
    const lo=Math.min(start,end), hi=Math.max(start,end), out=[];
    for(let i=lo;i<=hi;i++) out.push(`${pageIndex}:${lineIndex}:${i}`);
    return out;
  }
  function consumedItalicCalibrationWords() {
    const consumed=new Set();
    const runs=state.italicCalibrationReviewSet||[];
    runs.forEach(run=>{
      if(state.italicCalibrationLabels[italicCalibrationKey(run)]) {
        italicCalibrationWordKeys(run).forEach(k=>consumed.add(k));
      }
    });
    return consumed;
  }

  async function renderSpoilerSafeItalicCrop(canvasHost, run) {
    if (!canvasHost || !run?.reviewBox) return;
    const pageIndex = Number(run.pageIndex);
    const page = state.pages[pageIndex];
    const file = page?.file || state.files[pageIndex];
    if (!file) return;
    try {
      const img = await loadImageFromFile(file);
      const source = makeCroppedCanvas(img);
      const b = run.reviewBox;
      // Candidate only: no neighboring words, page number, chapter, or line context.
      const padX = Math.max(3, Math.round(Number(b.h || 20) * 0.12));
      const padY = Math.max(2, Math.round(Number(b.h || 20) * 0.10));
      const x = clamp(Math.floor(b.x - padX), 0, source.width - 1);
      const y = clamp(Math.floor(b.y - padY), 0, source.height - 1);
      const w = clamp(Math.ceil(b.w + padX * 2), 1, source.width - x);
      const h = clamp(Math.ceil(b.h + padY * 2), 1, source.height - y);
      const scale = Math.min(3, Math.max(1.35, 74 / Math.max(1, h)));
      const out = document.createElement("canvas");
      out.className = "italic-spoiler-crop";
      out.width = Math.max(1, Math.round(w * scale));
      out.height = Math.max(1, Math.round(h * scale));
      const ctx = out.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(source, x, y, w, h, 0, 0, out.width, out.height);
      canvasHost.replaceChildren(out);
    } catch (err) {
      console.warn("Could not render spoiler-safe italic specimen", err);
      canvasHost.textContent = "Specimen unavailable";
    }
  }

  function renderItalicCalibrationReview() {
    if (!els.italicCalibrationReview || !els.italicCalibrationReviewList) return;
    const runs = state.italicCalibrationReviewSet || [];
    els.italicCalibrationReviewList.innerHTML = "";

    const consumedWords = consumedItalicCalibrationWords();
    const reviewRuns = [...runs].filter(run => {
      const key=italicCalibrationKey(run);
      if(state.italicCalibrationLabels[key]) return false;
      if(italicCalibrationWordKeys(run).some(k=>consumedWords.has(k))) return false;
      if(state.italicReviewSelectionMode==="hunt"){
        const t=italicNormalizedSpecimenText(run);
        if(t && state.italicHuntSessionServedTexts?.has(t)) return false;
      }
      return true;
    });

    const run = reviewRuns[0] || null;
    if (run) {
      const key = italicCalibrationKey(run);
      const card = document.createElement("div");
      card.className = "italic-calibration-card spoiler-safe-italic-card";
      card.innerHTML = `
        <div class="italic-calibration-title"><strong>Next specimen</strong><span class="badge">spoiler-safe</span>${run.learnedItalicProbability==null?"":`<span class="badge">learned ${Math.round(run.learnedItalicProbability*100)}%</span>`}</div>
        <div class="italic-spoiler-specimen" aria-label="Isolated typography specimen"><span class="hint">Loading isolated specimen…</span></div>
        <div class="italic-calibration-actions">
          <button class="button secondary" data-previous ${state.italicReviewHistory?.length?"":"disabled"}>← Previous</button>
          <button class="button secondary" data-label="ITALIC">Italic</button>
          <button class="button secondary" data-label="ROMAN">Roman</button>
          <button class="button secondary" data-label="GLYPH">Glyph / Decorative</button>
          <button class="button secondary" data-fragment-toggle>Fragment: no</button>
          <button class="button secondary" data-label="UNSURE">Unsure</button>
          ${Array.isArray(run.splitChildren)&&run.splitChildren.length>1?'<button class="button secondary" data-split="words">Split</button>':''}
        </div>`;
      if(state.italicReviewSelectionMode==="validation"){
        const ib=card.querySelector('[data-label="ITALIC"]'), rb=card.querySelector('[data-label="ROMAN"]'), gb=card.querySelector('[data-label="GLYPH"]'), ub=card.querySelector('[data-label="UNSURE"]');
        if(ib) ib.textContent="Known italic"; if(rb) rb.textContent="Not a control"; if(gb) gb.textContent="Glyph / decorative"; if(ub) ub.textContent="Skip";
      }
      run.reviewIsFragment=false;
      card.querySelector("[data-fragment-toggle]")?.addEventListener("click",e=>{
        run.reviewIsFragment=!run.reviewIsFragment;
        e.currentTarget.textContent=run.reviewIsFragment?"Fragment: YES":"Fragment: no";
        e.currentTarget.classList.toggle("selected",run.reviewIsFragment);
      });
      card.querySelectorAll("[data-label]").forEach(btn => btn.addEventListener("click", () => {
        if (state.italicCalibrationLabels[key] && state.italicReviewSelectionMode!=="line-hunt") return;
        const round=state.italicReviewRoundStats;
        const label=btn.dataset.label;
        if(state.italicReviewSelectionMode==="line-hunt" && run.lineHunt && label!=="ROMAN" && round) round.linesReviewed=(round.linesReviewed||0)+1;
        if(state.italicReviewSelectionMode==="hunt"){
          if(!(state.italicHuntSessionServedTexts instanceof Set)) state.italicHuntSessionServedTexts=new Set();
          const servedText=italicNormalizedSpecimenText(run);
          if(servedText) state.italicHuntSessionServedTexts.add(servedText);
        }
        if(state.italicReviewSelectionMode==="line-hunt" && run.lineHunt && label==="ROMAN" && Array.isArray(run.splitChildren)){
          if(round){ round.presses=(round.presses||0)+1; round.roman=(round.roman||0)+1; round.linesReviewed=(round.linesReviewed||0)+1; }
          if(!Array.isArray(state.italicReviewHistory)) state.italicReviewHistory=[];
          state.italicReviewHistory.push(run);
          let added=0,updated=0,failed=0;
          for(const child of run.splitChildren){
            const ck=italicCalibrationKey(child); state.italicCalibrationLabels[ck]="ROMAN";
            child.reviewChosenLabel="ROMAN"; child.reviewIsFragment=false;
            const before=italicLearningStats(), result=saveItalicTrainingExample(child,"ROMAN");
            if(result?.ok){state.italicLearningProfile=null;const after=italicLearningStats();if(after.total>before.total)added++;else updated++;}else failed++;
          }
          if(round){round.newPersisted=(round.newPersisted||0)+added;round.updated=(round.updated||0)+updated;round.lineWordLabels=(round.lineWordLabels||0)+run.splitChildren.length;}
          updateItalicLearningUi();
          const queue=state.italicCalibrationReviewSet||[], idx=queue.indexOf(run); if(idx>=0) queue.splice(idx,1);
          setStatus(`LINE ROMAN · learned ${run.splitChildren.length} words · ${added} new / ${updated} updated${failed?` / ${failed} failed`:""} · ${Math.max(0,Number(round?.linesPlanned||100)-Number(round?.linesReviewed||0))} lines left`);
          renderItalicCalibrationReview(); return;
        }
        state.italicCalibrationLabels[key] = label;
        if(round){
          round.presses=(round.presses||0)+1;
          if(!round.selectionSources) round.selectionSources={};
          const src=run.huntSelectionSource||state.italicHuntSelectionSourceByKey?.[italicCalibrationKey(run)]||"unknown";
          round.selectionSources[src]=(round.selectionSources[src]||0)+1;
          const lk=String(label||"").toLowerCase();
          if(Object.prototype.hasOwnProperty.call(round,lk)) round[lk]=(round[lk]||0)+1;
          if(run.reviewIsFragment) round.fragment=(round.fragment||0)+1;
        }
        if(!Array.isArray(state.italicReviewHistory)) state.italicReviewHistory=[];
        run.reviewGeneralization={
          normalizedText:italicNormalizedSpecimenText(run),
          wordCount:Math.max(Number(run.wordCount||0),Math.abs(Number(run.endWordIndex)-Number(run.startWordIndex))+1,italicNormalizedSpecimenText(run).split(" ").filter(Boolean).length),
          appearedInConfirmedItalicTrainingBeforeLabel:(()=>{
            const t=italicNormalizedSpecimenText(run);
            return (currentItalicLearningProfile().examples||[]).some(x=>x.label==="ITALIC" &&
              String(x.text||x.specimenText||"").normalize("NFKC").toLocaleLowerCase()
              .replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ")===t);
          })()
        };
        run.reviewChosenLabel=label;
        if(run.reviewIsFragment){
          const rb=run.reviewBox||run.box||{}, txt=italicNormalizedSpecimenText(run);
          run.fragmentDiagnostic={neutralForItalicLearning:false,typographyLabel:label,normalizedText:txt,letters:(txt.match(/\p{L}/gu)||[]).length,wordCount:Number(run.wordCount||0),reviewBox:{x:Number(rb.x||0),y:Number(rb.y||0),w:Number(rb.w||rb.width||0),h:Number(rb.h||rb.height||0)},startWordIndex:Number(run.startWordIndex),endWordIndex:Number(run.endWordIndex),hasSplitChildren:Array.isArray(run.splitChildren)&&run.splitChildren.length>0,splitChildCount:Array.isArray(run.splitChildren)?run.splitChildren.length:0};
          if(round){ if(!Array.isArray(round.fragmentDiagnostics)) round.fragmentDiagnostics=[]; round.fragmentDiagnostics.push(run.fragmentDiagnostic); }
        }
        state.italicReviewHistory.push(run);
        if(state.italicReviewSelectionMode==="validation"){ run.validationLabel=label; }
        else {
          const before=italicLearningStats();
          const saveResult=saveItalicTrainingExample(run,label);
          if(saveResult?.ok) state.italicLearningProfile=null;
          const after=italicLearningStats();
          if(state.italicReviewRoundStats && label!=="UNSURE" && saveResult?.ok){
            if(after.total>before.total) state.italicReviewRoundStats.newPersisted=(state.italicReviewRoundStats.newPersisted||0)+1;
            else state.italicReviewRoundStats.updated=(state.italicReviewRoundStats.updated||0)+1;
          }
          updateItalicLearningUi();
          if(label==="UNSURE") setStatus("Unsure: skipped, not saved to training.");
          else if(!saveResult?.ok) setStatus(`SAVE FAILED · ${saveResult?.error||"unknown storage error"} · ${Math.round(Number(saveResult?.bytes||0)/1024)} KB attempted. Label was NOT confirmed durable.`);
          else if(after.total>before.total) setStatus(`SAVED TO INDEXEDDB QUEUE · ${label.toLowerCase()} · ${after.italic} italic / ${after.roman} Roman / ${after.glyph} glyph · ${Math.round(Number(saveResult.bytes||0)/1024)} KB store`);
          else setStatus(`UPDATED INDEXEDDB QUEUE · existing ${label.toLowerCase()} specimen · totals unchanged`);
        }
        if(state.italicReviewSelectionMode==="hunt" && Number(state.italicReviewRoundStats?.presses||0)>=100){
          state.italicCalibrationReviewSet=[];
          setStatus("HUNT SESSION COMPLETE · 100 decisions · start a new Hunt for the next batch.");
          renderItalicCalibrationReview();
          return;
        }
        renderItalicCalibrationReview();
      }));
      card.querySelector("[data-previous]")?.addEventListener("click",()=>{
        if(!Array.isArray(state.italicReviewHistory) || !state.italicReviewHistory.length) return;
        const previous=state.italicReviewHistory.pop();
        const previousKey=italicCalibrationKey(previous);
        if(state.italicReviewSelectionMode==="hunt"){
          const previousText=italicNormalizedSpecimenText(previous);
          if(previousText) state.italicHuntSessionServedTexts?.delete(previousText);
        }
        // Undo the prior review decision so it can be corrected. If it was a
        // training label, remove that saved row; a new Italic/Roman choice will
        // write the corrected example back exactly once.
        delete state.italicCalibrationLabels[previousKey];
        removeItalicTrainingExample(previous);
        const queue=state.italicCalibrationReviewSet||[];
        const idx=queue.indexOf(previous);
        if(idx>0){ queue.splice(idx,1); queue.unshift(previous); }
        else if(idx<0) queue.unshift(previous);
        updateItalicLearningUi();
        renderItalicCalibrationReview();
      });
      card.querySelector("[data-split]")?.addEventListener("click",()=>{
        const children=(run.splitChildren||[]).filter(child=>run.lineHunt || !state.italicCalibrationLabels[italicCalibrationKey(child)]);
        if(children.length<2) return;
        const queue=state.italicCalibrationReviewSet||[];
        const idx=queue.indexOf(run);
        if(idx>=0) queue.splice(idx,1,...children);
        else queue.unshift(...children);
        state.italicCalibrationReviewSet=queue;
        if(state.italicReviewSelectionMode==="line-hunt" && run.lineHunt && state.italicReviewRoundStats) state.italicReviewRoundStats.linesReviewed=(state.italicReviewRoundStats.linesReviewed||0)+1;
        setStatus(state.italicReviewSelectionMode==="line-hunt"?`LINE SPLIT · label ${children.length} words, then Line Hunt continues automatically.`:`Split mixed typography specimen into ${children.length} spoiler-safe word specimens.`);
        renderItalicCalibrationReview();
      });
      els.italicCalibrationReviewList.appendChild(card);
      renderSpoilerSafeItalicCrop(card.querySelector(".italic-spoiler-specimen"), run);
    } else {
      const done=document.createElement("div");
      done.className="italic-calibration-card";
      done.innerHTML = runs.length
        ? '<strong>Review queue complete.</strong><div class="hint">No unseen, non-overlapping spoiler-safe specimens remain in this queue.</div>'
        : '<strong>Ready for review.</strong><div class="hint">Choose Learned review or Random review above. Existing OCR data is enough; Repair Book and Final Polish are not prerequisites.</div>';
      els.italicCalibrationReviewList.appendChild(done);
    }

    const labeled = runs.filter(r => state.italicCalibrationLabels[italicCalibrationKey(r)]).length;
    if (els.italicCalibrationProgress) els.italicCalibrationProgress.textContent = `${labeled} labeled · ${reviewRuns.length} remaining`;
    if (els.exportItalicCalibrationLabels) els.exportItalicCalibrationLabels.disabled = labeled === 0;
  }

  function openItalicCalibrationReview() {
    if (state.sourceProfile !== "cloud-iowan") {
      setStatus("The supervised calibration review is intentionally limited to CloudLibrary / Iowan Old Style.");
      return;
    }
    downloadItalicDiagnostics(false);
    els.italicCalibrationReview?.scrollIntoView({behavior:"smooth", block:"start"});
  }

  function exportItalicCalibrationLabels() {
    const runs = state.italicCalibrationReviewSet || [];
    if (!runs.length) { setStatus("Build the Iowan calibration review first."); return; }
    const labeledRuns = runs.map(run => ({...run, reviewLabel: state.italicCalibrationLabels[italicCalibrationKey(run)] || null}));
    const counts = labeledRuns.reduce((a,r)=>{ if(r.reviewLabel) a[r.reviewLabel]=(a[r.reviewLabel]||0)+1; return a; },{});
    const payload = {
      format:"book-ocr-studio-iowan-supervised-labels-v1", buildVersion:BUILD_VERSION, exportedAt:new Date().toISOString(),
      sourceProfile:state.sourceProfile, summary:{total:labeledRuns.length,labeled:labeledRuns.filter(r=>r.reviewLabel).length,counts},
      note:"Human screenshot-ground-truth labels. Diagnostic only; no EPUB italics were changed.", runs:labeledRuns
    };
    const safeTitle=cleanFilename(els.bookTitle?.value||"book");
    downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),`${safeTitle}-iowan-italic-labels.json`);
    setStatus(`Exported ${payload.summary.labeled} screenshot-grounded Iowan labels. Automatic Iowan italics remain disabled.`);
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

  // v32: Guided Repair must persist source-supported wrapped continuations in
  // the canonical page text, not merely understand them later during Final Polish.
  // This is intentionally narrow: both text blocks must map to two consecutive raw
  // OCR lines, the first must be syntactically open, the second must begin lowercase,
  // and the source lines must be vertically adjacent. It fixes chapter-opening wrap
  // cases such as "...do manual / labor on Christmas Eve." without changing lanes.
  function mergeSourceAdjacentOpenParagraphs(page) {
    if (state.sourceProfile !== "cloud-iowan" || !Array.isArray(page?.layoutLines) || !page.layoutLines.length) return 0;
    const blocks = pageBlocks(page);
    if (blocks.length < 2) return 0;
    const norm = value => stripItalicMarkers(String(value || ""))
      .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
    const lines = page.layoutLines;
    const profile = state.bookLayoutProfile || buildBookLayoutProfile(state.pages);
    const typicalH = Number(profile?.typicalH) || 38;
    let merged = 0;

    for (let i = 0; i < blocks.length - 1; ) {
      const a = norm(blocks[i]), b = norm(blocks[i + 1]);
      if (!a || !b || isStructuralBlock(a) || isStructuralBlock(b) ||
          /[.!?…]["'’)]?$/.test(a) || !/^[a-z]/.test(b)) { i++; continue; }
      const aProbe = a.slice(-Math.min(56, a.length));
      const bProbe = b.slice(0, Math.min(56, b.length));
      let matched = false;
      for (let li = 0; li < lines.length - 1; li++) {
        const la = norm(lines[li]?.text), lb = norm(lines[li + 1]?.text);
        if (!la || !lb) continue;
        const aMatch = a.endsWith(la) || la.endsWith(aProbe) || a.includes(la.slice(-Math.min(36, la.length)));
        const bMatch = b.startsWith(lb) || lb.startsWith(bProbe) || bProbe.startsWith(lb.slice(0, Math.min(36, lb.length)));
        if (!aMatch || !bMatch) continue;
        const prevBottom = Number(lines[li]?.box?.y) + Number(lines[li]?.box?.h);
        const gap = Number(lines[li + 1]?.box?.y) - prevBottom;
        const adjacent = Number.isFinite(gap) && gap >= -6 && gap <= Math.max(typicalH * 0.72, 30);
        if (adjacent) { matched = true; break; }
      }
      if (!matched) { i++; continue; }
      blocks[i] = `${blocks[i].trim()} ${blocks[i + 1].trim()}`.replace(/\s+/g, " ");
      blocks.splice(i + 1, 1);
      merged++;
    }
    if (merged) writePageBlocks(page, blocks);
    return merged;
  }

  function autoMergeStrongContinuations() {
    let merged = 0;
    const norm = value => stripItalicMarkers(String(value || ""))
      .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

    // Polish is downstream of the known-good geometry reconstruction. For the
    // CloudLibrary/Iowan production profile, only merge an existing boundary when
    // saved source geometry independently reconstructs BOTH sides inside the same
    // paragraph. If geometry reconstructs B as its own paragraph, preserve it.
    const geometrySupportsMerge = (page, a, b) => {
      if (state.sourceProfile !== "cloud-iowan") return true;
      if (!Array.isArray(page?.layoutLines) || !page.layoutLines.length) return false;
      const rebuilt = reconstructParagraphsFromLayout(page.layoutLines, {
        messageMode: !!page.messageMode,
        bookProfile: state.bookLayoutProfile || buildBookLayoutProfile(state.pages)
      });
      const paras = (rebuilt?.paragraphs || []).map(p => norm(p.text)).filter(Boolean);
      const na = norm(a), nb = norm(b);
      if (!na || !nb) return false;
      // Dialogue starts are source-significant paragraph boundaries in this corpus.
      if (/^["']/.test(nb)) return false;
      const aTail = na.slice(-Math.min(90, na.length));
      const bHead = nb.slice(0, Math.min(90, nb.length));
      if (paras.some(p => p.includes(aTail) && p.includes(bHead) && p.indexOf(aTail) <= p.lastIndexOf(bHead))) return true;

      // v2.8.2: Repair a narrow class of false paragraph splits before the
      // terminal-punctuation audit. Reconstruction can itself preserve a bad
      // blank-line boundary, so use the raw source-line geometry as a second,
      // independent signal. The next block must begin lowercase, its source
      // line must sit on the body lane (a wrapped continuation, not an indented
      // paragraph start), and the preceding source line must be vertically
      // adjacent. This targets cases such as “appreciate / it, but…” and
      // “we are / composed…” without weakening source-supported boundaries.
      const lines = page.layoutLines || [];
      const profile = state.bookLayoutProfile || buildBookLayoutProfile(state.pages);
      const bodyLeft = Number(profile?.bodyLeft);
      const typicalH = Number(profile?.typicalH) || 38;
      const laneTol = Number(profile?.laneTolerance) || Math.max(10, typicalH * 0.32);
      if (!Number.isFinite(bodyLeft)) return false;

      const lineNorm = line => norm(line?.text || '');
      const bProbe = nb.slice(0, Math.min(42, nb.length));
      let bIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        const t = lineNorm(lines[i]);
        if (t && (t.startsWith(bProbe) || bProbe.startsWith(t.slice(0, Math.min(24, t.length))))) {
          bIndex = i;
          break;
        }
      }
      if (bIndex <= 0) return false;
      const bLine = lines[bIndex], prev = lines[bIndex - 1];
      const bx = Number(bLine?.box?.x);
      const prevBottom = Number(prev?.box?.y) + Number(prev?.box?.h);
      const gap = Number(bLine?.box?.y) - prevBottom;
      const indentLeft = Number(profile?.indentLeft);
      const onBodyLane = Number.isFinite(bx) && Math.abs(bx - bodyLeft) <= laneTol;
      const onIndentLane = Number.isFinite(bx) && Number.isFinite(indentLeft) && Math.abs(bx - indentLeft) <= laneTol;
      const verticallyAdjacent = Number.isFinite(gap) && gap <= Math.max(typicalH * 0.65, 28);
      const prevMatchesA = na.includes(lineNorm(prev).slice(-Math.min(32, lineNorm(prev).length))) ||
        lineNorm(prev).includes(na.slice(-Math.min(32, na.length)));

      // v30: Reconcile the same narrow indent-lane continuation that v29 now
      // handles during reconstruction before quote/terminal audits run. Paddle
      // can place a wrapped lowercase line on the 229 px paragraph lane. If the
      // preceding source line is vertically adjacent and the prior block is
      // syntactically open, that is continuation evidence, not a fresh paragraph.
      // This prevents healed dialogue such as “...do manual / labor on Christmas
      // Eve.” from generating phantom quote-balance and punctuation review cards.
      const previousOpen = /[A-Za-z0-9,;:]$/.test(na) && !/[.!?…]["'’)]?$/.test(na);
      const beginsLowercase = /^["'‘’“”]?\s*[a-z]/.test(nb);
      const beginsDialogue = /^["“]/.test(String(b || '').trim());
      const laneSupported = onBodyLane || (onIndentLane && previousOpen && beginsLowercase && !beginsDialogue);
      return laneSupported && verticallyAdjacent && prevMatchesA;
    };

    state.pages.forEach(page => {
      const blocks = pageBlocks(page);
      let changed = false;
      for (let i = 0; i < blocks.length - 1; ) {
        const a = stripItalicMarkers(blocks[i]).trim();
        const b = stripItalicMarkers(blocks[i + 1]).trim();
        const aEndsOpen = /[A-Za-z0-9,;:]$/.test(a) && !/[.!?…]["”'’)]?$/.test(a);
        const bContinues = /^[“"‘']?[a-z]/.test(b);
        const geometryOkay = geometrySupportsMerge(page, a, b);
        if (!isStructuralBlock(a) && !isStructuralBlock(b) && aEndsOpen && bContinues && geometryOkay) {
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

  function messageBubbleWrapEvidence(page, para, direction = "next") {
    // v2.8.3: CloudLibrary message bubbles can contain multiple visual OCR lines.
    // Final Polish must not treat those wrapped lines as separate prose paragraphs.
    // This is intentionally audit-only: it does not alter the known-good paragraph
    // lane/reconstruction model or Kindle's dedicated message workflow.
    if (state.sourceProfile !== "cloud-iowan") return false;
    const lines = Array.isArray(page?.layoutLines) ? page.layoutLines : [];
    if (lines.length < 2) return false;

    const norm = value => stripItalicMarkers(String(value || ""))
      .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
    const target = norm(para);
    if (!target) return false;

    const profile = state.bookLayoutProfile || buildBookLayoutProfile(state.pages);
    const bodyLeft = Number(profile?.bodyLeft);
    const indentLeft = Number(profile?.indentLeft);
    const typicalH = Number(profile?.typicalH) || 38;
    const laneTol = Number(profile?.laneTolerance) || Math.max(10, typicalH * 0.32);
    const lineNorm = line => norm(line?.text || "");

    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      const t = lineNorm(lines[i]);
      if (!t) continue;
      const probe = target.slice(0, Math.min(36, target.length));
      if (t === target || t.startsWith(probe) || target.startsWith(t.slice(0, Math.min(28, t.length)))) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return false;
    const otherIdx = direction === "previous" ? idx - 1 : idx + 1;
    if (otherIdx < 0 || otherIdx >= lines.length) return false;
    const a = direction === "previous" ? lines[otherIdx] : lines[idx];
    const b = direction === "previous" ? lines[idx] : lines[otherIdx];
    if (!a?.box || !b?.box) return false;

    const ax = Number(a.box.x), bx = Number(b.box.x);
    const aBottom = Number(a.box.y) + Number(a.box.h);
    const gap = Number(b.box.y) - aBottom;
    if (![ax, bx, gap].every(Number.isFinite)) return false;

    // Wrapped lines inside one bubble are tightly stacked and share a bubble text
    // lane. Normal book prose lives on the learned 181/229 lanes; exclude those so
    // this cannot become another general paragraph-merging heuristic.
    const sameBubbleLane = Math.abs(ax - bx) <= Math.max(34, typicalH * 0.9);
    const tightlyStacked = gap >= -6 && gap <= Math.max(typicalH * 0.72, 30);
    const offBookLanes = Number.isFinite(bodyLeft) && Number.isFinite(indentLeft) &&
      Math.min(Math.abs(ax - bodyLeft), Math.abs(ax - indentLeft),
               Math.abs(bx - bodyLeft), Math.abs(bx - indentLeft)) > laneTol;
    if (!sameBubbleLane || !tightlyStacked || !offBookLanes) return false;

    // Require message-layout context too. A repeated all-caps speaker label is
    // strong evidence, while alternating off-lane text blocks handles unlabeled
    // outgoing bubbles on the same page.
    const blocks = pageBlocks(page).map(norm);
    const speakerLabels = blocks.filter(t => /^[a-z][a-z .'-]{1,24}$/.test(t) && t === t.toLowerCase())
      .filter(t => /^[a-z]+(?: [a-z]+)?$/.test(t));
    const rawSpeakerCount = (String(page.text || "").match(/(?:^|\n\n)[A-Z][A-Z .'-]{2,24}(?=\n\n|$)/gm) || []).length;
    const offLaneCount = lines.filter(line => {
      const x = Number(line?.box?.x);
      return Number.isFinite(x) && Number.isFinite(bodyLeft) && Number.isFinite(indentLeft) &&
        Math.min(Math.abs(x - bodyLeft), Math.abs(x - indentLeft)) > laneTol;
    }).length;
    return rawSpeakerCount >= 1 || offLaneCount >= 4 || speakerLabels.length >= 2;
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

    // v31: Final Polish audits must reason over the same continuation structure
    // as reconstruction, even when page.text still contains a temporary blank-line
    // split. This is AUDIT-ONLY: it does not mutate repaired text. It prevents one
    // source-supported continuation from spawning quote-balance + punctuation ghosts.
    const auditContinuation = (pageIndex, paraIndex, direction = "next") => {
      const page = state.pages[pageIndex];
      if (!page) return false;
      const paras = pageBlocks(page);
      const a = stripItalicMarkers(paras[paraIndex] || "").trim();
      if (!a) return false;
      const open = /[A-Za-z0-9,;:]$/.test(a) && !/[.!?…]["”'’)]?$/.test(a);
      if (!open) return false;

      let b = "", nextPage = page, crossPage = false;
      if (direction === "next" && paraIndex + 1 < paras.length) {
        b = stripItalicMarkers(paras[paraIndex + 1] || "").trim();
      } else if (direction === "next" && paraIndex === paras.length - 1 && state.pages[pageIndex + 1] && !state.pages[pageIndex + 1].chapterStart) {
        nextPage = state.pages[pageIndex + 1];
        b = stripItalicMarkers(pageBlocks(nextPage)[0] || "").trim();
        crossPage = true;
      } else return false;
      if (!b || !/^[“"‘']?[a-z]/.test(b) || /^["“]/.test(b)) return false;

      // Cross-page prose continuation: an open final paragraph followed by a
      // lowercase first paragraph on the next non-chapter page is strong evidence.
      if (crossPage) return true;

      // Same-page continuation: require saved source geometry to put B directly
      // after the source line that ends A. Accept body-lane wraps and the narrow
      // v29 indent-lane lowercase wrap case.
      const lines = Array.isArray(page.layoutLines) ? page.layoutLines : [];
      if (!lines.length) return false;
      const profile = state.bookLayoutProfile || buildBookLayoutProfile(state.pages);
      const bodyLeft = Number(profile?.bodyLeft), indentLeft = Number(profile?.indentLeft);
      const typicalH = Number(profile?.typicalH) || 38;
      const laneTol = Number(profile?.laneTolerance) || Math.max(10, typicalH * 0.32);
      const norm = v => stripItalicMarkers(String(v || "")).replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/\s+/g,' ').trim().toLowerCase();
      const na = norm(a), nb = norm(b);
      let best = null;
      for (let i = 1; i < lines.length; i++) {
        const cur = norm(lines[i]?.text), prev = norm(lines[i-1]?.text);
        if (!cur || !prev) continue;
        const head = nb.slice(0, Math.min(34, nb.length));
        if (!(cur.startsWith(head) || head.startsWith(cur.slice(0, Math.min(22, cur.length))))) continue;
        const tail = prev.slice(-Math.min(34, prev.length));
        const tailMatch = na.endsWith(tail) || na.includes(tail) || prev.includes(na.slice(-Math.min(28, na.length)));
        if (!tailMatch) continue;
        const gap = Number(lines[i]?.box?.y) - (Number(lines[i-1]?.box?.y) + Number(lines[i-1]?.box?.h));
        const x = Number(lines[i]?.box?.x);
        const adjacent = Number.isFinite(gap) && gap >= -6 && gap <= Math.max(typicalH * .72, 30);
        const body = Number.isFinite(x) && Number.isFinite(bodyLeft) && Math.abs(x-bodyLeft) <= laneTol;
        const indent = Number.isFinite(x) && Number.isFinite(indentLeft) && Math.abs(x-indentLeft) <= laneTol;
        if (adjacent && (body || indent)) { best = true; break; }
      }
      return !!best;
    };

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
      const samePageAdjacent = b.pageIndex === a.pageIndex && b.paraIndex === a.paraIndex + 1;
      const sameChapter = !state.pages[b.pageIndex]?.chapterStart;
      const touchesBoundary = a.paraIndex === a.paraCount - 1 && b.paraIndex === 0 && b.pageIndex === a.pageIndex + 1;
      const combinedQuotes = ((a.plain + " " + b.plain).match(/["“”]/g) || []).length;
      const continuation = samePageAdjacent
        ? auditContinuation(a.pageIndex, a.paraIndex, "next")
        : (sameChapter && touchesBoundary && auditContinuation(a.pageIndex, a.paraIndex, "next"));

      if ((samePageAdjacent || (sameChapter && touchesBoundary)) && continuation && combinedQuotes % 2 === 0) {
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
          // v31: if the audit representation has a source-supported same-page
          // or cross-page continuation, this is not a real paragraph ending.
          if (auditContinuation(pageIndex, paraIndex, "next")) return;
          // A visual line ending inside a CloudLibrary text bubble is not a
          // paragraph ending, so it must never become a punctuation review card.
          if (messageBubbleWrapEvidence(page, para, "next")) return;
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
          // Likewise, the second visual line of a message bubble is not a tiny
          // paragraph fragment. Suppress the audit card without changing text.
          if (messageBubbleWrapEvidence(page, para, "previous")) return;
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
      const profileResult = applyProfileKnownOcrCleanup(result.text);
      page.text = profileResult.text;
      result.fixedCount = (result.fixedCount || 0) + (profileResult.fixedCount || 0);
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

      // v33: overlays/manual-safe stages can reintroduce an OCR-era blank-line split.
      // Whole-book mode intentionally uses null pageIndexes, so normalize it to
      // an iterable list here without changing the established Dropcap APIs.
      let sourceContinuationMerges = 0;
      const continuationPageIndexes = pageIndexes || state.pages.map((_, pageIndex) => pageIndex);
      for (const pageIndex of continuationPageIndexes) sourceContinuationMerges += mergeSourceAdjacentOpenParagraphs(state.pages[pageIndex]);
      if (sourceContinuationMerges) saveCheckpoint();

      repairStage = els.geometryAssist?.checked ? "Dropcap Rescue · geometry on" : "Dropcap Rescue · geometry off";
      setGuidedProgress("5/5 · Dropcaps", 100, "reconstructing");
      const quotedDropcapsFixed = applyCloudIowanQuotedDropcapOwnership(pageIndexes);
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

      // Last writer wins for substantive text: OCR < automated repair < user manual edits.
      // Reapply once more after all automatic dropcap work. Then run one final
      // deterministic QA sweep over that restored text. This catches OCR-era
      // artifacts preserved inside a durable manual overlay (for example
      // `fi rst`, `dificult`, or `days.. .`) without rewriting prose.
      applyRepairOverlay();
      repairStage = "final deterministic QA sweep";
      const finalQaCleanup = applySafePolishToProject(pageIndexes) || { fixedCount:0 };
      const finalQaLigatures = runSplitLigaturePolish(pageIndexes) || { fixedCount:0, ambiguousCount:0 };

      // v35: page.text is not the only post-OCR text representation. Italic
      // diagnostics and other geometry-aware consumers read layoutLines/rawOcrItems
      // directly. Apply the same deterministic, CloudLibrary/Iowan-safe cleanup to
      // those saved line records so every downstream stage sees the corrected
      // characters without rerunning OCR. Geometry/boxes are left untouched.
      repairStage = "synchronize canonical OCR line text";
      const finalQaLineSync = synchronizeCanonicalOcrLineText(pageIndexes);

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

  function applyProfileKnownOcrCleanup(text) {
    if (state.sourceProfile !== "cloud-iowan") {
      return { text: String(text ?? ""), fixedCount: 0, knownWordOcr: 0, stackedDashArtifacts: 0, exactPunctuationArtifacts: 0 };
    }
    const repair = globalThis.BookOcrEpubPolish?.repairCloudIowanKnownArtifacts;
    if (typeof repair !== "function") {
      return { text: String(text ?? ""), fixedCount: 0, knownWordOcr: 0, stackedDashArtifacts: 0, exactPunctuationArtifacts: 0 };
    }
    return repair(text);
  }


  function synchronizeCanonicalOcrLineText(pageIndexes = null) {
    if (state.sourceProfile !== "cloud-iowan") return { fixedCount: 0, lineCount: 0 };
    const safe = globalThis.BookOcrEpubPolish?.safePolishText;
    const ligature = globalThis.BookOcrEpubPolish?.repairSplitLigatures;
    const selected = pageIndexes ? new Set(pageIndexes) : null;
    let fixedCount = 0;
    let lineCount = 0;

    const clean = value => {
      let text = String(value ?? "");
      const before = text;
      if (typeof safe === "function") text = safe(text).text;
      text = applyProfileKnownOcrCleanup(text).text;
      if (typeof ligature === "function") text = ligature(text).text;
      if (text !== before) fixedCount++;
      return text;
    };

    state.pages.forEach((page, pageIndex) => {
      if (selected && !selected.has(pageIndex)) return;
      for (const key of ["layoutLines", "rawOcrItems"]) {
        if (!Array.isArray(page?.[key])) continue;
        page[key].forEach(item => {
          if (!item || typeof item.text !== "string") return;
          item.text = clean(item.text);
          lineCount++;
        });
      }
    });
    return { fixedCount, lineCount };
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
      const profileResult = applyProfileKnownOcrCleanup(result.text);
      page.text = profileResult.text;
      result.fixedCount = (result.fixedCount || 0) + (profileResult.fixedCount || 0);
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

  async function runNeuralItalicN1(file){
    const status=els.neuralItalicN1Status||els.statusBox;
    const say=t=>{if(status)status.textContent=t;};
    if(!window.tf){say("TensorFlow.js did not load. Check the network connection and refresh.");return;}
    let payload;try{payload=JSON.parse(await file.text());}catch{say("Could not read that crop JSON.");return;}
    const rows=(payload.crops||[]).filter(r=>(r.label==="ITALIC"||r.label==="ROMAN")&&r.pngDataUrl&&Number.isFinite(Number(r.source?.pageIndex)));
    if(rows.length<100){say("This file does not contain enough labeled PNG crops.");return;}
    say(`N1 · decoding ${rows.length} crops…`);
    const decode=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=src;});
    const pages=[...new Set(rows.map(r=>Number(r.source.pageIndex)))].sort((a,b)=>a-b);
    const hash=n=>{let x=(n+1)*2654435761>>>0;x^=x>>>16;return x>>>0;};
    const shuffled=[...pages].sort((a,b)=>hash(a)-hash(b)),nTest=Math.max(1,Math.round(shuffled.length*.15)),nVal=Math.max(1,Math.round(shuffled.length*.15));
    const testPages=new Set(shuffled.slice(0,nTest)),valPages=new Set(shuffled.slice(nTest,nTest+nVal)),splitFor=r=>testPages.has(Number(r.source.pageIndex))?"test":valPages.has(Number(r.source.pageIndex))?"validation":"train";
    const tensors=[],labels=[],splits=[],meta=[];
    for(let i=0;i<rows.length;i++){
      const r=rows[i];try{const im=await decode(r.pngDataUrl),c=document.createElement("canvas");c.width=48;c.height=32;const cx=c.getContext("2d");cx.fillStyle="#fff";cx.fillRect(0,0,48,32);const scale=Math.min(44/im.width,28/im.height),w=Math.max(1,im.width*scale),h=Math.max(1,im.height*scale);cx.drawImage(im,(48-w)/2,(32-h)/2,w,h);const data=cx.getImageData(0,0,48,32).data,arr=new Float32Array(48*32);for(let j=0;j<arr.length;j++)arr[j]=(255-(data[j*4]+data[j*4+1]+data[j*4+2])/3)/255;tensors.push(arr);labels.push(r.label==="ITALIC"?1:0);splits.push(splitFor(r));meta.push(r);}catch{}
      if(i%200===0){say(`N1 · decoding ${i}/${rows.length}…`);await new Promise(requestAnimationFrame);}
    }
    const idx=kind=>splits.map((x,i)=>x===kind?i:-1).filter(i=>i>=0),trainI=idx("train"),valI=idx("validation"),testI=idx("test");
    const makeX=ids=>tf.tensor4d(ids.flatMap(i=>Array.from(tensors[i])),[ids.length,32,48,1]),makeY=ids=>tf.tensor2d(ids.map(i=>[labels[i]]),[ids.length,1]);
    const tx=makeX(trainI),ty=makeY(trainI),vx=makeX(valI),vy=makeY(valI);
    const pos=trainI.reduce((a,i)=>a+labels[i],0),neg=trainI.length-pos,classWeight={0:1,1:Math.max(1,neg/Math.max(1,pos))};
    const model=tf.sequential();model.add(tf.layers.conv2d({inputShape:[32,48,1],filters:8,kernelSize:3,activation:"relu",padding:"same"}));model.add(tf.layers.maxPooling2d({poolSize:2}));model.add(tf.layers.conv2d({filters:16,kernelSize:3,activation:"relu",padding:"same"}));model.add(tf.layers.maxPooling2d({poolSize:2}));model.add(tf.layers.flatten());model.add(tf.layers.dense({units:24,activation:"relu"}));model.add(tf.layers.dropout({rate:.25}));model.add(tf.layers.dense({units:1,activation:"sigmoid"}));model.compile({optimizer:tf.train.adam(.001),loss:"binaryCrossentropy"});
    say(`N1 · training on ${trainI.length} crops (${pos} Italic)…`);
    const history=await model.fit(tx,ty,{epochs:12,batchSize:64,shuffle:true,classWeight,validationData:[vx,vy],callbacks:{onEpochEnd:async(e,l)=>{say(`N1 · epoch ${e+1}/12 · loss ${Number(l.loss).toFixed(4)} · val ${Number(l.val_loss).toFixed(4)}`);await tf.nextFrame();}}});
    const sx=makeX(testI),pred=Array.from(model.predict(sx).dataSync()),truth=testI.map(i=>labels[i]);
    const thresholds=[.2,.3,.4,.5,.6,.7,.8,.9],metrics=thresholds.map(t=>{let tp=0,fp=0,tn=0,fn=0;truth.forEach((y,i)=>{const p=pred[i]>=t;if(y&&p)tp++;else if(!y&&p)fp++;else if(!y&&!p)tn++;else fn++;});return{threshold:t,tp,fp,tn,fn,precision:tp/Math.max(1,tp+fp),recall:tp/Math.max(1,tp+fn),f1:2*tp/Math.max(1,2*tp+fp+fn)};});
    const ranked=testI.map((ri,j)=>({score:pred[j],label:meta[ri].label,text:meta[ri].text,pageIndex:meta[ri].source?.pageIndex,lineIndex:meta[ri].source?.lineIndex,id:meta[ri].id})).sort((a,b)=>b.score-a.score);
    const top=k=>{const q=ranked.slice(0,k),it=q.filter(x=>x.label==="ITALIC").length;return{k,italic:it,roman:q.length-it,precision:it/Math.max(1,q.length)};};
    const result={experiment:"Neural Italic N1",buildVersion:BUILD_VERSION,sourceFormat:payload.format,createdAt:new Date().toISOString(),architecture:"48x32 grayscale padded crops; Conv8-MaxPool-Conv16-MaxPool-Dense24-Dropout-Dense1",split:{method:"deterministic page-grouped 70/15/15",train:trainI.length,validation:valI.length,test:testI.length,trainPages:pages.length-nTest-nVal,validationPages:nVal,testPages:nTest,trainItalics:pos,testItalics:truth.reduce((a,x)=>a+x,0)},classWeight,epochs:12,lossHistory:history.history.loss,valLossHistory:history.history.val_loss,thresholdMetrics:metrics,topRanks:[20,50,100,250].map(top),rankedTest:ranked};
    downloadBlob(new Blob([JSON.stringify(result)],{type:"application/json"}),`neural-italic-n1-build-${BUILD_VERSION}.json`);
    const best=[...metrics].sort((a,b)=>b.f1-a.f1)[0];say(`N1 complete · test ${testI.length} crops / ${result.split.testItalics} Italic · best tested threshold ${best.threshold}: precision ${(best.precision*100).toFixed(1)}%, recall ${(best.recall*100).toFixed(1)}%, F1 ${(best.f1*100).toFixed(1)}% · results downloaded.`);
    tf.dispose([tx,ty,vx,vy,sx]);model.dispose();
  }

  async function exportLabeledItalicCropDataset(){
    const examples=(currentItalicLearningProfile().examples||[]).filter(x=>(x.label==="ITALIC"||x.label==="ROMAN")&&italicExamplePhysicalKey(x));
    if(!examples.length){setStatus("No persisted Italic/Roman specimens with recoverable physical locations are available.");return;}
    const wordBoxesForPage=pi=>{
      const page=state.pages?.[pi],out=new Map();if(!page)return out;
      const lines=Array.isArray(page.layoutLines)?page.layoutLines:[];
      lines.forEach((line,li)=>{
        const text=String(line?.text||"").trim(),box=line?.box;if(!text||!box)return;
        const tokens=text.split(/\s+/).filter(Boolean),total=tokens.reduce((a,t)=>a+Math.max(1,t.length),0),gap=Math.max(0,Number(box.w||0)*.015),usable=Math.max(1,Number(box.w||0)-gap*Math.max(0,tokens.length-1));let x=Number(box.x||0);
        tokens.forEach((tok,wi)=>{const w=usable*Math.max(1,tok.length)/Math.max(1,total);out.set(`${li}:${wi}`,{x,y:Number(box.y||0),w,h:Number(box.h||0),approximate:true});x+=w+gap;});
      });
      return out;
    };
    const liveByPhysical=new Map();for(const run of (state.italicCalibrationReviewSet||[])){const key=(Number.isFinite(Number(run.pageIndex))&&Number.isFinite(Number(run.lineIndex))&&Number.isFinite(Number(run.startWordIndex)))?`${Number(run.pageIndex)}:${Number(run.lineIndex)}:${Number(run.startWordIndex)}`:null;if(key&&run.reviewBox&&!liveByPhysical.has(key))liveByPhysical.set(key,run.reviewBox);}
    const byPage=new Map();for(const x of examples){const key=italicExamplePhysicalKey(x),pi=Number(key?.split(":")[0]);if(!Number.isFinite(pi))continue;if(!byPage.has(pi))byPage.set(pi,[]);byPage.get(pi).push(x);}
    const rows=[];let done=0,failed=0,exactGeometry=0,approxGeometry=0;
    const audit={sampleSize:0,italic:[],roman:[],geometryCounts:{},warnings:[]};
    const auditPick=(arr,n)=>{if(arr.length<=n)return [...arr];const out=[];for(let i=0;i<n;i++)out.push(arr[Math.round(i*(arr.length-1)/(n-1))]);return out;};
    setStatus(`Preparing neural crop dataset · 0/${examples.length} specimens…`);
    for(const [pi,list] of byPage){
      const file=state.pages?.[pi]?.file||state.files?.[pi];if(!file){failed+=list.length;continue;}
      const approx=wordBoxesForPage(pi);
      try{
        const img=await loadImageFromFile(file),pageCanvas=makeCroppedCanvas(img);
        for(const x of list){
          const physical=italicExamplePhysicalKey(x),parts=physical.split(":").map(Number),line=parts[1],startWord=parts[2],endWord=Number.isFinite(Number(x.endWordIndex))?Number(x.endWordIndex):startWord;
          let b=x.reviewBox||state.italicValidationEvidenceByPhysical?.get(physical)?.reviewBox||liveByPhysical.get(physical)||null,geometry="exact";
          if(!(Number(b?.w??b?.width)>0&&Number(b?.h??b?.height)>0)){
            const boxes=[];for(let wi=startWord;wi<=endWord;wi++){const q=approx.get(`${line}:${wi}`);if(q)boxes.push(q);}
            if(boxes.length){const left=Math.min(...boxes.map(q=>q.x)),top=Math.min(...boxes.map(q=>q.y)),right=Math.max(...boxes.map(q=>q.x+q.w)),bottom=Math.max(...boxes.map(q=>q.y+q.h));b={x:left,y:top,w:right-left,h:bottom-top};geometry="layout-line-proportional";}
          }
          if(!(Number(b?.w)>0&&Number(b?.h)>0)){failed++;continue;}
          const padX=Math.max(2,Number(b.h)*.18),padY=Math.max(2,Number(b.h)*.12),sx=Math.max(0,Math.floor(Number(b.x)-padX)),sy=Math.max(0,Math.floor(Number(b.y)-padY)),sw=Math.ceil(Number(b.w)+padX*2),sh=Math.ceil(Number(b.h)+padY*2),w=Math.max(1,Math.min(sw,pageCanvas.width-sx)),h=Math.max(1,Math.min(sh,pageCanvas.height-sy));if(w<=0||h<=0){failed++;continue;}
          const crop=document.createElement("canvas");crop.width=w;crop.height=h;crop.getContext("2d").drawImage(pageCanvas,sx,sy,w,h,0,0,w,h);
          rows.push({id:x.id,label:x.label,group:{page:pi,token:String(x.normalizedText||x.specimenText||"").toLocaleLowerCase()},source:{pageIndex:pi,lineIndex:line,startWordIndex:startWord,endWordIndex:endWord,geometry,reviewBox:{x:sx,y:sy,w,h}},text:String(x.normalizedText||x.specimenText||""),width:w,height:h,pngDataUrl:crop.toDataURL("image/png")});
          if(geometry==="exact")exactGeometry++;else approxGeometry++;crop.width=1;crop.height=1;done++;if(done%100===0){setStatus(`Preparing neural crop dataset · ${done}/${examples.length} specimens…`);await new Promise(requestAnimationFrame);}
        }
        pageCanvas.width=1;pageCanvas.height=1;
      }catch(err){console.warn("Could not export neural crops for page",pi,err);failed+=list.length;}
    }
    const italicRows=rows.filter(x=>x.label==="ITALIC"),romanRows=rows.filter(x=>x.label==="ROMAN");
    const auditRows=[...auditPick(italicRows,24),...auditPick(romanRows,24)];
    audit.sampleSize=auditRows.length;
    for(const row of auditRows){const entry={id:row.id,label:row.label,text:row.text,source:row.source,width:row.width,height:row.height,pngDataUrl:row.pngDataUrl};(row.label==="ITALIC"?audit.italic:audit.roman).push(entry);audit.geometryCounts[row.source.geometry]=(audit.geometryCounts[row.source.geometry]||0)+1;}
    if(!exactGeometry)audit.warnings.push("No exact persisted review boxes were available; every audited crop uses reconstructed layout-line-proportional geometry.");
    const payload={format:"book-ocr-studio-neural-italic-crops-v3",buildVersion:BUILD_VERSION,exportedAt:new Date().toISOString(),sourceProfile:state.sourceProfile||"default",counts:{requested:examples.length,exported:rows.length,failed,italic:rows.filter(x=>x.label==="ITALIC").length,roman:rows.filter(x=>x.label==="ROMAN").length,exactGeometry,approxGeometry},cropAudit:audit,geometryNote:"Build 206 embeds a deterministic 48-crop visual audit sample (up to 24 Italic + 24 Roman) so reconstructed geometry can be inspected before neural training. Exact review boxes are preferred. When unavailable after reload, Build 205 reconstructs a conservative word crop from the persisted OCR line box and word position; geometry is explicitly tagged so neural experiments can compare/exclude approximations.",splitGuardrails:{recommended:"group by page for primary held-out split; token grouping as secondary leakage stress test",warning:"Do not randomly split individual crops. Repeated words and neighboring typography can create visual near-duplicate leakage."},crops:rows};
    const title=cleanFilename(els.bookTitle?.value||"book"),blob=new Blob([JSON.stringify(payload)],{type:"application/json"});downloadBlob(blob,`${title}-neural-italic-crops-build-${BUILD_VERSION}.json`);setStatus(`Neural crop dataset + ${audit.sampleSize}-crop visual audit exported · ${rows.length} crops (${payload.counts.italic} italic · ${payload.counts.roman} Roman) · ${exactGeometry} exact / ${approxGeometry} recovered geometry${failed?` · ${failed} failed`:""}.`);
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


  function applySourceProfile(profile, { preserveCrop = false } = {}) {
    const next = profile === "kindle-georgia" ? "kindle-georgia" : profile === "custom" ? "custom" : "cloud-iowan";
    state.sourceProfile = next;
    if (els.sourceProfile && els.sourceProfile.value !== next) els.sourceProfile.value = next;
    if (!preserveCrop) {
      if (next === "cloud-iowan") {
        els.cropTop.value = 0;
        els.cropBottom.value = 75;
        els.cropSides.value = 0;
      } else if (next === "kindle-georgia") {
        els.cropTop.value = 130;
        els.cropBottom.value = 0;
        els.cropSides.value = 0;
      }
    }
    syncCropPresetUi();
    updatePreview().catch(err => console.warn("Could not refresh profile crop preview", err));
    if (state.files.length) saveCheckpoint();
  }

  function defaultPreviewIndex() {
    if (!state.files.length) return 0;
    // Prefer a representative middle page instead of page 1, which is often a
    // chapter opener with title whitespace/dropcap geometry.
    return clamp(Math.floor(state.files.length * 0.45), 0, state.files.length - 1);
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

  els.sourceProfile?.addEventListener("change", () => applySourceProfile(els.sourceProfile.value));
  els.previewPrev?.addEventListener("click", () => {
    if (!state.files.length) return;
    state.cropPreviewIndex = clamp(state.cropPreviewIndex - 1, 0, state.files.length - 1);
    updatePreview().catch(err => console.warn("Could not render previous crop sample", err));
  });
  els.previewNext?.addEventListener("click", () => {
    if (!state.files.length) return;
    state.cropPreviewIndex = clamp(state.cropPreviewIndex + 1, 0, state.files.length - 1);
    updatePreview().catch(err => console.warn("Could not render next crop sample", err));
  });

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
    state.cropPreviewIndex = defaultPreviewIndex();
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
      const visualRestored = await restoreCachedVisualItalicResults();
      if (!visualRestored) {
        setStatus(`Recovered ${restored} processed pages. Tap Process all pages to resume at page ${Math.min(restored + 1, state.files.length)}, or review what is already saved.`);
      }
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
  els.downloadItalicDiagnostics?.addEventListener("click", () => downloadItalicDiagnostics(true));
  els.exportItalicCalibrationLabels?.addEventListener("click", exportItalicCalibrationLabels);
  els.exportItalicLearning?.addEventListener("click", exportItalicLearningProfile);
  els.importItalicLearning?.addEventListener("click", ()=>els.importItalicLearningFile?.click());
  els.importItalicLearningFile?.addEventListener("change", ()=>{ importItalicLearningProfileFile(els.importItalicLearningFile.files?.[0]); els.importItalicLearningFile.value=""; });
  els.resetItalicLearning?.addEventListener("click", resetItalicLearningProfile);
  initializeItalicLearningDb();
  updateItalicLearningUi();
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

  async function applyItalicPixelAssistToQueue(mode){
    if(mode!=="learned"&&mode!=="hunt"&&mode!=="validation")return false;
    let model=null;try{model=JSON.parse(localStorage.getItem("bookOcrStudio.italicPixelAssist.v1")||"null");}catch(_){}
    const modelReady=!!(model&&model.sourceProfile===state.sourceProfile&&Array.isArray(model.features)&&model.features.length>=3);
    const runs=state.italicCalibrationReviewSet||[]; if(!runs.length)return false;
    const measure=(canvas,b)=>{
      const pad=Math.max(1,Math.round(b.h*.08)),x=Math.max(0,Math.floor(b.x-pad)),y=Math.max(0,Math.floor(b.y-pad)),w=Math.min(canvas.width-x,Math.max(4,Math.ceil(b.w+2*pad))),h=Math.min(canvas.height-y,Math.max(4,Math.ceil(b.h+2*pad)));if(w<4||h<4)return null;
      const d=canvas.getContext("2d",{willReadFrequently:true}).getImageData(x,y,w,h).data,gray=new Float32Array(w*h);let sum=0;
      for(let i=0,j=0;i<d.length;i+=4,j++){const g=.299*d[i]+.587*d[i+1]+.114*d[i+2];gray[j]=g;sum+=g;}
      const mean=sum/gray.length,thr=Math.max(70,Math.min(210,mean-30)),rows=[],left=[],right=[];let ink=0;
      for(let yy=0;yy<h;yy++){let sx=0,n=0,lo=w,hi=-1;for(let xx=0;xx<w;xx++)if(gray[yy*w+xx]<thr){sx+=xx;n++;ink++;lo=Math.min(lo,xx);hi=Math.max(hi,xx);}if(n){rows.push({y:yy,c:sx/n});left.push({y:yy,x:lo});right.push({y:yy,x:hi});}}
      const slope=pts=>{if(pts.length<3)return 0;const my=pts.reduce((a,p)=>a+p.y,0)/pts.length,mx=pts.reduce((a,p)=>a+p.x,0)/pts.length;let num=0,den=0;for(const p of pts){num+=(p.y-my)*(p.x-mx);den+=(p.y-my)**2;}return den?num/den:0;};
      const cs=rows.map((p,i)=>i?(p.c-rows[i-1].c)/Math.max(1,p.y-rows[i-1].y):0).slice(1);
      const leanConsistency=cs.length?1/(1+Math.sqrt(cs.reduce((a,v)=>a+(v-cs.reduce((q,z)=>q+z,0)/cs.length)**2,0)/cs.length)):0;
      return {leanConsistency,inkOccupancy:ink/(w*h),contourAsymmetry:Math.abs(slope(left)-slope(right))};
    };
    const prob=f=>{if(!modelReady)return null;let si=0,sr=0;for(const m of model.features){const v=Number(f[m.name]);for(const [lab,stat] of [["i",m.italic],["r",m.roman]]){const sd=Math.max(1e-6,Number(stat?.sd||0)),z=(v-Number(stat?.mean||0))/sd,val=-.5*z*z-Math.log(sd);if(lab==="i")si+=val;else sr+=val;}}const d=Math.max(-30,Math.min(30,si-sr));return 1/(1+Math.exp(-d));};
    const byPage=new Map();for(const r of runs)if(r.reviewBox){if(!byPage.has(r.pageIndex))byPage.set(r.pageIndex,[]);byPage.get(r.pageIndex).push(r);}
    let measured=0;
    for(const [pi,list] of byPage){const file=state.pages?.[pi]?.file||state.files?.[pi];if(!file)continue;try{const img=await loadImageFromFile(file),canvas=makeCroppedCanvas(img);for(const r of list){const f=measure(canvas,r.reviewBox);if(f){measured++;r.pixelFeatures=f;r.pixelItalicProbability=prob(f);}}canvas.width=1;canvas.height=1;}catch(_){}}
    return {measured,modelApplied:modelReady};
  }

  function finalizeItalicReviewRanking(mode){
    const runs=state.italicCalibrationReviewSet||[];
    if(mode==="hunt"||mode==="validation"){
      const ordered=rankCanonicalItalicCandidates(runs);
      state.italicCalibrationReviewSet.splice(0,state.italicCalibrationReviewSet.length,...ordered);
      state.italicValidationEvidenceByPhysical=new Map();
      ordered.forEach(r=>state.italicValidationEvidenceByPhysical.set(`${r.pageIndex}:${r.lineIndex}:${r.startWordIndex}`,{hiddenContext:r.hiddenContext||null,pixelFeatures:r.pixelFeatures||null,pixelItalicProbability:r.pixelItalicProbability,supervisedScore:r.supervisedScore,finalRankDiagnostics:r.finalRankDiagnostics,reviewBox:r.reviewBox||null}));
      state.italicHuntSelectionSourceByKey=Object.fromEntries(ordered.map(r=>[italicCalibrationKey(r),r.huntSelectionSource]));
      if(state.italicHuntDiagnostics){const contextValues=ordered.map(r=>Number(r.hiddenContext?.phraseBonus||0)).filter(x=>x>0),pixelAssistAppliedCount=ordered.filter(r=>Number(r.finalRankComponents?.pixelWeight||0)>0).length;state.italicHuntDiagnostics.finalRanking={canonical:true,pixelAssistApplied:pixelAssistAppliedCount>0,pixelAssistAppliedCount,servedPopulation:ordered.length,hiddenContextDistribution:{appliedCount:contextValues.length,appliedRate:ordered.length?contextValues.length/ordered.length:0,averageBonus:contextValues.length?contextValues.reduce((a,b)=>a+b,0)/contextValues.length:0,maxBonus:contextValues.length?Math.max(...contextValues):0,guardrail:"Only all-strong contiguous spans (structural minimum >= 0.10 and consistency = 1) qualify."},top:ordered.slice(0,250).map(r=>({specimenKey:italicCalibrationKey(r),text:italicNormalizedSpecimenText(r),pageIndex:r.pageIndex,lineIndex:r.lineIndex,startWordIndex:r.startWordIndex,servedRank:r.finalServedRank,finalScore:r.finalItalicScore,diagnostics:r.finalRankDiagnostics}))};state.italicHuntDiagnostics.top=state.italicHuntDiagnostics.finalRanking.top;}
      return true;
    }
    if(mode==="learned"){
      runs.forEach(r=>{const p=Number(r.pixelItalicProbability),base=Number.isFinite(r.learnedItalicProbability)?r.learnedItalicProbability:0;r.finalItalicScore=r.pixelItalicProbability!=null&&Number.isFinite(p)?base*.95+p*.05:base;});
      runs.sort((a,b)=>Number(b.finalItalicScore)-Number(a.finalItalicScore)||Number(b.supervisedScore||0)-Number(a.supervisedScore||0));
      runs.forEach((r,i)=>{r.finalServedRank=i+1;r.finalRankDiagnostics={servedRank:i+1,componentsActuallyApplied:r.pixelItalicProbability!=null&&Number.isFinite(Number(r.pixelItalicProbability))?["learned-probability","pixel-assist"]:["learned-probability"]};});return true;
    }
    return false;
  }

  function italicReviewModeLabel(mode){
    return mode==="hunt"?"ITALIC HUNT":mode==="learned"?"LEARNED REVIEW":mode==="random"?"RANDOM REVIEW":mode==="validation"?"HELD-OUT ITALIC VALIDATION":"ITALIC REVIEW";
  }
  function setItalicReviewBuilding(mode,stage="Building candidate queue…"){
    if(els.italicReviewModeTitle)els.italicReviewModeTitle.textContent=`${italicReviewModeLabel(mode)} · BUILDING…`;
    if(els.italicCalibrationProgress)els.italicCalibrationProgress.textContent=stage;
    if(els.italicCalibrationReviewList)els.italicCalibrationReviewList.innerHTML=`<div class="hint"><strong>${italicReviewModeLabel(mode)} is building…</strong><br>${stage}<br>The previous queue is locked until this finishes.</div>`;
  }
  function setItalicReviewReady(mode,count){
    if(els.italicReviewModeTitle)els.italicReviewModeTitle.textContent=`${italicReviewModeLabel(mode)} READY`;
    if(els.italicCalibrationProgress)els.italicCalibrationProgress.textContent=`${count} queued`;
  }

  async function launchItalicLearningReview(mode, buttonTiming = null) {
    if(state.sourceProfile!=="cloud-iowan"){setStatus("Italic learning review currently uses the CloudLibrary / Iowan Old Style profile.");return;}
    if(!state.pages?.length||!state.files?.length){setStatus("Load the saved screenshot/OCR project before starting italic review.");return;}
    const now=()=>globalThis.performance?.now?.()??Date.now();
    const t0=buttonTiming?.performanceNow ?? now();
    const wallStartedAt=buttonTiming?.wallStartedAt ?? Date.now();
    const timing={mode,startedAt:new Date(wallStartedAt).toISOString(),buttonToHandlerMs:Math.round(now()-t0)};
    state.italicReviewSelectionMode=mode; state.italicReviewHistory=[];
    state.italicReviewRoundStats={mode,startedAt:new Date(wallStartedAt).toISOString(),italic:0,roman:0,glyph:0,fragment:0,unsure:0,newPersisted:0,updated:0,presses:0};
    setItalicReviewBuilding(mode,"Preparing typography measurements…");
    // Validation rebuilds the live specimen evidence, then evaluates persisted
    // labels out of fold. Ground-truth labels never enter the live ranking path.
    if(mode==="validation"){
      let t=now();
      const hasMeasurements=state.pages.some(page=>(page.layoutLines||[]).some(line=>line.italicMeta||(Array.isArray(line.italicWordMeta)&&line.italicWordMeta.length)));
      if(!hasMeasurements){
      setStatus("Examining typeface cache…");
      const restored=await restoreCachedItalicMeasurements();
      timing.typefaceCacheHit=restored;
      if(!restored){setStatus("Examining typeface…");await autoScanItalics({rebuildText:false});}
    }else timing.typefaceCacheHit=true;
      const measurementPrepMs=Math.round(now()-t);
      t=now();
      downloadItalicDiagnostics(false);
      const livePopulationMs=Math.round(now()-t);
      const livePopulationTiming=state.italicPopulationTiming||null;
      const liveDeepTiming=state.italicDiagnosticsTiming||null;
      const liveHuntTiming=state.italicHuntTiming||null;
      setStatus("Held-out validation: measuring the same Pixel Assist evidence used by live Hunt…");
      const pixelAssist=await applyItalicPixelAssistToQueue("validation");
      finalizeItalicReviewRanking("validation");
      const replay=buildPersistedItalicValidationReplay();
      state.italicPersistedValidationReplay=replay;
      setStatus("Held-out validation: training and scoring page-grouped folds…");
      const pageHeldOut=buildGroupedHeldOutItalicValidation("page");
      setStatus("Held-out validation: checking token-grouped folds…");
      const tokenHeldOut=buildGroupedHeldOutItalicValidation("token");
      state.italicHeldOutValidation={label:"HELD-OUT VALIDATION",pageGrouped:pageHeldOut,tokenGrouped:tokenHeldOut,pixelAssist,foldDiagnostics:{pageGrouped:italicHeldOutFoldDiagnostics("page"),tokenGrouped:italicHeldOutFoldDiagnostics("token")},scoreAblation:{pageGrouped:italicHeldOutScoreAblation("page"),tokenGrouped:italicHeldOutScoreAblation("token")},rescueFailureAnatomy:{pageGrouped:italicHeldOutRescueAnatomy("page"),tokenGrouped:italicHeldOutRescueAnatomy("token")}};
      state.italicValidationLiveHuntTiming=liveHuntTiming;
      state.italicHuntTiming=replay.huntTiming;
      state.italicReviewTiming={mode,startedAt:new Date().toISOString(),measurementPrepMs,livePopulationMs,populationBuildRankMs:livePopulationMs,renderMs:0,totalMs:Math.round(now()-t0),queueSize:(state.italicCalibrationReviewSet||[]).length,replayDiagnostic:true,heldOut:true,pixelAssist};
      state.italicValidationPopulationTiming=livePopulationTiming;
      state.italicValidationDeepTiming=liveDeepTiming;
      setStatus(`HELD-OUT VALIDATION READY · page-grouped ${pageHeldOut.foldCount||0} folds · ${pageHeldOut.totalHeldOutPositives||0} italics / ${pageHeldOut.totalHeldOutRomans||0} Roman · export the JSON for the honest baseline.`);
      return;
    }
    let t=now();
    const queueAtButton=Number(buttonTiming?.queueAtButton ?? (state.italicCalibrationReviewSet?.length||0));
    const hasMeasurements=state.pages.some(page=>(page.layoutLines||[]).some(line=>line.italicMeta||(Array.isArray(line.italicWordMeta)&&line.italicWordMeta.length)));
    timing.runTemperature=(hasMeasurements || queueAtButton>0) ? "warm-or-reused" : "cold";
    timing.measurementsAtButton=hasMeasurements;
    timing.queueAtButton=queueAtButton;
    timing.preparationStartedMs=Math.round(now()-t0);
    if(!hasMeasurements){
      setStatus("Checking saved typeface measurements…");
      const restored=await restoreCachedItalicMeasurements();
      timing.typefaceCacheHit=restored;
      if(!restored){setStatus("Preparing spoiler-safe typography measurements…");await autoScanItalics({rebuildText:false});}
    } else timing.typefaceCacheHit=true;
    setItalicReviewBuilding(mode,"Building and ranking candidates…");
    timing.measurementPrepMs=Math.round(now()-t);
    timing.afterMeasurementMs=Math.round(now()-t0);
    t=now();
    const beforeDiagPages=state.pages?.length||0;
    const beforeDiagQueue=state.italicCalibrationReviewSet?.length||0;
    downloadItalicDiagnostics(false);
    timing.populationBuildRankMs=Math.round(now()-t);
    timing.afterPopulationRankMs=Math.round(now()-t0);
    setItalicReviewBuilding(mode,"Applying pixel assist…");
    const pixelAssistApplied=await applyItalicPixelAssistToQueue(mode);
    timing.pixelAssistApplied=pixelAssistApplied;
    timing.canonicalFinalizerApplied=finalizeItalicReviewRanking(mode);
    timing.actualPopulationPath={
      pages:beforeDiagPages,
      queueBefore:beforeDiagQueue,
      queueAfter:state.italicCalibrationReviewSet?.length||0,
      diagnosticsInternal:state.italicDiagnosticsTiming||null
    };
    setItalicReviewReady(mode,state.italicCalibrationReviewSet?.length||0);
    t=now(); renderItalicCalibrationReview(); timing.renderMs=Math.round(now()-t);
    timing.firstCardVisibleMs=Math.round(now()-t0);
    timing.totalMs=timing.firstCardVisibleMs;
    timing.wallClockTotalMs=Date.now()-wallStartedAt;
    timing.queueSize=(state.italicCalibrationReviewSet||[]).length;
    state.italicReviewTiming=timing;
    if(mode==="hunt") state.lastRealItalicHuntTiming={...timing};
    setStatus(`Built ${mode} review from ${timing.queueSize} unique specimens in ${(timing.totalMs/1000).toFixed(1)}s.`);
    els.italicCalibrationReview?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function launchItalicLineHunt(){
    if(state.sourceProfile!=="cloud-iowan"){setStatus("Line Hunt currently uses the CloudLibrary / Iowan Old Style profile.");return;}
    if(!state.pages?.length||!state.files?.length){setStatus("Load the saved screenshot/OCR project before starting Line Hunt.");return;}
    state.italicReviewSelectionMode="line-hunt"; state.italicReviewHistory=[];
    state.italicReviewRoundStats={mode:"line-hunt",startedAt:new Date().toISOString(),italic:0,roman:0,glyph:0,fragment:0,unsure:0,newPersisted:0,updated:0,presses:0};
    if(!(state.italicLineHuntSeenLines instanceof Set)) state.italicLineHuntSeenLines=new Set();
    const hasMeasurements=state.pages.some(page=>(page.layoutLines||[]).some(line=>Array.isArray(line.italicWordMeta)&&line.italicWordMeta.length));
    if(!hasMeasurements){
      setStatus("Line Hunt: restoring typeface measurements…");
      const restored=await restoreCachedItalicMeasurements();
      if(!restored){setStatus("Line Hunt: preparing typeface measurements…");await autoScanItalics({rebuildText:false});}
    }
    // Build directly from saved per-line OCR word metadata. Do NOT reuse the
    // ordinary Hunt queue: that queue is deduped/filtered by design and can
    // contain too few words per line to reconstruct full context.
    const words=[];
    state.pages.forEach((page,pageIndex)=>(page.layoutLines||[]).forEach((line,lineIndex)=>{
      (line.italicWordMeta||[]).forEach((w,wordIndex)=>{
        const box=w.box||w.reviewBox; if(!box) return;
        words.push({...w,pageIndex,pageNumber:pageIndex+1,fileName:page.fileName||state.files[pageIndex]?.name||"",lineIndex,
          wordIndex:Number.isFinite(Number(w.wordIndex))?Number(w.wordIndex):wordIndex,
          startWordIndex:Number.isFinite(Number(w.wordIndex))?Number(w.wordIndex):wordIndex,
          endWordIndex:Number.isFinite(Number(w.wordIndex))?Number(w.wordIndex):wordIndex,
          wordCount:1,text:w.text||"",reviewBox:{x:Number(box.x||0),y:Number(box.y||0),w:Number(box.w||box.width||0),h:Number(box.h||box.height||0)},
          sampleKind:"line-word"});
      });
    }));
    const groups=new Map();
    for(const r of words){const lk=`${r.pageIndex}:${r.lineIndex}`;if(!groups.has(lk))groups.set(lk,[]);groups.get(lk).push(r);}
    const lines=[...groups.entries()].filter(([k,rs])=>!state.italicLineHuntSeenLines.has(k)&&rs.length>1).map(([k,rs])=>{
      rs.sort((a,b)=>a.wordIndex-b.wordIndex);
      // Cheap typography suspicion only for line ordering. Human review decides.
      const vals=rs.map(r=>Math.max(0,Number(r.localSlantLift||0))*3.5+Math.max(0,Number(r.localGainLift||0))*50+Math.max(0,Number(r.gain||0))*8).sort((a,b)=>b-a);
      return {k,rs,score:(vals[0]||0)+(vals[1]||0)*.45};
    }).sort((a,b)=>b.score-a.score);
    const chosenLines=lines.slice(0,100);
    if(!chosenLines.length){setStatus(`Line Hunt found no reviewable lines · ${words.length} OCR words across ${groups.size} lines.`);state.italicCalibrationReviewSet=[];renderItalicCalibrationReview();return;}
    const queue=chosenLines.map(chosen=>{
      state.italicLineHuntSeenLines.add(chosen.k);
      const rs=chosen.rs, boxes=rs.map(r=>r.reviewBox), x=Math.min(...boxes.map(b=>b.x)), y=Math.min(...boxes.map(b=>b.y));
      const right=Math.max(...boxes.map(b=>b.x+b.w)), bottom=Math.max(...boxes.map(b=>b.y+b.h));
      return {...rs[0],startWordIndex:rs[0].wordIndex,endWordIndex:rs[rs.length-1].wordIndex,wordCount:rs.length,
        text:rs.map(r=>r.text||"").join(" "),reviewBox:{x,y,w:right-x,h:bottom-y},
        splitChildren:rs.map(r=>({...r,lineHunt:true,reviewLabel:null})),sampleKind:"line-hunt",lineHunt:true};
    });
    state.italicCalibrationReviewSet=queue;
    state.italicReviewRoundStats.linesPlanned=queue.length; state.italicReviewRoundStats.linesReviewed=0;
    setStatus(`LINE HUNT · ${queue.length} suspicious lines queued · duplicates allowed · Roman whole lines learn word-by-word · Split mixed lines.`);
    renderItalicCalibrationReview();
  }


  // Build 158: experimental direct visual classifier. Diagnostic only.
  let visualItalicOrtPromise=null, visualItalicSessionPromise=null;
  async function ensureVisualItalicOrt(){
    if(!visualItalicOrtPromise) visualItalicOrtPromise=import("https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/+esm");
    return visualItalicOrtPromise;
  }
  async function ensureVisualItalicSession(){
    if(!visualItalicSessionPromise) visualItalicSessionPromise=(async()=>{
      const ort=await ensureVisualItalicOrt();
      ort.env.wasm.wasmPaths="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/";
      const session=await ort.InferenceSession.create("./visual-model/italic-mobilenetv3-synthetic.onnx",{executionProviders:["wasm"]});
      state.visualItalicSession=session;
      return session;
    })();
    return visualItalicSessionPromise;
  }
  function visualItalicTensorFromCanvas(ort,source,box){
    const pad=Math.max(1,Math.round(box.h*.12));
    const crop=cropCanvasRegion(source,{x:box.x-pad,y:box.y-pad,w:box.w+2*pad,h:box.h+2*pad});
    const c=document.createElement("canvas");c.width=320;c.height=96;
    const x=c.getContext("2d",{alpha:false,willReadFrequently:true});x.fillStyle="#fff";x.fillRect(0,0,320,96);
    const scale=Math.min(320/crop.width,96/crop.height),dw=Math.max(1,Math.round(crop.width*scale)),dh=Math.max(1,Math.round(crop.height*scale));
    x.drawImage(crop,Math.round((320-dw)/2),Math.round((96-dh)/2),dw,dh);
    const d=x.getImageData(0,0,320,96).data,out=new Float32Array(3*96*320);
    const mean=[.485,.456,.406],std=[.229,.224,.225],plane=96*320;
    for(let i=0,p=0;i<d.length;i+=4,p++){out[p]=(d[i]/255-mean[0])/std[0];out[plane+p]=(d[i+1]/255-mean[1])/std[1];out[2*plane+p]=(d[i+2]/255-mean[2])/std[2];}
    return new ort.Tensor("float32",out,[1,3,96,320]);
  }
  function setVisualItalicStatus(message){ if(els.visualItalicStatus) els.visualItalicStatus.textContent=message; setStatus(message); }
  function setVisualItalicStatus(message){ if(els.visualItalicStatus) els.visualItalicStatus.textContent=message; setStatus(message); }
  function visualItalicCacheKey(){ return "visualItalic:schema1:"+italicMeasurementCacheSignature(); }
  function visualItalicLabelsKey(){return visualItalicCacheKey()+":labels";}
  async function cacheVisualItalicResults(){
    try{const db=await openItalicLearningDb(),key=visualItalicCacheKey(),labelsKey=visualItalicLabelsKey(),payload={cacheSchema:1,savedAt:new Date().toISOString(),results:state.visualItalicResults||[],labels:state.visualItalicLabels||[]},labelPayload={cacheSchema:1,savedAt:payload.savedAt,labels:state.visualItalicLabels||[]};await new Promise((resolve,reject)=>{const tx=db.transaction(ITALIC_LEARNING_DB_STORE,"readwrite"),store=tx.objectStore(ITALIC_LEARNING_DB_STORE);store.put(payload,key);store.put(labelPayload,labelsKey);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});return true;}catch(err){console.warn("Could not cache Visual Italic results",err);return false;}
  }
  async function restoreCachedVisualItalicResults(){
    try{const db=await openItalicLearningDb(),key=visualItalicCacheKey(),labelsKey=visualItalicLabelsKey();const [cached,labelCache]=await Promise.all([new Promise((resolve,reject)=>{const tx=db.transaction(ITALIC_LEARNING_DB_STORE,"readonly"),req=tx.objectStore(ITALIC_LEARNING_DB_STORE).get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);}),new Promise((resolve,reject)=>{const tx=db.transaction(ITALIC_LEARNING_DB_STORE,"readonly"),req=tx.objectStore(ITALIC_LEARNING_DB_STORE).get(labelsKey);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);})]);if(!cached||!Array.isArray(cached.results)||!cached.results.length)return false;state.visualItalicResults=cached.results;const embedded=Array.isArray(cached.labels)?cached.labels:[],separate=Array.isArray(labelCache?.labels)?labelCache.labels:[];state.visualItalicLabels=normalizeVisualItalicLabels(separate.length>=embedded.length?separate:embedded,false);const reviewedRanks=new Set(state.visualItalicLabels.map(l=>Number(l.visualItalicRank)).filter(Number.isFinite));let nextIndex=state.visualItalicResults.findIndex(x=>!reviewedRanks.has(Number(x.visualItalicRank)));if(nextIndex<0)nextIndex=state.visualItalicResults.length;state.visualItalicReviewIndex=nextIndex;if(nextIndex<state.visualItalicResults.length)visualItalicResetDiversityBand(state.visualItalicResults[nextIndex]);setVisualItalicStatus(`Visual Italic restored · ${state.visualItalicResults.length} cached specimens ranked · ${state.visualItalicLabels.length} review labels restored · next unreviewed rank ${nextIndex<state.visualItalicResults.length?state.visualItalicResults[nextIndex].visualItalicRank:"none"} · diagnostic only.`);await renderVisualItalicReview();return true;}catch(err){console.warn("Could not restore cached Visual Italic results",err);return false;}
  }
  async function runVisualItalicExperiment(){
    if(!state.files.length||!state.pages.length) throw new Error("Load an OCR project with screenshots first.");
    const ort=await ensureVisualItalicOrt(),session=await ensureVisualItalicSession(),results=[];
    const inputName=session.inputNames[0],outputName=session.outputNames[0];
    for(let pi=0;pi<state.pages.length;pi++){
      const page=state.pages[pi], file=state.files[pi]||page.file;
      if(!file) continue;
      setVisualItalicStatus(`Visual Italic · page ${pi+1} of ${state.pages.length}… · ${results.length} specimens scored`);
      const img=await loadImageFromFile(file), canvas=makeCroppedCanvas(img);
      const raw=Array.isArray(page.rawOcrItems)&&page.rawOcrItems.length?page.rawOcrItems:(Array.isArray(page.layoutLines)?page.layoutLines:[]);
      for(let li=0;li<raw.length;li++){
        const line=raw[li]; if(!line?.box||!line?.text) continue;
        // Paddle's stored geometry can be line-level. Split only when individual word boxes exist;
        // otherwise score the detected region honestly as one visual specimen.
        // Visual Italic is a word-crop classifier. Paddle's persisted OCR is line-level,
        // so derive ink-aligned word boxes from the original screenshot pixels rather than
        // feeding the network a whole line as one specimen.
        let words=Array.isArray(line.words)&&line.words.length?line.words:null;
        if(!words){
          const derived=estimateInkAlignedWordBoxes(canvas,line);
          words=Array.isArray(derived)&&derived.length?derived:[line];
        }
        for(let wi=0;wi<words.length;wi++){
          const w=words[wi],box=w.box||line.box;if(!box)continue;
          const tensor=visualItalicTensorFromCanvas(ort,canvas,box);
          const output=await session.run({[inputName]:tensor});
          const logit=Number(output[outputName].data[0]),prob=1/(1+Math.exp(-logit));
          results.push({pageIndex:pi,pageNumber:pi+1,fileName:file.name,lineIndex:li,wordIndex:wi,text:String(w.text||line.text||""),box,visualItalicProbability:prob,visualItalicSpanScore:prob,geometryType:(w!==line)?"word/run":"line-level",cropWidth:Number(box.w??box.width??0),cropHeight:Number(box.h??box.height??0)});
        }
      }
      canvas.width=1;canvas.height=1;
      await new Promise(r=>setTimeout(r,0));
    }
    const groups=new Map();for(const r of results){const k=`${r.pageIndex}:${r.lineIndex}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
    for(const g of groups.values()){g.sort((a,b)=>a.wordIndex-b.wordIndex);for(let i=0;i<g.length;i++){const r=g[i],L=g[i-1],R=g[i+1],p=r.visualItalicProbability;if(p<.20)continue;
      if(L&&R&&L.visualItalicProbability>=.95&&R.visualItalicProbability>=.95&&p<.95)r.visualItalicSpanScore=Math.max(p,Math.min(L.visualItalicProbability,R.visualItalicProbability)*.97);
      else {const anchor=Math.max(L?.visualItalicProbability||0,R?.visualItalicProbability||0);if(anchor>=.98&&p<anchor)r.visualItalicSpanScore=Math.max(p,anchor*.90);}
    }}
    results.sort((a,b)=>b.visualItalicSpanScore-a.visualItalicSpanScore||b.visualItalicProbability-a.visualItalicProbability);
    results.forEach((r,i)=>r.visualItalicRank=i+1);state.visualItalicResults=results;await cacheVisualItalicResults();
    setVisualItalicStatus(`Visual Italic ready · ${results.length} specimens ranked · raw neural + conservative span scores kept separate · diagnostic only.`);
    return results;
  }

  function visualItalicPopulationSummary(){
    const q=state.visualItalicResults||[];if(!q.length)return "";
    const type=x=>x.geometryType||"unknown",num=(a,f)=>a.map(f).filter(Number.isFinite).sort((x,y)=>x-y),med=a=>a.length?(a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2):0;
    const stats=t=>{const a=q.filter(x=>type(x)===t),w=num(a,x=>Number(x.cropWidth??x.box?.w??x.box?.width)),ar=num(a,x=>{const w=Number(x.cropWidth??x.box?.w??x.box?.width),h=Number(x.cropHeight??x.box?.h??x.box?.height);return h>0?w/h:NaN;});return {n:a.length,w:med(w),ar:med(ar)};};
    const line=stats("line-level"),word=stats("word/run");
    const top=n=>{const a=q.slice(0,Math.min(n,q.length));return {line:a.filter(x=>type(x)==="line-level").length,word:a.filter(x=>type(x)==="word/run").length};};
    const t20=top(20),t100=top(100),t1000=top(1000);
    const buckets=[[.95,1.01],[.80,.95],[.60,.80],[.40,.60],[.20,.40],[0,.20]].map(([lo,hi])=>{const a=q.filter(x=>Number(x.visualItalicProbability)>=lo&&Number(x.visualItalicProbability)<hi);return `${Math.round(lo*100)}–${hi>1?100:Math.round(hi*100)}%: ${a.filter(x=>type(x)==="line-level").length} line / ${a.filter(x=>type(x)==="word/run").length} word`;});
    return `<div class="status" style="margin:10px 0"><strong>Population:</strong> ${q.length} total · ${line.n} line-level · ${word.n} word/run<br><span class="muted">Median line: ${Math.round(line.w)} px · aspect ${line.ar.toFixed(2)} · Median word/run: ${Math.round(word.w)} px · aspect ${word.ar.toFixed(2)}<br>Top 20: ${t20.line} line / ${t20.word} word · Top 100: ${t100.line} / ${t100.word} · Top 1000: ${t1000.line} / ${t1000.word}<br>${buckets.join(" · ")}</span></div>`;
  }

  function normalizeVisualItalicLabels(labels,trim=false){
    const byRank=new Map();
    for(const raw of (labels||[])){const rank=Number(raw?.visualItalicRank);if(!Number.isFinite(rank)||(trim&&rank>20))continue;const rec={...raw};if(rec.label==="FRAGMENT"){rec.label="UNSURE";rec.fragment=true;}rec.fragment=!!rec.fragment;byRank.set(rank,rec);}
    return [...byRank.values()].sort((x,y)=>x.visualItalicRank-y.visualItalicRank);
  }
  function visualItalicLabelCounts(){
    const a=normalizeVisualItalicLabels(state.visualItalicLabels||[]);
    return `Reviewed: ${a.length} · Italic ${a.filter(x=>x.label==="ITALIC").length} · Roman ${a.filter(x=>x.label==="ROMAN").length} · Fragment-tagged ${a.filter(x=>x.fragment).length} · Glyph ${a.filter(x=>x.label==="GLYPH").length} · Unsure ${a.filter(x=>x.label==="UNSURE").length}`;
  }
  function visualItalicNormalizedText(r){return String(r?.text||"").toLowerCase().replace(/[’‘]/g,"'").replace(/[^a-z0-9']+/g,"").trim();}
  function visualItalicBandKey(r){return (Math.round(Number(r?.visualItalicSpanScore||0)*1000)/1000).toFixed(3);}
  function visualItalicResetDiversityBand(r){
    state.visualItalicDiversityBand=visualItalicBandKey(r);
    state.visualItalicDiversitySeenTexts=new Set();
    for(const lab of (state.visualItalicLabels||[])){const rr=(state.visualItalicResults||[]).find(x=>Number(x.visualItalicRank)===Number(lab.visualItalicRank));if(rr&&visualItalicBandKey(rr)===state.visualItalicDiversityBand){const t=visualItalicNormalizedText(rr);if(t)state.visualItalicDiversitySeenTexts.add(t);}}
  }
  function visualItalicNextDiverseIndex(from){
    const q=state.visualItalicResults||[],cur=q[from];if(!cur)return Math.min(q.length-1,from+1);
    const band=state.visualItalicDiversityBand||visualItalicBandKey(cur),seen=state.visualItalicDiversitySeenTexts||new Set();
    const reviewedRanks=new Set((state.visualItalicLabels||[]).map(l=>Number(l.visualItalicRank)).filter(Number.isFinite));
    for(let j=from+1;j<q.length;j++){
      if(visualItalicBandKey(q[j])!==band)break;
      if(reviewedRanks.has(Number(q[j].visualItalicRank)))continue;
      const t=visualItalicNormalizedText(q[j]);
      if(!t||!seen.has(t))return j;
    }
    // If this rounded score band is exhausted, continue forward to the next
    // unreviewed specimen instead of falling back onto an already-labeled rank.
    for(let j=from+1;j<q.length;j++)if(!reviewedRanks.has(Number(q[j].visualItalicRank)))return j;
    return q.length;
  }
  async function renderVisualItalicReview(){
    const host=els.visualItalicReview;if(!host)return;
    state.visualItalicLabels=normalizeVisualItalicLabels(state.visualItalicLabels||[]);
    const q=state.visualItalicResults||[],i=state.visualItalicReviewIndex||0;
    if(!q.length){host.innerHTML="";return;}
    const r=q[i]; if(!r){host.innerHTML=`<div class="status">Visual Italic review complete · ${visualItalicLabelCounts()}</div>`;return;}
    const sourcePage=state.pages[r.pageIndex],sourceRaw=Array.isArray(sourcePage?.rawOcrItems)&&sourcePage.rawOcrItems.length?sourcePage.rawOcrItems:(Array.isArray(sourcePage?.layoutLines)?sourcePage.layoutLines:[]),sourceLine=sourceRaw[r.lineIndex];
    const cropW=Number(r.cropWidth??r.box?.w??r.box?.width??0),cropH=Number(r.cropHeight??r.box?.h??r.box?.height??0),cropAspect=cropH>0?cropW/cropH:0;
    const geometryType=r.geometryType||((Array.isArray(sourceLine?.words)&&sourceLine.words.length)?"word/run":"line-level");
    const file=state.files[r.pageIndex], img=file?await loadImageFromFile(file):null;
    let src="";if(img){const canvas=makeCroppedCanvas(img),crop=cropCanvasRegion(canvas,r.box),out=document.createElement("canvas");out.width=Math.max(360,crop.width*3);out.height=Math.max(100,crop.height*3);const x=out.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,out.width,out.height);const scale=Math.min((out.width-24)/crop.width,(out.height-24)/crop.height);x.imageSmoothingEnabled=false;x.drawImage(crop,(out.width-crop.width*scale)/2,(out.height-crop.height*scale)/2,crop.width*scale,crop.height*scale);src=out.toDataURL("image/png");canvas.width=1;canvas.height=1;}
    host.innerHTML=visualItalicPopulationSummary()+`<div class="review-card"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><strong>Visual Italic Review · ${i+1} / ${q.length}</strong><span class="pill">raw ${(r.visualItalicProbability*100).toFixed(3)}% · span ${(r.visualItalicSpanScore*100).toFixed(3)}%</span></div><div class="muted" style="text-align:center;margin-top:8px">crop ${Math.round(cropW)} × ${Math.round(cropH)} px · aspect ${cropAspect.toFixed(2)} · ${geometryType}</div>${src?`<div style="margin:12px 0"><img src="${src}" alt="spoiler-safe visual italic crop" style="display:block;max-width:100%;max-height:150px;margin:auto;object-fit:contain"></div>`:""}<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="button secondary" data-vilabel="ITALIC">Italic</button><button class="button secondary" data-vilabel="ROMAN">Roman</button><button class="button secondary" data-vilabel="GLYPH">Glyph / Decorative</button><button class="button secondary" data-vilabel="FRAGMENT">Fragment tag</button><button class="button secondary" data-vilabel="UNSURE">Unsure</button><button class="button secondary" data-viprev ${i?"":"disabled"}>← Previous</button><button class="button secondary" data-vinext ${i+1<q.length?"":"disabled"}>Next →</button><label class="muted">Rank <input data-virank type="number" min="1" max="${q.length}" value="${i+1}" style="width:86px"></label><button class="button secondary" data-vigorank>Go</button><label class="muted">Score <input data-viscore type="number" min="0" max="1" step="0.01" placeholder="0.60" style="width:86px"></label><button class="button secondary" data-vigoscore>Nearest</button></div><div class="muted" style="text-align:center;margin-top:8px">Independent validation only · does not train either italic system · ${visualItalicLabelCounts()}</div></div>`;
    host.querySelectorAll("[data-vilabel]").forEach(b=>b.addEventListener("click",()=>{const chosen=b.dataset.vilabel,idx=state.visualItalicLabels.findIndex(x=>Number(x.visualItalicRank)===Number(r.visualItalicRank)),prior=idx>=0?state.visualItalicLabels[idx]:null,base={visualItalicRank:r.visualItalicRank,pageIndex:r.pageIndex,lineIndex:r.lineIndex,wordIndex:r.wordIndex,raw:r.visualItalicProbability,span:r.visualItalicSpanScore,cropWidth:cropW,cropHeight:cropH,cropAspect,geometryType};let rec;if(chosen==="FRAGMENT"){rec={...(prior||base),...base,label:prior?.label||"UNSURE",fragment:!prior?.fragment};}else{rec={...(prior||base),...base,label:chosen,fragment:!!prior?.fragment};}if(idx>=0)state.visualItalicLabels[idx]=rec;else state.visualItalicLabels.push(rec);if(chosen!=="FRAGMENT"){const t=visualItalicNormalizedText(r);if(t)(state.visualItalicDiversitySeenTexts||(state.visualItalicDiversitySeenTexts=new Set())).add(t);state.visualItalicReviewIndex=visualItalicNextDiverseIndex(i);}renderVisualItalicReview();void cacheVisualItalicResults().then(ok=>{if(!ok)setVisualItalicStatus("Visual Italic label changed in memory but could not be saved to cache.");});}));
    host.querySelector("[data-viprev]")?.addEventListener("click",()=>{state.visualItalicReviewIndex=Math.max(0,i-1);renderVisualItalicReview();}); host.querySelector("[data-vinext]")?.addEventListener("click",()=>{state.visualItalicReviewIndex=Math.min(q.length-1,i+1);renderVisualItalicReview();}); host.querySelector("[data-vigorank]")?.addEventListener("click",()=>{const n=Math.max(1,Math.min(q.length,Number(host.querySelector("[data-virank]")?.value)||1));state.visualItalicReviewIndex=n-1;visualItalicResetDiversityBand(q[state.visualItalicReviewIndex]);renderVisualItalicReview();}); host.querySelector("[data-virank]")?.addEventListener("keydown",e=>{if(e.key==="Enter")host.querySelector("[data-vigorank]")?.click();}); host.querySelector("[data-vigoscore]")?.addEventListener("click",()=>{let v=Number(host.querySelector("[data-viscore]")?.value);if(!Number.isFinite(v))return;if(v>1)v/=100;let best=0,dist=Infinity;q.forEach((x,j)=>{const d=Math.abs(x.visualItalicProbability-v);if(d<dist){dist=d;best=j;}});state.visualItalicReviewIndex=best;visualItalicResetDiversityBand(q[best]);renderVisualItalicReview();}); host.querySelector("[data-viscore]")?.addEventListener("keydown",e=>{if(e.key==="Enter")host.querySelector("[data-vigoscore]")?.click();});
  }
  async function restoreVisualItalicAfterRecovery(){if(state.pages.length&&state.files.length)await restoreCachedVisualItalicResults();}

  function startVisualItalicReview(){
    if(!(state.visualItalicResults||[]).length)throw new Error("Run Visual Italic first.");
    state.visualItalicReviewIndex=0;state.visualItalicLabels=[];visualItalicResetDiversityBand(state.visualItalicResults[0]);renderVisualItalicReview();els.visualItalicReview?.scrollIntoView({behavior:"smooth",block:"center"});
  }

  function exportVisualItalicResults(){
    const payload={format:"book-ocr-studio-visual-italic-v2",buildVersion:BUILD_VERSION,model:"italic-mobilenetv3-synthetic.onnx",diagnosticOnly:true,spanRules:{visualFloor:.20,sandwichAnchor:.95,oneSidedAnchor:.98},validationLabels:state.visualItalicLabels||[],results:state.visualItalicResults||[]};
    downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),`${cleanFilename(els.bookTitle?.value||"book")}-visual-italic.json`);
  }

  els.italicReviewLearnedBtn?.addEventListener("click", async () => {
    els.italicReviewLearnedBtn.disabled=true;
    try { await launchItalicLearningReview("learned"); }
    finally { els.italicReviewLearnedBtn.disabled=false; }
  });
  els.italicReviewRandomBtn?.addEventListener("click", async () => {
    els.italicReviewRandomBtn.disabled=true;
    try { await launchItalicLearningReview("random"); }
    finally { els.italicReviewRandomBtn.disabled=false; }
  });
  els.visualItalicBtn?.addEventListener("click",async()=>{els.visualItalicBtn.disabled=true;try{await runVisualItalicExperiment();startVisualItalicReview();}catch(err){console.error(err);setVisualItalicStatus(`Visual Italic failed: ${err?.message||err}`);}finally{els.visualItalicBtn.disabled=false;}});
  els.exportVisualItalic?.addEventListener("click",exportVisualItalicResults);

  els.italicReviewHuntBtn?.addEventListener("click", async () => {
    const buttonTiming={performanceNow:(globalThis.performance?.now?.()??Date.now()),wallStartedAt:Date.now(),queueAtButton:state.italicCalibrationReviewSet?.length||0};
    els.italicReviewHuntBtn.disabled=true;
    try {
      await launchItalicLearningReview("hunt", buttonTiming);
      if(!(state.italicCalibrationReviewSet?.length)){
        setStatus("Italic Hunt finished without producing a review queue. No labels were changed.");
      }
    } catch (err) {
      console.error("Italic Hunt failed", err);
      setStatus(`Italic Hunt failed: ${err?.message || err}`);
    } finally {
      els.italicReviewHuntBtn.disabled=false;
    }
  });
  els.italicLineHuntBtn?.addEventListener("click",async()=>{els.italicLineHuntBtn.disabled=true;try{await launchItalicLineHunt();}finally{els.italicLineHuntBtn.disabled=false;}});
  els.neuralItalicN1Btn?.addEventListener("click",()=>els.neuralItalicN1Input?.click());
  els.neuralItalicN1Input?.addEventListener("change",async e=>{const f=e.target.files?.[0];if(f)await runNeuralItalicN1(f);e.target.value="";});
  els.italicCropExportBtn?.addEventListener("click", exportLabeledItalicCropDataset);
  els.italicValidationBtn?.addEventListener("click",async()=>{
    els.italicValidationBtn.disabled=true;
    try {
      // v93: Validation is intentionally rerunnable. Never reuse a replay built
      // before additional Italic/Roman labels were added in this session.
      state.italicPersistedValidationReplay=null;
      await launchItalicLearningReview("validation");
    } finally {
      els.italicValidationBtn.disabled=false;
    }
  });
  function buildPersistedItalicValidationReplay(){
    const now=()=>globalThis.performance?.now?.()??Date.now(), t0=now();
    const examples=(currentItalicLearningProfile().examples||[]).filter(x=>(x.label==="ITALIC"||x.label==="ROMAN")&&Array.isArray(x.vector)&&x.vector.length===ITALIC_FEATURE_NAMES.length);
    const pseudoRun=(x)=>{
      const v=x.vector.map(n=>Number.isFinite(Number(n))?Number(n):0), wc=Math.max(1,Math.round(v[6]||1));
      const glyph=String(x.glyphClass||`word:${wc}`), single=glyph.startsWith("single:");
      const text=single?(glyph.split(":")[1]||"a"):Array.from({length:Math.max(2,wc)},()=>"aa").join(" ");
      const words=Array.from({length:wc},(_,i)=>({wordIndex:i,text:single&&i===0?text:"aa",inkDensityZ:v[7],edgeDelta:v[8],widthRatioDelta:v[9],localSlantLift:v[10],localGainLift:v[11],localShearLift:v[12]}));
      return {text,words,wordCount:wc,structuralAverage:v[0],structuralMinimum:v[1],structuralConsistency:v[2],slantSupport:v[3],gainSupport:v[4],shearSupport:v[5],reviewBox:null};
    };
    const standardScore=(v)=>{
      const wc=Math.max(1,Math.round(Number(v[6]||1)));
      const contextBonus=wc>=2?Math.min(.22,(wc-1)*.055)*(.35+Math.max(0,Math.min(1,Number(v[2]||0)))*.65):0;
      return Number(v[0]||0)+Math.max(0,Number(v[1]||0))*.10+Number(v[2]||0)*.10+Math.min(Number(v[3]||0),.12)+Math.min(Number(v[4]||0)*16,.12)+Math.min(Number(v[5]||0)*.004,.02)+contextBonus;
    };
    const rows=examples.map((x,i)=>{const run=pseudoRun(x);run.supervisedScore=standardScore(x.vector);return {index:i,label:x.label,vector:x.vector,glyphClass:x.glyphClass||null,normalizedText:x.normalizedText||null,standardScore:run.supervisedScore,learnedScore:italicLearnedProbabilityUncached(run),run};});
    [...rows].sort((a,b)=>b.standardScore-a.standardScore).forEach((r,i)=>r.standardRank=i+1);
    [...rows].sort((a,b)=>(Number.isFinite(b.learnedScore)?b.learnedScore:-1)-(Number.isFinite(a.learnedScore)?a.learnedScore:-1)||b.standardScore-a.standardScore).forEach((r,i)=>r.learnedRank=i+1);

    // v97 replay mirrors production Hunt's ranking backbone: Learned order only.
    // The persisted-label replay cannot model unseen-text suppression, because by
    // definition every replay row is already labeled; it measures ranking quality.
    const hunt0=now();
    const scored=[...rows].map(r=>{r.huntScore=Number.isFinite(r.learnedScore)?r.learnedScore:-1;return r;})
      .sort((a,b)=>b.huntScore-a.huntScore||b.standardScore-a.standardScore);
    scored.forEach((r,i)=>r.huntRank=i+1);
    const huntTiming={totalMs:Math.round((now()-hunt0)*10)/10,population:rows.length,shortlist:rows.length,picked:rows.length,replay:true,learnedBackbone:true};
    return {rows,huntTiming,totalMs:Math.round((now()-t0)*10)/10};
  }

  function italicExamplePhysicalKey(example){
    const page=example?.sourcePage??example?.pageIndex,line=example?.sourceLine??example?.lineIndex,start=example?.startWordIndex;
    if(page!=null&&line!=null&&start!=null&&Number.isFinite(Number(page))&&Number.isFinite(Number(line))&&Number.isFinite(Number(start)))return `${Number(page)}:${Number(line)}:${Number(start)}`;
    const tail=String(example?.id||"").split("::").pop()||"",m=tail.match(/^(\d+):(\d+):(\d+):(\d+)$/);return m?`${Number(m[1])}:${Number(m[2])}:${Number(m[3])}`:null;
  }
  function italicExampleToken(example){return String(example?.normalizedText||example?.specimenText||"").normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");}
  function italicExamplePageGroup(example,index){
    const physical=italicExamplePhysicalKey(example);if(!physical)return `unknown-page:${index}`;
    const id=String(example?.id||""),split=id.lastIndexOf("::"),sourceRun=String(example?.sourceRunId||(split>=0?id.slice(0,split):"legacy-run"));
    return `page:${sourceRun}:${physical.split(":")[0]}`;
  }
  function italicRunFromPersistedExample(example){
    const v=(example.vector||[]).map(n=>Number.isFinite(Number(n))?Number(n):0),wc=Math.max(1,Math.round(Number(example.wordCount||v[6]||1))),glyph=String(example.glyphClass||`word:${Math.max(2,italicExampleToken(example).replace(/[^\p{L}\p{N}]/gu,"").length||2)}`);let text=italicExampleToken(example);if(!text)text=glyph.startsWith("single:")?(glyph.slice(7)||"a"):"aa";
    const tokens=text.split(/\s+/),words=Array.from({length:wc},(_,i)=>({wordIndex:i,text:tokens[i]||tokens[0]||"aa",inkDensityZ:v[7],edgeDelta:v[8],widthRatioDelta:v[9],localSlantLift:v[10],localGainLift:v[11],localShearLift:v[12]})),key=italicExamplePhysicalKey(example),parts=key?key.split(":").map(Number):[],evidence=key?state.italicValidationEvidenceByPhysical?.get(key):null;
    return{text,words,wordCount:wc,glyphClassOverride:glyph,slantSignalOverride:example.slantSignal==null?undefined:Number(example.slantSignal),structuralAverage:v[0],structuralMinimum:v[1],structuralConsistency:v[2],slantSupport:v[3],gainSupport:v[4],shearSupport:v[5],pageIndex:parts[0],lineIndex:parts[1],startWordIndex:parts[2],endWordIndex:parts[2],hiddenContext:evidence?.hiddenContext||null,pixelFeatures:evidence?.pixelFeatures||null,supervisedScore:Number(evidence?.supervisedScore||0),reviewBox:evidence?.reviewBox||example.reviewBox||null};
  }
  function italicPixelModelForExamples(examples){
    const keys=["leanConsistency","inkOccupancy","contourAsymmetry"],rows=(examples||[]).map(ex=>({label:ex.label,features:italicRunFromPersistedExample(ex).pixelFeatures})).filter(x=>x.features&&(x.label==="ITALIC"||x.label==="ROMAN")),stats=(label,name)=>{const a=rows.filter(x=>x.label===label).map(x=>Number(x.features[name])).filter(Number.isFinite);if(a.length<2)return null;const mean=a.reduce((s,z)=>s+z,0)/a.length,sd=Math.max(1e-6,Math.sqrt(a.reduce((s,z)=>s+(z-mean)**2,0)/(a.length-1)));return{mean,sd,n:a.length};},features=keys.map(name=>({name,italic:stats("ITALIC",name),roman:stats("ROMAN",name)})).filter(x=>x.italic&&x.roman);return features.length===keys.length?{features,rowCount:rows.length}:null;
  }
  function italicPixelProbabilityFromModel(features,model){
    if(!features||!model?.features?.length)return null;let si=0,sr=0;for(const m of model.features){const value=Number(features[m.name]);if(!Number.isFinite(value))return null;for(const [label,stat] of [["i",m.italic],["r",m.roman]]){const sd=Math.max(1e-6,Number(stat.sd)),z=(value-Number(stat.mean))/sd,score=-.5*z*z-Math.log(sd);if(label==="i")si+=score;else sr+=score;}}const d=Math.max(-30,Math.min(30,si-sr));return 1/(1+Math.exp(-d));
  }
  function italicRankMetrics(ranked){
    const cutoffs=[20,50,100,250],positives=ranked.filter(x=>x.validationLabel==="ITALIC").length,romans=ranked.filter(x=>x.validationLabel==="ROMAN").length,out={population:ranked.length,heldOutPositives:positives,heldOutRomans:romans,cutoffs:{}};for(const n of cutoffs){const selected=ranked.slice(0,Math.min(n,ranked.length)),tp=selected.filter(x=>x.validationLabel==="ITALIC").length;out.cutoffs[n]={selected:selected.length,trueItalics:tp,romans:selected.length-tp,precision:selected.length?tp/selected.length:null,recall:positives?tp/positives:null};}let seen=0,precisionSum=0;ranked.forEach((r,i)=>{if(r.validationLabel==="ITALIC"){seen++;precisionSum+=seen/(i+1);}});out.averagePrecision=positives?precisionSum/positives:null;out.italicRanks=ranked.map((r,i)=>r.validationLabel==="ITALIC"?i+1:null).filter(Number.isFinite);return out;
  }
  function italicGroupedFolds(examples,groupKind){
    const groups=new Map();examples.forEach((ex,index)=>{const token=italicExampleToken(ex),key=groupKind==="token"?(token||`id:${index}`):italicExamplePageGroup(ex,index);if(!groups.has(key))groups.set(key,[]);groups.get(key).push({example:ex,index});});
    const positiveGroups=[...groups.values()].filter(g=>g.some(x=>x.example.label==="ITALIC")).length,k=Math.min(5,positiveGroups);if(k<2)return{available:false,reason:`Only ${positiveGroups} positive ${groupKind} groups; at least 2 are required.`,folds:[]};
    const folds=Array.from({length:k},(_,index)=>({index,rows:[],positives:0,total:0,groups:[]})),ordered=[...groups.entries()].sort((a,b)=>{const ap=a[1].filter(x=>x.example.label==="ITALIC").length,bp=b[1].filter(x=>x.example.label==="ITALIC").length;return bp-ap||b[1].length-a[1].length||a[0].localeCompare(b[0]);});
    for(const [key,rows] of ordered){const target=[...folds].sort((a,b)=>a.positives-b.positives||a.total-b.total||a.index-b.index)[0],p=rows.filter(x=>x.example.label==="ITALIC").length;target.rows.push(...rows);target.groups.push(key);target.positives+=p;target.total+=rows.length;}return{available:true,groupKind,foldCount:k,folds};
  }
  function italicHeldOutFoldDiagnostics(groupKind="page"){
    const examples=(currentItalicLearningProfile().examples||[]).filter(x=>(x.label==="ITALIC"||x.label==="ROMAN")&&Array.isArray(x.vector)&&x.vector.length===ITALIC_FEATURE_NAMES.length),plan=italicGroupedFolds(examples,groupKind);
    if(!plan.available)return{...plan,totalExamples:examples.length};
    const components=["learnedProbability","blendedLearnedProbability","structuralProbability","positiveEnvelopeScore","pixelProbability","hiddenContextBonus","finalScore"];
    const summarize=(rows,label)=>{const a=rows.filter(x=>x.validationLabel===label),mean=k=>{const v=a.map(x=>Number(x.finalRankComponents?.[k])).filter(Number.isFinite);return v.length?v.reduce((p,c)=>p+c,0)/v.length:null;};return{count:a.length,componentMeans:Object.fromEntries(components.map(k=>[k,mean(k)]))};};
    const reports=[];
    for(const fold of plan.folds){
      const testIndices=new Set(fold.rows.map(x=>x.index)),train=examples.filter((_,i)=>!testIndices.has(i)),pixelModel=italicPixelModelForExamples(train);
      const runs=fold.rows.map(({example,index})=>{const run=italicRunFromPersistedExample(example);run.validationLabel=example.label;run.validationExampleId=example.id||`index:${index}`;run.validationExampleIndex=index;run.pixelItalicProbability=italicPixelProbabilityFromModel(run.pixelFeatures,pixelModel);return run;});
      const ranked=rankCanonicalItalicCandidates(runs,{trainingExamples:train}),ital=ranked.filter(x=>x.validationLabel==="ITALIC"),rom=ranked.filter(x=>x.validationLabel==="ROMAN"),top=ranked.slice(0,250);
      const gaps=Object.fromEntries(components.map(k=>{const mi=summarize(ranked,"ITALIC").componentMeans[k],mr=summarize(ranked,"ROMAN").componentMeans[k];return[k,(Number.isFinite(mi)&&Number.isFinite(mr))?mi-mr:null];}));
      reports.push({fold:fold.index+1,groupKind,groupCount:fold.groups.length,heldOutPositives:ital.length,heldOutRomans:rom.length,metrics:italicRankMetrics(ranked),classSummary:{italic:summarize(ranked,"ITALIC"),roman:summarize(ranked,"ROMAN"),italicMinusRoman:gaps},top250:{italic:top.filter(x=>x.validationLabel==="ITALIC").length,roman:top.filter(x=>x.validationLabel==="ROMAN").length},positivePages:[...new Set(ital.map(x=>x.pageIndex).filter(Number.isFinite))].length,positiveTokens:[...new Set(ital.map(x=>italicNormalizedSpecimenText(x)).filter(Boolean))].length});
    }
    return{available:true,diagnosticOnly:true,groupKind,foldCount:reports.length,reports,note:"Build 200: out-of-fold component diagnostics. Every test specimen is scored only from the corresponding training fold. Compare strong and weak folds without changing production scoring."};
  }

  function italicHeldOutScoreAblation(groupKind="page"){
    const examples=(currentItalicLearningProfile().examples||[]).filter(x=>(x.label==="ITALIC"||x.label==="ROMAN")&&Array.isArray(x.vector)&&x.vector.length===ITALIC_FEATURE_NAMES.length),plan=italicGroupedFolds(examples,groupKind);
    if(!plan.available)return{...plan,totalExamples:examples.length};
    const recipes=[
      {id:"control-v200",label:"Build 200 control",weights:{learned:.62,structural:.30,envelope:.08,context:1}},
      {id:"pixel-structural-balanced",label:"Pixel/structural balanced",weights:{learned:.42,structural:.50,envelope:.08,context:.50}},
      {id:"structural-forward",label:"Structural forward",weights:{learned:.32,structural:.60,envelope:.08,context:.35}},
      {id:"low-envelope-context",label:"Low envelope/context",weights:{learned:.48,structural:.50,envelope:.02,context:.20}},
      {id:"learned-structural-only",label:"Learned + structural only",weights:{learned:.45,structural:.55,envelope:0,context:0}}
    ];
    const perRecipe=new Map(recipes.map(r=>[r.id,[]]));
    const foldReports=[];
    const scoreWith=(run,recipe)=>{
      const c=run.finalRankComponents||{},w=recipe.weights;
      return w.learned*Number(c.blendedLearnedProbability||0)+w.structural*Number(c.structuralProbability||0)+w.envelope*Number(c.positiveEnvelopeScore||0)+w.context*Number(c.hiddenContextBonus||0);
    };
    const diversify=(rows,scoreField)=>{
      const sorted=[...rows].sort((a,b)=>Number(b[scoreField])-Number(a[scoreField])||Number(b.supervisedScore||0)-Number(a.supervisedScore||0)),rounds=[],counts=new Map();
      for(const row of sorted){const key=italicNormalizedSpecimenText(row)||row.validationExampleId,round=counts.get(key)||0;counts.set(key,round+1);if(!rounds[round])rounds[round]=[];rounds[round].push(row);}
      return rounds.flat();
    };
    for(const fold of plan.folds){
      const testIndices=new Set(fold.rows.map(x=>x.index)),train=examples.filter((_,i)=>!testIndices.has(i)),pixelModel=italicPixelModelForExamples(train);
      const runs=fold.rows.map(({example,index})=>{const run=italicRunFromPersistedExample(example);run.validationLabel=example.label;run.validationExampleId=example.id||`index:${index}`;run.validationExampleIndex=index;run.pixelItalicProbability=italicPixelProbabilityFromModel(run.pixelFeatures,pixelModel);return run;});
      const canonical=rankCanonicalItalicCandidates(runs,{trainingExamples:train});
      const foldResult={fold:fold.index+1,heldOutPositives:canonical.filter(x=>x.validationLabel==="ITALIC").length,heldOutRomans:canonical.filter(x=>x.validationLabel==="ROMAN").length,recipes:{}};
      for(const recipe of recipes){
        const rows=canonical.map((row,i)=>({...row,ablationScore:scoreWith(row,recipe),ablationIdentity:i})),ranked=diversify(rows,"ablationScore");
        perRecipe.get(recipe.id).push(...ranked);
        foldResult.recipes[recipe.id]=italicRankMetrics(ranked);
      }
      foldReports.push(foldResult);
    }
    const pooled={};
    for(const recipe of recipes){const ranked=diversify(perRecipe.get(recipe.id),"ablationScore");pooled[recipe.id]={label:recipe.label,weights:recipe.weights,metrics:italicRankMetrics(ranked)};}
    return{available:true,diagnosticOnly:true,groupKind,recipes,perFold:foldReports,pooled,note:"Build 201 score-ablation laboratory. Uses the same honest grouped held-out folds and fold-trained Pixel Assist as the control. Production Hunt scoring is unchanged."};
  }

  function italicHeldOutRescueAnatomy(groupKind="page"){
    const examples=(currentItalicLearningProfile().examples||[]).filter(x=>(x.label==="ITALIC"||x.label==="ROMAN")&&Array.isArray(x.vector)&&x.vector.length===ITALIC_FEATURE_NAMES.length),plan=italicGroupedFolds(examples,groupKind);
    if(!plan.available)return{...plan,totalExamples:examples.length};
    const signals=["learned","structural","pixel","context"],pooled=[],foldReports=[];
    const percentile=(rows,key,value)=>{const vals=rows.map(r=>Number(r[key])).filter(Number.isFinite).sort((a,b)=>a-b);if(!vals.length||!Number.isFinite(value))return null;let lo=0,hi=vals.length;while(lo<hi){const m=(lo+hi)>>1;if(vals[m]<=value)lo=m+1;else hi=m;}return lo/vals.length;};
    for(const fold of plan.folds){
      const testIndices=new Set(fold.rows.map(x=>x.index)),train=examples.filter((_,i)=>!testIndices.has(i)),pixelModel=italicPixelModelForExamples(train);
      const runs=fold.rows.map(({example,index})=>{const run=italicRunFromPersistedExample(example);run.validationLabel=example.label;run.validationExampleId=example.id||`index:${index}`;run.validationExampleIndex=index;run.pixelItalicProbability=italicPixelProbabilityFromModel(run.pixelFeatures,pixelModel);return run;});
      const canonical=rankCanonicalItalicCandidates(runs,{trainingExamples:train}),romans=canonical.filter(r=>r.validationLabel==="ROMAN");
      const rows=canonical.map((r,i)=>{const c=r.finalRankComponents||{},raw={learned:Number(c.blendedLearnedProbability||0),structural:Number(c.structuralProbability||0),pixel:Number(r.pixelItalicProbability||0),context:Number(c.hiddenContextBonus||0)};const pct={};for(const s of signals)pct[s]=percentile(romans,s,raw[s]);const strong=signals.filter(s=>pct[s]!=null&&pct[s]>=.9),weak=signals.filter(s=>pct[s]==null||pct[s]<.75);let rescueBucket="mixed/multiple";if(!strong.length)rescueBucket="no-strong-signal";else if(strong.length===1)rescueBucket=`${strong[0]}-only`;return{fold:fold.index+1,label:r.validationLabel,rank:i+1,exampleIndex:r.validationExampleIndex,exampleId:r.validationExampleId,text:italicNormalizedSpecimenText(r),pageIndex:r.pageIndex,lineIndex:r.lineIndex,raw,romanPercentile:pct,strongSignals:strong,weakSignals:weak,rescueBucket,finalScore:Number(r.finalItalicScore||0)};});
      pooled.push(...rows);const ital=rows.filter(r=>r.label==="ITALIC"),bucketCounts={};for(const x of ital)bucketCounts[x.rescueBucket]=(bucketCounts[x.rescueBucket]||0)+1;
      foldReports.push({fold:fold.index+1,heldOutPositives:ital.length,heldOutRomans:romans.length,italicRescueBuckets:bucketCounts,highRankingRomanFalsePositives:rows.filter(r=>r.label==="ROMAN").sort((a,b)=>a.rank-b.rank).slice(0,50)});
    }
    const italics=pooled.filter(r=>r.label==="ITALIC"),bucketCounts={};for(const x of italics)bucketCounts[x.rescueBucket]=(bucketCounts[x.rescueBucket]||0)+1;
    const missed=italics.filter(r=>r.rank>100).sort((a,b)=>a.rank-b.rank),falsePositives=pooled.filter(r=>r.label==="ROMAN").sort((a,b)=>a.rank-b.rank).slice(0,250);
    return{available:true,diagnosticOnly:true,groupKind,totalExamples:pooled.length,totalHeldOutPositives:italics.length,totalHeldOutRomans:pooled.length-italics.length,thresholds:{strong:"at or above the 90th percentile of held-out Romans in the same fold",weak:"below the 75th percentile of held-out Romans in the same fold",missedItalic:"canonical fold rank > 100"},italicRescueBuckets:bucketCounts,missedItalics:missed,highRankingRomanFalsePositives:falsePositives,perFold:foldReports,note:"Build 202 rescue/failure anatomy. Signals are judged only against held-out Romans in the same honest grouped fold. Pixel Assist remains fold-trained. Diagnostic only; production Hunt scoring is unchanged."};
  }

  function buildGroupedHeldOutItalicValidation(groupKind="page"){
    const started=globalThis.performance?.now?.()??Date.now(),examples=(currentItalicLearningProfile().examples||[]).filter(x=>(x.label==="ITALIC"||x.label==="ROMAN")&&Array.isArray(x.vector)&&x.vector.length===ITALIC_FEATURE_NAMES.length),plan=italicGroupedFolds(examples,groupKind);if(!plan.available)return{...plan,totalExamples:examples.length};
    const allRows=[],foldReports=[],covered=[];
    for(const fold of plan.folds){const testIndices=new Set(fold.rows.map(x=>x.index)),testGroups=new Set(fold.groups),trainRows=examples.map((example,index)=>({example,index})).filter(x=>!testIndices.has(x.index)),train=trainRows.map(x=>x.example),trainGroups=new Set(trainRows.map(x=>groupKind==="token"?(italicExampleToken(x.example)||`id:${x.index}`):italicExamplePageGroup(x.example,x.index))),pixelModel=italicPixelModelForExamples(train),testRuns=fold.rows.map(({example,index})=>{covered.push(index);const run=italicRunFromPersistedExample(example);run.validationLabel=example.label;run.validationExampleId=example.id||`index:${index}`;run.validationExampleIndex=index;run.pixelItalicProbability=italicPixelProbabilityFromModel(run.pixelFeatures,pixelModel);return run;}),ranked=rankCanonicalItalicCandidates(testRuns,{trainingExamples:train}),overlap=[...testGroups].filter(x=>trainGroups.has(x));
      allRows.push(...ranked);foldReports.push({fold:fold.index+1,groupCount:fold.groups.length,trainingExamples:train.length,testExamples:ranked.length,heldOutPositives:fold.rows.filter(x=>x.example.label==="ITALIC").length,heldOutRomans:fold.rows.filter(x=>x.example.label==="ROMAN").length,leakageAudit:{trainingTestIndexOverlap:trainRows.filter(x=>testIndices.has(x.index)).length,trainingTestGroupOverlap:overlap,passed:overlap.length===0},pixelModelApplied:!!pixelModel,metrics:italicRankMetrics(ranked)});
    }
    const pooled=[...allRows].sort((a,b)=>Number(b.finalItalicScore)-Number(a.finalItalicScore)||Number(b.supervisedScore||0)-Number(a.supervisedScore||0)),rounds=[],counts=new Map();for(const r of pooled){const key=italicNormalizedSpecimenText(r)||r.validationExampleId,round=counts.get(key)||0;counts.set(key,round+1);if(!rounds[round])rounds[round]=[];rounds[round].push(r);}const pooledFinal=rounds.flat(),uniqueCovered=new Set(covered),coveragePassed=covered.length===examples.length&&uniqueCovered.size===examples.length,evidenceRuns=examples.map(italicRunFromPersistedExample),contextCount=evidenceRuns.filter(r=>Number(r.hiddenContext?.phraseBonus||0)>0).length,pixelCount=evidenceRuns.filter(r=>r.pixelFeatures).length;
    return{available:true,label:"HELD-OUT VALIDATION",groupKind,foldCount:plan.foldCount,totalExamples:examples.length,totalHeldOutPositives:examples.filter(x=>x.label==="ITALIC").length,totalHeldOutRomans:examples.filter(x=>x.label==="ROMAN").length,coverageAudit:{evaluatedRows:covered.length,uniqueEvaluatedRows:uniqueCovered.size,missingIndices:examples.map((_,i)=>i).filter(i=>!uniqueCovered.has(i)),passed:coveragePassed},leakageAuditPassed:foldReports.every(x=>x.leakageAudit.passed),evidenceCoverage:{hiddenContext:contextCount,hiddenContextRate:examples.length?contextCount/examples.length:0,pixelFeatures:pixelCount,pixelFeatureRate:examples.length?pixelCount/examples.length:0},perFold:foldReports,pooled:italicRankMetrics(pooledFinal),timingMs:Math.round(((globalThis.performance?.now?.()??Date.now())-started)*10)/10,note:"Every specimen is scored only by a model trained on other groups. Evaluation class imbalance is unchanged. Pixel Assist is trained only from the training fold when screenshot evidence is available. Pooled ordering uses each specimen's out-of-fold canonical final score and the same lexical occurrence-round rule as live Hunt."};
  }

  // v99 diagnostic-only feature discovery. This deliberately does not feed
  // production ranking. It looks for stronger combinations and robust shifts
  // in the human-labeled vectors so the next learner change can be evidence-led.
  function italicFeatureDiscoveryReport(rows){
    const named=["structuralAverage","structuralMinimum","structuralConsistency","slantSupport","gainSupport","shearSupport","wordCount","meanInkDensityZ","meanAbsEdgeDelta","meanAbsWidthRatioDelta","meanLocalSlantLift","meanLocalGainLift","meanLocalShearLift"];
    const usable=(rows||[]).filter(r=>(r.label==="ITALIC"||r.label==="ROMAN")&&Array.isArray(r.vector));
    const ital=usable.filter(r=>r.label==="ITALIC"), rom=usable.filter(r=>r.label==="ROMAN");
    const median=a=>{const b=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!b.length)return null;const m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2;};
    const quantile=(a,q)=>{const b=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!b.length)return null;const p=(b.length-1)*q,lo=Math.floor(p),hi=Math.ceil(p);return lo===hi?b[lo]:b[lo]+(b[hi]-b[lo])*(p-lo);};
    const robust=[];
    for(let j=0;j<named.length;j++){
      const ai=ital.map(r=>Number(r.vector[j])).filter(Number.isFinite), ar=rom.map(r=>Number(r.vector[j])).filter(Number.isFinite);
      const mi=median(ai),mr=median(ar),iqi=(quantile(ai,.75)??0)-(quantile(ai,.25)??0),iqr=(quantile(ar,.75)??0)-(quantile(ar,.25)??0);
      const scale=Math.max(1e-9,(Math.abs(iqi)+Math.abs(iqr))/2);
      robust.push({index:j,name:named[j],italicMedian:mi,romanMedian:mr,italicIqr:iqi,romanIqr:iqr,robustSignedSeparation:(mi==null||mr==null)?null:(mi-mr)/scale,robustSeparation:(mi==null||mr==null)?null:Math.abs(mi-mr)/scale});
    }
    robust.sort((a,b)=>(b.robustSeparation??-1)-(a.robustSeparation??-1));
    const means=(group,j)=>{const a=group.map(r=>Number(r.vector[j])).filter(Number.isFinite);if(!a.length)return {m:0,sd:0};const m=a.reduce((x,y)=>x+y,0)/a.length;const v=a.reduce((x,y)=>x+(y-m)*(y-m),0)/Math.max(1,a.length-1);return {m,sd:Math.sqrt(v)};};
    const pairs=[];
    for(let a=0;a<named.length;a++)for(let b=a+1;b<named.length;b++){
      const ia=means(ital,a),ra=means(rom,a),ib=means(ital,b),rb=means(rom,b);
      const sa=Math.max(1e-9,Math.sqrt((ia.sd*ia.sd+ra.sd*ra.sd)/2));
      const sb=Math.max(1e-9,Math.sqrt((ib.sd*ib.sd+rb.sd*rb.sd)/2));
      const da=(ia.m-ra.m)/sa, db=(ib.m-rb.m)/sb;
      pairs.push({features:[named[a],named[b]],indices:[a,b],combinedSeparation:Math.sqrt(da*da+db*db),signedComponents:[da,db]});
    }
    pairs.sort((x,y)=>y.combinedSeparation-x.combinedSeparation);
    return {diagnosticOnly:true,italicCount:ital.length,romanCount:rom.length,robustFeatures:robust,topFeaturePairs:pairs.slice(0,20),note:"Build 99 feature discovery is diagnostic only. Robust median/IQR shifts and pairwise standardized centroid distances are exploratory training-set statistics, not held-out performance, and do not change Hunt, Learned Review, or automatic italics."};
  }

  // v100 diagnostic-only slant interaction study. Keep production behavior
  // untouched while testing whether the strongest v99 robust signal becomes
  // more useful when combined with independent structural/gain/width evidence.
  function italicSlantInteractionReport(rows){
    const names=["structuralAverage","structuralMinimum","structuralConsistency","slantSupport","gainSupport","shearSupport","wordCount","meanInkDensityZ","meanAbsEdgeDelta","meanAbsWidthRatioDelta","meanLocalSlantLift","meanLocalGainLift","meanLocalShearLift"];
    const independent=[0,1,2,3,4,5,7,8,9]; // remove duplicate local-lift dimensions and wordCount
    const usable=(rows||[]).filter(r=>(r.label==="ITALIC"||r.label==="ROMAN")&&Array.isArray(r.vector));
    const ital=usable.filter(r=>r.label==="ITALIC"),rom=usable.filter(r=>r.label==="ROMAN");
    const stats=(group,j)=>{const a=group.map(r=>Number(r.vector[j])).filter(Number.isFinite);if(!a.length)return {mean:0,sd:0};const mean=a.reduce((x,y)=>x+y,0)/a.length;const variance=a.reduce((x,y)=>x+(y-mean)*(y-mean),0)/Math.max(1,a.length-1);return {mean,sd:Math.sqrt(variance)};};
    const zdef={};
    for(const j of independent){const a=stats(ital,j),b=stats(rom,j),scale=Math.max(1e-9,Math.sqrt((a.sd*a.sd+b.sd*b.sd)/2));zdef[j]={italic:a,roman:b,scale,direction:Math.sign(a.mean-b.mean)||1};}
    const score=(r,js)=>js.reduce((sum,j)=>sum+zdef[j].direction*((Number(r.vector[j])||0)-zdef[j].roman.mean)/zdef[j].scale,0)/Math.sqrt(js.length);
    const summarize=(label,js)=>{
      const ranked=[...usable].map(r=>({label:r.label,score:score(r,js)})).sort((a,b)=>b.score-a.score);
      const cutoffs={}; for(const n of [20,50,100,250]){const top=ranked.slice(0,n),tp=top.filter(x=>x.label==="ITALIC").length;cutoffs[n]={trueItalics:tp,romans:top.length-tp,precision:top.length?tp/top.length:null,recall:ital.length?tp/ital.length:null};}
      const italicRanks=[]; ranked.forEach((r,i)=>{if(r.label==="ITALIC")italicRanks.push(i+1);});
      return {label,features:js.map(j=>names[j]),indices:js,cutoffs,italicRanks};
    };
    const tests=[
      summarize("slant",[3]),
      summarize("slant + structuralAverage",[3,0]),
      summarize("slant + structuralMinimum",[3,1]),
      summarize("slant + structuralConsistency",[3,2]),
      summarize("slant + gainSupport",[3,4]),
      summarize("slant + shearSupport",[3,5]),
      summarize("slant + inkDensity",[3,7]),
      summarize("slant + edgeDelta",[3,8]),
      summarize("slant + widthRatioDelta",[3,9]),
      summarize("slant + structuralAverage + gainSupport",[3,0,4]),
      summarize("slant + structuralConsistency + widthRatioDelta",[3,2,9]),
      summarize("slant + structuralConsistency + shearSupport",[3,2,5])
    ];
    tests.sort((a,b)=>b.cutoffs[50].trueItalics-a.cutoffs[50].trueItalics||b.cutoffs[100].trueItalics-a.cutoffs[100].trueItalics||b.cutoffs[250].trueItalics-a.cutoffs[250].trueItalics);
    return {diagnosticOnly:true,italicCount:ital.length,romanCount:rom.length,duplicateDimensionsExcluded:["meanLocalSlantLift","meanLocalGainLift","meanLocalShearLift","wordCount"],tests,note:"Build 100 slant-interaction study is retrospective and diagnostic only. Scores use class-direction standardized independent features and do not change production Hunt, Learned Review, or automatic italic detection."};
  }

  async function buildItalicPixelGeometryStudyFromLoadedScreenshots(){
    // v110: derive review boxes directly from persisted OCR line geometry plus
    // the loaded screenshot pixels. This uses estimateInkAlignedWordBoxes, the
    // same non-OCR geometry helper used by the italic scan, but does NOT invoke OCR.
    const examples=(currentItalicLearningProfile().examples||[]).filter(x=>x.label==="ITALIC"||x.label==="ROMAN");
    const parsed=[]; let parsedIds=0,invalidIds=0,outOfRange=0,missingLines=0,missingFiles=0,wordRangeMisses=0;
    for(const ex of examples){
      const tail=String(ex.id||"").split("::").pop()||"";
      const m=tail.match(/^(\d+):(\d+):(\d+):(\d+)$/);
      if(!m){invalidIds++;continue;}
      parsedIds++;
      parsed.push({ex,pageIndex:Number(m[1]),lineIndex:Number(m[2]),lo:Math.min(Number(m[3]),Number(m[4])),hi:Math.max(Number(m[3]),Number(m[4]))});
    }
    const byPage=new Map(); for(const p of parsed){if(!byPage.has(p.pageIndex))byPage.set(p.pageIndex,[]);byPage.get(p.pageIndex).push(p);}
    const targets=[];
    for(const [pageIndex,items] of byPage){
      const page=state.pages?.[pageIndex]; if(!page){outOfRange+=items.length;continue;}
      const file=page.file||state.files?.[pageIndex]; if(!file){missingFiles+=items.length;continue;}
      let canvas=null;
      try{const img=await loadImageFromFile(file);canvas=makeCroppedCanvas(img);}catch(_){missingFiles+=items.length;continue;}
      const lineCache=new Map();
      for(const item of items){
        const line=page.layoutLines?.[item.lineIndex]; if(!line){missingLines++;continue;}
        let words=lineCache.get(item.lineIndex);
        if(!words){words=estimateInkAlignedWordBoxes(canvas,line).map((w,i)=>({...w,wordIndex:i}));lineCache.set(item.lineIndex,words);}
        const chosen=words.filter(w=>w.wordIndex>=item.lo&&w.wordIndex<=item.hi);
        if(!chosen.length){wordRangeMisses++;continue;}
        const boxes=chosen.map(w=>w.box).filter(Boolean);
        if(!boxes.length){wordRangeMisses++;continue;}
        const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y)),x2=Math.max(...boxes.map(b=>b.x+b.w)),y2=Math.max(...boxes.map(b=>b.y+b.h));
        targets.push({pageIndex,label:item.ex.label,example:item.ex,box:{x,y,w:x2-x,h:y2-y}});
      }
      canvas.width=1;canvas.height=1;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const attachment={totalExamples:examples.length,parsedIds,invalidIds,outOfRange,missingLines,missingFiles,wordRangeMisses,reattached:targets.length,attachmentSource:"saved-layoutLines + estimateInkAlignedWordBoxes"};
    if(!targets.length)return {diagnosticOnly:true,available:false,...attachment,reason:"Persisted IDs parsed, but saved OCR line geometry could not reconstruct matching word boxes."};

    const measure=(canvas,b)=>{
      const pad=Math.max(1,Math.round(b.h*.08)),x=Math.max(0,Math.floor(b.x-pad)),y=Math.max(0,Math.floor(b.y-pad)),w=Math.min(canvas.width-x,Math.max(4,Math.ceil(b.w+2*pad))),h=Math.min(canvas.height-y,Math.max(4,Math.ceil(b.h+2*pad)));
      if(w<4||h<4)return null;
      const d=canvas.getContext("2d",{willReadFrequently:true}).getImageData(x,y,w,h).data,gray=new Float32Array(w*h);let sum=0;
      for(let i=0,j=0;i<d.length;i+=4,j++){const g=.299*d[i]+.587*d[i+1]+.114*d[i+2];gray[j]=g;sum+=g;}
      const mean=sum/gray.length,thr=Math.max(70,Math.min(210,mean-30)),rows=[],left=[],right=[];let ink=0,upper=0,lower=0;
      for(let yy=0;yy<h;yy++){let sx=0,n=0,lo=w,hi=-1;for(let xx=0;xx<w;xx++)if(gray[yy*w+xx]<thr){sx+=xx;n++;ink++;if(yy<h/2)upper++;else lower++;lo=Math.min(lo,xx);hi=Math.max(hi,xx);}if(n>=2){rows.push([yy,sx/n]);left.push([yy,lo]);right.push([yy,hi]);}}
      const slope=pts=>{if(pts.length<3)return 0;const my=pts.reduce((s,p)=>s+p[0],0)/pts.length,mx=pts.reduce((s,p)=>s+p[1],0)/pts.length;let num=0,den=0;for(const [yy,xx] of pts){num+=(yy-my)*(xx-mx);den+=(yy-my)**2;}return den?num/den:0;};
      const cs=slope(rows),ls=slope(left),rs=slope(right);
      const steps=[];for(let i=1;i<rows.length;i++){const dy=rows[i][0]-rows[i-1][0];if(dy)steps.push((rows[i][1]-rows[i-1][1])/dy);}
      const sm=steps.length?steps.reduce((x,z)=>x+z,0)/steps.length:0,ssd=steps.length?Math.sqrt(steps.reduce((x,z)=>x+(z-sm)**2,0)/steps.length):0;
      return {centroidLean:cs,leftContourLean:ls,rightContourLean:rs,contourAsymmetry:Math.abs(ls-rs),leanConsistency:1/(1+ssd),inkOccupancy:ink/(w*h),upperLowerInkRatio:lower?upper/lower:0};
    };
    const rows=[],groups=new Map();for(const t of targets){if(!groups.has(t.pageIndex))groups.set(t.pageIndex,[]);groups.get(t.pageIndex).push(t);}
    for(const [pageIndex,items] of groups){
      const file=state.pages?.[pageIndex]?.file||state.files?.[pageIndex];if(!file)continue;
      try{const img=await loadImageFromFile(file),canvas=makeCroppedCanvas(img);for(const t of items){const f=measure(canvas,t.box);if(f)rows.push({label:t.label,pageIndex:t.pageIndex,features:f,example:t.example});}}catch(err){console.warn("v102 pixel diagnostic skipped page",pageIndex,err);}
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const keys=["centroidLean","leftContourLean","rightContourLean","contourAsymmetry","leanConsistency","inkOccupancy","upperLowerInkRatio"];
    const stat=(arr,k)=>{const v=arr.map(r=>Number(r.features[k])).filter(Number.isFinite);if(!v.length)return {n:0,mean:null,sd:null};const mean=v.reduce((x,z)=>x+z,0)/v.length,sd=Math.sqrt(v.reduce((x,z)=>x+(z-mean)**2,0)/Math.max(1,v.length-1));return {n:v.length,mean,sd};};
    // v111: diagnostic-only leave-one-out pixel classifier. It uses only the
    // three promising v110 features, with class means/SD learned from all OTHER
    // measured labels for each specimen. No production learner state is changed.
    const pixelKeys=["leanConsistency","inkOccupancy","contourAsymmetry"];
    const gaussianScore=(row,train,label)=>{
      const cls=train.filter(x=>x.label===label); if(cls.length<2)return 0;
      let score=0;
      for(const k of pixelKeys){
        const vals=cls.map(x=>Number(x.features[k])).filter(Number.isFinite);
        if(vals.length<2)continue;
        const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
        const sd=Math.max(1e-6,Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/(vals.length-1)));
        const z=(Number(row.features[k])-mean)/sd;
        score+=-.5*z*z-Math.log(sd);
      }
      return score;
    };
    const simRows=rows.map((r,i)=>{
      const train=rows.filter((_,j)=>j!==i);
      const si=gaussianScore(r,train,"ITALIC"),sr=gaussianScore(r,train,"ROMAN");
      const d=Math.max(-30,Math.min(30,si-sr)),pixelProbability=1/(1+Math.exp(-d));
      return {...r,pixelProbability};
    });
    const rankSummary=(arr)=>{
      const ranked=[...arr].sort((a,b)=>b.pixelProbability-a.pixelProbability);
      const totalItalic=ranked.filter(x=>x.label==="ITALIC").length;
      const at=n=>{const top=ranked.slice(0,n),found=top.filter(x=>x.label==="ITALIC").length;return {n,italicFound:found,totalItalic,recall:totalItalic?found/totalItalic:null,precision:top.length?found/top.length:null};};
      return {top10:at(10),top25:at(25),top50:at(50),top100:at(100)};
    };
    const pseudoRunFromExample=x=>{
      const v=(x?.vector||[]).map(n=>Number.isFinite(Number(n))?Number(n):0),wc=Math.max(1,Math.round(v[6]||1));
      const glyph=String(x?.glyphClass||`word:${wc}`),single=glyph.startsWith("single:");
      const text=single?(glyph.split(":")[1]||"a"):Array.from({length:Math.max(2,wc)},()=>"aa").join(" ");
      const words=Array.from({length:wc},(_,i)=>({wordIndex:i,text:single&&i===0?text:"aa",inkDensityZ:v[7],edgeDelta:v[8],widthRatioDelta:v[9],localSlantLift:v[10],localGainLift:v[11],localShearLift:v[12]}));
      return {text,words,wordCount:wc,structuralAverage:v[0],structuralMinimum:v[1],structuralConsistency:v[2],slantSupport:v[3],gainSupport:v[4],shearSupport:v[5],reviewBox:null};
    };
    for(const r of simRows){
      const lp=italicLearnedProbabilityUncached(pseudoRunFromExample(r.example));
      r.currentLearnerProbability=Number.isFinite(lp)?lp:0;
    }
    const summarizeByScore=(arr,key)=>{
      const ranked=[...arr].sort((a,b)=>Number(b[key])-Number(a[key]));
      const totalItalic=ranked.filter(x=>x.label==="ITALIC").length;
      const at=n=>{const top=ranked.slice(0,n),found=top.filter(x=>x.label==="ITALIC").length;return {n,italicFound:found,totalItalic,recall:totalItalic?found/totalItalic:null,precision:top.length?found/top.length:null};};
      return {top10:at(10),top25:at(25),top50:at(50),top100:at(100)};
    };
    const weights=[0,.025,.05,.075,.10,.125];
    const weightedBakeoff=weights.map(weight=>{
      for(const r of simRows)r._blend=(1-weight)*r.currentLearnerProbability+weight*r.pixelProbability;
      return {pixelWeight:weight,learnerWeight:1-weight,...summarizeByScore(simRows,"_blend")};
    });
    const pixelRankingSimulation={method:"leave-one-out Gaussian, equal class prior, features: leanConsistency + inkOccupancy + contourAsymmetry",...rankSummary(simRows)};
    const learnerPixelBakeoff={diagnosticOnly:true,population:simRows.length,italicCount:simRows.filter(x=>x.label==="ITALIC").length,romanCount:simRows.filter(x=>x.label==="ROMAN").length,weightsTested:weights,currentLearnerNote:"Current learner is replayed from each persisted 13-feature vector on the same pixel-measured subset.",results:weightedBakeoff};

    const I=rows.filter(r=>r.label==="ITALIC"),R=rows.filter(r=>r.label==="ROMAN");
    return {diagnosticOnly:true,available:rows.length>0,...attachment,measured:rows.length,italicCount:I.length,romanCount:R.length,pixelRankingSimulation,learnerPixelBakeoff,features:keys.map(k=>{const i=stat(I,k),r=stat(R,k),pool=Math.max(1e-9,Math.sqrt(((i.sd||0)**2+(r.sd||0)**2)/2));return {name:k,italic:i,roman:r,signedSeparation:(i.mean==null||r.mean==null)?null:(i.mean-r.mean)/pool,separation:(i.mean==null||r.mean==null)?null:Math.abs(i.mean-r.mean)/pool};}).sort((x,z)=>(z.separation??-1)-(x.separation??-1)),note:"BUILD 114 pixel geometry diagnostic; validated three-feature model is persisted for conditional production assist (0–12.5%) with top-100 recall. Reconstructs word boxes directly from saved OCR layoutLines plus loaded screenshot pixels; no Auto Italic Scan, no re-OCR, and no production ranking changes."};
  }


  // v151 local Iowan reference-atlas experiment. Diagnostic only.
  // Source: the user's clean Roman/Italic Iowan Old Style Basic Latin screenshots.
  const IOWAN_REFERENCE_ASSETS={
    roman:"iowan-old-style-roman-atlas.webp",
    italic:"iowan-old-style-italic-atlas.webp"
  };
  const IOWAN_ATLAS_GRID={
    columns:20,
    // The screenshot grid has a title row followed by five equal glyph rows.
    // Each cell is sampled independently so punctuation and narrow glyphs do not
    // need heuristic vertical segmentation.
    chars:[
      ["","!","\"","#","$","%","&","'","(",")","*","+",",","-",".","/","0","1","2","3"],
      ["4","5","6","7","8","9",":",";","<","=",">","?","@","A","B","C","D","E","F","G"],
      ["H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","["],
      ["\\","]","^","_","`","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o"],
      ["p","q","r","s","t","u","v","w","x","y","z","{","|","}","~","","","","",""]
    ]
  };
  async function loadReferenceImage(url){
    return await new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error("Could not load bundled reference image: "+url));
      img.src=url+"?v="+BUILD_VERSION;
    });
  }
  function trimInkCanvas(source){
    const ctx=source.getContext("2d",{willReadFrequently:true}),im=ctx.getImageData(0,0,source.width,source.height),d=im.data;
    let x0=source.width,y0=source.height,x1=-1,y1=-1;
    for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
      const i=(y*source.width+x)*4,gray=(d[i]+d[i+1]+d[i+2])/3;
      if(gray<205){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
    }
    if(x1<x0||y1<y0)return null;
    return cropCanvasRegion(source,{x:Math.max(0,x0-1),y:Math.max(0,y0-1),w:Math.min(source.width-x0+1,x1-x0+3),h:Math.min(source.height-y0+1,y1-y0+3)});
  }
  function normalizedInkMask(source,w=24,h=32){
    const trimmed=trimInkCanvas(source);if(!trimmed)return null;
    const c=document.createElement("canvas");c.width=w;c.height=h;
    const x=c.getContext("2d",{alpha:false,willReadFrequently:true});x.fillStyle="#fff";x.fillRect(0,0,w,h);
    const scale=Math.min((w-4)/trimmed.width,(h-4)/trimmed.height),dw=Math.max(1,trimmed.width*scale),dh=Math.max(1,trimmed.height*scale);
    x.drawImage(trimmed,(w-dw)/2,(h-dh)/2,dw,dh);
    const d=x.getImageData(0,0,w,h).data,m=new Float32Array(w*h);
    for(let i=0;i<m.length;i++){const j=i*4,gray=(d[j]+d[j+1]+d[j+2])/3;m[i]=Math.max(0,Math.min(1,(245-gray)/190));}
    return m;
  }
  function maskDistance(a,b){if(!a||!b||a.length!==b.length)return null;let sum=0,ws=0;for(let i=0;i<a.length;i++){const w=.2+.8*Math.max(a[i],b[i]),z=a[i]-b[i];sum+=w*z*z;ws+=w;}return ws?Math.sqrt(sum/ws):null;}
  function verticalInkSegments(source,expected){
    const ctx=source.getContext("2d",{willReadFrequently:true}),d=ctx.getImageData(0,0,source.width,source.height).data,active=[];
    for(let x=0;x<source.width;x++){let n=0;for(let y=0;y<source.height;y++){const i=(y*source.width+x)*4;if((d[i]+d[i+1]+d[i+2])/3<210)n++;}active[x]=n>0;}
    const seg=[];let start=-1;
    for(let x=0;x<=active.length;x++){if(x<active.length&&active[x]&&start<0)start=x;if((x===active.length||!active[x])&&start>=0){if(x-start>=1)seg.push([start,x]);start=-1;}}
    while(seg.length>expected&&seg.length>1){let best=0,gap=Infinity;for(let i=0;i<seg.length-1;i++){const g=seg[i+1][0]-seg[i][1];if(g<gap){gap=g;best=i;}}seg.splice(best,2,[seg[best][0],seg[best+1][1]]);}
    if(seg.length!==expected)return null;
    return seg.map(pair=>cropCanvasRegion(source,{x:Math.max(0,pair[0]-1),y:0,w:Math.min(source.width-pair[0]+1,pair[1]-pair[0]+2),h:source.height}));
  }
  function atlasCellMask(canvas,row,col){
    const cols=IOWAN_ATLAS_GRID.columns,rows=5;
    const x0=col*canvas.width/cols,x1=(col+1)*canvas.width/cols;
    const y0=row*canvas.height/rows,y1=(row+1)*canvas.height/rows;
    const padX=Math.max(2,(x1-x0)*.12),padY=Math.max(2,(y1-y0)*.10);
    const cell=cropCanvasRegion(canvas,{x:x0+padX,y:y0+padY,w:(x1-x0)-padX*2,h:(y1-y0)-padY*2});
    return normalizedInkMask(cell);
  }
  async function buildIowanReferenceAtlas(){
    const [romanImg,italicImg]=await Promise.all([
      loadReferenceImage(IOWAN_REFERENCE_ASSETS.roman),
      loadReferenceImage(IOWAN_REFERENCE_ASSETS.italic)
    ]);
    const toCanvas=img=>{const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext("2d",{alpha:false}).drawImage(img,0,0);return c;};
    const rc=toCanvas(romanImg),ic=toCanvas(italicImg),roman={},italic={};
    IOWAN_ATLAS_GRID.chars.forEach((row,ri)=>row.forEach((ch,ci)=>{
      if(!ch)return;
      const rm=atlasCellMask(rc,ri,ci),im=atlasCellMask(ic,ri,ci);
      if(rm)roman[ch]=rm;if(im)italic[ch]=im;
    }));
    return {roman,italic,pageSize:[rc.width,rc.height],glyphCount:Object.keys(roman).filter(ch=>italic[ch]).length};
  }
  async function candidateCanvasForRun(run){
    const file=state.files?.[Number(run.pageIndex)];if(!file||!run.reviewBox)return null;
    const img=await loadImageFromFile(file),page=makeCroppedCanvas(img),b=run.reviewBox;
    return cropCanvasRegion(page,{x:Number(b.x||0),y:Number(b.y||0),w:Number(b.w||b.width||0),h:Number(b.h||b.height||0)});
  }
  function iowanDeltaMask(romanMask,italicMask){
    if(!romanMask||!italicMask||romanMask.length!==italicMask.length)return null;
    const out=new Float32Array(romanMask.length);
    for(let i=0;i<out.length;i++) out[i]=italicMask[i]-romanMask[i];
    return out;
  }
  function deltaProjectionScore(sampleMask,romanMask,italicMask){
    if(!sampleMask||!romanMask||!italicMask||sampleMask.length!==romanMask.length||romanMask.length!==italicMask.length)return null;
    const delta=iowanDeltaMask(romanMask,italicMask);let num=0,den=0;
    for(let i=0;i<sampleMask.length;i++){
      const baseline=(romanMask[i]+italicMask[i])/2;
      num+=(sampleMask[i]-baseline)*delta[i];
      den+=delta[i]*delta[i];
    }
    return den>1e-8?num/Math.sqrt(den):null;
  }
  function pairedDifferenceCorrelation(sampleMask,romanMask,italicMask){
    if(!sampleMask||!romanMask||!italicMask||sampleMask.length!==romanMask.length||romanMask.length!==italicMask.length)return null;
    const delta=iowanDeltaMask(romanMask,italicMask);
    const centered=new Float32Array(sampleMask.length);
    let sm=0,bm=0;
    for(let i=0;i<sampleMask.length;i++){sm+=sampleMask[i];bm+=(romanMask[i]+italicMask[i])/2;}
    sm/=sampleMask.length;bm/=sampleMask.length;
    let num=0,sd=0,dd=0;
    for(let i=0;i<sampleMask.length;i++){
      const sv=sampleMask[i]-sm, bv=((romanMask[i]+italicMask[i])/2)-bm, dv=delta[i];
      const cv=sv-bv; centered[i]=cv; num+=cv*dv; sd+=cv*cv; dd+=dv*dv;
    }
    return (sd>1e-8&&dd>1e-8)?num/Math.sqrt(sd*dd):null;
  }
  async function runIowanReferenceAtlasStudy(){
    const atlas=await buildIowanReferenceAtlas(),profile=currentItalicLearningProfile(),examples=(profile.examples||[]).filter(x=>x.label==="ITALIC"||x.label==="ROMAN");
    const parsed=[];let invalidIds=0,outOfRange=0,missingLines=0,missingFiles=0,wordRangeMisses=0,unsupported=0,segmentationSkipped=0;
    for(const ex of examples){
      const tail=String(ex.id||"").split("::").pop()||"",m=tail.match(/^(\d+):(\d+):(\d+):(\d+)$/);
      if(!m){invalidIds++;continue;}
      parsed.push({ex,pageIndex:Number(m[1]),lineIndex:Number(m[2]),lo:Math.min(Number(m[3]),Number(m[4])),hi:Math.max(Number(m[3]),Number(m[4]))});
    }
    const byPage=new Map();for(const p of parsed){if(!byPage.has(p.pageIndex))byPage.set(p.pageIndex,[]);byPage.get(p.pageIndex).push(p);}
    const out=[];let reattached=0;
    for(const [pageIndex,items] of byPage){
      const page=state.pages?.[pageIndex];if(!page){outOfRange+=items.length;continue;}
      const file=page.file||state.files?.[pageIndex];if(!file){missingFiles+=items.length;continue;}
      let canvas;try{const img=await loadImageFromFile(file);canvas=makeCroppedCanvas(img);}catch(_){missingFiles+=items.length;continue;}
      const lineCache=new Map();
      for(const item of items){
        const line=page.layoutLines?.[item.lineIndex];if(!line){missingLines++;continue;}
        let words=lineCache.get(item.lineIndex);
        if(!words){words=estimateInkAlignedWordBoxes(canvas,line).map((w,i)=>({...w,wordIndex:i}));lineCache.set(item.lineIndex,words);}
        const chosen=words.filter(w=>w.wordIndex>=item.lo&&w.wordIndex<=item.hi);
        if(!chosen.length){wordRangeMisses++;continue;}
        const text=String(item.ex.normalizedText||item.ex.specimenText||chosen.map(w=>w.text||"").join(" ")).replace(/[^\p{L}\p{N}'’]/gu,"");
        if(!text){unsupported++;continue;}
        const chars=Array.from(text).map(ch=>ch==="’"?"'":ch);
        if(!chars.every(ch=>atlas.roman[ch]&&atlas.italic[ch])){unsupported++;continue;}
        const boxes=chosen.map(w=>w.box).filter(Boolean);if(!boxes.length){wordRangeMisses++;continue;}
        const x=Math.min(...boxes.map(q=>q.x)),y=Math.min(...boxes.map(q=>q.y)),x2=Math.max(...boxes.map(q=>q.x+q.w)),y2=Math.max(...boxes.map(q=>q.y+q.h));
        const crop=cropCanvasRegion(canvas,{x,y,w:x2-x,h:y2-y});reattached++;
        const pieces=verticalInkSegments(crop,chars.length);if(!pieces){segmentationSkipped++;continue;}
        let rd=0,id=0,proj=0,corr=0,n=0,pn=0,cn=0;
        chars.forEach((ch,i)=>{
          const m=normalizedInkMask(pieces[i]),r=maskDistance(m,atlas.roman[ch]),it=maskDistance(m,atlas.italic[ch]);
          if(r!=null&&it!=null){rd+=r;id+=it;n++;}
          const p=deltaProjectionScore(m,atlas.roman[ch],atlas.italic[ch]);if(Number.isFinite(p)){proj+=p;pn++;}
          const c=pairedDifferenceCorrelation(m,atlas.roman[ch],atlas.italic[ch]);if(Number.isFinite(c)){corr+=c;cn++;}
        });
        if(!n)continue;rd/=n;id/=n;proj=pn?proj/pn:null;corr=cn?corr/cn:null;
        out.push({label:item.ex.label,textLength:chars.length,romanDistance:rd,italicDistance:id,italicAdvantage:rd-id,deltaProjection:proj,deltaCorrelation:corr});
      }
      canvas.width=1;canvas.height=1;await new Promise(resolve=>setTimeout(resolve,0));
    }
    const vals=(label,key)=>out.filter(r=>r.label===label&&Number.isFinite(r[key])).map(r=>r[key]);
    const stat=(arr)=>{if(!arr.length)return {n:0,mean:null,median:null,sd:null};const a=[...arr].sort((x,y)=>x-y),mean=a.reduce((x,y)=>x+y,0)/a.length,sd=Math.sqrt(a.reduce((t,v)=>t+(v-mean)*(v-mean),0)/a.length);return {n:a.length,mean,median:a[Math.floor(a.length/2)],sd};};
    const separation=(key)=>{
      const ia=stat(vals("ITALIC",key)),ra=stat(vals("ROMAN",key)),pool=Math.sqrt(((ia.sd||0)**2+(ra.sd||0)**2)/2);
      return {feature:key,italic:ia,roman:ra,separation:pool?Math.abs((ia.mean??0)-(ra.mean??0))/pool:null,direction:(ia.mean??0)>(ra.mean??0)?"higher-for-italic":"lower-for-italic"};
    };
    const features=["italicAdvantage","deltaProjection","deltaCorrelation"].map(separation).sort((a,b)=>(b.separation??-1)-(a.separation??-1));
    return {diagnosticOnly:true,source:"bundled-user-captured-Iowan-Old-Style-atlas",referenceAssets:IOWAN_REFERENCE_ASSETS,referencePageSize:atlas.pageSize,atlasGlyphCount:atlas.glyphCount,totalExamples:examples.length,parsedIds:parsed.length,reattached,measured:out.length,featureSeparation:features,invalidIds,outOfRange,missingLines,missingFiles,wordRangeMisses,unsupported,segmentationSkipped,rows:out,note:"v154 Iowan paired Roman↔Italic delta diagnostic. Tests only the style-change direction encoded by paired glyphs, rather than raw nearest-face distance. Diagnostic only; no Hunt ranking, learning, OCR, Repair Book, or Final Polish changes."};
  }
  async function ensureTesseractSidecar(){
    if(globalThis.Tesseract?.createWorker)return globalThis.Tesseract;
    setStatus("Loading Tesseract sidecar…");
    await new Promise((resolve,reject)=>{
      const prior=document.querySelector('script[data-book-ocr-tesseract]');
      if(prior){prior.addEventListener("load",resolve,{once:true});prior.addEventListener("error",reject,{once:true});return;}
      const tag=document.createElement("script");tag.dataset.bookOcrTesseract="1";
      tag.src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      tag.onload=resolve;tag.onerror=()=>reject(new Error("Could not load Tesseract.js"));
      document.head.appendChild(tag);
    });
    if(!globalThis.Tesseract?.createWorker)throw new Error("Tesseract.js loaded without createWorker");
    return globalThis.Tesseract;
  }
  function tesseractWordsToLayout(words){
    const usable=(Array.isArray(words)?words:[]).filter(w=>String(w?.text||"").trim()&&w?.bbox);
    if(!usable.length)return [];
    const heights=usable.map(w=>Math.max(1,Number(w.bbox.y1)-Number(w.bbox.y0))),typicalH=median(heights)||28;
    const groups=[];
    for(const w of usable.sort((a,b)=>(a.bbox.y0-b.bbox.y0)||(a.bbox.x0-b.bbox.x0))){
      const cy=(w.bbox.y0+w.bbox.y1)/2;let g=groups.find(x=>Math.abs(x.cy-cy)<=typicalH*.45);
      if(!g){g={items:[],cy};groups.push(g);}g.items.push(w);g.cy=median(g.items.map(q=>(q.bbox.y0+q.bbox.y1)/2));
    }
    return groups.map(g=>{
      const row=g.items.sort((a,b)=>a.bbox.x0-b.bbox.x0),x=Math.min(...row.map(w=>w.bbox.x0)),y=Math.min(...row.map(w=>w.bbox.y0)),x2=Math.max(...row.map(w=>w.bbox.x1)),y2=Math.max(...row.map(w=>w.bbox.y1));
      return {text:row.map(w=>String(w.text||"").trim()).filter(Boolean).join(" "),score:Math.min(...row.map(w=>Number(w.confidence||0)/100)),box:{x,y,w:x2-x,h:y2-y,cx:(x+x2)/2,cy:(y+y2)/2}};
    }).sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x);
  }
  function textSimilarity(a,b){
    const aa=String(a||"").replace(/\s+/g," ").trim(),bb=String(b||"").replace(/\s+/g," ").trim();
    if(!aa&&!bb)return 1;if(!aa||!bb)return 0;
    let prev=Array(bb.length+1).fill(0).map((_,i)=>i);
    for(let i=1;i<=aa.length;i++){const cur=[i];for(let j=1;j<=bb.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(aa[i-1]===bb[j-1]?0:1));prev=cur;}
    return 1-prev[bb.length]/Math.max(aa.length,bb.length,1);
  }
  async function runTesseractSidecar(){
    if(!state.files.length){setStatus("Add the book screenshots first.");return;}
    const T=await ensureTesseractSidecar(),sample=[0,Math.floor(state.files.length/2),state.files.length-1].filter((v,i,a)=>v>=0&&a.indexOf(v)===i);
    const worker=await T.createWorker("eng",1,{logger:m=>{if(m?.status)setStatus("Tesseract sidecar: "+m.status+(Number.isFinite(m.progress)?" "+Math.round(m.progress*100)+"%":""));}});
    try{
      const rows=[];
      for(const index of sample){
        const img=await loadImageFromFile(state.files[index]),canvas=makeCroppedCanvas(img),r=await worker.recognize(canvas,{}, {text:true,blocks:true,hocr:true,tsv:true});
        const data=r?.data||{},words=data.words||[],layout=tesseractWordsToLayout(words);
        const bookProfile=layout.length?buildBookLayoutProfile([{layoutLines:layout}]):null;
        const rebuilt=layout.length?reconstructParagraphsFromLayout(layout,{bookProfile}):{text:data.text||""};
        const raw=cleanBodyText(data.text||""),repaired0=cleanBodyText(rebuilt.text||raw);
        const safe=globalThis.BookOcrEpubPolish?.safePolishText,repaired1=typeof safe==="function"?safe(repaired0).text:repaired0,repaired=applyProfileKnownOcrCleanup(repaired1).text;
        const paddle=state.pages?.[index]?.text||"";
        const italicWords=words.filter(w=>w?.font_name&&/italic|oblique/i.test(String(w.font_name)));
        rows.push({pageIndex:index,fileName:state.files[index].name,rawText:raw,repairedText:repaired,paddleText:paddle,rawVsPaddleSimilarity:paddle?textSimilarity(raw,paddle):null,repairedVsPaddleSimilarity:paddle?textSimilarity(repaired,paddle):null,wordCount:words.length,italicStyleWordCount:italicWords.length,italicStyleWords:italicWords.slice(0,100).map(w=>({text:w.text,font_name:w.font_name,confidence:w.confidence,bbox:w.bbox})),tesseractMetadata:{hasWords:!!words.length,hasBlocks:!!data.blocks?.length,hasHocr:!!data.hocr,hasTsv:!!data.tsv}});
        canvas.width=1;canvas.height=1;
      }
      const payload={build:BUILD_VERSION,diagnosticOnly:true,engine:"Tesseract.js v5 sidecar",samplePages:sample.map(i=>i+1),rows,note:"Tesseract sidecar diagnostic only. Tesseract does not replace Paddle or modify saved OCR/learning. Tesseract text is passed through current paragraph reconstruction where geometry is available, safe polish, and profile-known cleanup; output is compared with existing Paddle text."};
      downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),"tesseract-sidecar-v"+BUILD_VERSION+".json");
      setStatus("Tesseract sidecar complete on "+rows.length+" pages. Diagnostic JSON downloaded; Paddle OCR and learning were untouched.");
    }finally{await worker.terminate();}
  }
  els.tesseractSidecarBtn?.addEventListener("click",async()=>{const b=els.tesseractSidecarBtn,old=b.textContent;b.disabled=true;b.textContent="Testing Tesseract…";try{await runTesseractSidecar();}catch(err){console.error(err);setStatus("Tesseract sidecar failed: "+(err?.message||err));}finally{b.disabled=false;b.textContent=old;}});

  els.italicReferenceAtlasBtn?.addEventListener("click",async()=>{
    const btn=els.italicReferenceAtlasBtn,old=btn.textContent;btn.disabled=true;btn.textContent="Reference atlas…";setStatus("Reference atlas: loading bundled Iowan Roman/Italic glyph atlas…");
    try{const study=await runIowanReferenceAtlasStudy();state.iowanReferenceAtlasStudy=study;downloadBlob(new Blob([JSON.stringify({build:BUILD_VERSION,sourceProfile:state.sourceProfile,referenceAtlasStudy:study},null,2)],{type:"application/json"}),"iowan-reference-atlas-v"+BUILD_VERSION+".json");setStatus("Reference atlas complete: "+study.atlasGlyphCount+" glyph pairs · "+study.measured+" labeled specimens measured · "+study.correct+"/"+study.measured+" nearest-face matches.");}
    catch(err){const study={diagnosticOnly:true,available:false,error:String(err?.message||err),source:"bundled-user-captured-Iowan-Old-Style-atlas"};state.iowanReferenceAtlasStudy=study;downloadBlob(new Blob([JSON.stringify({build:BUILD_VERSION,sourceProfile:state.sourceProfile,referenceAtlasStudy:study},null,2)],{type:"application/json"}),"iowan-reference-atlas-v"+BUILD_VERSION+".json");setStatus("Reference atlas experiment failed; diagnostic JSON downloaded.");console.warn(err);}
    finally{btn.disabled=false;btn.textContent=old;}
  });

  els.italicPixelStudyBtn?.addEventListener("click",async ()=>{
    const btn=els.italicPixelStudyBtn, oldText=btn.textContent;
    btn.disabled=true; btn.textContent="Pixel study…";
    setStatus("Pixel study: measuring existing labeled screenshot crops…");
    try{
      const study=await buildItalicPixelGeometryStudyFromLoadedScreenshots();
      state.italicVisualFeatureStudy=study;
      if(study?.available&&Array.isArray(study.features)){
        const keep=new Set(["leanConsistency","inkOccupancy","contourAsymmetry"]);
        const model={version:1,sourceProfile:state.sourceProfile,features:study.features.filter(f=>keep.has(f.name)).map(f=>({name:f.name,italic:f.italic,roman:f.roman})),savedAt:new Date().toISOString()};
        try{localStorage.setItem("bookOcrStudio.italicPixelAssist.v1",JSON.stringify(model));}catch(_){}
      }
      const payload={build:BUILD_VERSION,sourceProfile:state.sourceProfile,visualFeatureStudy:study,note:"BUILD 124 isolated pixel diagnostic. Uses already-loaded screenshots and persisted Italic/Roman labels only. No re-OCR, no new labeling, and no production learner/ranking changes."};
      downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),`italic-pixel-study-v${BUILD_VERSION}.json`);
      setStatus(study?.available?`Pixel study complete: ${study.measured||0} specimens measured.`:`Pixel study complete: no measurements. ${study?.reason||""}`);
    }catch(err){
      const study={diagnosticOnly:true,available:false,error:String(err?.message||err),reason:"Isolated pixel study threw an error."};
      state.italicVisualFeatureStudy=study;
      downloadBlob(new Blob([JSON.stringify({build:BUILD_VERSION,sourceProfile:state.sourceProfile,visualFeatureStudy:study},null,2)],{type:"application/json"}),`italic-pixel-study-v${BUILD_VERSION}.json`);
      setStatus("Pixel study failed; diagnostic JSON downloaded."); console.warn("Pixel study failure",err);
    }finally{btn.disabled=false;btn.textContent=oldText;}
  });

  els.exportItalicValidation?.addEventListener("click",()=>{
    const replay=buildPersistedItalicValidationReplay();
    state.italicPersistedValidationReplay=replay;
    const rows=replay.rows, controls=rows.filter(r=>r.label==="ITALIC"), romans=rows.filter(r=>r.label==="ROMAN"), cutoffs=[20,50,100,250];
    const modeSummary=(rankField)=>{const ranked=rows.filter(r=>Number.isFinite(Number(r[rankField]))),out={labeled:ranked.length,knownItalics:controls.length,knownRomans:romans.length,cutoffs:{}};for(const n of cutoffs){const selected=ranked.filter(r=>Number(r[rankField])<=n),tp=selected.filter(r=>r.label==="ITALIC").length,fp=selected.filter(r=>r.label==="ROMAN").length;out.cutoffs[n]={selectedLabeled:selected.length,trueItalics:tp,romans:fp,precision:selected.length?tp/selected.length:null,recall:controls.length?tp/controls.length:null};}out.italicRanks=controls.map(r=>Number(r[rankField])).filter(Number.isFinite).sort((a,b)=>a-b);return out;};
    const heldOut=state.italicHeldOutValidation||{label:"HELD-OUT VALIDATION",pageGrouped:buildGroupedHeldOutItalicValidation("page"),tokenGrouped:buildGroupedHeldOutItalicValidation("token"),warning:"Run Held-out Italic Validation first to attach current-project Pixel Assist and hidden-context evidence before export."};
    const finalCards=(state.italicCalibrationReviewSet||[]).slice(0,250).map(r=>({servedRank:r.finalServedRank||null,specimenKey:italicCalibrationKey(r),text:italicNormalizedSpecimenText(r),pageIndex:r.pageIndex,lineIndex:r.lineIndex,startWordIndex:r.startWordIndex,finalScore:r.finalItalicScore,finalRankDiagnostics:r.finalRankDiagnostics||null}));
    const payload={format:"book-ocr-studio-held-out-italic-validation-v1",build:BUILD_VERSION,exportedAt:new Date().toISOString(),sourceProfile:state.sourceProfile,
      heldOutValidation:heldOut,
      trainingSetReplayDiagnostics:{label:"TRAINING-SET / REPLAY DIAGNOSTICS — NOT EXPECTED LIVE PERFORMANCE",selfNeighborLeakagePossible:true,rows:rows.length,knownItalics:controls.length,knownRomans:romans.length,standard:modeSummary("standardRank"),learned:modeSummary("learnedRank"),hunt:modeSummary("huntRank"),timing:replay.huntTiming,note:"Retained only for historical comparison with pre-v156 exports. These are resubstitution numbers and must not be interpreted as generalization or expected Hunt yield."},
      canonicalLiveRanking:{label:"EXACT FINAL SCORING/RANKING PATH USED BY LIVE HUNT",formula:"0.62 * pixel-blended learned probability + 0.30 * structural probability + 0.08 * positive-envelope score + hidden context bonus; then lexical occurrence rounds",pixelWeightWhenAvailable:.10,finalCards,huntFunnel:state.italicHuntDiagnostics||null},
      timing:{review:state.italicReviewTiming||null,deep:state.italicValidationDeepTiming||state.italicDiagnosticsTiming||null,population:state.italicValidationPopulationTiming||state.italicPopulationTiming||null,lastRealHunt:state.lastRealItalicHuntTiming||null},
      dataIntegrity:{ocrReset:false,learningReset:false,persistedExamples:rows.length},
      note:"Build 156 laboratory repair. heldOutValidation is the honest baseline. trainingSetReplayDiagnostics is deliberately separated and labeled as optimistic historical replay. No detector was added and no labels or OCR results were reset."};
    downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),`italic-held-out-validation-v${BUILD_VERSION}.json`);
    setStatus(`Exported honest held-out italic baseline for build ${BUILD_VERSION}. Send back italic-held-out-validation-v${BUILD_VERSION}.json.`);
  });
  updatePreview();
})();
