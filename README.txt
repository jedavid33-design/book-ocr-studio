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
