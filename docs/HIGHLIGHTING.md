# Read-along highlighting

## Default reusable static player

`<pipread-audio>` has an optional highlight checkbox. Off removes highlights.
When enabled, a sidecar containing valid word intervals highlights those exact
source ranges; otherwise it follows paragraphs. During gaps within a paragraph
it retains paragraph context, and inter-paragraph silence clears it. There is no
interpolation or acoustic model in the browser player.

Text is mapped in document order to normalized paragraph text and original UTF-16
text-node offsets, so repeated words/paragraphs and words spanning links/emphasis
remain unambiguous. The article transcript must match. DOM edits invalidate ranges;
reset the source to rebuild mapping. CSS Custom Highlights preserve DOM content and
selection. Unsupported browsers keep audio playback with highlighting disabled.

The renderer uses audio.currentTime, animation frames during playback, and media
events for seek, pause and speed changes. Optional timing requests do not delay
playable audio. Completion, errors, source reset and disconnect clear highlights.

[WORD_TIMINGS.md](WORD_TIMINGS.md) defines the sidecar schema.
[The alignment helper](../tools/alignment/README.md) explains how to generate
acoustic timings and attach them to a manifest. The JavaScript generation CLI
itself produces chunk/paragraph boundaries only.

## Branded website demo

The website has a separate compact button cycling Paragraph → Off → Word →
Paragraph. It uses the committed forced-aligned word data, including its reported
uncertainties. It follows body text only; the spoken title is passage 0.
[Website documentation](../website/README.md) describes the actual control and tests.

## Optional browser-synthesis experiment

`<article-voice>` under examples/browser-local.html is a different, local-only
experiment. Its “Words (approximate)” option uses RMS activity and syllable weights.
That estimator is not forced alignment and is not used by the static website or
static word-timing player. It has no validated word-boundary accuracy. The compiled
speech runtime remains outside the public distribution scope.

## Verification scope

Static-player browser regression tests cover repeated passages, inline markup,
UTF-16 offsets, seeks, pause, speed, invalid timing fallback and mutation/reset.
Node regression tests cover stalled optional timing fetches and audio-error
cleanup. Website Node suites verify every real body-word midpoint. Automated
mapping/control tests and a muted demo GIF do not constitute a listening audit.
