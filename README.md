# Book OCR Studio

A static, mobile-friendly GitHub Pages tool for turning your own book screenshots into text or EPUB files.

## What it does

- Upload a whole batch of screenshots at once.
- Sort pages naturally by filename.
- Apply a bulk crop preset:
  - **CloudLibrary footer:** removes 75 px from the bottom.
  - **Kindle header:** removes 150 px from the top.
  - Or enter your own crop values.
- OCR pages sequentially in the browser using **Tesseract.js**.
- Flag likely chapter-opening pages for review.
- Let you **toggle chapter starts on or off manually**.
- Let you **edit chapter titles** before export.
- Use **Drop-cap rescue** to OCR a chapter-opening region while trimming the large decorative letter from the left edge.
- Edit OCR text page-by-page.
- Export:
  - `.txt`
  - `.epub` with:
    - title
    - author
    - optional cover image
    - real chapter breaks
    - separate EPUB files per chapter/section
    - clickable table of contents

## Privacy

The page itself has no server-side upload code. Your selected screenshots are processed in the browser.

Tesseract.js loads its browser worker/core/language resources from a CDN, so an internet connection is required for OCR resources to load. The selected screenshots are not intentionally sent to an application server by this project.

## GitHub Pages setup

1. Create a new repository.
2. Upload these files to the root:
   - `index.html`
   - `styles.css`
   - `script.js`
3. In GitHub:
   - **Settings → Pages**
   - Deploy from branch
   - Branch: `main`
   - Folder: `/ (root)`
4. Open the Pages URL on iPhone/iPad.

## Suggested workflow

1. Add title, author, and cover.
2. Select all screenshots.
3. Choose the appropriate crop preset.
4. Check the crop preview.
5. Tap **Process all pages**.
6. Review pages marked as chapter starts.
7. Use **Drop-cap rescue** on any chapter opening whose first lines were skipped.
8. Turn **Chapter start** on/off where needed.
9. Optionally edit **Chapter title** for cleaner EPUB navigation.
10. Export TXT or EPUB.

## Chapter-aware EPUB behavior

- If chapter starts are marked, the EPUB exporter splits the book into sections using those markers.
- Each section becomes its own XHTML file inside the EPUB.
- The EPUB TOC is built from the chapter titles.
- If no chapter starts are marked, the exporter falls back to a single-section EPUB.

## Notes for large books

OCR is deliberately sequential rather than processing many pages at once. This is slower but much safer for Safari/iPad memory.

For a very large book, keep the tab open and the device awake while processing.

## External libraries

- Tesseract.js v5 via jsDelivr
- JSZip 3.10.1 via jsDelivr
