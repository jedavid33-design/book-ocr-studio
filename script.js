(() => {
  "use strict";

  const BUILD_VERSION = "v14";
  console.info(`Book OCR Studio ${BUILD_VERSION} loaded`);

  const $ = (id) => document.getElementById(id);

  const state = {
    files: [],
    pages: [],
    coverFile: null,
    coverUrl: "",
    worker: null,
    stopRequested: false,
    processing: false,
    currentPageIndex: -1,
  };

  const CHECKPOINT_KEY = "bookOcrStudio.progress.current";
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
    stopBtn: $("stopBtn"),
    progressWrap: $("progressWrap"),
    progressLabel: $("progressLabel"),
    progressPercent: $("progressPercent"),
    progressBar: $("progressBar"),
    statusBox: $("statusBox"),
    reviewSection: $("reviewSection"),
    reviewList: $("reviewList"),
    reviewProgress: $("reviewProgress"),
    prevPageBtn: $("prevPageBtn"),
    nextPageBtn: $("nextPageBtn"),
    messageOcrBtn: $("messageOcrBtn"),
    exportSection: $("exportSection"),
    downloadTxt: $("downloadTxt"),
    downloadEpub: $("downloadEpub"),
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

  async function resetWorker(logger) {
    if (state.worker) {
      try { await state.worker.terminate(); } catch (_) {}
      state.worker = null;
    }
    return ensureWorker(logger);
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

  function updateNavigationControls() {
    const processed = state.pages.length;
    const total = state.files.length;
    els.reviewProgress.textContent = `${processed} of ${total} processed`;

    const hasCurrent = processed > 0 && state.currentPageIndex >= 0;
    els.prevPageBtn.disabled = state.processing || !hasCurrent || state.currentPageIndex <= 0;
    els.messageOcrBtn.disabled = state.processing || !hasCurrent;

    if (!total) {
      els.nextPageBtn.disabled = true;
      els.nextPageBtn.textContent = 'Next page';
      return;
    }

    if (!hasCurrent) {
      els.nextPageBtn.disabled = state.processing;
      els.nextPageBtn.textContent = 'Process first page';
      return;
    }

    const canAdvanceToProcessed = state.currentPageIndex < processed - 1;
    const canProcessNew = processed < total && state.currentPageIndex === processed - 1;
    const isAtEnd = processed >= total && state.currentPageIndex >= total - 1;

    els.nextPageBtn.disabled = state.processing || isAtEnd;
    if (canAdvanceToProcessed) {
      els.nextPageBtn.textContent = 'Next page';
    } else if (canProcessNew) {
      els.nextPageBtn.textContent = 'Save + next page';
    } else if (isAtEnd) {
      els.nextPageBtn.textContent = 'All pages done';
    } else {
      els.nextPageBtn.textContent = 'Next page';
    }
  }

  function renderReview() {
    els.reviewList.innerHTML = "";

    if (!state.pages.length || state.currentPageIndex < 0) {
      const empty = document.createElement('div');
      empty.className = 'review-empty';
      empty.textContent = state.files.length
        ? 'No pages have been processed yet. Tap “Process first page” to begin.'
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

  async function ensureWorker(logger) {
    if (state.worker) return state.worker;
    if (!window.Tesseract) throw new Error("Tesseract.js did not load. Check your internet connection and reload.");
    state.worker = await Tesseract.createWorker("eng", 1, { logger });
    return state.worker;
  }

  async function ocrCanvas(canvas, parameters = {}, logger) {
    const worker = await ensureWorker(logger);
    await worker.setParameters(parameters);
    const result = await worker.recognize(canvas);
    return result?.data?.text || "";
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
      "CAN","COULD","WOULD","SHOULD","WILL","JUST","SHE","HE","THEY","WE","I"
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
    const scale = sourceCanvas.width > 900 ? 0.34 : 0.5;
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
    const bubbleThreshSq = 42 * 42;
    const bgThreshSq = 20 * 20;

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
        if (count < 40 || bw < 18 || bh < 8) continue;
        if (bw < bh) continue;

        boxes.push({
          x: Math.round(minX / scale),
          y: Math.round(minY / scale),
          w: Math.round(bw / scale),
          h: Math.round(bh / scale),
          area: count,
        });
      }
    }

    return mergeBoxes(boxes, 10)
      .filter(box => box.w >= 70 && box.h >= 20)
      .sort((a, b) => (a.y - b.y) || (a.x - b.x));
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
    if (space.height < 13) return "";

    // Speaker labels are tiny and sit directly above the bubble. Keep this crop
    // deliberately shallow so message text cannot be mistaken for a name.
    const x = Math.max(0, bubble.x - 12);
    const maxLabelWidth = Math.min(360, Math.max(150, Math.round(bubble.w * 0.62)));
    const region = {
      x,
      y: space.top,
      w: Math.min(canvas.width - x, maxLabelWidth),
      h: Math.min(34, space.height),
    };
    if (region.h < 13) return "";

    const cropped = cropCanvasRegion(canvas, region);
    const scaled = upscaleCanvas(cropped, 3.2);
    const raw = await ocrCanvas(scaled, {
      tessedit_pageseg_mode: "7",
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz&'- ",
      preserve_interword_spaces: "1",
    });
    const label = cleanLabel(raw);
    cropped.width = 1;
    cropped.height = 1;
    scaled.width = 1;
    scaled.height = 1;
    return label;
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
    const bubbles = detectMessageBubbles(canvas);
    if (!bubbles.length) {
      throw new Error("No message bubbles were detected on this page.");
    }

    const pieces = [];
    const priorBubbles = [];
    const laneSpeaker = { left: "", right: "" };

    // Preserve ordinary prose before the first message block, but do not OCR every
    // little gap between bubbles. Full-width inter-bubble OCR was reading pieces of
    // neighboring messages and turning them into garbage text.
    const firstBubble = bubbles[0];
    const openingBottom = Math.max(0, firstBubble.y - 56);
    const opening = await ocrNarrativeRegion(canvas, 0, openingBottom);
    if (opening) pieces.push(opening);

    let previousBottom = firstBubble.y;

    for (const bubble of bubbles) {
      const lane = bubbleLane(canvas, bubble);
      const gap = bubble.y - previousBottom;

      // A genuinely large gap can contain normal prose between message groups.
      // Small gaps are bubble spacing / speaker-label space and are intentionally ignored.
      if (priorBubbles.length && gap > 150) {
        const narrative = await ocrNarrativeRegion(canvas, previousBottom + 12, bubble.y - 58);
        if (narrative) pieces.push(narrative);
      }

      const space = labelSpaceAbove(bubble, priorBubbles);
      const shouldCheckLabel = !laneSpeaker[lane] || space.height >= 18;
      let label = "";
      if (shouldCheckLabel) {
        label = await ocrBubbleLabel(canvas, bubble, priorBubbles);
        if (label) laneSpeaker[lane] = label;
      }

      const bubbleText = await ocrBubbleText(canvas, bubble);
      if (label) pieces.push(label);
      if (bubbleText) pieces.push(bubbleText);
      pieces.push("");

      priorBubbles.push(bubble);
      previousBottom = Math.max(previousBottom, bubble.y + bubble.h);
    }

    const trailingTop = Math.min(canvas.height, previousBottom + 16);
    const trailing = await ocrNarrativeRegion(canvas, trailingTop, canvas.height);
    if (trailing) pieces.push(trailing);

    const finalText = pieces.join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();

    state.pages[index].text = finalText;
    state.pages[index].chapterCandidate = chapterHeuristic(finalText);
    saveCheckpoint();

    canvas.width = 1;
    canvas.height = 1;
  }

  async function processSinglePage(index) {
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
      const logger = (m) => {
        if (m.status === "recognizing text") {
          const perPage = (index + (m.progress || 0)) / state.files.length;
          const pct = Math.round(perPage * 100);
          els.progressBar.value = pct;
          els.progressPercent.textContent = `${pct}%`;
        }
        if (m.status) {
          els.progressLabel.textContent = `Page ${Math.min(index + 1, state.files.length)}: ${m.status}`;
        }
      };

      const worker = await resetWorker(logger);
      await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });

      const file = state.files[index];
      setStatus(`Processing page ${index + 1} of ${state.files.length}: ${file.name}`);
      const img = await loadImageFromFile(file);
      const canvas = makeCroppedCanvas(img);
      const result = await worker.recognize(canvas);
      const text = cleanBodyText(result?.data?.text || "");
      const isChapter = chapterHeuristic(text);
      const pageData = { file, text, chapterCandidate: isChapter, chapterStart: isChapter, chapterTitle: detectChapterTitle(text, index + 1) };

      if (index < state.pages.length) state.pages[index] = pageData;
      else state.pages.push(pageData);

      state.currentPageIndex = index;
      saveCheckpoint();
      renderReview();

      canvas.width = 1;
      canvas.height = 1;

      const pct = Math.round(((index + 1) / state.files.length) * 100);
      els.progressBar.value = pct;
      els.progressPercent.textContent = `${pct}%`;
      setStatus(`Finished page ${index + 1} of ${state.files.length}. Edit it if needed, then tap Next page.`);
    } catch (err) {
      console.error(err);
      saveCheckpoint();
      setStatus(`OCR failed on page ${index + 1}. Your previous progress was preserved.`);
      alert(`OCR failed on page ${index + 1}: ${err.message || err}`);
    } finally {
      try { await resetWorker(); } catch (_) {}
      state.processing = false;
      els.processBtn.disabled = !state.files.length || state.pages.length > 0;
      updateNavigationControls();
    }
  }

  async function goToPreviousPage() {
    if (state.processing || state.currentPageIndex <= 0) return;
    state.currentPageIndex -= 1;
    saveCheckpoint();
    renderReview();
    setStatus(`Showing page ${state.currentPageIndex + 1} of ${state.files.length}.`);
  }

  async function goToNextPage() {
    if (state.processing || !state.files.length) return;

    if (!state.pages.length || state.currentPageIndex < 0) {
      await processSinglePage(0);
      return;
    }

    if (state.currentPageIndex < state.pages.length - 1) {
      state.currentPageIndex += 1;
      saveCheckpoint();
      renderReview();
      setStatus(`Showing page ${state.currentPageIndex + 1} of ${state.files.length}.`);
      return;
    }

    if (state.pages.length < state.files.length) {
      await processSinglePage(state.pages.length);
      return;
    }

    setStatus('You are already on the last page.');
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

    downloadBlob(blob, `${safeTitle}-v14.epub`);
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
    state.files = Array.from(els.imageInput.files || []).sort(naturalSort);
    state.pages = [];
    state.currentPageIndex = -1;
    const restored = state.files.length ? restoreCheckpointIfMatching() : 0;
    if (restored && state.currentPageIndex < 0) state.currentPageIndex = restored - 1;
    els.fileCount.textContent = `${state.files.length} page${state.files.length === 1 ? "" : "s"} loaded`;
    els.processBtn.disabled = !state.files.length || restored > 0;
    els.reviewSection.classList.toggle("hidden", restored === 0);
    els.exportSection.classList.toggle("hidden", restored === 0);
    renderThumbs();
    renderReview();
    await updatePreview();
    if (restored) {
      setStatus(`Recovered ${restored} processed pages. Use Previous/Next page to review, or tap Next page to continue from page ${Math.min(restored + 1, state.files.length)}.`);
    } else {
      setStatus(state.files.length ? "Ready to process the first page." : "Add screenshots to begin.");
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
    els.reviewSection.classList.add("hidden");
    els.exportSection.classList.add("hidden");
    renderThumbs();
    renderReview();
    updatePreview();
    setStatus("Add screenshots to begin.");
  });

  els.processBtn.addEventListener("click", async () => {
    els.reviewSection.classList.remove("hidden");
    els.exportSection.classList.remove("hidden");
    await processSinglePage(0);
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
      setStatus(`Message-page OCR updated page ${idx + 1}.`);
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

  updatePreview();
})();
