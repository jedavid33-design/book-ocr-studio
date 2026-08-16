# Book OCR Studio v16

## v16 changes
- Keeps the permanent saved-progress key from v15, so version updates should continue using the same saved project.
- Improves **Message-page OCR** for later-book layouts by:
  - upscaling tiny message crops before OCR,
  - trying more than one OCR segmentation mode,
  - retrying suspicious/fragmented bubbles with a wider crop,
  - checking a taller speaker-label area.
- Adds a much more compact small-screen layout:
  - smaller cards and header,
  - compact chapter controls,
  - screenshot preview is small in page review,
  - taller editing area,
  - Previous / Message OCR / Next controls stay together in a compact sticky bar,
  - fixes the oversized navigation buttons on narrow screens.

The one-page-at-a-time workflow, chapter EPUB export, and saved progress behavior are unchanged.
