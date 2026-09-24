# Book OCR Studio — Project State

> Repo continuity file. Read this first in a fresh coding thread.
>
> **Source of truth:** the current `main` branch and current code. This file is a compact map of the intended state, not a substitute for inspecting the implementation. If code and this file ever disagree, verify the code and update this file in the same change.

## Current state

- **Current build:** 241
- **Status:** stable / feature-complete for the current OCR workflow. Leave the app alone unless real-book use exposes a concrete problem.
- **Primary repo:** `jedavid33-design/book-ocr-studio`
- **Branch:** `main`
- **Cloudflare Worker:** none. No Cloudflare-side deployment work is required for this project.
- **Current production flow:** Book Info → Screenshots → Crop → OCR / QA → Review → Guided Repair → Final Polish → Kindle Ready → Export.
- Build 238 cleaned the production UI without changing OCR/QA/Repair/Polish/export behavior.
- Build 239 fixes a recovered-project edge case: if Studio auto-restores the last source-free project and the user selects a different screenshot batch, Studio offers to start a new book instead of trapping the user behind an attachment mismatch.

## Canonical workflow

1. Select source profile and book metadata.
2. Add the full screenshot batch.
3. Confirm crop preset / crop preview.
4. Run PaddleOCR sequentially.
5. Export an OCR backup whenever a portable checkpoint is useful.
6. Export Typography Test for independent visual QA.
7. Import cumulative QA Corrections transactionally.
8. Review chapter starts / page text as needed.
9. Run Guided Repair.
10. Run Final Polish and resolve any remaining review items.
11. Run Kindle Ready.
12. Export TXT / EPUB.

For an already-completed OCR project, importing the OCR backup can begin at step 6 or later without attaching screenshots. Attach the originals only when image-based tools or unfinished OCR require them.

## Persistence / recovery

- Full automatic project checkpoints live in **IndexedDB**, not localStorage.
- A completed OCR page is not treated as durably saved until its IndexedDB checkpoint commit completes.
- Routine edits are coalesced so large books do not queue a full-project write for every keystroke.
- Portable OCR backup JSON remains the user-controlled safety copy.
- OCR backup restore works **without screenshots**.
- A complete backup restores downstream text/geometry work immediately.
- A partial backup restores existing OCR immediately but requires the original screenshots to continue OCR.
- Reattaching the original screenshot batch matches by saved signature / filename / normalized filename stem and must not reset restored work.
- If a different screenshot batch is selected while an old source-free project is auto-recovered, Build 239 asks whether to start a new book. Confirming replaces the browser recovery checkpoint but does not alter exported backup files. A fresh batch also claims the browser recovery identity immediately, even before page 1 is OCRed, so an unrelated old project cannot reappear on the next reload.
- Lightweight localStorage data may still exist for small auxiliary state such as chapter memory, repair overlay, or italic-learning support. Do not move the full project checkpoint back to localStorage.

## OCR / geometry architecture

- **Primary OCR:** PaddleOCR PP-OCRv5 in-browser.
- Saved project data includes page text, line/word geometry, raw OCR items, crop settings, chapter markers, chapter POV metadata, Repair/Polish state, QA authority, and related project state.
- Tesseract exists as companion/diagnostic evidence in selected paths. It does **not** replace Paddle as the production OCR engine.
- Paragraph reconstruction uses saved Paddle geometry. Avoid replacing this with text-only heuristics.
- Source screenshots are authoritative for visual questions.
- Source files may be detached after restore; all pixel-driven tools must remain guarded when real source files are unavailable.

## QA architecture

Independent visual QA is intentionally outside the automatic OCR detector.

- Export Typography Test packages stable page/line/word identities plus source images and geometry.
- Visual QA treats screenshot pixels as authoritative.
- QA can correct italics per word, paragraph structure, quote structure, scene breaks, page-boundary continuations, and chapter POV metadata.
- Cumulative QA import is **transactional**. Do not partially apply a correction package that contains unresolved conflicts.
- Existing authoritative `[[i]]…[[/i]]` markers must not create false re-import conflicts.
- Additive punctuation corrections are idempotent only when anchored safely to the intended OCR item.
- Successful cumulative QA creates/preserves Visual-QA authority evidence so Final Polish does not repeatedly ask about source conditions already inspected and approved.
- QA authority cannot suppress a newly detected non-suppressible decorative-marker candidate.

## Repair / Polish rules

- Manual and imported QA edits are authoritative.
- Repair Book may rebuild geometry-derived structure and apply deterministic safe cleanup, but it must preserve authoritative typography.
- Final Polish applies only low-risk cleanup automatically and sends ambiguous conditions to review.
- Final Polish must not rewrite prose speculatively.
- Kindle Ready is an inspection/preflight step and must not silently rewrite book text.
- Build 238 collapses a clean Final Polish result into a compact summary; warnings/review items expand the audit automatically.

## Typography / italics

- CloudLibrary / Iowan Old Style was the original calibration corpus.
- The large Italic Hunt / Line Hunt / validation / neural / pixel experiment system remains available under **Advanced → Italic research & learning**.
- Offline Roman Residual / Neural Italic N1 tools live under **Lab / offline experiments**.
- These research tools are not part of the normal production path.
- Do not reset learned labels/training data casually.
- For current production books, independent visual QA is the authoritative typography check. A separate Kindle-specific QA subsystem is not currently planned unless real Kindle screenshots prove one is necessary.

## Source profiles

