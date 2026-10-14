# Local word alignment (optional helper)

The JavaScript `generate` command produces audio and exact chunk/paragraph
boundaries. It does **not** run WhisperX. This separate helper aligns the existing
recording to that known transcript using local CPU inference. Readers receive
only the resulting audio, timing JSON and player; no Python, models or API keys.

## Install once

Python 3.12 is required for this pinned environment. The runtime pins below were
tested on macOS Apple Silicon; other platforms need their own validation. The
full WhisperX ASR/diarization command-line application is deliberately not installed.

```sh
python3.12 -m venv .venv-align
.venv-align/bin/python -m pip install --only-binary=:all: --no-deps -r tools/alignment/requirements.txt
.venv-align/bin/python tools/alignment/download_model.py --output .alignment-model
```

Requirements pin WhisperX 3.8.6 and all 35 dependencies used by its alignment
module. `--no-deps` intentionally avoids unnecessary transcription and diarization
packages. The official WhisperX wheel used for the bundled demo had SHA-256
`cb6d4fcd3fb6c42305cb8b222a33a0b78f6b657e9db3b714345fe43dc0a69c1f`.

The downloader retrieves only `facebook/wav2vec2-base-960h` at revision
`22aad52d435eb6dbaf354bdad9b0da84ce7d6156` and verifies every file against committed
SHA-256 values. Weights are 377,607,901 bytes, plus small config/tokenizer files.
This is an additional optional download beyond Kokoro. It uses safetensors, not
pickle weights. Package/model downloads contact PyPI and Hugging Face; audio and
article text stay local during alignment. Cached model files are reused.

## Reproduce the bundled demo's alignment

From the repository root, choose a new output path:

```sh
mkdir -p output
.venv-align/bin/python tools/alignment/align.py \
  --audio website/public/assets/narration-4d232dd92529.wav \
  --timings website/public/assets/voice-timings.json \
  --model-dir .alignment-model \
  --output output/voice-words.json
```

For another post, use the generated WAV and timing filenames found in its
manifest. The helper refuses to overwrite existing outputs. It verifies model
hashes and the audio duration, then uses the source's existing chunk boundaries.
It writes the word JSON and a separate `*.provenance.json` with input hashes,
package versions, normalization details, scores and unmatched tokens. Inference
is offline; no transcription or speaker model is downloaded.

The output's `text` retains every original whitespace-delimited token, including
punctuation. Only the internal alignment input is lowercased, curly apostrophes
normalized, and nonletter punctuation removed. Numbers/symbol-only tokens are
refused rather than assigned invented times; write their spoken form before
generation if needed. Timestamp interpolation is disabled. Unmatched tokens
prevent a word JSON from being emitted; inspect the report.

## Attach words to the reusable player's manifest

Review the report and timing quality, then run this helper against the same
generated audio. Replace `post.html` with the manifest's article key:

```sh
node tools/alignment/attach.mjs --manifest /path/to/blog/public/pipread/manifest.json \
  --article post.html --words output/voice-words.json
# Repeat with --write to apply the reviewed plan.
```

It verifies the audio hash and exact transcript, converts words to UTF-16 source
offsets, writes an immutable content-hashed timing sidecar, and atomically updates
the manifest after creating a backup. The WAV is unchanged. It shares the CLI's
output lock and refuses modified assets. Publish the new sidecar before the new
manifest. Repeating the attachment is a no-op. Regenerating changed narration
requires new alignment; unchanged narration keeps its attached words. If only the WAV is missing, repair preserves the word sidecar only when regenerated audio has the identical integrity hash. Different regenerated audio receives new asset filenames and paragraph timings, with an explicit message that alignment must be rerun. Missing word sidecars cannot be reconstructed from paragraph timings.

No `generate --align` or `--words` flag exists. Alignment is an explicit helper
step, not part of `pipread generate` or its cache identity.

## Quality limits

These are acoustic forced-alignment boundaries, not a human annotation or an
equal-time word animation. Scores are model diagnostics, not calibrated accuracy.
Review unusual names, numbers, acronyms, contractions and fast function words.
The bundled demo has all 242 tokens, with one weak `to` interval at
41.852–41.892 seconds. Four `a` tokens occupy roughly one 20 ms model frame.
No boundary was stretched to make the animation smoother. The demo's quality and
provenance reports are in `website/alignment/`; no audible listening audit is claimed.
The player falls back to paragraph highlighting when word intervals are absent
or structurally invalid. A low-score interval is not automatically removed.
