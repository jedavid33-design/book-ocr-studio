# Book OCR Studio v18

## Message OCR patch
- Stops OCRing every small gap between message bubbles.
- Reads speaker labels only from a shallow strip directly above a bubble.
- Prevents the label crop from overlapping prior message bubbles.
- Tracks left/right message lanes so unlabeled follow-up bubbles do not force a fake speaker label.
- Preserves prose before/after a message block and only checks very large gaps for prose between message groups.
- Keeps the existing one-page workflow, chapter exporter, compact UI, and permanent saved-progress key unchanged.
