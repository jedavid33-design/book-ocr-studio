# Book OCR Studio 2.7.2

Current production build: **265**.

## Build 265: AI QA first-run error visibility
- A failed paid OpenRouter request now **keeps its failure reason** on screen instead of replacing it with a misleading “0 pages completed” message. Prior failed attempts from the browser's saved benchmark state now show the most recent page and error, plus HTTP status when available. This is a Studio-only UI change and **does not require Cloudflare Worker redeployment**, does not retry requests, and does not spend credits. Shell cache v91 and Build 265 loader ensure iOS refreshes the diagnostic script.

## Build 264: OpenRouter AI QA audition (pilot only)
- **Review → AI QA Bake-off** is an opt-in experiment, separate from the real book editor and final export. It accepts a local **blind screenshot/OCR anchors ZIP** and local **private answer-key ZIP**, and runs up to three pages per explicit paid API confirmation using a private Cloudflare Worker configured separately by the owner. All correction scoring stays on the device; the polished EPUB and gold answer key are never sent to OpenRouter.
- A secure, stateless `cloudflare/openrouter-qa-relay.js` accepts only authenticated, size-limited image+OCR-anchor requests for three allowed model IDs. The OpenRouter key must be set as a **Worker secret**, never pasted into Studio or committed to GitHub; a separate Worker access token is entered for the session. Data-collection-deny, ZDR and structured response requirements are enforced; incompatible providers are rejected.
- Reports distinguish **substantive OCR fixes**, **typography-only fixes**, and **false edits to unchanged controls**. Partial model results are checkpointed locally after every page and can be exported/re-imported. Model responses are diagnostic only: no auto-import, rewritten book text, or success/verified claim is made.
- Pilot files: **Pucked Over, Prologue + Chapters 1–4, 41 matched screenshots (cover excluded)**, 894 source OCR snippets/controls. Benchmark is *anchor based*, not whole-page QA; even perfect scores will not establish 100% visual QA.
- See [AI_QA_BAKEOFF_SETUP.md](AI_QA_BAKEOFF_SETUP.md) for setup, privacy, limits, and model comparison process. Source ZIPs and private corrected book data are NOT tracked in this repository. Loader 264 / CSS 70 / offline shell v90; 10 regression suites.

## Build 263: Prioritized QA inspection queue
- Under **Review → Prioritized QA Review**, choose **Build priority queue** to sort the processed screenshot pages by existing audit evidence. **High attention** includes blank OCR pages, unresolved source-backed drop-cap concerns, stale approved text-bubble anchors, suspicious chapter openings and unconfirmed decorative dividers. **Review suggested** includes other chapter/POV, paragraph, text-boundary and unresolved typography warnings. **No patterns flagged** is a neutral category, *not* proof of completed visual QA.
- Default shows flagged pages in descending importance. Switch to **High attention**, **Every processed page**, or **No patterns flagged**, and select **Most attention first** or **Original page order**. Tap a page to view its source screenshot/text. **Next flagged page** walks the flagged queue. Long lists load 60 at a time.
- The detector reuses the Build 258 chapter audit, Build 259 word-boundary audit (broader display cap for prioritization), canonical Final Polish with QA approvals and explicit ignored decisions respected, Build 256 bubble validation, pending drop caps and unresolved typography. It does not launch OCR, rewrite saved page text, mark visual QA as complete, or alter EPUB/Kindle Ready export gates.
- Rankings are an **inspection snapshot**. Manual edits in Review mark it stale; re-run after imported corrections, Guided Repair, Final Polish, or editing. Even pages with zero flags still need the appropriate source-image validation. If the word detector caps its output, a warning says the priorities may be incomplete. No new QA approval or skip-status storage is introduced.
- Build 263 uses `prioritized-qa-queue.js`, CSS 69, offline shell v89, loader 263, and `node tests/prioritized-qa-queue.test.js` (nine suites in CI). No Cloudflare Worker or re-OCR required.

## Build 262: Generated EPUB visual preview
- After **Kindle Ready**, choose **Preview generated EPUB** in section 8. Studio builds its actual screenshot-project EPUB **in memory**, then loads the generated chapter XHTML and `EPUB/style.css` from that ZIP into an isolated, script-disabled iframe. This does not save or download the EPUB, nor edit OCR/QA text. The regular **Download EPUB** path remains unchanged.
- Select cover/title or any chapter; navigate with Previous/Next. Preview at phone (360 px), small tablet (640 px) or wider reader (820 px) widths, with scrollable page content. A per-section report counts paragraphs, italic runs, text-message groups, semantic scene breaks and embedded illustrated dividers, with advisory warnings for residual markup/empty sections or duplicated headings.
- The preview uses the actual packaged styling and embeds images only if they occur in the generated EPUB ZIP, using local data URLs. Its iframe has a restrictive content security policy and `sandbox=""` (no script execution, no same-origin access). No remote preview server or worker.
- Supported for **screenshot-to-EPUB projects**. Existing imported-EPUB repair preserves the uploaded package and is not previewed in this build. Preview is diagnostic and cannot guarantee Apple Books/Kindle font substitution, paginated layout, or reading-app compatibility. Export can still project accepted italics; run Kindle Ready first, and verify the actual exported book in a reading app before signing off.
- Build 262 adds `epub-visual-preview.js`, stylesheet 68, loader 262, offline cache v88, and `node tests/epub-visual-preview.test.js` (eight regression suites in CI).

## Build 261: Source-traceable first-pass OCR cleanup
- When **new screenshot pages** are recognized, Studio now runs `ocr-first-pass.js` on the newly reconstructed text **before visual QA**. Fixes are deliberately narrow and deterministic: known internal false periods (`assist. ant → assistant`, `expres. sion → expression`, `resent. ment → resentment`); a tiny set of known split-letter words (`fi rst → first`, `fl owers → flowers`, `fi nally → finally`, `fl oor → floor`); and no-space comma/semicolon between multi-letter words (`said,then → said, then`). The rule set is idempotent and will not generalize to unknown or hyphenated words.
- This **does not run on restored, already-processed, manually edited, or QA-approved pages**. Existing Repair Book / Final Polish remain unchanged. There is no retroactive blanket migration of old books. No new OCR request beyond the user's ordinary OCR run.
- Each real correction is recorded under `page.layoutMeta.ocrFirstPass`; the Review page shows a collapsible `N first-pass OCR corrections` ledger with the exact before/after snippet and rule. The record survives ordinary checkpoint/backup export because it uses the existing `layoutMeta` serialization. Readers should verify source screenshots, especially for names or intentional unusual punctuation.
- Changes to exported EPUB occur only because new OCR text is improved at ingestion, not because the exporter was altered. Uncertain mid-word capitals (`thenShe`), hyphen wraps (`wait- ing`), and drop-cap guesses still require review.
- Loader 261; stylesheet 67; offline cache v87; no Worker. Regression: `node tests/ocr-first-pass.test.js`; GitHub Actions runs seven suites.

