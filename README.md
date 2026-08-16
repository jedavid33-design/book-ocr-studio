# Book OCR Studio v17

Changes in v17:
- Compact navigation buttons now apply to iPad Split View and other narrow browser windows, not just phone-sized viewports.
- Navigation buttons are explicitly capped at 40 px high.
- Message-page OCR rejects phrase-like false speaker labels such as “WHAT ARE YOU” or “AND YOU HAVE”.
- Message OCR now tries both the original crop and a high-contrast version, plus extra Tesseract layout modes on difficult bubbles.
- Existing permanent saved project/checkpoint behavior is unchanged.
