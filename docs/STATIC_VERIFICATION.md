# Static narration and website verification

## Current integration — 2026-10-14

Host: macOS Apple Silicon, Node 24.21.0, Playwright Chromium 156.

- Fresh `npm ci --ignore-scripts`: 82 packages installed, zero reported vulnerabilities.
- `npm run check`: 16 CLI/loading regressions, the alignment-attachment suite,
  all five website suites, the reusable-player build and static website build pass.
- Headless `npm test`: 34 pass, one optional local-PCM test skips when its
  uncommitted recording is absent. No voice model is required for these fixtures.
- Regressions cover repeated words and duplicate paragraphs, text across inline
  elements, mutations, invalid intervals, error cleanup, independent optional
  timing fetches, source resets, HTML formatting newlines, seeking and speed.
- The website suites check every real body-word midpoint, the Highlight cycle,
  media-clock behavior and exact recording/transcript/alignment hashes.
- A fresh Python 3.12 environment installed the 36 pinned alignment packages.
  The public helper verified cached model files, ran inference offline and
  reproduced the committed 242-word JSON byte for byte. SHA-256:
  `daa0505b401b210972d1bb9e3dc28055a838546e3d6ac86c1c4f67d9a2f5dca6`.
  Attaching those real timings to a manifest succeeded and repeating was a no-op.
- The branded website includes its complete approved art, fonts, icons, 88.675-second
  PCM16 WAV, paragraph/chunk timings, transcript and alignment reports. The README
  GIF is a real muted capture; it is not an audible listening audit.
- The new GitHub Actions workflow runs install, checks and headless browser tests.
  It performs no deployment, package publication, speech generation or alignment.
  Hosted results are available on the repository's Actions tab.

## Follow-up QA — 2026-10-14

New checks used installed dependencies and cached models only, with model-fetch
requests blocked during actual CLI generation. No software or models were installed.

- Actual CLI dry-run produced no output; initial/changed/new narration generated;
  unchanged input reused the same WAV and manifest without loading Kokoro. Deleted
  input disappeared from the active manifest while its WAV remained. An edited WAV
  was refused without changing the manifest or overwriting the edit.
- A real 1.575-second post was forced-aligned with the existing pinned helper,
  attached, and reused unchanged. Deleting just its WAV and repairing regenerated
  identical audio and preserved the aligned sidecar bytes and reference.
- Muted headless Chromium played that generated WAV through the CLI-inserted
  standalone component, sought to its measured word interval, highlighted the
  correct word, and changed speed. The deleted article reported no published
  narration; the browser made no inference/model requests.
- New deterministic regressions reject cache/output overlap and symlinks. WAV
  repair preserves words only for identical audio; different audio drops words,
  uses fresh immutable assets, and explicitly requires alignment again.
- Website recovery tests cover failed metadata/audio loading, single in-flight
  retries, Paragraph/Off while loading or failed, and the timed metadata abort
  followed by recovery. Q&A and setup docs distinguish test CI, local generation,
  paragraph timing, and the optional separate alignment helper.
- All 19 relative Markdown links resolved. The copy-agent prompt matches supported
  source-based setup; it does not prescribe an unpublished npm package or an
  invented alignment flag. No fresh dependency installation was attempted here.

These are automated checks, not foreground visual QA or a listening audit.
The 242-word demo reproduction and fresh environment installation above are prior
verified evidence; the short-post lifecycle/alignment/repair checks are new.

## Earlier real generation checks

Kokoro Heart fp32 was exercised locally with the pinned model. A separate
six-paragraph article produced 102.325 seconds of mono 24 kHz PCM16 audio;
paragraph boundaries came from sample counts with 0.3-second pauses. A short-post
incremental sequence verified initial generation, unchanged reuse without engine
load, changed/new inputs, and retirement of deleted inputs while preserving audio.
These are local results, not cross-platform or cold-download performance claims.

## Limits

Word boundaries are acoustic forced alignment, not human annotation. The bundled
recording has a weak “to” interval at 41.852–41.892 seconds and four very short “a”
intervals. No invented or interpolated word intervals are used. See the reports
in `website/alignment/` and the optional helper documentation.

Safari, Firefox, physical mobile devices, background/offline playback, q8 voice
quality and generation on non-Mac hosts remain unverified. Narrow viewport tests
are layout checks. HTML extraction does not calculate external CSS visibility.
Static hosts must support usable byte-range requests for media seeking.

Native ONNX Runtime emitted a telemetry device-ID persistence warning during
prior generation; no supported disable control was established. The static player
has no analytics or inference dependencies. The separate browser-local synthesis
runtime remains an unpublished experiment with unresolved distribution work;
see `docs/LICENSING.md` and `docs/RELEASE.md`.
