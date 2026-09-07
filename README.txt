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


2.7.3 Actionable Review: Repair Book now has one unresolved-repair drawer with Fix/Discard or Keep actions. Final Polish review items are actionable (join/keep wrap hyphens, merge/keep paragraph fragments, dismiss/edit quote checks), and high-confidence lowercase paragraph continuations merge automatically before quote auditing. Final Polish summary layout is widened for readability.


2.7.4 Stage Reviews: unresolved OCR repairs stay under Repair Book; Final Polish shows only polish-stage review items. Wrap-hyphen Join word now stores and replaces the exact matched page-text span, with explicit success/failure feedback and an Edit page fallback.


2.7.6 Repaired-Text Polish: Final Polish now treats Repair Book's reconstructed page text as its source of truth. Original Paddle line geometry is supporting evidence only. A source wrap such as beam- / ing is suppressed when repaired text already contains beaming; geometry creates a review item only when the repaired text still contains a recognizable unresolved split.


2.7.8 Guided + Polish layout: section 6 contains Repair Book, Review repairs, Final Polish, and Review polish. Section 7 contains Regression Check, Paragraph Reconstruction, and Formatting Rescue. Section 8 contains export controls only. Standalone Dropcap Rescue and standalone Split Ligature UI are removed from the normal workflow. Header keeps only the build pill.


2.7.9 Layout Hotfix: restores hidden compatibility DOM hooks required by the existing repair/dropcap/ligature initialization while preserving the visible 6 Guided Repair / 7 Advanced / 8 Export layout.


2.7.10 Collapsible Review: section 5 is now a native collapsible disclosure. It opens by default after OCR but can be collapsed to keep the main workflow compact.


2.7.11 Crop Preview Sync: fixes screenshot-selection startup flow after removal of the standalone Dropcap section, immediately refreshes the crop preview after files are selected, keeps preset highlighting synchronized with numeric crop values, and adds a Custom preset state for manual crop values.


2.7.12 Recovery Sections Fix: recovered OCR checkpoints now reveal Review, Guided Repair, Advanced, and Export together. A single visibility helper now owns all post-OCR workflow sections so fresh processing and recovered sessions stay in sync.


2.7.13 Compact EPUB Repair: the existing-EPUB repair area is now collapsed by default behind a compact native disclosure, preserving all repair/import behavior while reducing top-of-page visual weight.


2.7.14 Kindle Ready: adds permanent section 8 between Advanced and Export. Preflight checks book text, metadata, cover, chapter navigation, unresolved Repair/Polish items, italic marker balance, scene breaks, and the reflowable Kindle-safe EPUB structure. Export is now section 9. No Kindle Ready check changes book text.


2.7.15 Polish Review Restored: restores the Review polish drawer directly under Final Polish and keeps Final Polish audit stage-owned by removing outstanding Repair Book ligature/dropcap rows from its audit.
