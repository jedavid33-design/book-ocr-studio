# Book OCR Studio Visual Italic Model

Experimental offline training pipeline for the visual italic classifier.

## Frozen benchmark

Ruby Circle v180 corpus:
- 109 clean single-word Italic specimens
- 1,000 structurally hard Roman specimens
- 1,000 ordinary Roman specimens
- page identity retained for grouped evaluation

Current HOG baseline target to beat:
- Italics@100: 83
- all 109 Italics recovered by approximately rank 230

## Training sequence

1. Pretrain on synthetic true Regular/Italic font pairs from many font families.
2. Keep font families separated between train and synthetic validation.
3. Evaluate the synthetic-only model on Ruby Circle v180 before any Ruby fine-tuning.
4. Fine-tune only after recording that untouched transfer result.
5. Evaluate with page-grouped out-of-fold predictions.
6. Optimize ranking metrics, especially AP and Precision/Italics @25/@50/@100/@250.

Do not generate synthetic Italic primarily by shearing Roman text. Use genuine Italic font files.

The browser production target is MobileNetV3-Small exported to ONNX for ONNX Runtime Web.
