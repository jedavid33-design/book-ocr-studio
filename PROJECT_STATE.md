# Book OCR Studio — Project State

> Repo continuity file. Read this first in a fresh coding thread.
>
> **Source of truth:** the current `main` branch and current code. This file is a compact map of the intended state, not a substitute for inspecting the implementation. If code and this file ever disagree, verify the code and update this file in the same change.

## Current state

- **Current build:** 266
- **Status:** stable / feature-complete for the current OCR workflow. Leave the app alone unless real-book use exposes a concrete problem.
- **Primary repo:** `jedavid33-design/book-ocr-studio`
- **Branch:** `main`
- **Cloudflare Worker:** Optional private OpenRouter QA test relay (`cloudflare/openrouter-qa-relay.js`) owned and deployed manually in user's Cloudflare account; normal Studio OCR/EPUB functionality has no Worker requirement.
- **Current production flow:** Book Info → Screenshots → Default Crop + Page-Range Overrides → Crop Preflight (human approval) → OCR / QA → Review → Guided Repair → Final Polish → Kindle Ready → Export.
- Build 266 provides a non-generative `POST /key-check` relay route secured by `QA_ACCESS_TOKEN`, checking `GET https://openrouter.ai/api/v1/key`, plus sanitized upstream error status/type reporting without raw provider messages or OCR. UI adds a **Check OpenRouter key · No charge** button and displays real OpenRouter HTTP status on failed paid requests. Cloudflare Worker source **must be updated and redeployed manually** by owner; GitHub code push updates Studio only. No API key or QA token values are stored in repo. Shell v92 / loader 266. Existing benchmark checkpoints retain key prefix `ocrStudio.qaBakeoff.264` deliberately for continuity.
- Build 265 fixes first-use failure diagnostics in AI QA bake-off: the previous `run()` loop recorded 1 failure then overwrote the actual error with '0 pages completed'. Studio now retains the original per-page error, displays the most recent saved error after reload, records HTTP status for new failures, and does not start retries automatically. The existing Cloudflare Worker code and its secrets are unchanged. Shell v91/loader 265.
- Build 264 adds an **experimental AI QA Bake-off** in Review. Two separate local ZIPs hold blind page images/untouched OCR snippets and private gold reference plus polished EPUB. Users explicitly approve paid *three-page* runs for the chosen OpenRouter vision model through their own private Cloudflare Worker relay (`cloudflare/openrouter-qa-relay.js`). API key is held only in Worker secrets, never browser/GitHub; separate QA token, origin restriction, ZDR and data-collection denial are required. `qa-bakeoff-core.js` locally scores exact text, substantive errors, typography-only changes and false-positive controls; `qa-bakeoff-ui.js` preserves results locally, exports/imports JSON, and does not alter source, QA, or EPUB. Pilot benchmark is Pucked Over Prologue + Chapters 1–4 (41 pages); original archive's cover is intentionally omitted. It has 853 saved text edits and 41 deliberate no-change controls, NOT complete raw OCR full-page reference. No model API calls have been made; deploy/configure relay to start. See `AI_QA_BAKEOFF_SETUP.md`. Offline shell v90/CSS 70/loader 264; 10 regression suites.
- Build 263 adds **Review → Prioritized QA Review**, a separate read-only inspection order implemented by `prioritized-qa-queue.js`. Its single-run snapshot composes existing chapter-opening/POV audit, residual word boundaries, Final Polish source-backed issues (with QA suppression and ignore decisions), stale message bubbles, pending Dropcap Rescue candidates, and unresolved typography. Pages rank as high attention, review suggested, or no patterns flagged, with a priority-vs-book-order switch, filters, source-page jumps, Next flagged, and progressive 60-row display. A zero-flag page is emphatically **not QA verified**, and no approval/skipping states are inferred or written. Results are transient and Review typing/chapter heading edits mark them stale; users rerun after downstream repairs or QA imports. The word-audit display cap is raised for queueing and any omissions are disclosed. No source/project mutation, no re-OCR, no export gate, no Worker. Cache v89/CSS 69/loader 263; new `tests/prioritized-qa-queue.test.js` (nine regression suites).
- Build 262 adds **Kindle Ready → Preview generated EPUB** for screenshot-based EPUB projects. It builds the same actual EPUB ZIP internally via `buildEpub({preview:true})`, skipping normal editor synchronization and italic-projection changes, and presents its chapter XHTML + precise `EPUB/style.css` through an isolated `iframe sandbox=""` with CSP. Images are displayed only from ZIP-packaged assets via data URIs. Controls: cover/title/chapter selector, previous/next, 360/640/820px reader widths; per-section paragraph, italic, bubble, semantic scene-break, illustration counts and advisory warnings. No OCR/QA state writes, no EPUB download while previewing, no Worker. **Important:** browser preview is not proof of Apple Books/Kindle rendering and does not preview patched imported EPUBs. Complete Kindle Ready before inspecting and separately verify an actual exported EPUB in a reading app. CSS 68, loader 262, offline shell v88, eighth regression suite `tests/epub-visual-preview.test.js`.
- Build 261 adds `ocr-first-pass.js`, invoked **only from first-time `processSinglePage`** after Paddle text reconstruction and before chapter detection/checkpoint save. The only auto changes are exact false-period joins, a tiny set of known `fi/fl` splits, and lower-case prose words glued immediately after comma/semicolon. The helper is pure/idempotent and returns an occurrence-level ledger in `layoutMeta.ocrFirstPass`. Review displays it under the page title. Older already-processed pages, user edits, imported QA and completed books are never automatically reprocessed by Build 261. Existing Repair/Polish and the Book 260 unified audits stay unchanged. No new OCR or Worker. Cache v87, CSS 67, loader 261. Regression `tests/ocr-first-pass.test.js`, all seven suites in GitHub Actions.
- Build 260 adds **Review → Unified Book Audit** with explicit "after OCR" and "after QA" read-only checkpoints. It composes the independent Build 258 chapter inventory, Build 259 word-boundary detector, canonical Final Polish review, and the Kindle Ready export checks without reimplementing their logic. After OCR leads are advisory; after QA existing Kindle Ready failures are presented separately as blockers, warnings as notes. The unified Kindle preflight uses `kindleReadyChecks({readOnly:true})` to avoid triggering usual editor sync or italic-projection mutations; normal Kindle Ready retains its full export-time authority. Reviewed QA suppressions/ignored Polish decisions are respected in after-QA mode. Findings are grouped with page jump + capped display, JSON report, and session-only checkpoint comparison. No changes to original OCR, QA imports, repairs, saved EPUBs, or export gates. Asset loader 260 / stylesheet 66 / offline shell v86. New test: `node tests/unified-book-audit.test.js` (GitHub Actions now runs six regression suites).
- Build 259 adds a separate read-only Review → Residual word-boundary review. The independent `word-boundary-audit.js` searches finished authoritative text for remaining fi/fl ligature splits, hyphen-wrap fragments, selective glued words with mid-token capitals, and no-space punctuation. Results include screenshot-page navigation, context and tentative suggestions; JSON export is an advisory report, not a correction package. No data mutation, auto-fix, or Kindle Ready gate. Loader 259; stylesheet 65; offline shell v85. Test: `node tests/word-boundary-audit.test.js` (GitHub Actions runs all five regression suites).
- Build 258 adds a read-only Review → Chapter opening inventory for chapter heading/number continuity, tentative lowercase/drop-cap openings, missing POV metadata, and unmarked chapter candidates. It uses saved text only, allows page jumps and requires manual source review. No automatic repairs, no changes to transactional QA or EPUB export. Offline cache v84; loader 258, stylesheet v64. Test: `node tests/chapter-opening-audit.test.js`.
- Build 257 adds `scene-ornaments.js` and a local IndexedDB ornament library independent of the active project, plus an explicit Book Info chooser, image upload and source-screenshot touch crop. Only a user-approved single selected illustration replaces canonical standalone `* * *` paragraphs across a book; the exact asset snapshot and apply flag are embedded in OCR project backups/checkpoints. EPUB embeds the PNG once with OPF manifest entry and `data-opal-scene-break="true"` on each decorative image paragraph, preserving Reader pauses. Plain dividers and original OCR remain unchanged if disabled. Kindle Ready and direct export reject enabled missing/invalid assets and books with zero canonical breaks. Offline cache v83, Build 257 loader. Tests: `node tests/scene-ornaments.test.js` plus prior Build 255/256 suites. Existing book/QA workflow and source screenshot integrity are preserved.
- Build 256 adds `message-bubbles.js` to the production chain. Review-page message annotations store exact OCR paragraph text + occurrence, explicit outgoing/incoming side and optional *existing* printed sender label; they are checkpointed/backed up, not inserted into source OCR text. Suggestions from adjacent uppercase labels + chapter POV require explicit approval. EPUB XHTML emits blue/gray message groups, verified existing label only once as nonspoken furniture, and unchanged message prose as an ordinary nested `<p>` (Opal Reader keeps chapter narrator voice). Page-crossing paragraph merges never swallow tagged messages. Stale text/label anchors block both Kindle Ready and direct EPUB export. No Worker; no OCR re-run. Regression: `node tests/message-bubbles.test.js`.
- Build 255 keeps source/QA data unchanged and adds Reader-compatible nonspoken scene markers to newly exported EPUBs. Kindle Ready warns when a book with some explicit chapter POV labels is missing others, preserving the chapter narrator across text messages. Regression tests: `node tests/reader-ready-export.test.js`. No Worker deployment. Future Pucked-derived improvements: source-backed styled text bubbles, selectable ornamental scene artwork, stronger chapter/drop-cap inventory, and review-only residual OCR split-word checks.
- Build 254 adds inclusive 1-based page-range crop overrides and samples at book-wide intervals and span boundaries. The preview overlays removed portions of the original image, with advisory cut-line ink warnings and explicit approval before new full-book OCR. The effective crop applies to OCR and visual QA. Ranges persist in IndexedDB checkpoints; changing settings after an OCR batch begins blocks mixed-crop resume.
- Build 253 marks the generated EPUB title page with `data-opal-narration="skip"`. This preserves the visible title/author page while allowing Opal Reader to exclude it from TTS import. No OCR text, QA, Repair, Polish, chapter content, or typography behavior changes.
- Build 238 cleaned the production UI without changing OCR/QA/Repair/Polish/export behavior.
- Build 239 fixes a recovered-project edge case: if Studio auto-restores the last source-free project and the user selects a different screenshot batch, Studio offers to start a new book instead of trapping the user behind an attachment mismatch.
- Build 242 starts the **pretty EPUBs** phase: title page, centered chapter headings, justified text, real scene-break ornaments (not CSS-generated), improved typography.

