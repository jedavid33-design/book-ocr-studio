Book OCR Studio 2.1 batch update

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
