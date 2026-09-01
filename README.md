# Book OCR Studio 2.4.0

## New in 2.4.0
- Adds a focused **EPUB Polish → Repair split ligatures** action for existing OCR projects and imported EPUBs; it never runs OCR.
- Repairs only same-line splits whose joined token is in a conservative local word allowlist.
- Supports `fi`, `fl`, `ff`, `ffi`, and `ffl`, while preserving punctuation, capitalization, dialogue, paragraph boundaries, and unrelated spacing.
- Reports the number repaired and the number of uncertain candidates deliberately left unchanged.
- Includes 13 deterministic regression tests. Run them with `node tests/epub-polish.test.js`.

Dropcap Rescue 2.0 adds a post-OCR repair workflow. It can use a recovered browser checkpoint or import an already-exported Book OCR Studio EPUB; neither route reruns OCR.

## New in 2.3.0
- Adds **Dropcap Rescue** directly to the per-page OCR review/editor controls.
- Opens a review dialog with the current paragraph, editable suggestion, evidence note, orphan-fragment notice, and source screenshot when available.
- Applies nothing until **Apply suggested repair** is pressed; Cancel and dialog dismissal leave the page unchanged.
- Uses the same candidate engine for page-level and full-book rescue.
- Locates the first real prose paragraph after POV names, dates, holidays, time jumps, short subtitles, and other metadata-style labels.
- Preserves metadata lines even when PaddleOCR stored the labels and prose in one newline-separated OCR block.
- Supports ordinary chapters, sections, and Epilogues without requiring a pre-existing chapter-start marker for page-level rescue.

## Fixed in 2.2.1
- Never treats an ordinary prose pronoun **I** as the missing first letter of words such as `rap`, `tay`, or `ucker`.
- Distinguishes missing letters (`rap` → `Crap`), missing standalone words (`wait` → `I wait`), and missing contraction letters (`'m` → `I'm`).
- Matches displaced initials wrapped in quotation marks and handles non-Latin OCR glyphs conservatively.
- Finds narrative openings after text-message/date preludes, including preludes merged into the same EPUB paragraph.
- Flags duplicate displaced initials even when the opening word itself is already correct; ordinary **I** is excluded from duplicate detection.
- Can recognize and repair mistaken `Irap`/`Itay`/`Icouple`-style output created by 2.2.0.

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