## Build 260: Unified Book Audit with two checkpoints
- In **Review → Unified Book Audit**, choose **1 · Scan after OCR** for a non-mutating, full-book queue of chapter/drop-cap warnings, Final Polish paragraph/punctuation/scene-break candidates, residual word-boundary warnings, and empty-text pages. These are leads for visual QA, not validated defects or EPUB blockers.
- Run **2 · Scan after QA** on the same project. It reuses those detectors while respecting the existing visual-QA suppression and ignored Final Polish decisions. It also shows the existing Kindle Ready **fail** checks separately as export blockers and **warn** checks as notes. Regular Kindle Ready remains the authoritative pre-export step and its behavior is unchanged.
- The read-only audit path bypasses the text-synchronizing/italic-projecting side effects of regular Kindle Ready. It scans the current corrected text and never re-runs PaddleOCR, rewrites source pages, saves correction overlays, or changes EPUB output. The after-QA blockers are a snapshot and should be rechecked in Kindle Ready immediately before export.
- Results include source-page buttons, capped per-group examples with accurate total counts, optional JSON export, and an in-session before/after review-lead comparison (a diagnostic, not an automatic QA completion percentage). These new audits are not export gates, and no Cloudflare Worker is needed.
- Regression: `node tests/unified-book-audit.test.js`; all six suites run on GitHub Actions. Production loader 260, CSS 66, cache v86.

## Build 259: Residual OCR word-boundary audit
- **Review → Residual word-boundary review → Scan word boundaries** scans current saved prose for four *advisory* patterns: split fi/fl ligatures (`fi rst`), whitespace after a line-wrap hyphen (`wait- ing`), common prose prefixes glued to an uppercase word (`thenShe`), and missing whitespace after punctuation (`said,then`).
- Each finding shows the exact suspicious text, a *tentative* suggestion, nearby context, and a page-jump button for source-screenshot verification. The optional **Export findings JSON** provides a portable audit snapshot, including counts and flagged snippets. Re-scan after manual edits; the exported snapshot is not a corrections import package.
- Never auto-apply suggestions or overwrite completed QA: ordinary expressions, intentional hyphens, author style, and names can be false positives. This checker is intentionally conservative and cannot find every missing space or merged word. Existing Repair and Final Polish checks remain unchanged. Regression: `node tests/word-boundary-audit.test.js`.

## Build 258: Chapter opening inventory
- In **Review → Chapter opening inventory**, tap **Scan chapter openings** for a read-only list of confirmed chapters and suspected missed chapter starts. Jump directly to any source page.
- Flags are deliberately advisory: possible missing decorative initials (lowercase beginnings), uncertain or absent chapter titles, skipped/repeated numeric headings, missing POV labels (only when the book uses them elsewhere), and chapter headings the detector saw but that are not marked.
- Re-scan after editing; the inventory does not change OCR, drop caps, corrections, EPUBs, or Kindle Ready decisions. Verify all warnings against screenshots. Regression: `node tests/chapter-opening-audit.test.js`.

## Build 257: Source-approved illustrated scene breaks
- **Book info → Illustrated scene breaks** contains a reusable on-device ornament library. Add a tightly cropped PNG/JPG/WebP or crop directly from an *attached source screenshot* using a finger/mouse rectangle and a source page number. The original source screenshot is never changed.
- Artwork is stored as a resized PNG (up to 900×500 pixels, under 800 KB) in an independent local IndexedDB library. It remains available when starting another book **in the same browser**. Each project's selected artwork is separately snapshotted into the OCR project checkpoint and portable OCR backup, so restoring a project doesn't depend on the local library entry.
- Selecting artwork does **not** alter the book. Check **Use this ornament on all confirmed `* * *` scene breaks** and approve the confirmation before it is applied. This is a book-wide choice for books using the *same illustration on all dividers*. For a book with mixed illustration styles, leave the book-wide switch off until per-divider artwork assignments are supported; Build 257 deliberately does not guess which divider gets which picture.
- On export, the single approved PNG is embedded once at `EPUB/images/scene-ornament.png` with a proper OPF manifest image entry, and eligible scene-break paragraphs display it at reflowable reader-friendly dimensions. They retain `data-opal-scene-break="true"`, allowing Opal Reader 1.4.90+ to pause at the image without reading it aloud. Disabled artwork leaves the existing semantic `* * *` text unchanged.
- Only canonical standalone paragraph dividers are candidates. Uncertain OCR blobs, decorative image fragments and prose aren't automatically converted into scene breaks; explicit visual QA remains required. The authorial text, italics, chapter labels, message bubbles, and Chapter POV narrators are never rewritten by this feature.
- **Kindle Ready** reports and blocks invalid/missing enabled artwork, and direct EPUB export enforces the same validation. Screenshot/PNG evidence remains source-authoritative.
- **Regression tests:** `node tests/scene-ornaments.test.js`, `node tests/message-bubbles.test.js` and `node tests/reader-ready-export.test.js`.
- No Cloudflare Worker. No re-OCR. Existing EPUBs and original screenshots are not mutated. On-device visual verification in Apple Books/Reader remains required before a book is signed off.

