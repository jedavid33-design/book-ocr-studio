# Book OCR Studio · AI QA Bake-off (Build 266, pilot originated in 264)

## Purpose
Audition a vision model against previously human-verified source screenshots before enabling any live-book AI corrections.

The current pilot uses **Pucked Over, Prologue plus Chapters 1–4 (41 pages)**. The private dataset is deliberately split:
- `Pucked_Over_Benchmark_Blind_Prologue_Ch1-4.zip` contains 41 JPEG screenshots and 894 OCR correction-or-control snippets, but NO corrected EPUB or gold answers.
- `Pucked_Over_Benchmark_Reference_Prologue_Ch1-4.zip` contains the human-reviewed gold JSON, the polished EPUB, and a local Python scoring script. This ZIP **must never be sent to OpenRouter**.

The old *source archive* included `IMG_5761.PNG` as a cover. It is omitted from the blind benchmark: `p0001` = `IMG_5762.PNG` (Prologue), and `p0006` = `IMG_5767.PNG` (Chapter 1). Uploaded Studio screenshots for this benchmark should not include the cover.

**Caveat:** the 894 anchors are excerpts from the completed QA replacement records, not the complete unpolished OCR page text. The benchmark cannot yet measure missed errors in lines without anchors, nor prove whole-book 100% correctness or reflow/formatting compatibility. 853 are saved corrections; 41 are unchanged controls. Most of the 853 are typography/quote normalization. Studio reports substantive OCR fixes separately from typography.

## What Build 264 includes

**Review → AI QA Bake-off** offers:
- Local BLIND ZIP import and separate LOCAL gold reference import.
- Three candidate OpenRouter model IDs and a private Cloudflare relay URL field.
- Opt-in **Run next 3 pages · Paid API** button with confirmation for each set.
- Local, privately calculated accuracy reporting (tested pages/anchors, exact fixes, substantive fixes, typography, false positive controls, actual cost when returned).
- Stop-after-current-page; local browser checkpoint after each completed page; export/import model results JSON. No inference is silently started.
- No changes to the OCR, guided repairs, imported QA, Kindle Ready, or EPUB export. **AI proposed corrections cannot be auto-applied.**

Model prices, providers and eligibility can change. Test real prices/usage and three-page quality first rather than estimating a book-wide total.

## Secure OpenRouter connection setup (user action required)

1. Create an OpenRouter API key using your OpenRouter account. Add a strict low spend limit in OpenRouter's API key controls. **Do not paste this key into ChatGPT, Studio, GitHub, or screenshots.**
2. Create a small Cloudflare Worker under your own Cloudflare account (free tier may be sufficient for a short synchronous test).
3. Deploy the repo file `cloudflare/openrouter-qa-relay.js` as the Worker's source.
4. Set Worker **Secrets** `OPENROUTER_API_KEY` (your actual OpenRouter API key) and `QA_ACCESS_TOKEN` (a separate long random token you generate). Set Worker **plain variable** `ALLOWED_ORIGIN` to the **exact origin** where Studio runs, e.g. `https://example.github.io` or your custom domain, no trailing slash or path. Never commit secret values.
5. If you've already deployed an older relay, replace its entire code from `cloudflare/openrouter-qa-relay.js` in GitHub and redeploy it. Worker code is manually managed; a GitHub push does **not** update an existing Cloudflare Worker. In Studio, use **Check OpenRouter key · No charge** BEFORE starting paid page QA. The check authenticates the Worker and queries `GET /api/v1/key`; it never transmits screenshots or OCR or generates paid output. A successful key check does not prove a model meets privacy routing or that your account has sufficient paid credits. Failed model requests now show the numeric upstream HTTP status with a privacy-safe explanation (401 key invalid; 402 insufficient credits/limit; 503 no provider meeting strict ZDR/parameter requirements).
6. Deploy the Worker, confirm its `/health` endpoint answers `{"ok":true,...}`. **This health check is not proof that OpenRouter is connected.**
7. Open Studio → Review → AI QA Bake-off. Load the two ZIPs *locally*. Paste the Worker's HTTPS base URL into **Private QA Worker base URL**. Paste the separate **QA_ACCESS_TOKEN** into **Worker access token**. **Never paste the OpenRouter key here.**
8. Start with the default **Gemini 3.1 Flash Lite** for three pages and inspect substantive OCR hits and false positives. Then run identical pages for **Gemini 3.8 Flash** and **Claude Sonnet 4.6**. Export one results JSON file per model for comparison.
9. When ready, tap **Run next 3 pages** repeatedly. Every completed page is stored locally (per benchmark+model) to help survive a browser reload, but exporting the JSON is still recommended on mobile.

**Privacy:** the image and OCR snippet go to your configured Worker and then to OpenRouter and the selected model provider, so external third-party handling applies. The Worker enforces `provider: {data_collection:"deny", zdr:true, require_parameters:true}`, and will fail rather than silently switch to providers without those constraints. Provider policies should still be reviewed independently. The Worker never transmits the gold reference or corrected EPUB and stores no page content. The browser's local results checkpoint may contain model-corrected text.

**Cost control:** each button press can initiate up to three API requests, one per page. This feature has no background batch scheduler or guarantee against provider retries/charging; use a restricted OpenRouter API key. No OpenRouter API calls were made as part of creating Build 264.

## Optional offline runner / audit reproducibility

The separately delivered `run_openrouter_qa.py` program can run from a computer using an `OPENROUTER_API_KEY` *environment variable* and the blind ZIP. It uses no Gold files and checkpoints results to disk after each page. The private reference ZIP contains `tools/score_ai_qa.py` to evaluate results offline. The runner defaults to **dry run and 3 pages**. This CLI route is optional; Studio + Worker is the intended iOS-friendly workflow.

## Safety and rollout criteria

The model must demonstrate a good **substantive error catch rate** without changing correct controls, across the **same page subset** for all competitors. Then we should run a larger blind full-page validation, including genuine untouched OCR lines, message bubbles, decorative breaks, chapter numbers and italics. A model passing this anchor benchmark does **not** license autonomous rewrite of the original book. Approved corrections must be validated against exact current text and imported through the existing transactional QA workflow.
