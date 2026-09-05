// Book OCR Studio 2.7.1-inline-review"./script.js?v=2.7.1-inline-review", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load script.js (${response.status})`);
  }

  let source = await response.text();

  const anchor =
    '  els.prevPageBtn.addEventListener("click", goToPreviousPage);\n' +
    '  els.nextPageBtn.addEventListener("click", goToNextPage);';

  const replacement =
    '  els.reviewAllBtn.addEventListener("click", () => setReviewMode("all"));\n' +
    '  els.reviewChaptersBtn.addEventListener("click", () => setReviewMode("chapters"));\n' +
    anchor;

  if (!source.includes(anchor)) {
    throw new Error("Review-toggle patch anchor not found in script.js.");
  }

  source = source.replace(anchor, replacement);
  source += "\n//# sourceURL=book-ocr-studio-2.7.1-inline-review";

  (0, eval)(source);
})().catch((err) => {
  console.error("Book OCR Studio loader failed", err);
  const status = document.getElementById("statusBox");
  if (status) {
    status.textContent = `App update failed to load: ${err.message || err}`;
  }
});
