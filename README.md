# Book OCR Studio 2.7.2

## New in 2.7.1
- Adds **Guided Repair**: one button runs paragraph rebuild, conservative Auto Italics, Safe Text Cleanup, split-ligature repair, then Dropcap Rescue. High-confidence dropcaps are accepted automatically; uncertain candidates remain for review.
- Adds **Run Regression Check**, a read-only integrity pass for page continuity, duplicate pages, paragraph size, cleanup normalization, scene breaks, split ligatures, layout geometry, dropcaps, and italic sanity.
- Recognizes the 20-page `IMG_2701`–`IMG_2720` reference pack and verifies its known body/indent geometry without embedding the source screenshots.
- Keeps all individual repair controls available for debugging and manual use.

## New in 2.4.1
- Tunes only Split Ligature Repair recall by adding nine confirmed ordinary English forms that the existing local allowlist omitted: `filthy`, `figured`, `firstborn`, `fists`, `fixated`, `figure`, `fitness`, `flushed`, and `fiercely`.
- Keeps the same conservative candidate matcher, exact-word validation, capitalization guard, and same-line-only spacing rule.
- Expands the deterministic regression suite from 13 to 22 cases.

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


Book OCR Studio 2.5.1 — Book-Level Paragraph Profile
- Learns one body-margin lane and one first-line-indent lane across the OCRed book.
- Applies the learned profile automatically after batch OCR and during manual paragraph rebuilds.
- Keeps punctuation as supporting evidence only; indentation remains the primary paragraph signal.
- Uses dominant body-left geometry and first-line indentation to reconstruct paragraphs.
- Indentation no longer requires preceding sentence punctuation.
- Saves PaddleOCR line geometry in the local checkpoint for no-re-OCR paragraph rebuilding.
- Adds Rebuild paragraphs control; use before manual text edits because it replaces page text.
- Uses saved geometry to join likely paragraph continuations across screenshot/page boundaries.
- Preserves existing Dropcap Rescue, message-page OCR, split-ligature polish, and chapter review behavior.

## v2.6.1
- Safe Text Cleanup is automatically re-applied after Paragraph Reconstruction, so cleanup is not lost if Rebuild Paragraphs is run afterward.
- Added conservative Auto Italic Scan for screenshot projects. It analyzes source-image slant within saved OCR line boxes and marks only high-confidence fully italic lines; mixed inline italics remain manual fallback.
- Ellipsis normalization now treats existing Unicode ellipses and spaced/compact three-dot OCR forms consistently.


v2.6.5: Added exportable italic detection 2.0 diagnostics with per-line slant/gain scores for calibration against known italic source text.


2.7.1: Dropcap Rescue now handles the fresh regression cases eese→Reese and quoted his→This while preserving opening punctuation; detached matching capitals are removed from their orphaned position when safe.


2.7.2 Final Polish: adds a Kindle-first safe cleanup pass plus review-only audits for geometry-backed wrap hyphens, quote balance, suspicious short paragraph fragments, chapter structure, and outstanding ligature/dropcap review. Ambiguous text is not auto-changed.


2.7.3 Actionable Review: Repair Book now has one unresolved-repair drawer with Fix/Discard or Keep actions. Final Polish review items are actionable (join/keep wrap hyphens, merge/keep paragraph fragments, dismiss/edit quote checks), and high-confidence lowercase paragraph continuations merge automatically before quote auditing. Final Polish summary layout is widened for readability.


2.7.4 Stage Reviews: unresolved OCR repairs stay under Repair Book; Final Polish shows only polish-stage review items. Wrap-hyphen Join word now stores and replaces the exact matched page-text span, with explicit success/failure feedback and an Edit page fallback.


2.7.6 Repaired-Text Polish: Final Polish now treats Repair Book's reconstructed page text as its source of truth. Original Paddle line geometry is supporting evidence only. A source wrap such as beam- / ing is suppressed when repaired text already contains beaming; geometry creates a review item only when the repaired text still contains a recognizable unresolved split.


2.7.8 Guided + Polish layout: section 6 contains Repair Book, Review repairs, Final Polish, and Review polish. Section 7 contains Regression Check, Paragraph Reconstruction, and Formatting Rescue. Section 8 contains export controls only. Standalone Dropcap Rescue and standalone Split Ligature UI are removed from the normal workflow. Header keeps only the build pill.


2.7.9 Layout Hotfix: restores hidden compatibility DOM hooks required by the existing repair/dropcap/ligature initialization while preserving the visible 6 Guided Repair / 7 Advanced / 8 Export layout.


2.7.10 Collapsible Review: section 5 is now a native collapsible disclosure. It opens by default after OCR but can be collapsed to keep the main workflow compact.


2.7.11 Crop Preview Sync: fixes screenshot-selection startup flow after removal of the standalone Dropcap section, immediately refreshes the crop preview after files are selected, keeps preset highlighting synchronized with numeric crop values, and adds a Custom preset state for manual crop values.


2.7.12 Recovery Sections Fix: recovered OCR checkpoints now reveal Review, Guided Repair, Advanced, and Export together. A single visibility helper now owns all post-OCR workflow sections so fresh processing and recovered sessions stay in sync.
