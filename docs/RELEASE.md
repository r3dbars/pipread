# Static audio publishing and optional runtime boundary

The default CLI generates narration on the developer’s machine and emits an original standalone player plus WAV/timing/manifest files. Those generated outputs can be published with the blog without shipping the model or synthesis runtime. Review rights to the article and output before publishing. No blanket legal clearance is asserted.

The following hold applies specifically to the optional browser-local synthesis runtime. It does not prohibit hosting the standalone static player and generated narration.

## Optional synthesis runtime

This repository distributes original JavaScript/HTML source, dependency version references and license notices. It does **not** distribute model weights, generated/minified speech bundles, dependency packages, phonemizer/eSpeak binaries, or prebuilt release archives. Install dependencies from their upstream registry for local evaluation. The CLI only scaffolds source and edits explicitly named HTML files; it never downloads/builds/deploys a runtime itself.

This is a bounded source-review release, not legal clearance and not a production-ready audio distribution. The MIT license covers original code only. A dependency declaration does not relicense its contents. The unresolved eSpeak payload provenance described in LICENSING.md remains a blocker for distributing or serving built assets to other people. No binary release, CDN artifact, npm runtime package or hosted demo should accompany this source release.

## Before public runtime distribution

- Obtain matching native eSpeak revision, modifications, dictionaries and build/control scripts for the actual phonemizer payload, or replace it with a provenance-complete implementation.
- Rebuild and validate the replacement or assemble verified matching corresponding source.
- Review applicable GPL combined-work, notice and corresponding-source delivery requirements. Preserve original and third-party notices.
- Re-run GPU/WASM inference and browser tests; assess voice quality and timing independently.
- Only then reassess public bundle hosting. These steps are not complete.

## Source release checklist

- [x] User approved public `r3dbars/pipread`; authenticated owner verified.
- [ ] Commit only explicitly reviewed source, fixtures, tests, documentation and license texts.
- [ ] Verify no generated bundles, models, local recordings, screenshots, Library IDs, machine paths, personal references, credentials or internal investigation logs are included.
- [ ] Run CLI dry-run/write/idempotence/refusal tests and browser regression tests.
- [ ] Test documented clone/install/build commands from a fresh local clone.
- [ ] Review staged diff and secret-pattern scan. A pattern scan is not a guarantee of absence.
- [ ] Remote creation/push only after authorization is confirmed.

No npm publication or deployment is part of this release.