## Build 256: Reviewed message bubbles
- Review any OCR page and expand **Text bubbles** beneath the source screenshot/editor. Only likely messages are shown initially; toggle **Show every paragraph** for unusual message layouts.
- Source-backed all-caps sender labels (for example RANDY/LILY) produce suggestions. The **Mark labeled messages** action proposes **blue outgoing** for the current chapter POV and **gray incoming** for other printed senders. No suggestions are committed without explicit confirmation; either side can be changed manually.
- Optional **Move preceding label above bubble** preserves the *printed label* exactly once, above its bubble. Its EPUB label is nonspoken (`data-opal-narration="skip"`). The actual message is kept in a normal `<p>`, so Opal Reader speaks it in the original **chapter narrator's** voice. No per-sender voice changes.
- Message styles are annotations separate from authoritative page text. They are preserved in IndexedDB checkpoints and portable OCR backups, survive a normal reload, and export as XHTML + Kindle-compatible CSS. Source wording, punctuation, italics and existing scene artwork are not changed.
- Exact paragraph + occurrence anchors prevent arbitrary assignment drift. If editing/repair changes a marked paragraph or preceding label, **Kindle Ready reports a blocker and EPUB export refuses to proceed**, naming affected pages. The reviewer can re-mark or clear unmatched annotations.
- **Regression:** `node tests/message-bubbles.test.js` and `node tests/reader-ready-export.test.js`.
- No OCR rerun, Cloudflare Worker, or change to existing imported book files is required. The new styles apply when exporting *new* screenshot-based projects; existing imported-EPUB byte-preserving repair remains separate.

## Build 255: Reader-aware EPUB export (Pucked Over follow-up)
- Scene-break paragraphs remain visible as `* * *` but now carry `data-opal-scene-break="true"`. Opal Reader v1.4.90+ inserts a brief non-spoken scene pause at those dividers instead of narrating three asterisks or merging straight across them.
- The existing `data-opal-pov` metadata remains chapter-wide. Text messages retain the chapter narrator's voice, with no sender-based voice switching.
- Kindle Ready reports incomplete chapter POV casting as a **warning** if any narratable section has a narrator and others do not. Books without individual POV labels remain valid.
- Adds no-browser regression checks in `tests/reader-ready-export.test.js`. Run `node tests/reader-ready-export.test.js`.
- No OCR data, recognized text, imported QA, dropcaps, source images, or previously exported EPUB is altered. No Cloudflare Worker.

### Next book-polish steps (not part of Build 255)
1. **Text-message bubbles:** source-verified sender and grouping metadata, styled blue/gray bubbles in EPUB. Do not infer an author/sender just from pronouns; require review for ambiguous messages.
2. **Illustrated scene breaks:** optional user-chosen reusable ornament/image on semantic dividers. Never guess that a screenshot ornament is prose or automatically embed unauthorized guesses.
3. **Heading & drop-cap QA:** pre-export chapter-start inventory compared against source page labels, including Prologue/Epilogue and detached initials.
4. **Readability QA:** catch residual cross-item splits, broken word joins, and odd quote/paragraph structures without rewriting verified print text.

## Build 253
- Exported title pages now carry `data-opal-narration="skip"` on the visible title-page section. The title and author remain in the EPUB exactly as before, but Opal Reader can treat that page as display metadata instead of narration.

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


2.7.13 Compact EPUB Repair: the existing-EPUB repair area is now collapsed by default behind a compact native disclosure, preserving all repair/import behavior while reducing top-of-page visual weight.


2.7.14 Kindle Ready: adds permanent section 8 between Advanced and Export. Preflight checks book text, metadata, cover, chapter navigation, unresolved Repair/Polish items, italic marker balance, scene breaks, and the reflowable Kindle-safe EPUB structure. Export is now section 9. No Kindle Ready check changes book text.


2.7.15 Polish Review Restored: restores the Review polish drawer directly under Final Polish and keeps Final Polish audit stage-owned by removing outstanding Repair Book ligature/dropcap rows from its audit.


2.7.16 Kindle Typography + TOC: exported EPUB body paragraphs now use novel-style first-line indents with no extra paragraph spacing, while first chapter paragraphs and paragraphs after scene breaks remain flush-left. Pre-chapter OCR text stays in the spine but no longer gets a fabricated “Opening” TOC entry unless it actually resembles front matter, in which case it is labeled Front Matter.


2.7.17 Metadata + Title Filename: screenshot-project title and author are saved in/recovered from the OCR checkpoint, and screenshot EPUB exports now use the sanitized Book Title directly as the .epub filename (for example, In Her Own League.epub).


2.7.18 Atomic Repair State: repair actions now update both canonical page text and the open Review editor atomically so a later sync cannot overwrite a completed fix. Repair/Polish dismissals persist in checkpoints. Kindle Ready invalidates stale results after a repair and always recalculates from current repaired text. Rerunning Repair Book preserves already repaired paragraph text instead of rebuilding it again from original OCR geometry; Paragraph Reconstruction remains available explicitly under Advanced.


2.7.19 Stage-Owned Readiness: Repair Book is now the single source of truth for unresolved repair state. Kindle Ready consumes the same canonical Repair review state instead of independently rediscovering repairs. Split-ligature Keep as-is decisions now use stable context-based identities and migrate v2.7.18 index-based checkpoint decisions so resolved candidates do not resurrect when earlier text shifts.


2.7.20 Exact Ligature Resolution: keeps Repair Book as the canonical readiness source, but removes the broad legacy ligature-decision migration that could hide distinct split-ligature candidates. Keep-as-is now fingerprints one exact occurrence using page + original/joined text + exact normalized surrounding context. v2.7.18 compatibility is accepted only when the old character index still matches; v2.7.19 context decisions are matched exactly.


2.7.21 Ligature Evidence Filter: split-ligature review is now evidence-first. Ordinary word boundaries ending in ff/fi/fl (for example off the, off doing, off personal) are no longer surfaced as uncertain ligatures. Plausible dictionary joins remain auto-repaired; review is reserved for rare plausible joins blocked only by capitalization.


2.7.22 Dropcap Rerun Preserve: fixes the root cause of repaired dropcaps reappearing. Auto Italic Scan no longer rebuilds canonical repaired text from original geometry on a subsequent Repair Book run. Dropcap Rescue also rechecks the current page opening before surfacing a candidate. Manual Open-page corrections and previously accepted dropcap repairs therefore survive reruns. The 2.7.21 ligature evidence filter is unchanged.


