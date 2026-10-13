# Distribution review — not legal clearance

Reviewed 2026-10-13 against package metadata, exact phonemizer source, and upstream license texts. No license agreement was accepted and no artifact was published.

## Exact evidence

`phonemizer@1.2.1` declares Apache-2.0. npm records source commit **6835144b7ee9043129222549c1ed2f6a27216278** and tarball integrity **sha512-v0KJ4mi2T4Q7eJQ0W15Xd4G9k4kICSXE8bpDeJ8jisL4RyJhNWsweKTOi88QXFc4r4LZlz5jVL5lCHhkpdT71A==**. The lockfile records that integrity.

At that exact commit, [`src/phonemizer.js`](https://github.com/xenova/phonemizer.js/blob/6835144b7ee9043129222549c1ed2f6a27216278/src/phonemizer.js) imports generated [`src/espeakng.worker.js`](https://github.com/xenova/phonemizer.js/blob/6835144b7ee9043129222549c1ed2f6a27216278/src/espeakng.worker.js), which instantiates `eSpeakNGWorker` and embeds eSpeak data. The repository tree contains generated JS/data and Rollup configuration, but **no native eSpeak C/C++ source, exact native commit identifier, or build recipe for that generated native payload**. Its Rollup config only bundles/minifies the JS wrapper. No eSpeak copyright/GPL notice appears in that generated file's text. Wrapper Apache metadata therefore does not establish that the complete binary is Apache-only.

[eSpeak NG's own README](https://github.com/espeak-ng/espeak-ng#license-information) declares GPL-3.0-or-later. [Its native speech source](https://github.com/espeak-ng/espeak-ng/blob/master/src/libespeak-ng/speech.c) identifies Jonathan Duddington (2005–2013) and Reece H. Dunn (2013–2017), and the GPL terms. These are upstream attributions; the exact embedded version and complete attribution set are still unverified. The optional NetBSD getopt implementation has a separate BSD-2-Clause notice, also retained.

## Concrete distribution requirements to resolve

The following summarizes GPLv3 [sections 1, 4–6](../licenses/espeak-GPL-3.0.txt), rather than deciding whether this particular integration is an aggregate or a combined work:

- Keep copyright/license/no-warranty notices and supply the GPL text.
- If distributing a covered combined/modified work, apply GPL-compatible distribution terms to the covered whole, identify changes where required, and assess applicable interactive legal notices. Original MIT/Apache notices still need preservation.
- For executable/minified/generated covered material, provide the matching preferred source, including needed build/control scripts and modifications. A generic link to today's eSpeak repository is not evidence of matching source.
- A network-download distribution can use section 6(d): provide equivalent access to corresponding source and clear directions alongside the executable. A separate source server can qualify under its conditions. Merely bundling license text does not satisfy source obligations.

Serving JS to visitors transfers a copy to their browser; do not treat this as server-only software. No project-wide legal conclusion is asserted here.

## What is already included

Original project files remain MIT, with explicit third-party exclusions. Apache, MIT, GPL and BSD texts, plus ONNX Runtime's own third-party notices, are retained in `licenses/`. The build copies these, `LICENSE`, `THIRD_PARTY_NOTICES.md` and this review into `dist/`, so copying the complete bundle keeps the notices. `README.md` warns against describing the bundle as MIT-only. The demo links to notices.

## Actual publication blocker

Obtain the exact eSpeak source revision, patches, dictionaries and native-to-JS build instructions corresponding to the published `phonemizer@1.2.1` payload, then prepare/verify the complete corresponding-source distribution and applicable combined-work/UI notices. Alternatively replace that phonemizer with a provenance-complete, appropriately licensed implementation and retest speech. Neither path is completed here. No source-provenance request was sent externally.

This prevents a claim of distribution readiness; it does not prevent reviewing and testing this local prototype. The browser interface and dependency audit are separate technical questions.

## Source-only repository scope

The source release excludes the generated runtime, dependency tarballs, model weights and compiled application bundles. Dependency references and installation instructions support local evaluation; they are not a claim that upstream distribution is compliant. See [RELEASE.md](RELEASE.md) for the explicit publication boundary. The compiled-runtime blocker remains open.

## Source-built replacement experiment

An opt-in [pinned-source replacement](../experimental/phonemizer/README.md) now builds eSpeak NG 1.52.0 with a new GPL-marked adapter. Two English-only builds matched byte-for-byte on the tested Mac and a real Node Kokoro inference test passed. It is not the default dependency; browser validation and full source/notice delivery remain unfinished. This does not clear public synthesis-runtime hosting. The default static generator keeps inference dependencies on the developer’s machine and publishes only narration, timing/manifest data, and original player source.
