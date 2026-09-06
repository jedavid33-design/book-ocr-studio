Book OCR Studio 2.7.2 — Guided Repair + Regression

Guided Repair runs the safe repair stages in the order that preserves source-geometry formatting: paragraph rebuild → conservative Auto Italics → Safe Text Cleanup → split-ligature repair → Dropcap Rescue. High-confidence dropcaps are accepted automatically; uncertain candidates remain for review.

Run Regression Check is inspection-only and does not change the book. It checks continuity, paragraph sanity, cleanup, scene breaks, ligatures, layout geometry, dropcaps, and italic sanity. The IMG_2701–IMG_2720 reference set also gets its known 125/161-style layout-profile check.

Book OCR Studio 2.2 Dropcap Rescue update

Import a completed Book OCR Studio EPUB at the top of the app to scan and repair chapter-opening drop caps without rerunning OCR. Existing browser checkpoints remain compatible and are not cleared by this update.

Replace these two files in the ROOT of the GitHub repo:
- index.html
- script.js

New behavior:
- Process all pages automatically, one at a time (iPad-friendly)
- Saves checkpoint after every page
- Resumes a partial batch
- Review All Pages or Chapter Starts Only
- Chapter markers/titles still feed EPUB export
- Message-page Paddle OCR remains available during review

After GitHub Pages deploys, fully close and reopen the Home Screen app once so the new JavaScript is loaded.


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

v2.6.1: Safe cleanup now survives paragraph rebuilds. Added a conservative automatic italic-line scan from source screenshots, with manual italic marking retained for mixed inline emphasis.


v2.6.5: Added exportable italic detection 2.0 diagnostics with per-line slant/gain scores for calibration against known italic source text.


2.7.1: Dropcap Rescue now handles the fresh regression cases eese→Reese and quoted his→This while preserving opening punctuation; detached matching capitals are removed from their orphaned position when safe.


2.7.2 Final Polish: adds a Kindle-first safe cleanup pass plus review-only audits for geometry-backed wrap hyphens, quote balance, suspicious short paragraph fragments, chapter structure, and outstanding ligature/dropcap review. Ambiguous text is not auto-changed.
