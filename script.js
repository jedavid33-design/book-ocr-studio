(() => {
  "use strict";

  const BUILD_VERSION = "2.6.1-cleanup-persistence-auto-italics";
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
    downloadTxt: $("downloadTxt"),
    downloadEpub: $("downloadEpub"),
    safePolish: $("safePolish"),
    autoItalicScan: $("autoItalicScan"),
    italicStatus: $("italicStatus"),
    polishStatus: $("polishStatus"),
    repairLigatures: $("repairLigatures"),
    ligatureStatus: $("ligatureStatus"),
    rebuildParagraphs: $("rebuildParagraphs"),
    downloadLayoutDiagnostics: $("downloadLayoutDiagnostics"),
    paragraphStatus: $("paragraphStatus"),
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
        bookLayoutProfile: state.bookLayoutProfile || null,
        pages: state.pages.map(p => ({
          fileName: p.file.name,
          text: p.text || "",
          chapterCandidate: !!p.chapterCandidate,
          chapterStart: !!p.chapterStart,
          chapterTitle: p.chapterTitle || "",
          layoutLines: Array.isArray(p.layoutLines) ? p.layoutLines : [],
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
    state.bookLayoutProfile = saved.bookLayoutProfile || null;

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
        layoutLines: Array.isArray(page.layoutLines) ? page.layoutLines : [],
        layoutMeta: page.layoutMeta || null,
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
      current.push(line.italicAuto ? `[[i]]${text}[[/i]]` : text);

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

  function stripItalicMarkers(text) {
    return String(text || "").replace(/\[\[\/?i\]\]/gi, "");
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
    if (page) page.text = textarea.value;
    saveCheckpoint();
    setStatus(`Marked the selected text as italic on page ${state.currentPageIndex + 1}. EPUB export will preserve it as emphasis.`);
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
    if (page) page.text = after;
    saveCheckpoint();
    setStatus(`Removed manual italic marks from page ${state.currentPageIndex + 1}.`);
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
    const eligible = state.pages.filter(page => Array.isArray(page.layoutLines) && page.layoutLines.length);
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
    const eligible = state.pages.filter(page => Array.isArray(page.layoutLines) && page.layoutLines.length);
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
    setStatus(`Paragraph structure rebuilt on ${rebuiltCount} page${rebuiltCount === 1 ? "" : "s"} from saved OCR geometry. No OCR rerun was needed.${profileNote}`);
    return rebuiltCount;
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

    // Once the batch exists as a whole, learn one authoritative profile and
    // feed that exact object through rebuild, diagnostics, status, and export.
    // This prevents helper/profile drift between code paths.
    state.bookLayoutProfile = buildBookLayoutProfile(state.pages);
    rebuildParagraphsFromSavedGeometry({ confirmOverwrite: false });
    state.currentPageIndex = 0;
    state.reviewMode = "chapters";
    saveCheckpoint();
    renderReview();
    refreshParagraphRebuildUi();
    const chapters = reviewIndices().length;
    setStatus(`Batch OCR complete: ${state.pages.length} pages processed. Book-level paragraph profile applied automatically. Showing ${chapters} detected chapter start page${chapters === 1 ? "" : "s"} for review.`);
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

  function excerpt(text, limit = 150) {
    const flat = String(text || "").replace(/\s+/g, " ").trim();
    return flat.length > limit ? `${flat.slice(0, limit).trim()}…` : flat;
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
    const fragment = standaloneFragment(pageText, opening.text, expectedInitial, contractionProposal);
    const latinFragment = fragment && /^\p{Lu}$/u.test(fragment.value) ? fragment.value : "";
    let proposedWord = "";
    let confidence = "ambiguous";
    let reason = "The chapter-opening word begins with a lowercase letter, but no reliable detached letter was found.";

    if (contractionProposal) {
      proposedWord = info.word;
      reason = latinFragment === "I"
        ? "A detached capital “I” matches the missing start of the opening contraction."
        : "The opening contraction appears to be missing “I”; please verify the suggestion.";
      confidence = latinFragment === "I" && fragment.source === "line" && fragment.distance <= 1
        ? "high" : "ambiguous";
    } else if (phraseProposal) {
      proposedWord = info.word;
      reason = phraseProposal.firstPerson
        ? "This chapter may begin with a standalone first-person “I” before the opening verb; please verify the suggestion."
        : latinFragment === expectedInitial
          ? `A detached capital “${expectedInitial}” matches this opening phrase.`
          : `This opening phrase appears to be missing “${expectedInitial}”; please verify the suggestion.`;
      // A normal pronoun “I” inside prose is never strong evidence. Only a
      // separate adjacent OCR line can raise an I-based repair to high.
      confidence = latinFragment === expectedInitial && fragment.source === "line" && fragment.distance <= 1
        ? "high" : "ambiguous";
    } else if (dictionaryProposal) {
      proposedWord = dictionaryProposal;
      const matches = latinFragment.toLocaleUpperCase() === expectedInitial.toLocaleUpperCase();
      confidence = matches && fragment.distance <= 2 ? "high" : "ambiguous";
      reason = matches
        ? `A detached capital “${latinFragment}” matches the missing start of “${dictionaryProposal}.”`
        : fragment
          ? `A stray “${fragment.value}” may be the misread decorative letter. “${dictionaryProposal}” is a review suggestion.`
          : `“${dictionaryProposal}” is a review suggestion; no reliable detached letter was found.`;
    } else if (latinFragment) {
      proposedWord = `${latinFragment}${info.word}`;
      confidence = fragment.source === "line" && fragment.distance <= 1 ? "high" : "ambiguous";
      reason = confidence === "high"
        ? `A detached capital “${latinFragment}” appears beside this opening paragraph.`
        : `A detached capital “${latinFragment}” appears elsewhere in this chapter; please verify it.`;
    } else {
      proposedWord = info.word;
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
    if (opening.fullText && opening.startOffset > 0) {
      proposedText = `${opening.fullText.slice(0, opening.startOffset)}${proposedText}`;
    }
    return {
      id, ...opening, info, fragment, confidence, reason,
      before: opening.fullText || opening.text, proposed: proposedText, status: "pending"
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
    const blockIndex = Number.isInteger(candidate.sourceBlockIndex)
      ? candidate.sourceBlockIndex : candidate.paragraphIndex;
    if (!blocks[blockIndex]) return;
    blocks[blockIndex] = candidate.leadingMetadataLines?.length
      ? `${candidate.leadingMetadataLines.join("\n")}\n${replacement}`
      : replacement;
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

  async function autoScanItalics() {
    if (!state.pages.length || !state.files.length) {
      setStatus("Load and OCR screenshot pages before running the automatic italic scan.");
      return;
    }
    syncCurrentEditor();
    els.autoItalicScan.disabled = true;
    let marked = 0, scanned = 0;
    try {
      for (let index = 0; index < state.pages.length; index++) {
        const page = state.pages[index];
        if (!Array.isArray(page.layoutLines) || !page.layoutLines.length) continue;
        const file = page.file || state.files[index];
        if (!file) continue;
        setStatus(`Automatic italic scan: page ${index + 1} of ${state.pages.length}…`);
        const img = await loadImageFromFile(file);
        const canvas = makeCroppedCanvas(img);
        for (const line of page.layoutLines) {
          scanned++;
          line.italicAuto = false;
          line.italicMeta = null;
          const text = String(line.text || "").trim();
          if (text.length < 8 || isSceneMarkerText(text)) continue;
          const result = italicSlantScore(canvas, line.box);
          line.italicMeta = result;
          if (result.italic) { line.italicAuto = true; marked++; }
        }
        canvas.width = 1; canvas.height = 1;
      }
      // Apply the marks through the same paragraph reconstruction path, then
      // re-apply safe cleanup so emphasis and cleanup coexist.
      rebuildParagraphsFromSavedGeometry({ confirmOverwrite: false });
      saveCheckpoint();
      if (els.italicStatus) els.italicStatus.textContent = `${marked} line${marked === 1 ? "" : "s"} marked`;
      setStatus(`Automatic italic scan checked ${scanned} OCR lines and marked ${marked} high-confidence fully italic line${marked === 1 ? "" : "s"}. Mixed inline italics remain available for manual marking.`);
    } catch (err) {
      console.error(err);
      setStatus(`Automatic italic scan failed: ${err.message || err}`);
    } finally {
      els.autoItalicScan.disabled = false;
      renderReview();
    }
  }

  function applySafePolishToProject() {
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
    for (const page of state.pages) {
      const result = polish(page.text || "");
      page.text = result.text;
      fixedCount += result.fixedCount || 0;
      ellipsisCount += result.ellipsisCount || 0;
      sceneCount += result.sceneCount || 0;
      quoteCount += result.quoteCount || 0;
    }
    saveCheckpoint();
    renderReview();
    if (els.polishStatus) els.polishStatus.textContent = `${fixedCount} safe fix${fixedCount === 1 ? "" : "es"}`;
    setStatus(`Safe text cleanup applied ${ellipsisCount} ellipsis normalization${ellipsisCount === 1 ? "" : "s"}, ${sceneCount} scene-divider normalization${sceneCount === 1 ? "" : "s"}, and ${quoteCount} obvious dialogue-quote repair${quoteCount === 1 ? "" : "s"}. No spelling or prose rewrites were performed.`);
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

  function runSplitLigaturePolish() {
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
      state.pages.forEach(page => {
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
    els.ligatureStatus.textContent = `${fixedCount} fixed`;
    setStatus(`${fixedLabel}; ${ambiguousLabel}. No OCR was run.`);
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

      const canJoinAcrossPage = pageIndex > section.start
        && out.length
        && !page?.chapterStart
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
      const bodyParagraphs = sectionParagraphs(section).map(({ text, pageIndex, paragraphIndex }) => {
        if (String(text || "").trim() === "* * *") return `<hr id="p-${pageIndex + 1}-${paragraphIndex + 1}" class="scene-break"/>`;
        const html = paragraphToEpubHtml(text);
        return html.replace("<p>", `<p id="p-${pageIndex + 1}-${paragraphIndex + 1}">`);
      });

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

    zip.file("EPUB/style.css", `body{font-family:serif;line-height:1.5;margin:5%;}p{display:block;margin:0 0 1em;white-space:normal;}h1{font-size:1.5em;margin:0 0 1.25em;}em{font-style:italic}.scene-break{border:0;text-align:center;margin:1.5em 0}.scene-break:after{content:"* * *";}`);

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
    refreshParagraphRebuildUi();
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
    refreshParagraphRebuildUi();
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
    }
  });

  els.downloadTxt.addEventListener("click", downloadTxt);
  els.downloadEpub.addEventListener("click", downloadEpub);
  els.safePolish?.addEventListener("click", applySafePolishToProject);
  els.autoItalicScan?.addEventListener("click", autoScanItalics);
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
