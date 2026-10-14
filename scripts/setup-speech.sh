#!/bin/bash
# One-time download for offline pronunciation checking (~160 MB):
#   - transformers.js 3.8.1 (+ onnxruntime-web WASM) from npm  -> vendor/transformers/
#   - Whisper "base" (fp32 encoder + int8 decoder, ONNX) from Hugging Face        -> models/onnx-community/whisper-base/
# Versions are pinned so the result is reproducible. After this, everything runs offline.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v npm >/dev/null || { echo "npm (Node.js) is required: https://nodejs.org" >&2; exit 1; }

TFJS_VERSION=3.8.1
MODEL=onnx-community/whisper-base
REV=1846881b6b3a3024392c1eea3ad983695bc23925
MODEL_DIR="models/$MODEL"

echo "→ transformers.js $TFJS_VERSION"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
(cd "$TMP" && npm pack "@huggingface/transformers@$TFJS_VERSION" --silent >/dev/null && tar xzf ./*.tgz)
mkdir -p vendor/transformers
for f in transformers.min.js ort-wasm-simd-threaded.jsep.mjs ort-wasm-simd-threaded.jsep.wasm; do
  cp "$TMP/package/dist/$f" "vendor/transformers/$f"
done
cp "$TMP/package/LICENSE" vendor/transformers/LICENSE

echo "→ $MODEL @ ${REV:0:8}"
mkdir -p "$MODEL_DIR/onnx"
FILES="added_tokens.json config.json generation_config.json merges.txt normalizer.json preprocessor_config.json
special_tokens_map.json tokenizer.json tokenizer_config.json vocab.json
onnx/encoder_model.onnx onnx/decoder_model_merged_quantized.onnx"
for f in $FILES; do
  if [ ! -s "$MODEL_DIR/$f" ]; then
    curl -fL --retry 3 --progress-bar -o "$MODEL_DIR/$f.part" "https://huggingface.co/$MODEL/resolve/$REV/$f"
    mv "$MODEL_DIR/$f.part" "$MODEL_DIR/$f"   # only complete files get the final name
  fi
done
echo "✓ Speech model ready ($(du -sh models vendor | awk '{print $1}' | paste -sd+ -) on disk)."
