# Book OCR Studio v13

This build fixes a browser-cache problem that could leave an older `script.js` running even after newer GitHub Pages files were uploaded.

## Important changes
- `script.js?v=13` and `styles.css?v=13` force Safari/GitHub Pages to fetch the new build.
- The page visibly says **LOCAL BOOK TOOL · v13** at the top so you can confirm the new code loaded.
- EPUB files temporarily export with `-v13` in the filename so the test file cannot be confused with an older export.
- The v12 chapter-structured EPUB exporter is unchanged: each marked chapter becomes its own XHTML file and TOC entry.
- The existing v12 checkpoint key is preserved so saved OCR text is not intentionally discarded.
