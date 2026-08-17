# Book OCR Studio 2.0.1

Hotfix for the 2.0 page-selection issue on Safari/iPad.

- The main app now loads before PaddleOCR is downloaded.
- Selecting screenshots works even if the PaddleOCR CDN/module has a problem.
- PaddleOCR is loaded only when you actually run OCR.
- A second CDN is used as a fallback if the first module URL fails.
- Existing saved project/checkpoint data is preserved.

# Book OCR Studio 2.0 — PaddleOCR experiment

Version 2.0 keeps the v19 one-page workflow, project recovery, chapter controls, TXT export, and chapter-structured EPUB export, but changes the OCR engine from Tesseract.js to the official PaddleOCR.js browser SDK using PP-OCRv5 mobile detection/recognition models.

## What to test first
- Re-run **Message-page OCR · Paddle** on the seven known message-layout pages, especially IMG_2251 and IMG_2252.
- Compare normal prose OCR on a few ordinary pages.
- The first OCR request may take longer because the browser downloads/initializes the Paddle models.

## Saved progress
The permanent `bookOcrStudio.progress.current` checkpoint key is unchanged, so selecting the same screenshot batch can recover existing v19 edits. Paddle OCR only replaces a page when you explicitly process/re-process that page.

## Files
Upload `index.html`, `script.js`, and `styles.css` to the GitHub Pages repository root. `README.md` is optional.
