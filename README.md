# Book OCR Studio 2.0.2

PaddleOCR build with a fresh-reprocess control.

## New in 2.0.2
- Added **Clear old OCR + restart with Paddle**.
- Clears the current and legacy saved OCR checkpoints so old Tesseract text cannot carry over.
- Keeps the currently selected screenshot batch loaded.
- Preserves existing chapter-start markers and chapter titles where possible while pages are reprocessed.
- Keeps the one-page-at-a-time workflow, Message-page OCR, and EPUB/TXT export.

Use the new restart button after selecting the same screenshot batch, then process page 1 and continue through the book with PaddleOCR.
