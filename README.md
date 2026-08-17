# Book OCR Studio v19

Regression-tested message OCR patch for the seven known bubble-layout screenshots in this book.

## Message OCR changes
- Stops merging nearby/stacked bubbles into one giant OCR region.
- Uses denser fill detection so ordinary page text is less likely to be mistaken for a bubble.
- Uses a higher-resolution bubble mask.
- Speaker-label crops now keep a safety gap above the bubble text.
- Speaker labels get multiple OCR passes and stricter rejection of phrase-like false labels.
- Keeps the existing left/right lane logic and adaptive bubble-text retries.

The one-page workflow, saved project data, compact layout, chapter controls, and EPUB exporter are unchanged.
