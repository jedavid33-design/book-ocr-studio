# Book OCR Studio v11

One-page-at-a-time OCR workflow with safer TXT/EPUB export.

## v11 export fixes
- Syncs the currently visible textarea into saved state immediately before export.
- Normalizes TXT paragraph spacing before download.
- Writes each OCR paragraph as its own explicit EPUB `<p>` element.
- Gives EPUB paragraphs unique IDs and keeps page sections separate, which helps readers/importers preserve short dialogue lines.

## Workflow
1. Load screenshots.
2. Choose the crop preset.
3. Process the first page.
4. Edit as needed.
5. Use **Message-page OCR** if needed.
6. Tap **Save + next page** to continue.
7. Export TXT or EPUB at any time.
