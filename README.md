# Book OCR Studio 2.2.0

Dropcap Rescue 2.0 adds a post-OCR repair workflow. It can use a recovered browser checkpoint or import an already-exported Book OCR Studio EPUB; neither route reruns OCR.

## New in 2.2.0
- Scans all likely chapter-opening paragraphs for separated or missing decorative initials.
- Automatically classifies only strong detached-letter evidence as high confidence.
- Sends dictionary-like and symbol/non-Latin cases to review instead of silently changing them.
- Supports accept, reject, edit, and **Accept all high-confidence** actions.
- Shows the source screenshot when a recovered browser project has its files selected.
- Preserves an imported EPUB package and changes only accepted paragraph repairs.
- Keeps the existing local-storage checkpoint keys and completed OCR text intact.

PaddleOCR build with a fresh-reprocess control.

## New in 2.0.2
- Added **Clear old OCR + restart with Paddle**.
- Clears the current and legacy saved OCR checkpoints so old Tesseract text cannot carry over.
- Keeps the currently selected screenshot batch loaded.
- Preserves existing chapter-start markers and chapter titles where possible while pages are reprocessed.
- Keeps the one-page-at-a-time workflow, Message-page OCR, and EPUB/TXT export.

Use the new restart button after selecting the same screenshot batch, then process page 1 and continue through the book with PaddleOCR.