## Canonical workflow

1. Select source profile and book metadata.
2. Add the full screenshot batch.
3. Choose default crop and optional nonoverlapping page-range overrides. Run the crop preflight and approve after reviewing samples.
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
- **Build 244: audit fix pass** — all 12 minor findings from the 2026-10-01 full audit fixed; 0 majors found. (1) Loader cache-bust now bumped with the build (`script-loader.js?v=244` / `script.js?v=244` — the discipline is build/loader/cache versions move together). (2) Batch OCR gains a **Stop after this page** button wired to `state.stopRequested`, checked between pages; stopping flushes and shows the same honest "resume at page N" state as the failure path, plus the hint text now says closing the tab mid-batch is safe. (3) The dead standalone split-ligature review panel render was deleted — uncertain ligature candidates surface only through the Repair Book review list, which owns those decisions; the auto-repair path is unchanged. (4) Deleted the unreachable `<hr class="scene-break"/>` branch in `paragraphToEpubHtml` (buildEpub already serializes real `<p class="scene-break">* * *</p>`); documented the no-`<hr/>` decision at the call site. (5) Paragraph rebuild now counts standalone dividers normalized to `* * *` by `safePolishText` and says so in the rebuild status. (6) A failed coalesced checkpoint write keeps the newest unsaved payload for one retry on the next `saveCheckpoint()` (no auto-spin on a failing store; one retry at durability boundaries, then honest failure) and surfaces the failure in the status bar instead of only the console. (7) The post-batch book-level tail (layout profile, dual-OCR guard, chapter redetect) is wrapped in try/catch — pages are already durable per page; the catch reports honestly. (8) The legacy ChatGPT-annotations QA import path now works on a `workingPages` copy and commits atomically like the cumulative path; misses are still reported, not silently partial. (9) Repair-overlay keys are `pageIndex:normalizedStem` so same-stem filenames (`IMG_001.jpg` vs `IMG_001.PNG`) can't overwrite each other; stem-only keys remain a legacy read fallback. (10) Batch OCR collects zero-text pages (glare/thumb/undecodable) and flags them in the completion status. (11) The first accepted dropcap repair on an imported EPUB shows a one-time status: repaired text is checkpointed, but the byte-preserving original-package export needs the EPUB re-imported after a reload. (12) `restartFreshWithPaddle` also clears `importedEpub`, `dropcapCandidates`, and terminates the Tesseract worker.
- **Build 243: cumulative QA import runs a pre-import validator** (`validateQaCumulativePackage`) enforcing the frozen QA rulebook mechanically before anything is applied: exact schema, pageCount, ordered chapters, required arrays per chapter, unique op/span IDs, every page covered exactly once, every within-chapter boundary audited, matchText byte-exact against OCR items, plus the Rule 20 absolutes (chapters key not renamed, no unrelated replacement text via Levenshtein similarity, no doubled em-dash). Errors abort with no changes applied; warnings (possible content loss, missing metadata) require explicit confirmation; routine notices (quote additions, merge from/to shape variants) are reported in the import summary. The validator passes the real Book 3 QA package with 0 errors.
- Merge from/to shapes are normalized by `qaMergePageIds` (nested `from:{pageId}` canonical; flat `fromPageId` keys and flat `"p0084"` strings also import instead of silently dropping — real Book 3 QA contained 30 flat-string merges the old importer silently ignored).
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
- **Build 242 pretty EPUBs (phase 1):** title page with centered title/author, centered chapter headings with top margin, justified body text, 1.6 line-height, real `<p class="scene-break">* * *</p>` ornaments (Kindle-compatible, not CSS-generated). Future: drop caps, decorative ornaments, chapter-opening styling variants.
- **Pucked blind QA experiment (2026-09-23):** ChatGPT primary QA beat Muse/Wren in the blinded EPUB comparison. Muse successfully processed the full book autonomously and found useful local OCR corrections, but its output introduced silent source-text loss in multiple chapters. Until repeated testing proves otherwise, treat Muse as experimental/secondary QA rather than the sole authoritative correction engine.
- **Scene-break QA gap discovered by Pucked:** both engines can visually recognize scene breaks, but the cumulative QA schema has no canonical insertion operation when OCR produced no safe ornament token to replace. Build 241 instructions explicitly forbid Muse from overwriting neighboring prose or inventing unsupported ops in that case. A future safe `insert_scene_break`-style transactional operation is the preferred fix.
- **Build 240 across-room notices:** batch OCR success shows a persistent large `OCR COMPLETE` modal; batch OCR failure/stoppage shows a persistent large `OCR STOPPED` modal. Both remain until dismissed.
- **Immediate real-world test:** first full Kindle book.
- A partial-backup → restore without screenshots → attach originals → resume OCR path is implemented but has not been deliberately end-to-end tested as a manufactured scenario.
- EPUB scene-break conversion now serializes real text content (`<p class="scene-break">* * *</p>`) instead of empty `<hr/>` with CSS-generated ornament. Kindle displays this correctly.
- Large-scale `script.js` modularization can happen later, after more real-book use proves the current behavior stable.
- README build archaeology can be pruned later. Do not mix that cleanup into functional fixes without a reason.

## Development / verification discipline

- Treat the current repo as source of truth and inspect current code before changing behavior.
- Keep functional fixes narrow.
- When changing a proven workflow, validate the Ruby Circle invariants above.
- Bump build/loader/cache versions together when deployment needs cache busting.
- Keep `PROJECT_STATE.md` current when a change materially alters architecture, workflow, known-good behavior, or deferred work.
- Do not add a Cloudflare Worker unless the project genuinely acquires server-side requirements.
