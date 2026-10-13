# Static narration verification — 2026-10-13

Host: macOS Apple Silicon, Node 24.21.0, desktop Chrome 155. No npm publication, runtime-binary upload, Site edit, or CI permission change was performed.

## Passed

- Clean `npm ci --ignore-scripts`: 82 installed packages, 0 reported vulnerabilities.
- `npm run test:cli`: 10 tests covering dry-run, initial generation, incremental reuse, changed/new/deleted inputs, config invalidation, missing output recovery, edited output refusal, generation failure recovery, locks, paths/symlinks, script-free article extraction, scaffold, static integration, backup and idempotence.
- `npm test`: 27 browser tests, including 4 static-player tests and 23 existing local-synthesis lifecycle/highlighting tests. Static player tests use real native media playback over controlled WAV responses; neural inference is separately exercised below.
- Static controls: play, pause/resume, ±15-second skips, pitch-preserving rate, seek, optional passage highlights, fetch errors/retry affordance, source-change/disconnect cancellation, and 390/320px layout. No model/runtime requests in the static-player test.
- `npm run build`: static demo plus approximately 6 KB compiled player JS; no model, ONNX/WASM runtime or TTS worker. `npm run build:browser-local`: separate optional runtime build passed; distribution remains held.
- Real Kokoro Heart fp32 CLI generation of a six-paragraph article: 102.325 seconds of mono 24 kHz PCM16 WAV. Text matched the supplied transcript; paragraph boundaries came directly from sample counts, with 0.3-second pauses. Audio SHA-256: `6d8cb123308b8d426f41e6492565ec55cb09ad9f0ea5fc595e65741612a3c78c`.
- Separate real short-post incremental sequence, cached pinned model: fresh 745 ms; unchanged 3 ms with no engine load; changed plus new 926 ms; deleted input 7 ms, retired and its old audio preserved. These are individual local measurements, not guarantees or cold-download timings.
- Real included demo narration generated successfully (23 chunks).

## Failures found and resolved

The initial static-player seek fixture returned full WAV responses without byte-range semantics, causing Chrome to reset seeking to zero. The fixture now supplies correct HTTP 206 Content-Range responses and seeking passes. Hosts still must serve usable range responses; this player does not silently download the entire WAV into a Blob as a fallback.

## Not established

The new batch CLI's first-download timings, q8 voice quality, non-Mac runners, actual GitHub Actions execution, mobile devices, Safari/Firefox, offline/background playback, and subjective listening quality are not certified by these tests. A mocked narrow viewport is not a mobile device test. HTML extraction does not calculate external CSS visibility. Read-along timings are chunk/paragraph boundaries, not word forced alignment.

Native ONNX Runtime emitted a telemetry device-ID persistence warning; no supported disable control was established in the installed Node binding. Do not claim native-runtime telemetry is disabled. Article text is passed only to local inference; explicit model fetches carry no article text. The static browser player has no analytics/inference dependencies.

The source-built eSpeak replacement is opt-in and separately documented in `experimental/phonemizer/README.md`. Reproducible local binaries do not remove the optional browser-runtime distribution hold: browser execution tests and the full corresponding-source/notice package are unfinished.
