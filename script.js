(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "bookOcrStudio.session.v3";
  const WORKER_RESTART_EVERY = 20;
  const REVIEW_BATCH = 24;

  const state = {
    files: [],
    pages: [],
    coverFile: null,
    coverUrl: "",
    worker: null,
    stopRequested: false,
    rescuePageIndex: null,
    totalFiles: 0,
    expectedFileNames: [],
    reviewLimit: REVIEW_BATCH,
    restoredAt: null,
  };

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
    reviewSearch: $("reviewSearch"),
    chapterOnly: $("chapterOnly"),
    exportSection: $("exportSection"),
    downloadTxt: $("downloadTxt"),
    downloadEpub: $("downloadEpub"),
    rescueDialog: $("rescueDialog"),
    rescueLeft: $("rescueLeft"),
    rescueTop: $("rescueTop"),
    rescueBottom: $("rescueBottom"),
    rescueLetter: $("rescueLetter"),
    rescueCanvas: $("rescueCanvas"),
    runRescue: $("runRescue"),
    rescueText: $("rescueText"),
    replaceOpening: $("replaceOpening"),
  };

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
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function cleanFilename(name) {
    return ((name || "book")
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, " ")
      .trim()) || "book";
  }

  function normalizeWhitespace(str = "") {
    return String(str)
      .replace(/\r/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function fileNamesFromFiles(files = state.files) {
    return files.map((f) => f.name);
  }

  function sameFileNames(a = [], b = []) {
    return a.length === b.length && a.every((name, i) => name === b[i]);
  }

  function serializablePage(page) {
    return {
      fileName: page.file?.name || page.fileName || "",
      text: page.text || "",
      detectedChapterStart: !!page.detectedChapterStart,
      chapterStart: !!page.chapterStart,
      chapterTouched: !!page.chapterTouched,
      chapterTitle: page.chapterTitle || "",
    };
  }

  function saveRecovery(silent = true) {
    const totalFiles = state.totalFiles || state.files.length || state.expectedFileNames.length || state.pages.length;
    const expectedFileNames = state.files.length ? fileNamesFromFiles() : state.expectedFileNames;

    const payload = {
      version: 3,
      savedAt: new Date().toISOString(),
      title: els.bookTitle.value || "",
      author: els.bookAuthor.value || "",
      cropTop: Number(els.cropTop.value) || 0,
      cropBottom: Number(els.cropBottom.value) || 0,
      cropSides: Number(els.cropSides.value) || 0,
      totalFiles,
      expectedFileNames,
      pages: state.pages.map(serializablePage),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      state.restoredAt = payload.savedAt;
      return true;
    } catch (err) {
      console.warn("Could not save OCR recovery data", err);
      if (!silent) setStatus("OCR is working, but Safari would not save the recovery checkpoint. Keep this tab open.");
      return false;
    }
  }

  function clearRecovery() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn(err);
    }
  }

  function loadRecovery() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.pages) || !saved.pages.length) return false;

      els.bookTitle.value = saved.title || "";
      els.bookAuthor.value = saved.author || "";
      els.cropTop.value = Number(saved.cropTop) || 0;
      els.cropBottom.value = Number(saved.cropBottom) || 0;
      els.cropSides.value = Number(saved.cropSides) || 0;

      state.totalFiles = Number(saved.totalFiles) || saved.expectedFileNames?.length || saved.pages.length;
      state.expectedFileNames = Array.isArray(saved.expectedFileNames) ? saved.expectedFileNames : saved.pages.map((p) => p.fileName);
      state.pages = saved.pages.map((p) => ({
        file: null,
        fileName: p.fileName || "",
        text: p.text || "",
        detectedChapterStart: !!p.detectedChapterStart,
        chapterStart: !!p.chapterStart,
        chapterTouched: !!p.chapterTouched,
        chapterTitle: p.chapterTitle || "",
      }));
      state.restoredAt = saved.savedAt || null;
      state.reviewLimit = REVIEW_BATCH;

      els.fileCount.textContent = `${state.pages.length} of ${state.totalFiles} pages recovered`;
      els.reviewSection.classList.remove("hidden");
      els.exportSection.classList.remove("hidden");
      renderReview();

      const complete = state.pages.length >= state.totalFiles;
      if (complete) {
        setStatus(`Recovered OCR for all ${state.pages.length} pages after the reload. You can export now. Reselect the screenshots only if you want page previews or Drop-cap rescue.`);
      } else {
        setStatus(`Recovered ${state.pages.length} of ${state.totalFiles} OCR pages. Reselect the same screenshot batch, then tap Resume OCR.`);
      }
      return true;
    } catch (err) {
      console.warn("Could not restore OCR recovery data", err);
      return false;
    }
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
    state.files.slice(0, 30).forEach((file, index) => {
      const wrap = document.createElement("div");
      wrap.className = "thumb";
      const img = document.createElement("img");
      img.loading = "lazy";
      const url = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(url);
      img.src = url;
      img.alt = file.name;
      const number = document.createElement("span");
      number.textContent = index + 1;
      wrap.append(img, number);
      els.thumbStrip.appendChild(wrap);
    });
    if (state.files.length > 30) {
      const more = document.createElement("div");
      more.className = "thumb";
      more.style.display = "grid";
      more.style.placeItems = "center";
      more.textContent = `+${state.files.length - 30}`;
      els.thumbStrip.appendChild(more);
    }
  }

  function chapterHeuristic(text) {
    const normalized = (text || "").replace(/\r/g, "").trimStart();
    if (!normalized) return false;

    const firstLines = normalized
      .split("\n")
      .map(normalizeWhitespace)
      .filter(Boolean)
      .slice(0, 8);

    const firstChunk = firstLines.join(" ").slice(0, 260);
    const hasChapterWord = /\b(chapter|prologue|epilogue|interlude)\b/i.test(firstChunk);
    const startsWithNumber = /^\d{1,3}\b/.test(firstLines[0] || "");
    const shortAllCaps = firstLines.some((line) => line.length >= 2 && line.length <= 28 && /^[A-Z][A-Z\s.'&-]+$/.test(line));

    return hasChapterWord || (startsWithNumber && shortAllCaps) || (startsWithNumber && firstLines.length >= 2);
  }

  function getHeadingLines(text, maxLines = 8) {
    return (text || "")
      .replace(/\r/g, "")
      .split("\n")
      .map(normalizeWhitespace)
      .filter(Boolean)
      .slice(0, maxLines);
  }

  function isMostlySymbolLine(line) {
    return !/[A-Za-z0-9]/.test(line) || /[©¢§=<>]/.test(line);
  }

  function looksLikeShortHeading(line) {
    if (!line || line.length > 40) return false;
    if (isMostlySymbolLine(line)) return false;
    if (/^(chapter|prologue|epilogue|interlude)\b/i.test(line)) return true;
    if (/^\d{1,3}$/.test(line)) return true;
    if (/^[IVXLCDM]{1,8}$/i.test(line)) return true;
    if (/^[A-Z][A-Z\s.'&-]{1,35}$/.test(line)) return true;
    if (/^(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})$/.test(line)) return true;
    return false;
  }

  function detectChapterTitle(text, ordinal = 1) {
    const lines = getHeadingLines(text, 10).filter((line) => !isMostlySymbolLine(line));
    if (!lines.length) return `Chapter ${ordinal}`;

    let numberLine = "";
    let labelLine = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!numberLine && (/^\d{1,3}$/.test(line) || /^[IVXLCDM]{1,8}$/i.test(line))) {
        numberLine = line;
        continue;
      }
      if (!labelLine && /^(chapter|prologue|epilogue|interlude)\b/i.test(line)) {
        labelLine = line;
        break;
      }
      if (!labelLine && looksLikeShortHeading(line) && !/^\d{1,3}$/.test(line)) {
        labelLine = line;
        if (numberLine) break;
      }
    }

    if (labelLine && /^(chapter|prologue|epilogue|interlude)\b/i.test(labelLine)) return labelLine;
    if (numberLine && labelLine) return `${numberLine} — ${labelLine}`;
    if (labelLine) return labelLine;
    if (numberLine) return `Chapter ${numberLine}`;
    return `Chapter ${ordinal}`;
  }

  function getPageChapterTitle(page, ordinal) {
    const manual = normalizeWhitespace(page.chapterTitle || "");
    return manual || detectChapterTitle(page.text || "", ordinal);
  }

  function combinedText() {
    return state.pages.map((p) => (p.text || "").trim()).filter(Boolean).join("\n\n");
  }

  function pageImageUrl(file) {
    return URL.createObjectURL(file);
  }

  function chapterIndices() {
    return state.pages.reduce((list, page, index) => {
      if (page.chapterStart) list.push(index);
      return list;
    }, []);
  }

  function buildSectionsFromPages() {
    const pages = state.pages;
    if (!pages.length) return [];

    const starts = chapterIndices();
    if (!starts.length) {
      return [{
        title: (els.bookTitle.value || "Book").trim() || "Book",
        pages,
        pageStartIndex: 0,
        chapterOrdinal: 1,
        isFrontMatter: false,
      }];
    }

    const sections = [];
    let chapterOrdinal = 0;

    if (starts[0] > 0) {
      sections.push({
        title: "Opening",
        pages: pages.slice(0, starts[0]),
        pageStartIndex: 0,
        chapterOrdinal: 0,
        isFrontMatter: true,
      });
    }

    for (let i = 0; i < starts.length; i++) {
      const startIndex = starts[i];
      const endIndex = i + 1 < starts.length ? starts[i + 1] : pages.length;
      chapterOrdinal += 1;
      sections.push({
        title: getPageChapterTitle(pages[startIndex], chapterOrdinal),
        pages: pages.slice(startIndex, endIndex),
        pageStartIndex: startIndex,
        chapterOrdinal,
        isFrontMatter: false,
      });
    }

    return sections.filter((section) => section.pages.some((page) => normalizeWhitespace(page.text)));
  }

  function renderReview() {
    const q = els.reviewSearch.value.trim().toLowerCase();
    const onlyChapters = els.chapterOnly.checked;
    els.reviewList.innerHTML = "";

    const matches = [];
    state.pages.forEach((page, index) => {
      const pageText = page.text || "";
      if (onlyChapters && !page.chapterStart) return;
      if (q && !pageText.toLowerCase().includes(q) && !(page.file?.name || page.fileName || "").toLowerCase().includes(q)) return;
      matches.push({ page, index });
    });

    const visible = matches.slice(0, state.reviewLimit);

    visible.forEach(({ page, index }) => {
      const item = document.createElement("article");
      item.className = "review-item";

      const title = document.createElement("div");
      title.className = "review-title";

      const left = document.createElement("div");
      left.className = "left";
      const strong = document.createElement("strong");
      strong.textContent = `Page ${index + 1}`;
      const name = document.createElement("span");
      name.className = "page-name";
      name.textContent = page.file?.name || page.fileName || `Page ${index + 1}`;
      left.append(strong, name);

      if (page.chapterStart) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = page.chapterTouched ? "Chapter start" : "Auto chapter start";
        left.appendChild(badge);
      }

      const rescue = document.createElement("button");
      rescue.className = "button ghost";
      rescue.type = "button";
      rescue.textContent = "Drop-cap rescue";
      rescue.disabled = !page.file;
      rescue.title = page.file ? "" : "Reselect the original screenshots to use Drop-cap rescue.";
      rescue.addEventListener("click", () => openRescue(index));
      title.append(left, rescue);

      const body = document.createElement("div");
      body.className = `review-body${page.file ? "" : " no-image"}`;

      if (page.file) {
        const img = document.createElement("img");
        img.loading = "lazy";
        const url = pageImageUrl(page.file);
        img.onload = () => URL.revokeObjectURL(url);
        img.src = url;
        img.alt = `Original screenshot ${index + 1}`;
        body.appendChild(img);
      }

      const right = document.createElement("div");
      right.className = "review-right";
      const meta = document.createElement("div");
      meta.className = "page-meta";

      const chapterWrap = document.createElement("label");
      chapterWrap.className = "mini-check";
      const chapterBox = document.createElement("input");
      chapterBox.type = "checkbox";
      chapterBox.checked = !!page.chapterStart;
      const chapterText = document.createElement("span");
      chapterText.textContent = "Chapter start";
      chapterWrap.append(chapterBox, chapterText);

      const chapterTitleField = document.createElement("label");
      chapterTitleField.className = "chapter-title-field";
      const chapterTitleLabel = document.createElement("span");
      chapterTitleLabel.textContent = "Chapter title";
      const chapterTitleInput = document.createElement("input");
      chapterTitleInput.type = "text";
      chapterTitleInput.placeholder = getPageChapterTitle(page, chapterIndices().indexOf(index) + 1 || 1);
      chapterTitleInput.value = page.chapterTitle || "";
      chapterTitleInput.disabled = !page.chapterStart;
      chapterTitleField.append(chapterTitleLabel, chapterTitleInput);

      chapterBox.addEventListener("change", () => {
        page.chapterStart = chapterBox.checked;
        page.chapterTouched = true;
        chapterTitleInput.disabled = !page.chapterStart;
        saveRecovery();
        state.reviewLimit = REVIEW_BATCH;
        renderReview();
      });

      chapterTitleInput.addEventListener("input", () => {
        page.chapterTitle = chapterTitleInput.value;
        saveRecovery();
      });

      meta.append(chapterWrap, chapterTitleField);

      const text = document.createElement("textarea");
      text.value = page.text || "";
      text.setAttribute("aria-label", `OCR text for page ${index + 1}`);
      text.addEventListener("input", () => {
        page.text = text.value;
        page.detectedChapterStart = chapterHeuristic(text.value);
        if (!page.chapterTouched) page.chapterStart = page.detectedChapterStart;
        chapterTitleInput.placeholder = getPageChapterTitle(page, chapterIndices().indexOf(index) + 1 || 1);
        saveRecovery();
      });

      right.append(meta, text);
      body.appendChild(right);
      item.append(title, body);
      els.reviewList.appendChild(item);
    });

    if (matches.length > visible.length) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "button secondary review-more";
      more.textContent = `Show ${Math.min(REVIEW_BATCH, matches.length - visible.length)} more (${matches.length - visible.length} remaining)`;
      more.addEventListener("click", () => {
        state.reviewLimit += REVIEW_BATCH;
        renderReview();
      });
      els.reviewList.appendChild(more);
    }
  }

  async function terminateWorker() {
    if (!state.worker) return;
    try {
      await state.worker.terminate();
    } catch (err) {
      console.warn("Worker terminate failed", err);
    }
    state.worker = null;
  }

  async function ensureWorker(logger) {
    if (state.worker) return state.worker;
    if (!window.Tesseract) throw new Error("Tesseract.js did not load. Check your internet connection and reload.");
    state.worker = await Tesseract.createWorker("eng", 1, { logger });
    return state.worker;
  }

  function attachFilesToRecoveredPages(files) {
    const byName = new Map(files.map((file) => [file.name, file]));
    state.pages.forEach((page) => {
      const name = page.fileName || page.file?.name;
      page.file = byName.get(name) || null;
      if (page.file && !page.fileName) page.fileName = page.file.name;
    });
  }

  function updateProcessButton() {
    if (!state.files.length) {
      els.processBtn.disabled = true;
      els.processBtn.textContent = "Process all pages";
      return;
    }

    const completed = state.pages.length;
    const total = state.files.length;
    els.processBtn.disabled = completed >= total;
    els.processBtn.textContent = completed > 0 && completed < total ? `Resume OCR at page ${completed + 1}` : "Process all pages";
  }

  async function processPages() {
    if (!state.files.length) return;

    const names = fileNamesFromFiles();
    const canResume = state.pages.length > 0 && sameFileNames(names, state.expectedFileNames) && state.pages.length < state.files.length;

    if (!canResume && state.pages.length > 0) {
      const okay = confirm("This will start OCR from page 1 and replace the recovered OCR session for this book. Continue?");
      if (!okay) return;
      state.pages = [];
      clearRecovery();
    }

    state.totalFiles = state.files.length;
    state.expectedFileNames = names;
    state.stopRequested = false;
    els.processBtn.disabled = true;
    els.stopBtn.disabled = false;
    els.progressWrap.classList.remove("hidden");
    state.reviewLimit = REVIEW_BATCH;

    let activePage = state.pages.length;
    const logger = (m) => {
      if (m.status === "recognizing text") {
        const perPage = (activePage + (m.progress || 0)) / state.files.length;
        const pct = Math.round(perPage * 100);
        els.progressBar.value = pct;
        els.progressPercent.textContent = `${pct}%`;
      }
      if (m.status) {
        els.progressLabel.textContent = `Page ${Math.min(activePage + 1, state.files.length)}: ${m.status}`;
      }
    };

    try {
      let worker = await ensureWorker(logger);
      const startIndex = state.pages.length;

      for (let i = startIndex; i < state.files.length; i++) {
        activePage = i;
        if (state.stopRequested) break;

        if (i > startIndex && i % WORKER_RESTART_EVERY === 0) {
          setStatus(`Saving checkpoint and refreshing OCR engine before page ${i + 1}…`);
          saveRecovery(false);
          await terminateWorker();
          worker = await ensureWorker(logger);
          await new Promise((resolve) => setTimeout(resolve, 80));
        }

        const file = state.files[i];
        setStatus(`Processing page ${i + 1} of ${state.files.length}: ${file.name}`);
        const img = await loadImageFromFile(file);
        const canvas = makeCroppedCanvas(img);
        const result = await worker.recognize(canvas);
        const text = result?.data?.text || "";
        const detectedChapterStart = chapterHeuristic(text);

        state.pages.push({
          file,
          fileName: file.name,
          text,
          detectedChapterStart,
          chapterStart: detectedChapterStart,
          chapterTouched: false,
          chapterTitle: "",
        });

        // Save after every single page so a Safari reload loses, at worst, the page currently being OCR'd.
        saveRecovery(false);

        const pct = Math.round(((i + 1) / state.files.length) * 100);
        els.progressBar.value = pct;
        els.progressPercent.textContent = `${pct}%`;

        // Give mobile Safari a brief chance to collect released canvas/image memory.
        if ((i + 1) % 5 === 0) await new Promise((resolve) => setTimeout(resolve, 40));
      }

      if (!state.pages.length) {
        setStatus("No pages were processed.");
        return;
      }

      saveRecovery(false);
      els.reviewSection.classList.remove("hidden");
      els.exportSection.classList.remove("hidden");
      renderReview();

      const starts = chapterIndices().length;
      if (state.stopRequested) {
        setStatus(`Stopped safely after ${state.pages.length} of ${state.totalFiles} pages. Your OCR checkpoint is saved.`);
      } else {
        setStatus(`Done. ${state.pages.length} pages processed and checkpointed. ${starts} chapter start${starts === 1 ? "" : "s"} detected.`);
      }
    } catch (err) {
      console.error(err);
      saveRecovery(false);
      setStatus(`OCR stopped: ${err.message || err}. Completed pages were checkpointed. Reload, reselect the same screenshots, and resume.`);
    } finally {
      els.stopBtn.disabled = true;
      updateProcessButton();
    }
  }

  async function openRescue(index) {
    state.rescuePageIndex = index;
    els.rescueText.value = "";
    els.rescueLetter.value = "";
    els.rescueDialog.showModal();
    await drawRescuePreview();
  }

  async function drawRescuePreview() {
    const index = state.rescuePageIndex;
    if (index == null || !state.pages[index]?.file) return;

    const file = state.pages[index].file;
    const img = await loadImageFromFile(file);
    const cropped = makeCroppedCanvas(img);
    const left = clamp(Number(els.rescueLeft.value) || 0, 0, 40) / 100;
    const top = clamp(Number(els.rescueTop.value) || 0, 0, 80) / 100;
    const bottom = clamp(Number(els.rescueBottom.value) || 58, 20, 100) / 100;
    const sx = Math.round(cropped.width * left);
    const sy = Math.round(cropped.height * top);
    const sw = Math.max(1, cropped.width - sx);
    const sh = Math.max(1, Math.round(cropped.height * bottom) - sy);

    const out = els.rescueCanvas;
    const maxW = 1000;
    const scale = Math.min(1, maxW / sw);
    out.width = Math.round(sw * scale);
    out.height = Math.round(sh * scale);
    out.getContext("2d", { alpha: false }).drawImage(cropped, sx, sy, sw, sh, 0, 0, out.width, out.height);
    out.dataset.sourceX = sx;
    out.dataset.sourceY = sy;
    out.dataset.sourceW = sw;
    out.dataset.sourceH = sh;
  }

  async function runRescue() {
    const index = state.rescuePageIndex;
    if (index == null || !state.pages[index]?.file) return;

    els.runRescue.disabled = true;
    els.runRescue.textContent = "Working…";

    try {
      const worker = await ensureWorker();
      const file = state.pages[index].file;
      const img = await loadImageFromFile(file);
      const cropped = makeCroppedCanvas(img);
      const sx = Number(els.rescueCanvas.dataset.sourceX);
      const sy = Number(els.rescueCanvas.dataset.sourceY);
      const sw = Number(els.rescueCanvas.dataset.sourceW);
      const sh = Number(els.rescueCanvas.dataset.sourceH);
      const region = document.createElement("canvas");
      region.width = sw;
      region.height = sh;
      region.getContext("2d", { alpha: false }).drawImage(cropped, sx, sy, sw, sh, 0, 0, sw, sh);
      const result = await worker.recognize(region);
      let text = normalizeWhitespace(result?.data?.text || "");
      const letter = els.rescueLetter.value.trim();
      if (letter && text && !text.toLowerCase().startsWith(letter.toLowerCase())) text = letter + text;
      els.rescueText.value = text;
    } catch (err) {
      els.rescueText.value = `OCR error: ${err.message || err}`;
    } finally {
      els.runRescue.disabled = false;
      els.runRescue.textContent = "OCR this region";
    }
  }

  function insertRecoveredOpening() {
    const index = state.rescuePageIndex;
    if (index == null) return;
    const recovered = els.rescueText.value.trim();
    if (!recovered) return;

    const original = state.pages[index].text.trimStart();
    state.pages[index].text = `${recovered}\n\n${original}`;
    state.pages[index].detectedChapterStart = true;
    if (!state.pages[index].chapterTouched) state.pages[index].chapterStart = true;
    saveRecovery();
    renderReview();
    els.rescueDialog.close();
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
    const text = combinedText();
    const title = cleanFilename(els.bookTitle.value || "book");
    downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), `${title}.txt`);
  }

  function buildXhtmlPage(title, innerHtml) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">\n<head>\n  <meta charset="utf-8"/>\n  <title>${escapeXml(title)}</title>\n  <link rel="stylesheet" type="text/css" href="style.css"/>\n</head>\n<body>\n  <section epub:type="bodymatter" xmlns:epub="http://www.idpf.org/2007/ops">\n    ${innerHtml}\n  </section>\n</body>\n</html>`;
  }

  function paragraphsFromSectionText(text) {
    return text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeXml(p).replace(/\n/g, "<br/>")}</p>`)
      .join("\n");
  }

  async function buildEpub() {
    if (!window.JSZip) throw new Error("JSZip did not load.");
    if (!state.pages.length) throw new Error("There is no OCR text to export.");

    const sections = buildSectionsFromPages();
    if (!sections.length) throw new Error("There is no OCR text to export.");

    const title = (els.bookTitle.value || "Untitled Book").trim();
    const author = (els.bookAuthor.value || "Unknown Author").trim();
    const safeTitle = cleanFilename(title);
    const identifier = `urn:uuid:${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
    const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const zip = new JSZip();

    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
    zip.file("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles>\n    <rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>\n  </rootfiles>\n</container>`);

    const manifestItems = [
      '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
      '    <item id="style" href="style.css" media-type="text/css"/>',
    ];
    const spineItems = [];
    const navItems = [];

    zip.file("EPUB/title.xhtml", buildXhtmlPage(title, `<h1 class="book-title">${escapeXml(title)}</h1><p class="book-author">${escapeXml(author)}</p>`));
    manifestItems.push('    <item id="title-page" href="title.xhtml" media-type="application/xhtml+xml"/>');
    spineItems.push('    <itemref idref="title-page"/>');
    navItems.push(`<li><a href="title.xhtml">Title Page</a></li>`);

    let coverManifest = "";
    let coverMeta = "";
    let coverSpine = "";
    let coverGuide = "";

    if (state.coverFile) {
      const type = state.coverFile.type || "image/jpeg";
      const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
      const coverName = `cover.${ext}`;
      zip.file(`EPUB/${coverName}`, await state.coverFile.arrayBuffer());
      zip.file("EPUB/cover.xhtml", `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml">\n<head><meta charset="utf-8"/><title>Cover</title><style>html,body{margin:0;padding:0;text-align:center;background:#fff}img{max-width:100%;max-height:100vh}</style></head>\n<body><img src="${coverName}" alt="Cover"/></body>\n</html>`);
      coverManifest = `\n    <item id="cover-image" href="${coverName}" media-type="${type}" properties="cover-image"/>\n    <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>`;
      coverSpine = '    <itemref idref="cover-page" linear="yes"/>\n';
      coverMeta = '\n    <meta name="cover" content="cover-image"/>';
      coverGuide = '\n  <guide><reference type="cover" title="Cover" href="cover.xhtml"/></guide>';
      navItems.unshift('<li><a href="cover.xhtml">Cover</a></li>');
    }

    sections.forEach((section, index) => {
      const fileName = `chapter-${String(index + 1).padStart(3, "0")}.xhtml`;
      const manifestId = `chap-${index + 1}`;
      const sectionText = section.pages.map((page) => (page.text || "").trim()).filter(Boolean).join("\n\n");
      const sectionBody = `<h2 class="chapter-title">${escapeXml(section.title)}</h2>\n${paragraphsFromSectionText(sectionText)}`;
      zip.file(`EPUB/${fileName}`, buildXhtmlPage(section.title, sectionBody));
      manifestItems.push(`    <item id="${manifestId}" href="${fileName}" media-type="application/xhtml+xml"/>`);
      spineItems.push(`    <itemref idref="${manifestId}"/>`);
      navItems.push(`<li><a href="${fileName}">${escapeXml(section.title)}</a></li>`);
    });

    zip.file("EPUB/nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">\n<head><meta charset="utf-8"/><title>Contents</title></head>\n<body>\n<nav epub:type="toc" id="toc">\n  <h1>Contents</h1>\n  <ol>\n    ${navItems.join("\n    ")}\n  </ol>\n</nav>\n</body>\n</html>`);

    zip.file("EPUB/style.css", `body{font-family:serif;line-height:1.5;margin:5%;}p{margin:0 0 1em;}h1.book-title{text-align:center;margin:28vh 0 .4em;font-size:2em;}p.book-author{text-align:center;margin:0 0 2em;font-style:italic;}h2.chapter-title{margin:0 0 1.2em;text-align:center;page-break-after:avoid;}img{max-width:100%;}`);

    zip.file("EPUB/package.opf", `<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">\n  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n    <dc:identifier id="pub-id">${identifier}</dc:identifier>\n    <dc:title>${escapeXml(title)}</dc:title>\n    <dc:creator>${escapeXml(author)}</dc:creator>\n    <dc:language>en</dc:language>\n    <meta property="dcterms:modified">${modified}</meta>${coverMeta}\n  </metadata>\n  <manifest>\n${manifestItems.join("\n")}${coverManifest}\n  </manifest>\n  <spine>\n${coverSpine}${spineItems.join("\n")}\n  </spine>${coverGuide}\n</package>`);

    const blob = await zip.generateAsync({
      type: "blob",
      mimeType: "application/epub+zip",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
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

  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-preset]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const preset = btn.dataset.preset;
      if (preset === "cloud") {
        els.cropTop.value = 0;
        els.cropBottom.value = 75;
        els.cropSides.value = 0;
      } else if (preset === "kindle") {
        els.cropTop.value = 150;
        els.cropBottom.value = 0;
        els.cropSides.value = 0;
      } else {
        els.cropTop.value = 0;
        els.cropBottom.value = 0;
        els.cropSides.value = 0;
      }
      saveRecovery();
      updatePreview();
    });
  });

  [els.cropTop, els.cropBottom, els.cropSides].forEach((input) => input.addEventListener("input", () => {
    saveRecovery();
    updatePreview();
  }));
  [els.rescueLeft, els.rescueTop, els.rescueBottom].forEach((input) => input.addEventListener("input", drawRescuePreview));

  [els.bookTitle, els.bookAuthor].forEach((input) => input.addEventListener("input", () => saveRecovery()));

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
    const newFiles = Array.from(els.imageInput.files || []).sort(naturalSort);
    const newNames = fileNamesFromFiles(newFiles);
    state.files = newFiles;
    state.totalFiles = newFiles.length;

    const matchesRecovery = state.pages.length > 0 && sameFileNames(newNames, state.expectedFileNames);
    if (matchesRecovery) {
      attachFilesToRecoveredPages(newFiles);
      els.fileCount.textContent = `${state.pages.length} of ${newFiles.length} pages recovered`;
      setStatus(state.pages.length >= newFiles.length
        ? `The recovered OCR matches this screenshot batch. All ${newFiles.length} pages are already done.`
        : `Recovery matched. ${state.pages.length} pages are safe; OCR can resume at page ${state.pages.length + 1}.`);
    } else {
      if (state.pages.length) {
        state.pages = [];
        clearRecovery();
      }
      state.expectedFileNames = newNames;
      els.fileCount.textContent = `${newFiles.length} page${newFiles.length === 1 ? "" : "s"} loaded`;
      els.reviewSection.classList.add("hidden");
      els.exportSection.classList.add("hidden");
      setStatus(newFiles.length ? "Ready to process." : "Add screenshots to begin.");
      saveRecovery();
    }

    state.reviewLimit = REVIEW_BATCH;
    renderThumbs();
    await updatePreview();
    updateProcessButton();
    if (state.pages.length) renderReview();
  });

  els.clearImages.addEventListener("click", async () => {
    const hasSession = state.pages.length || state.files.length;
    if (hasSession && !confirm("Clear this book and its saved OCR recovery checkpoint?")) return;
    els.imageInput.value = "";
    state.files = [];
    state.pages = [];
    state.totalFiles = 0;
    state.expectedFileNames = [];
    state.reviewLimit = REVIEW_BATCH;
    clearRecovery();
    await terminateWorker();
    els.fileCount.textContent = "0 pages loaded";
    els.reviewSection.classList.add("hidden");
    els.exportSection.classList.add("hidden");
    renderThumbs();
    updatePreview();
    updateProcessButton();
    setStatus("Add screenshots to begin.");
  });

  els.processBtn.addEventListener("click", processPages);
  els.stopBtn.addEventListener("click", () => {
    state.stopRequested = true;
    setStatus("Stop requested. Finishing the current page and saving its checkpoint…");
  });

  els.reviewSearch.addEventListener("input", () => {
    state.reviewLimit = REVIEW_BATCH;
    renderReview();
  });
  els.chapterOnly.addEventListener("change", () => {
    state.reviewLimit = REVIEW_BATCH;
    renderReview();
  });
  els.runRescue.addEventListener("click", runRescue);
  els.replaceOpening.addEventListener("click", insertRecoveredOpening);
  els.downloadTxt.addEventListener("click", downloadTxt);
  els.downloadEpub.addEventListener("click", downloadEpub);

  window.addEventListener("pagehide", () => saveRecovery());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveRecovery();
  });

  loadRecovery();
  updatePreview();
  updateProcessButton();
})();
