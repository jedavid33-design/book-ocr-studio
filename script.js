(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const state = {
    files: [],
    pages: [],
    coverFile: null,
    coverUrl: "",
    worker: null,
    stopRequested: false,
    rescuePageIndex: null,
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

  function combinedText() {
    return state.pages.map(p => (p.text || "").trim()).filter(Boolean).join("\n\n");
  }

  function pageImageUrl(file) {
    return URL.createObjectURL(file);
  }

  function renderReview() {
    const q = els.reviewSearch.value.trim().toLowerCase();
    const onlyChapters = els.chapterOnly.checked;
    els.reviewList.innerHTML = "";

    state.pages.forEach((page, index) => {
      if (onlyChapters && !page.chapterCandidate) return;
      if (q && !page.text.toLowerCase().includes(q) && !page.file.name.toLowerCase().includes(q)) return;

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
      name.textContent = page.file.name;

      left.append(strong, name);
      if (page.chapterCandidate) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "Check chapter start";
        left.appendChild(badge);
      }

      const rescue = document.createElement("button");
      rescue.className = "button ghost";
      rescue.type = "button";
      rescue.textContent = "Drop-cap rescue";
      rescue.addEventListener("click", () => openRescue(index));

      title.append(left, rescue);

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
      });

      body.append(img, text);
      item.append(title, body);
      els.reviewList.appendChild(item);
    });
  }

  async function ensureWorker(logger) {
    if (state.worker) return state.worker;
    if (!window.Tesseract) throw new Error("Tesseract.js did not load. Check your internet connection and reload.");
    state.worker = await Tesseract.createWorker("eng", 1, { logger });
    return state.worker;
  }

  async function processPages() {
    if (!state.files.length) return;

    state.stopRequested = false;
    els.processBtn.disabled = true;
    els.stopBtn.disabled = false;
    els.progressWrap.classList.remove("hidden");
    state.pages = [];

    try {
      let activePage = 0;
      const worker = await ensureWorker((m) => {
        if (m.status === "recognizing text") {
          const perPage = (activePage + (m.progress || 0)) / state.files.length;
          const pct = Math.round(perPage * 100);
          els.progressBar.value = pct;
          els.progressPercent.textContent = `${pct}%`;
        }
        if (m.status) {
          els.progressLabel.textContent = `Page ${Math.min(activePage + 1, state.files.length)}: ${m.status}`;
        }
      });

      for (let i = 0; i < state.files.length; i++) {
        activePage = i;
        if (state.stopRequested) break;

        const file = state.files[i];
        setStatus(`Processing page ${i + 1} of ${state.files.length}: ${file.name}`);
        const img = await loadImageFromFile(file);
        const canvas = makeCroppedCanvas(img);
        const result = await worker.recognize(canvas);
        const text = result?.data?.text || "";

        state.pages.push({
          file,
          text,
          chapterCandidate: chapterHeuristic(text),
        });

        const pct = Math.round(((i + 1) / state.files.length) * 100);
        els.progressBar.value = pct;
        els.progressPercent.textContent = `${pct}%`;
      }

      if (!state.pages.length) {
        setStatus("No pages were processed.");
        return;
      }

      els.reviewSection.classList.remove("hidden");
      els.exportSection.classList.remove("hidden");
      renderReview();

      if (state.stopRequested) {
        setStatus(`Stopped after ${state.pages.length} pages. You can review/export what finished.`);
      } else {
        setStatus(`Done. ${state.pages.length} pages processed. Review chapter candidates, then export.`);
      }
    } catch (err) {
      console.error(err);
      setStatus(`OCR error: ${err.message || err}`);
    } finally {
      els.processBtn.disabled = !state.files.length;
      els.stopBtn.disabled = true;
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
    if (index == null || !state.pages[index]) return;

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
    const ctx = out.getContext("2d", { alpha: false });
    ctx.drawImage(cropped, sx, sy, sw, sh, 0, 0, out.width, out.height);

    out.dataset.sourceX = sx;
    out.dataset.sourceY = sy;
    out.dataset.sourceW = sw;
    out.dataset.sourceH = sh;
  }

  async function runRescue() {
    const index = state.rescuePageIndex;
    if (index == null) return;

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
      let text = (result?.data?.text || "").trim();

      const letter = els.rescueLetter.value.trim();
      if (letter && text && !text.toLowerCase().startsWith(letter.toLowerCase())) {
        text = letter + text;
      }

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
    state.pages[index].chapterCandidate = true;
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

  async function buildEpub() {
    if (!window.JSZip) throw new Error("JSZip did not load.");
    const text = combinedText();
    if (!text) throw new Error("There is no OCR text to export.");

    const title = (els.bookTitle.value || "Untitled Book").trim();
    const author = (els.bookAuthor.value || "Unknown Author").trim();
    const safeTitle = cleanFilename(title);
    const identifier = `urn:uuid:${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
    const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

    const zip = new JSZip();

    // EPUB requires the mimetype entry to be stored without compression.
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

    zip.file("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

    const paragraphs = text
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p>${escapeXml(p).replace(/\n/g, "<br/>")}</p>`)
      .join("\n");

    zip.file("EPUB/book.xhtml", `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <section epub:type="bodymatter" xmlns:epub="http://www.idpf.org/2007/ops">
    <h1>${escapeXml(title)}</h1>
    ${paragraphs}
  </section>
</body>
</html>`);

    zip.file("EPUB/nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body>
<nav epub:type="toc" id="toc">
  <h1>Contents</h1>
  <ol><li><a href="book.xhtml">${escapeXml(title)}</a></li></ol>
</nav>
</body>
</html>`);

    zip.file("EPUB/style.css", `body{font-family:serif;line-height:1.5;margin:5%;}p{margin:0 0 1em;}h1{text-align:center;margin:2em 0;}`);

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
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="book" href="book.xhtml" media-type="application/xhtml+xml"/>
    <item id="style" href="style.css" media-type="text/css"/>${coverManifest}
  </manifest>
  <spine>
${coverSpine}    <itemref idref="book"/>
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
        els.cropTop.value = 150;
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
  [els.rescueLeft, els.rescueTop, els.rescueBottom].forEach(input => input.addEventListener("input", drawRescuePreview));

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
    els.fileCount.textContent = `${state.files.length} page${state.files.length === 1 ? "" : "s"} loaded`;
    els.processBtn.disabled = !state.files.length;
    els.reviewSection.classList.add("hidden");
    els.exportSection.classList.add("hidden");
    renderThumbs();
    await updatePreview();
    setStatus(state.files.length ? "Ready to process." : "Add screenshots to begin.");
  });

  els.clearImages.addEventListener("click", () => {
    els.imageInput.value = "";
    state.files = [];
    state.pages = [];
    els.fileCount.textContent = "0 pages loaded";
    els.processBtn.disabled = true;
    els.reviewSection.classList.add("hidden");
    els.exportSection.classList.add("hidden");
    renderThumbs();
    updatePreview();
    setStatus("Add screenshots to begin.");
  });

  els.processBtn.addEventListener("click", processPages);
  els.stopBtn.addEventListener("click", () => {
    state.stopRequested = true;
    setStatus("Stop requested. Finishing the current page…");
  });

  els.reviewSearch.addEventListener("input", renderReview);
  els.chapterOnly.addEventListener("change", renderReview);
  els.runRescue.addEventListener("click", runRescue);
  els.replaceOpening.addEventListener("click", insertRecoveredOpening);
  els.downloadTxt.addEventListener("click", downloadTxt);
  els.downloadEpub.addEventListener("click", downloadEpub);

  updatePreview();
})();
