# Optional reading highlight — October 13, 2026

## Behavior

`Highlight as read` is off initially. Enable it and choose **Passage** (default) or **Words (approximate)**. No integration changes or additional downloads. No scrolling, text upload, microphone, speech recognition or cloud alignment.

Passage highlighting covers the actual generated chunk, normally one sentence; a long sentence may be split at the existing 240-character bound. Word mode is an experimental reading guide, not precise karaoke or accessibility transcription. It estimates positions from PCM speech activity and syllable weights. It resets at every real clip boundary, avoiding accumulated article-wide drift. Numeric and recognized abbreviation passages fall back to passage highlighting. Before/after detected speech, passage context is shown.

## What the engine exposes

Inspected the installed official `kokoro-js` **1.2.1** bundle and declarations in `node_modules/kokoro-js/dist/kokoro.js` and `types/kokoro.d.ts`. `generate` returns `RawAudio`; `generate_from_ids` extracts `waveform` from the model and constructs 24 kHz audio. The streaming interface adds text and phonemes, not per-word timestamps. The current application worker forwards only PCM, sample rate, chunk index and generation milliseconds. There is no word-alignment result in this supported path. We did not modify the ONNX graph, export another model, or introduce a second aligner.

The official [model card](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) likewise documents audio output. The local package is authoritative for this pinned implementation; this is not a claim that no other Kokoro pipeline could expose durations.

## Measured versus estimated

The estimator computes RMS in 20 ms PCM frames, with threshold max(0.002, 4% of peak frame RMS). It allocates detected active frames across source words using rough vowel-group/syllable weights. This is not a linguistic aligner; pauses within an estimated word interval can still retain that word. Errors can be substantial for unusual names, pronunciations, punctuation, stress and expanded text. No quantitative word-boundary accuracy is claimed. A human-annotated alignment study remains undone; use Passage when accurate word placement matters.

A local verification test used **actual previously generated Kokoro WASM PCM** for “A little room to listen.”: 1.90 seconds total, 57 detected active frames, first activity 0.30 seconds and last frame starting at 1.42 seconds. The five estimated word intervals lie between 0.30 and 1.44 seconds. These values measure audio activity and estimator output, **not** true spoken-word boundaries.

Visible Mac Chrome also ran the updated real GPU engine: cached first playback 0.94 seconds. The user-facing demo showed a highlighted passage at 00:23.9 and an estimated `overlook` highlight after seeking back to 00:23.4 while paused. This verifies real audio integration and display, not subjective timing precision.

## Mapping, cleanup and controls

`src/text.js` retains original text-node/UTF-16 offsets while extracting and normalizing visible text. Chunks map monotonically through those offsets, so repeated words are not found with ambiguous global string search. Punctuation, links and emphasis retain their exact nodes. Each highlight consists of CSS Custom Highlight ranges; there are no wrapper spans, DOM text replacements, selection modifications or link changes. Only the active highlight receives temporary foreground/background colors.

The renderer reads `HTMLAudioElement.currentTime` on animation frames and media updates. It uses no wall-clock word timer. Pause freezes, seeks and ±15-second controls recompute, speed follows media time, and mute is independent. Completion, stop, errors, disconnect and disabling remove ranges and injected highlight styles. Host text/child edits invalidate highlighting until restart. Multiple player instances have separate highlight names.

Browsers without CSS Custom Highlight support show a disabled toggle and explanation; narration remains available. No DOM-wrapping fallback is used. No automatic scrolling or live-region word announcements are added, preserving selection and avoiding screen-reader chatter. Screen-reader behavior has not been manually audited.

## Verification

Four new checks cover DOM mapping/selection/link preservation; optional-off behavior and media-position transitions; genuine generated PCM activity/interval bounds and numeric fallback; host-edit invalidation, completion and restart. All previous playback controls remain under the existing regression suite.

The local full suite passed 22/22 tests. The source-only checkout excludes generated audio fixtures, so its optional archived-PCM test skips unless the fixture is generated locally. Production build passed.

Licensing/publication hold unchanged. No deployment, repository push, or cloud speech service.