2.7.23 Spoiler-Safe Review: Guided Repair dropcaps can now be corrected directly in Review repairs with an inline editor. Final Polish quote issues can be edited in-place by paragraph; Open page is optional. Quote audit reconciles odd quote counts split across adjacent page boundaries before surfacing warnings. Advanced is now collapsed by default.


2.7.24 Full-Book Repair Audit: Repair Book now accounts for every marked chapter start before it can report Done. Dropcap Rescue records expected/evaluated/missed chapter-start counts, Repair Book stops if coverage is incomplete, and the status pill reports both review count and chapter coverage. Kindle Ready surfaces the same dropcap scan coverage. Final Polish now treats known text-message speaker labels such as ME, YOU, SABRINA, and TUCKER as structure rather than suspicious short paragraphs.


2.7.25 Chapter Guided Repair: adds a compact Whole book / Chapter by chapter mode directly beside Repair Book. Chapter mode shows unobtrusive previous/next chapter controls, persists the current chapter, scopes safe cleanup, split-ligature repair, Dropcap Rescue, and Review repairs to only that chapter, and avoids whole-book paragraph/italic rebuilds so other repaired chapters remain untouched.


2.7.26 Dropcap Lowercase Rule: any marked chapter opening whose first prose word begins lowercase is now always surfaced as a Dropcap Rescue review item. If a detached capital can be inferred, Studio proposes it; otherwise the inline Guided Repair editor shows the damaged opening unchanged for manual correction. This catches full-book cases such as s this..., eese..., o you..., ey there..., and hen... that were previously suppressed by dictionary-only heuristics.

2.7.28 Strict Chapter Detection: chapter starts now require structural heading evidence near the top of the page. Removed broad matching of the word chapter anywhere in opening prose and loose number-start rules. Full OCR rebuild re-detects automatic chapter markers and clears stale automatic titles before Guided Repair.

2.7.29: Re-detect chapter starts from existing saved OCR without rerunning OCR. Clears stale chapter-derived Repair/Polish state.

2.7.31: Strict chapter detection now tolerates OCR confusion in short top-of-page decade headings (10/20/30, including O-for-0 and I/l-for-1) and up to two OCR-character errors in short EPILOGUE headings. Re-detect Existing Chapters remains available and does not rerun OCR.

2.7.32: Restores existing Final Polish review items into Guided Repair after reload/update. Polish run state is persisted; restoration performs audit only and does not reapply text fixes.

2.7.33: Guided Repair now verifies dropcap corrections actually modify current page text before resolving the review card. Uses current-text fallback when paragraph indexes are stale, checkpoints immediately, and leaves failed corrections open.

2.7.34 Durable Repair Save: repaired page text is now written immediately to a compact, verified repair-overlay store in addition to the large OCR checkpoint. On reload/checkpoint recovery the repair overlay is reapplied last, so an older or unsaved full checkpoint cannot resurrect pre-repair text. The overlay is cleared only by an explicit OCR restart/clear.

2.7.35 Geometry Dropcap Rescue: Dropcap Rescue now searches saved PaddleOCR line geometry for detached single-capital glyphs near the first prose line of each marked chapter. Strong geometry can reconstruct unknown initials such as I+s → Is, D+o → Do, R+eese → Reese, and H+ey → Hey without relying on a word dictionary. Geometry evidence is conservative: unknown initials require strong nearby/left-of-text support. Durable repair persistence from 2.7.34 is retained.

2.7.36 Fail-Soft Geometry: Geometry Dropcap Rescue now sanitizes saved Paddle box values and traps all geometry errors per chapter opening. Missing, malformed, or stale geometry returns null and automatically falls back to the proven text-based Dropcap Rescue path instead of stopping Repair Book. Durable repair persistence from 2.7.34 remains intact.

2.7.37 Repair Diagnostics: Guided Repair now reports the exact stage that stops and surfaces the runtime error directly under Repair Book. Added a compact Geometry assist checkbox; ON tests the new Paddle-geometry Dropcap Rescue, OFF runs the proven text-only detector path. This diagnostic switch changes only candidate reconstruction, not OCR text or saved repairs.

2.7.38 Paragraph Rebuild Fix: removes an invalid `restored` reference accidentally inserted into rebuildParagraphsFromSavedGeometry. Guided Repair can now pass the paragraph-rebuild stage and continue into italics, cleanup, ligatures, and Dropcap Rescue. Repair diagnostics and Geometry assist remain available.

2.7.39 Raw Dropcap Detections: Geometry-assisted Guided Repair now hydrates and saves unmerged PaddleOCR detections for marked chapter-start pages only. Dropcap Rescue searches those raw boxes before reconstructed layout lines, allowing decorative initials that were lost during same-row/paragraph reconstruction to be recovered. Existing projects do not need a full 204-page OCR rerun; Repair Book obtains raw detections only for chapter starts. Raw detections persist in the checkpoint for later runs.

2.7.40 Dropcap Token Diagnostics: unresolved dropcap cards now include a collapsed Raw Paddle diagnostic. It shows the raw OCR token matched to the damaged opening, nearby raw tokens and their box coordinates, and labels single-capital, left-side, and tall tokens. Diagnostic-only; repair behavior is unchanged.

2.7.44 v2.7.40 + Status + Quote Fix:
- Based directly on v2.7.40, before all chapter-start OCR persistence experiments.
- Guided Repair / Final Polish progress appears in Section 6 with stage percentages.
- Italics shows page N/total; Dropcap re-OCR shows chapter N/total and page number.
- Quote audit normalizes straight and curly double quotes.
- Fixes v2.7.40's Final Polish undefined pageIndexes bug.
- No chapter-start OCR persistence or migration logic is included.

2.7.46 Quote Review Workflow
- Direct v2.7.44 base; v2.7.45 dialogue parser discarded.
- v2.7.44 quote detector unchanged.
- Quote cards show previous, flagged, and next paragraphs.
- Apply edit saves corrected text immediately.
- Looks correct saves a small stable issue key immediately.
- No chapter/raw OCR persistence and no Dropcap Rescue changes.

2.7.47 Durable Manual Edits:
- Section 5 OCR textarea edits now save the edited page immediately into the existing compact repair overlay on every input and again on change/blur.
- syncCurrentEditor uses the same durable overlay before navigation, Repair, Polish, or export.
- The full whole-book checkpoint is still saved, but manual text persistence no longer depends on that large save succeeding.
- On reload, the repair overlay is already reapplied last, so manual chapter-QC corrections override older checkpoint text.
- Quote review workflow from v2.7.46 is unchanged. No chapter/raw OCR persistence was added.

