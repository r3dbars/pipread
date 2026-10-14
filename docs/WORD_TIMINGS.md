# Optional static word timings

The standalone player accepts optional `words` in a version-1 timing sidecar.
Existing manifests, paragraph-only sidecars, controls, and embedding attributes
are unchanged. The existing highlight checkbox uses supplied word intervals when
available and falls back to the current paragraph between words or when word
metadata is absent or invalid. Inter-paragraph silence has no highlight.

```json
{
  "version": 1,
  "paragraphs": [{"text": "Hello world.", "start": 0, "end": 2}],
  "words": [
    {"paragraph": 0, "offset": 0, "length": 5, "text": "Hello", "start": 0.1, "end": 0.7},
    {"paragraph": 0, "offset": 6, "length": 5, "text": "world", "start": 0.8, "end": 1.5}
  ]
}
```

This example is illustrative, not an aligned recording. Times are absolute media
seconds. `paragraph` is zero-based; `offset` and `length` use UTF-16 code units in
that paragraph's exact normalized text. Optional `text` must match the substring.
Provide entries in increasing time and source-offset order per paragraph. Words
must have positive durations, fit inside their paragraph, and neither overlap in
time nor text nor split a surrogate pair. An invalid entry disables word mode for
its paragraph. Unknown paragraph indices are ignored. Missing words are never
interpolated. The player does not certify the acoustic accuracy of supplied data.

Visible article text must match the full normalized paragraph transcript in
order. Text-node ranges preserve links, emphasis, repeated words and repeated
paragraphs. Hidden/excluded content is omitted. Stale transcripts or article
mutations disable highlighting, without interrupting audio. Reset the player via
its existing source attributes or reconnect it after updating the article and
sidecar. No wrapper elements, scrolling, selection changes or word announcements
are introduced. Unsupported CSS Highlight browsers retain audio playback.

Rendering uses audio.currentTime on animation frames while playing, and on media
seek/pause/rate events. The player remains one dependency-free file, so the CLI's
copy-to-output workflow still works without a bundler or extra published files.

## Optional local alignment

The main CLI generates chunk/paragraph boundaries. For genuine word intervals,
use the [optional pinned local alignment tools](../tools/alignment/README.md).
They align an existing recording against its known transcript without generating
new audio, then attach validated UTF-16 offsets in a new content-hashed sidecar.
The original recording and generation cache identity remain unchanged.

The included website demo uses that alignment workflow. Its provenance and
quality reports record the model, package versions, hashes, and uncertain words.
Alignment confidence is evidence to review, not a guarantee of acoustic accuracy.
The helper rejects unmatched words rather than inventing their timestamps.

The browser-synthesis player's syllable/activity-based estimator is separate and
still explicitly approximate. It is not used by the static player.
