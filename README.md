# Book OCR Studio v14

## Cross-version memory update

v14 keeps OCR progress under a permanent browser-storage key instead of tying it to a version number.

- It can restore the saved progress created by v13/v12 when the same screenshot batch is loaded.
- Old checkpoints are automatically migrated to the permanent key.
- Future versions should continue using `bookOcrStudio.progress.current`, so edits, page position, crop settings, chapter-start flags, and chapter titles survive version updates.
- Clear pages still intentionally clears saved progress.

The one-page-at-a-time OCR workflow, message-page OCR, and chapter-structured EPUB export are otherwise unchanged from v13.