2.7.48 Manual Edits Win Last
- Guided Repair reapplies the durable manual-page overlay immediately after chapter-start re-OCR and before Dropcap Rescue.
- Guided Repair reapplies manual overlays again after automatic dropcap work and before the final checkpoint.
- Explicit precedence is now OCR < automated Repair < user manual edits.
- Existing v2.7.47 manual corrections should return automatically after Guided Repair instead of needing to be redone.

### 2.7.49 QA Pattern Hardening
- Uses the full-book visual QA findings to repair three source-safe recurring Paddle patterns automatically: stray apostrophes before closing quotes, spaces before closing quotes, and dropped capital `I` in paragraph/dialogue-opening contractions.
- Final Polish now audits prose paragraphs ending in a bare letter/number for the systematic missing-final-period failure. These are review-only because punctuation is never invented without source confirmation; each item has **Add period**, **Looks correct**, and **Open page** actions.
- Guided Repair chapter mode now correctly limits safe cleanup to the selected chapter.
- Manual Review edits remain authoritative and are reapplied last.


2.7.50 REGRESSION HARDENING
- Restores the persistent Manual Page Lock from 2.7.49 while retaining QA Pattern Hardening.
- Adds high-confidence one- and two-word italic-run detection to address the dominant IHOL regression family.
- Adds Final Polish review for false period-inside-word boundaries such as `resent. ment`, `expres. sion`, and `assist. ant`.
- Adds geometry-based review warnings for likely lost scene-break ornaments when a large internal page gap has no semantic scene marker.
- Adds safe cleanup for `I'1l`-style digit/l contractions, spaces after opening quotes, and missing spaces after closing dialogue quotes.
- Keeps missing terminal punctuation review-only and preserves manual edits as authoritative text.

2.7.51 QUOTE BOUNDARY DRIFT
- Adds a review-only audit for paragraphs whose quote count is balanced but whose opening quote may have migrated ahead of a narrative action sentence during OCR/reconstruction.
- Uses saved OCR line geometry as the strongest evidence; a conservative action-verb fallback catches known cases when geometry is incomplete.
- Adds a one-click “Move opening quote” action plus the existing editable paragraph review. Nothing is moved automatically.
- Quote-boundary edits are persisted as manual page authority so later reconstruction cannot overwrite them.

2.7.53 FINAL POLISH QUOTE LEFT-SHIFT
- Safely normalizes the recurring OCR/reconstruction shape `Isaiah laughs." Range...` to `Isaiah laughs. "Range...` when the first sentence is a conservative narrative-action lead.
- Fixes the upstream safe-cleanup rule that was itself collapsing valid `sentence. "Dialogue` boundaries into `sentence." Dialogue`; closing-quote whitespace cleanup now requires closing-quote context.
- Handles the companion closing-quote OCR error in the same pattern (`Really?'` -> `Really?"`) only after a confident boundary shift.
- Runs during safe cleanup before quote review, so repaired paragraphs no longer return as misleading quote-balance cards.
- Keeps ambiguous quote placement review-only; this does not broadly rewrite balanced dialogue.



2.7.54 PERSISTENCE + BARRIERS
- Italic geometry evidence is projected onto the authoritative repaired page text instead of rebuilding text from OCR geometry. Existing manual italic spans are preserved and accepted formatting is saved to the durable repair overlay.
- Manual Mark selection italic / Remove italic marks decisions are durable manual-page authority.
- Opening-quote left-shift patterns such as `Isaiah laughs.\" Range...` are review-only and now surface in Final Polish instead of being silently normalized. The audit also covers mid-paragraph shifts, not only paragraph-leading drift.
- Semantic scene breaks are hard barriers during cross-page EPUB paragraph joining, preventing a scene divider from being swallowed into adjacent prose.
- User-confirmed Repair/Polish edits (dropcaps, ligatures, false-word joins, scene breaks, terminal periods, paragraph merges) are saved as durable authoritative overlays.
- Automatic safe-polish changes are mirrored into the durable overlay so later repair stages cannot resurrect stale pre-polish text.

2.7.55 ITALICS AUTHORITY
- Hardened accepted italic projection so repaired wording no longer has to match an entire original OCR line before emphasis can survive.
- Accepted italic runs now fall back to direct ordered phrase matching against authoritative repaired page text.
- Kindle Ready and EPUB export perform a final italic-evidence projection pass immediately before counting/serialization.
- Manual italic markers remain authoritative and are unioned with automatic accepted evidence.


2.7.63 ITALICS CALIBRATION
- Fixes the actual regression root cause: the scanner was accepting only one italic run before export, rather than export dropping accepted runs.
- Replaces the overly strict early word gate with a permissive geometry candidate pass followed by font-adaptive relative run classification.
- Restores automatic one- and two-word emphasis when it is typographically distinct from nearby roman text.
- Full-line italics now require relative evidence against surrounding body lines, specifically preventing naturally slanted roman text from becoming a persistent false positive.
- Retains the 2.7.55 final authority projection immediately before Kindle Ready and EPUB serialization.


## v2.7.63 — Italics Precision Recovery

Tightens automatic italic classification after the nine-chapter regression export produced 736 emphasis runs for a corpus with 82 source-supported runs. Weak projected-word slant no longer seeds runs; short runs require strong agreement against both same-line roman text and surrounding lines; common one-word function words are not auto-marked. The working detection-to-export path from v2.7.56 remains intact.


## v2.7.63 — Italics Calibration

Calibration build after the nine-chapter regression corpus produced 736 automatic emphasis runs in v2.7.56 and 15 in v2.7.57 against 82 source-confirmed runs. The detector now uses typography-only confidence tiers rather than a common-word blacklist, moderately reopens candidate geometry, requires strong dual-context evidence for single-word emphasis, allows two-word emphasis through calibrated local/surrounding contrast, and tightens full-line emphasis so it cannot pass without surrounding-line evidence. Italics persistence/export behavior remains unchanged.


## v2.7.63 — Ink-aligned italics