### CloudLibrary / Iowan Old Style
- Proven production source.
- Existing crop, geometry, repair, and QA behavior is the baseline. Do not regress it while adding support for other sources.

### Kindle / Georgia
- Profile exists.
- Treat the first full Kindle book as a real-world compatibility test of the existing pipeline.
- Do **not** build a parallel Kindle OCR/QA architecture preemptively.
- If Kindle exposes a source-specific problem, make the smallest source-profile/crop/preprocessing adjustment required and keep the shared downstream QA/Repair/Polish pipeline.

## Ruby Circle reference corpus

Ruby Circle is the established regression corpus and proven end-to-end book.

- 204 pages
- 20 chapters
- 521 structural corrections
- 203 authoritative page-boundary decisions
- 275 authoritative italic segments in the clean QA import
- 20 chapter POV tags
- 0 unresolved QA items
- Source-faithful POV metadata is required. Example: Chapter 14 is `ADRIAN … AGAIN`.
- Repair validation preserved chapters, POV, italics, and prose.
- Build 235 reached Final Polish **0 review**.
- Build 236 added geometry-backed decorative scene-marker review. A Paddle hallucination such as `1MC` can be explicitly converted to the canonical semantic scene marker `* * *` after source inspection.
- Build 237 screenshot-free backup restore and subsequent reattachment of all 204 screenshots were both user-tested successfully.
- Build 238 UI cleanup was visually accepted.

## DO NOT REGRESS

- Screenshot-free OCR backup restore.
- Partial-project restore plus later screenshot reattachment.
- Per-page IndexedDB durability during OCR.
- Transactional cumulative QA import.
- Stable page/line/word IDs used by QA.
- Imported/manual italics across Repair and export.
- Chapter markers and source-faithful POV metadata.
- Visual-QA authority suppression of already reviewed Final Polish conditions.
- Decorative-marker candidates requiring an explicit decision.
- CloudLibrary/Iowan geometry and paragraph reconstruction behavior.
- No book-specific hard-coding such as literal `1MC` detection.
- No speculative prose rewriting.
- No silent reset of a restored project when attaching matching screenshots.
- No silent destruction of a restored project when selecting a mismatched/new screenshot batch.

## UI organization

Normal production controls should remain visually dominant.

- **OCR:** primary process/backup/QA actions visible. Restart and legacy typography inspection live under **More OCR / recovery tools**.
- **Review:** normal page/chapter review visible. Message-page re-OCR and chapter re-detection live under **Page & recovery tools**.
- **Guided Repair:** Repair Book and status visible. Chapter-by-chapter mode and Geometry Assist live under **Repair options**.
- **Advanced:** diagnostics and individual reruns, including nested italic research.
- **Lab / offline experiments:** tools that do not belong in the normal book workflow.
- Screenshot thumbnails show eight by default, expandable to the previous 40-thumbnail ceiling.

## Known / deferred work

- **Build 241 QA handoff:** every Typography Test ZIP includes a short `QA-INSTRUCTIONS.md` router plus `CHATGPT-QA-INSTRUCTIONS.md` and `MUSE-QA-INSTRUCTIONS.md`. ChatGPT keeps the chapter-by-chapter cumulative workflow. Muse/Wren gets a continuous whole-book sequential workflow with strict canonical-schema, stable-ID, and silent-content-loss safeguards. Book-specific notes can still be added in chat.
- **Pucked blind QA experiment (2026-09-23):** ChatGPT primary QA beat Muse/Wren in the blinded EPUB comparison. Muse successfully processed the full book autonomously and found useful local OCR corrections, but its output introduced silent source-text loss in multiple chapters. Until repeated testing proves otherwise, treat Muse as experimental/secondary QA rather than the sole authoritative correction engine.
- **Scene-break QA gap discovered by Pucked:** both engines can visually recognize scene breaks, but the cumulative QA schema has no canonical insertion operation when OCR produced no safe ornament token to replace. Build 241 instructions explicitly forbid Muse from overwriting neighboring prose or inventing unsupported ops in that case. A future safe `insert_scene_break`-style transactional operation is the preferred fix.
- **Build 240 across-room notices:** batch OCR success shows a persistent large `OCR COMPLETE` modal; batch OCR failure/stoppage shows a persistent large `OCR STOPPED` modal. Both remain until dismissed.
- **Immediate real-world test:** first full Kindle book.
- A partial-backup → restore without screenshots → attach originals → resume OCR path is implemented but has not been deliberately end-to-end tested as a manufactured scenario.
- EPUB scene-break conversion currently serializes an empty semantic `<hr class="scene-break"/>` and uses CSS generated content for visible stars. Kindle preserved the spacing but did not display the generated ornament in the Ruby Circle test. This is accepted for now.
- Future phase: **pretty EPUBs**. Potential work includes real XHTML scene ornaments, chapter-opening styling, title-page treatment, typography/spacing polish, and other presentation improvements.
- Large-scale `script.js` modularization can happen later, after more real-book use proves the current behavior stable.
- README build archaeology can be pruned later. Do not mix that cleanup into functional fixes without a reason.

## Development / verification discipline

- Treat the current repo as source of truth and inspect current code before changing behavior.
- Keep functional fixes narrow.
- When changing a proven workflow, validate the Ruby Circle invariants above.
- Bump build/loader/cache versions together when deployment needs cache busting.
- Keep `PROJECT_STATE.md` current when a change materially alters architecture, workflow, known-good behavior, or deferred work.
- Do not add a Cloudflare Worker unless the project genuinely acquires server-side requirements.
