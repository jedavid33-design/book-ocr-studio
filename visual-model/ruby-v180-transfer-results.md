# Ruby Circle v180 synthetic-to-real transfer benchmark

Model: MobileNetV3-Small trained only on synthetic genuine Regular/Italic pairs from 277 Google Fonts families.
Real benchmark: Book OCR Studio v180 labeled word crops, 2,109 specimens (109 Italic, 2,000 Roman).
The Ruby labels were not used for training.

- Average precision: 0.860941
- ROC AUC: 0.995181
- Top 25: 21 Italics / 25 (84.0% precision)
- Top 50: 45 Italics / 50 (90.0% precision)
- Top 100: 87 Italics / 100 (87.0% precision)
- Top 250: 109 Italics / 250 (43.6% precision; 100% recall)

This is the first direct synthetic-to-real transfer result. Preserve the raw visual ranking before any Ruby fine-tuning, blending, or span/context smoothing.