Replaces character-count-projected word boxes in the automatic italics scanner with image-ink-aligned word boxes when the line image can be segmented reliably. The previous projection assumed uniform character widths, which could clip glyphs or include neighboring glyphs and manufacture false slant/gain evidence. The scanner now uses the actual dark-pixel column structure of each OCR line to align word geometry, merging only the smallest internal gaps to match the OCR token count and falling back to the old projection when segmentation is ambiguous. Detection thresholds from v2.7.58 and the working export/persistence path remain otherwise unchanged.


## v2.7.63 — Italics Consensus Guard

Precision follow-up to v2.7.59. The ink-aligned word boxes and working
formatting/export path are unchanged.

- One-word automatic italics remain supported, but now require exceptionally
  strong same-line and surrounding-line evidence.
- Full-line italics now require word-level directional consensus in addition to
  aggregate line slant/gain, targeting roman-line silhouette false positives.
- Two-word and longer inline-run thresholds remain at v2.7.59 values so the
  detector does not collapse back toward the under-detection seen in v2.7.57.


## v2.7.63 — Italics Lifecycle + Boundary Recovery

- Runs automatic italics immediately after a full OCR batch, so pre-Repair and post-Repair EPUB exports share the same formatting state.
- Repairs diagnostics metadata so the JSON reports the actual runtime build and current thresholds.
- Preserves the v2.7.60 precision guard, including the full-line consensus check.
- Adds one-word edge expansion around already accepted inline runs when adjacent typography agrees strongly, improving recall for clipped source-supported phrases without lowering core detection thresholds.


## v2.7.63 — Italics Context Consensus

- Keeps v2.7.61 immediate post-OCR italics commit and export behavior unchanged.
- Tightens isolated one-word italics with local-neighborhood consensus.
- Requires a strong anchor word for two-word italic runs.
- Allows accepted runs to expand up to two words per side when edge typography
  strongly agrees with the accepted run.
- Leaves the full-line consensus guard unchanged.


## v2.7.63 — Italics Expansion Safety

Surgical follow-up to v2.7.62.

- Core italics detector thresholds are unchanged.
- Immediate post-OCR commit / before-Repair export behavior is unchanged.
- Boundary expansion now requires each added edge word to independently qualify
  as an italic candidate with its own minimum score/slant/gain.
- This prevents accepted runs from pulling flat roman neighbors into italics.
- Diagnostics runtime build metadata is corrected for this build.


## v2.7.64 — CloudLibrary / Iowan production profile
- Adds explicit source profiles so CloudLibrary/Iowan and Kindle/Georgia can evolve independently instead of sharing every renderer-specific assumption.
- Makes CloudLibrary + Iowan Old Style the current production-first profile.
- Crop preview now starts on a representative mid-book page and has Previous/Next sample controls, avoiding misleading chapter-opening geometry.
- Extends decorative-initial cleanup so a semantic initial restored from raw geometry can consume one duplicated standalone decorative glyph in the reconstructed paragraph.
- Keeps italic persistence/export unchanged; the multi-font corpus showed the remaining italics problem is detection, not serialization.


## v2.7.65 — CloudLibrary / Iowan reconstruction

- Orders same-row Paddle fragments by visual x-position before joining, preventing detached punctuation from migrating to the start of a line.
- Keeps oversized decorative drop-cap glyphs out of normal same-row text merges.
- Adds a syntax-aware continuation guard so an indented OCR continuation line does not become a false paragraph after words such as `and`, `but`, `because`, or punctuation that clearly continues a sentence.
- Expands CloudLibrary chapter-opening rescue for Iowan Old Style, including `ou` → `You`, `few days after` → `A few days after`, detached decorative-glyph removal, and conservative restoration of a lost opening dialogue quote when a closing quote + attribution proves the paragraph begins in dialogue.
- Leaves the conservative Iowan italic acceptance thresholds unchanged in this build; the current screenshots show true italic text can be nearly geometry-indistinguishable from roman text, so lowering thresholds here would trade missed italics for known false positives.

## v2.7.66 — CloudLibrary dropcap ownership

- Adds geometry-backed ownership for composite CloudLibrary/Iowan chapter openings such as `“S he's...` and `“Y ou...`.
- A tall left-side decorative capital is now treated as one logical character with the adjacent lowercase remainder before Dropcap Rescue decides whether a review is needed.
- Preserves article/pronoun spacing for openings such as `A few days...` so semantic initial recovery cannot create `Afew`.
- Keeps this behavior scoped to the CloudLibrary / Iowan production profile; Kindle/Georgia is unchanged.
- Leaves paragraph-continuation and italics thresholds unchanged from v2.7.65.


## v2.7.67 — CloudLibrary quoted dropcap ownership

- Applies quoted decorative-initial ownership directly to chapter-start text before Dropcap Rescue review generation.
- Geometry-backed `“S he…` and `“Y ou…` shapes are now normalized to `“She…` and `“You…` without requiring a review card.
- Keeps the existing paragraph continuation and italic thresholds unchanged.


## v2.7.68 — CloudLibrary geometry-stage dropcap assembly

- Moves CloudLibrary/Iowan decorative-initial ownership into geometry-to-line assembly.
- Tall quoted initials such as `“S` + `he's…` and `“Y` + `ou…` are merged before paragraph reconstruction.
- Preserves whole-word decorative initials such as `A` + `few…` as `A few…`.
- Leaves the improved paragraph-continuation logic and italics thresholds unchanged.


## Build 224 — Combined QA + Opal POV metadata
- Imports cumulative chapter-QA checkpoints alongside the legacy typography-only annotation format.
- Applies high-confidence text replacements, authoritative cross-page boundary decisions, and confirmed italic segments without re-running OCR.
- Persists chapter-level POV metadata from `chapter.pov` and exports it on chapter XHTML as `data-opal-pov="…"`.
- Opal-specific POV metadata is non-visible and safe for other EPUB readers to ignore.
- QA boundary decisions override the geometry-only cross-page join heuristic; unsupported future structural-operation shapes are reported instead of silently guessed.


