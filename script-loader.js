// Book OCR Studio 158 loader. Keeps the review-toggle compatibility patch.
// v158 also repairs the held-out validation BUILDING -> READY UI transition.
// Production detector/ranking/validation math remains v157-identical.

(async () => {
  const response = await fetch("./script.js?v=157", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load script.js (${response.status})`);
  }

  let source = await response.text();

  // Report the deployed wrapper build without changing the frozen v157 detector.
  source = source.replace(
    '  const BUILD_VERSION = "157";',
    '  const BUILD_VERSION = "158";'
  );

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

  const validationReadyAnchor =
    '      setStatus(`HELD-OUT VALIDATION READY · page-grouped ${pageHeldOut.foldCount||0} folds · ${pageHeldOut.totalHeldOutPositives||0} italics / ${pageHeldOut.totalHeldOutRomans||0} Roman · export the JSON for the honest baseline.`);\n' +
    '      return;';

  const validationReadyReplacement =
    '      setItalicReviewReady("validation", state.italicCalibrationReviewSet?.length||0);\n' +
    '      setStatus(`HELD-OUT VALIDATION READY · page-grouped ${pageHeldOut.foldCount||0} folds · ${pageHeldOut.totalHeldOutPositives||0} italics / ${pageHeldOut.totalHeldOutRomans||0} Roman · export the JSON for the honest baseline.`);\n' +
    '      return;';

  if (!source.includes(validationReadyAnchor)) {
    throw new Error("Held-out validation READY patch anchor not found in script.js.");
  }
  source = source.replace(validationReadyAnchor, validationReadyReplacement);

  source += "\n//# sourceURL=book-ocr-studio-158.js";

  (0, eval)(source);
})().catch((err) => {
  console.error("Book OCR Studio loader failed", err);
  const status = document.getElementById("statusBox");
  if (status) {
    status.textContent = `App update failed to load: ${err.message || err}`;
  }
});