## Build 225 — Transactional authoritative QA import
- Treats completed cumulative chapter QA as authoritative for chapter starts and every reviewed page boundary.
- Unlisted page boundaries inside a reviewed chapter default to `keep_separate`; explicit `merge_across_pages` operations override that default.
- Supports structural corrections targeted by either `itemId` or multi-line `itemIds`, using the raw OCR item sequence to disambiguate repeated matches.
- Honors typography-segment `finalText` after structural text repair, with original `matchText` as a fallback.
- Combined QA import now runs transactionally on a working copy. Any structural or italic conflict blocks the entire import and leaves the live OCR project unchanged.
- Validates the QA source page count before applying corrections.


## Build 226 — Stable-item anchored QA matching
- Resolves cumulative QA text corrections against the stable raw OCR item IDs first, rather than relying on page-wide literal text.
- Treats smart/straight quote variants, OCR/JSON quote-escape artifacts, and whitespace/line-wrap differences as equivalent for targeting while preserving exact replacement intent.
- Recognizes corrections already present in reconstructed page text as verified no-ops instead of import conflicts.
- Uses full raw OCR line context to disambiguate repeated fragments such as `fi re` on the same page.
- Import remains transactional: any unresolved correction still blocks the entire combined QA import.


## Build 227 — Remaining QA normalization + visible conflicts
- Normalizes smart/straight quote variants, dash glyph variants, spaced ellipses, layout-only spaces around punctuation, hyphenated line-wrap spacing, and common split-fi OCR artifacts during QA targeting.
- Keeps stable OCR item anchoring and transactional all-or-nothing import behavior.
- On a blocked QA import, prints the structural conflict table and includes the conflict operation IDs directly in the visible status message.


## Build 228 — Authoritative backup restore
- Explicit OCR backup import now bypasses the durable repair overlay while loading the selected backup.
- After a successful backup match, stale local checkpoint and repair-overlay data are cleared before the restored backup becomes the live project.
- Automatic browser recovery still reapplies the repair overlay for ordinary sessions; only deliberate backup import is treated as sovereign.
- This fixes cases where a 204-page backup appeared fully restored while older browser edits silently overwrote text on a subset of those pages.


## Build 229 — Page-snapshot QA application
- Resolves every text correction on a page against the untouched restored page snapshot before applying any edits, then commits non-overlapping changes from the end of the page backward.
- Prevents multiple QA corrections on the same OCR line from invalidating one another's stable-item anchors.
- Adds neighboring raw OCR line anchors and conservative stable-item position fallback for repeated fragments.
- Preserves existing smart-quote glyphs when a QA correction changes nearby punctuation, so structural fixes do not flatten surrounding typography.
- Detects overlapping text corrections as a hard transactional conflict instead of guessing.
- Retains Build 228's authoritative explicit-backup restore behavior and all-or-nothing combined-QA import.


## Build 230 — Reconstructed-boundary QA recovery
- Recovers QA corrections when paragraph reconstruction previously removed a screenshot line-ending hyphen or dash and fused the surrounding text (for example `spicy-smelling` becoming `spicysmelling`, or `people— including` becoming `peopleincluding`).
- Uses stable OCR item anchors and conservative item-position checks for these boundary repairs rather than broad fuzzy matching.
- Derives each italic segment's post-structural wording from text corrections attached to the same stable OCR item, so italics remain locatable after typo/punctuation repair even when the QA segment has no explicit `finalText`.
- Retains Build 229 page-snapshot application, quote-style preservation, transactional import, and Build 228 authoritative backup restore.


## Build 231 — Nested quote preservation
- Fixes Repair Book safe cleanup so legitimate nested single-quoted titles/emphasis keep their closing apostrophe inside dialogue (for example `“'She Blinded Me With Science.'”`, `'Tainted Love.'`, and `'help.'`).
- The legacy apostrophe-plus-double-quote OCR cleanup now runs only when the paragraph has no plausible opening single quote before the candidate.
- Leaves Build 230 QA import behavior, authoritative typography, page boundaries, chapter POV metadata, and visible chapter text unchanged.


## Build 232 — Visual-QA authority for Final Polish
- Successful cumulative chapter-QA import now records a compact baseline of source-inspected Final Polish conditions on the pages covered by that QA.
- Final Polish suppresses quote, punctuation, wrap, scene-gap, and fragment warnings that match the completed visual-QA baseline, while still surfacing conditions introduced or changed after QA.
- Baseline matching is page- and issue-type-specific, quote/dash/ellipsis tolerant, and survives paragraph continuation merges without storing a second full copy of the book text.
- The baseline is saved in OCR checkpoints/backups and cleared on a fresh OCR restart.
- Final Polish reports a green Visual QA authority row showing how many source-approved conditions were suppressed.


## Build 233 — QA re-import through italic markers
- Fixes cumulative QA re-import after a post-QA backup has already stored authoritative italic markers.
- Structural replacements that are already present but interrupted by internal `[[i]]…[[/i]]` markers are now recognized as verified no-ops instead of false conflicts.
- The fallback is intentionally read-only: it can only prove a replacement is already present and cannot apply a correction using marker-stripped offsets.
- This unblocks Build 232's visual-QA baseline capture without weakening transactional QA import safety.


## Build 234 — Idempotent additive QA + Unicode heading ellipsis
- Makes cumulative QA re-import idempotent when a correction adds punctuation that leaves the original match text visible inside the corrected phrase, such as adding a final dialogue quote.
- The already-correct shortcut requires both the source and full replacement to resolve to the same stable item anchor, requires the replacement to be additive, and requires its matched range to contain the shorter source range.
- Deletions, shortenings, unrelated occurrences, and unanchored page-wide matches do not use this shortcut; transactional import behavior remains unchanged.
- Treats Unicode ellipsis (`…`) as a valid character in uppercase structural headings, so source-faithful headings such as `ADRIAN … AGAIN` stay out of prose-only terminal-punctuation and short-paragraph audits.
- Visible chapter heading text and `chapterPov` metadata remain source-faithful.


## Build 235 — Anchored additive self-heal + shared structural audit
- Detects a previously over-applied additive QA correction only when the authoritative full replacement and the duplicated punctuation suffix resolve at the same stable OCR-item anchor.
- Repairs that anchored over-application back to the exact QA replacement instead of treating the shorter valid replacement substring as an already-correct no-op.
- Keeps the repair deliberately narrow to short punctuation-only additive suffixes; it is not a general page-wide quote or punctuation deduper.
- Paragraph-fragment auditing now calls the shared `isStructuralBlock()` classifier instead of maintaining a second uppercase-heading regex.
- As a result, Unicode-ellipsis headings such as `ADRIAN … AGAIN` are excluded consistently from both terminal-punctuation and short-paragraph audits without rewriting their visible text or POV metadata.


## Build 236 — Decorative scene-marker review
- Adds a review-only Final Polish audit for extremely short standalone OCR tokens that are narrow, centered in the saved source geometry, vertically isolated, and positioned between normal prose paragraphs.
- These candidates are intended to catch decorative scene-break ornaments that Paddle rendered as bogus text such as `1MC`, without hard-coding that literal token or auto-converting arbitrary short text.
- Decorative-marker candidates cannot be passively suppressed by the cumulative visual-QA authority baseline; they require an explicit user decision.
- Review actions are **Convert to scene break**, **Keep as text**, and **Open page**. Conversion stores the canonical `* * *` scene marker that exports as a semantic EPUB separator.
- A decorative-marker candidate is excluded from the generic short-paragraph audit so one source condition does not create duplicate review cards.
- Kindle Ready remains blocked while any unresolved decorative-marker candidate is present, with the Polish Review row explicitly naming that candidate class.


## Build 237 — Screenshot-free project restore + IndexedDB checkpoints
- OCR backups can now reopen a Book OCR Studio project without first selecting the original screenshots.
- Complete backups restore text, saved word/line geometry, chapter metadata, POV tags, QA authority, Repair/Polish state, and downstream EPUB/TXT workflow immediately.
- Partial backups also restore without screenshots. Studio clearly marks OCR as incomplete and keeps OCR continuation disabled until the original full screenshot batch is attached.
- Selecting screenshots while a detached backup project is open now means **attach sources**. Studio validates the saved filename/signature identity and reconnects the File objects without resetting restored text or metadata.
- Source-image-only controls are disabled while screenshots are detached; Review shows a source-placeholder while text editing and geometry-based downstream work remain available.
- Full automatic project checkpoints moved from localStorage to IndexedDB. Legacy localStorage checkpoints remain readable for migration and are removed after a verified IndexedDB write succeeds.
- Each completed OCR page waits for its IndexedDB checkpoint commit before batch OCR advances, so a reported saved page has crossed a real durability boundary.
- On startup, Studio can recover the latest IndexedDB project without screenshots. If that project is partial, attaching the original screenshot batch resumes OCR at the next unprocessed page.
- Portable JSON OCR backups remain user-controlled safety copies and do not embed screenshot pixels.


## Build 238 — Production UI cleanup
- Freezes Build 237 persistence/restore behavior and makes no OCR, QA, Repair, Final Polish, italic-detection, POV, or EPUB-serialization logic changes.
- Simplifies the visible production path to Book Info → Screenshots → Crop → OCR/QA → Review → Guided Repair/Final Polish → Kindle Ready → Export.
- Moves restart/legacy typography inspection controls behind **More OCR / recovery tools** instead of presenting them beside the normal OCR actions.
- Moves page re-OCR and chapter re-detection behind **Page & recovery tools** in Review.
- Keeps Whole Book + Geometry Assist as the normal Repair configuration while moving chapter-by-chapter and geometry switches behind **Repair options**.
- Moves the full Italic Review & Learning laboratory into a nested **Italic research & learning** disclosure inside Advanced; no training data or research code is removed.
- Moves offline Roman Residual / Neural Italic N1 experiments out of the top of the app into a bottom **Lab / offline experiments** disclosure so those tools remain available without an OCR project.
- Removes duplicated Review/Guided Repair presentation labels and de-emphasizes destructive **Reset learning** styling.
- Reduces screenshot thumbnail clutter to eight previews by default, with an explicit expansion control that retains the previous 40-thumbnail ceiling.
- Successful Final Polish audits collapse to a compact summary such as **0 review · checks passed**; warnings/review items expand the detailed audit automatically.
- Removes a duplicated `visualItalicStatus` DOM reference plus unused `state.worker` / `WORKER_RECYCLE_EVERY` remnants.


## Build 239 — New-book escape from automatic recovery
- Fixes the case where a hard reload auto-restores the last IndexedDB OCR project and then treats a genuinely new screenshot batch only as an attempted source reattachment.
- Matching screenshots still reconnect to the restored project exactly as Build 237 intended, with no OCR reset.
- A mismatched screenshot batch now prompts to **start a new book**. Cancel keeps the recovered project untouched; confirm clears only browser recovery state for that old project and loads the new screenshots.
- Exported OCR backup files are never modified by starting a new book.
- Starting a fresh screenshot batch clears stale chapter-memory identity and writes the new source signature to IndexedDB immediately, so another reload cannot resurrect the unrelated previous project before page 1 is OCRed.
- Adds `PROJECT_STATE.md` as the repo-first continuity file for fresh development threads.


## Build 240 — Self-describing QA packages + across-room OCR notices
- Typography Test ZIP exports now include `QA-INSTRUCTIONS.md` in addition to `typography-map.json` and source screenshots.
- The embedded QA instructions define screenshot pixels as authoritative and require a pixel-by-pixel pass for typography, OCR text, punctuation, paragraph/quote structure, page boundaries, scene breaks, chapter metadata, and stable-ID anchoring.
- QA is explicitly **one chapter at a time** unless the user says otherwise.
- The returned QA file must remain **cumulative**: each new chapter is appended to the same `book-ocr-studio-cumulative-chapter-qa-checkpoint-v1` JSON while earlier completed chapters are carried forward.
- The instructions document the importer-compatible shapes for `replace_text`, `merge_across_pages`, boundary audit decisions, confident italic spans, uncertain spans, chapter headings, and POV metadata.
- Users can add book-specific notes in chat, such as whether the book has POV labels, chapter titles, special layouts, or unusual scene-break ornaments.
- Successful batch OCR now opens a large persistent **OCR COMPLETE** modal intended to be visible from across the room.
- Failed/stopped OCR now opens a large persistent **OCR STOPPED** modal so the user can see that Studio needs attention without reading the status line.
- Both notices remain visible until dismissed; failure details still preserve the existing page-level recovery status underneath.
