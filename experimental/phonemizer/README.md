# Source-built phonemizer experiment — distribution still held

This is an opt-in replacement for the unexplained native payload inside `phonemizer@1.2.1`. It does not change the default player, package dependencies, Site, or release boundary. Generated files are ignored. No runtime was published. This is engineering evidence, not legal clearance.

## What is attributable

- Official [eSpeak NG 1.52.0 source](https://github.com/espeak-ng/espeak-ng/tree/4870adfa25b1a32b4361592f1be8a40337c58d6c), commit `4870adfa25b1a32b4361592f1be8a40337c58d6c`. Native library, bundled ucd-tools, phoneme sources, dictionary sources, and language files come from that tree. Preserve its per-file copyrights, `COPYING`, `COPYING.BSD2`, and other component notices. eSpeak is GPL-3.0-or-later; do not describe this bundle as MIT-only.
- Official [Emscripten SDK 4.0.10](https://github.com/emscripten-core/emsdk/tree/62a853cd3b3134398ce85cde8bb5cbb2ef0194cb), SDK commit `62a853cd3b3134398ce85cde8bb5cbb2ef0194cb`; compiler identifies `b7dc6e5747465580df5984e723b9d1f10d8e804b`. Emscripten offers MIT/NCSA terms; linked system-library components have their own notices (including musl). Collect those notices from the pinned SDK before distribution.
- `espeak-1.52.0.patch` records both changes: honor `USE_LIBSONIC=OFF` before downloading Sonic, and include Emscripten's wchar declarations before eSpeak's classification macros. No upstream generated phonemizer is reused.
- `bridge.c`, `adapter.mjs`, build recipe and verification files are new GPL-3.0-or-later evaluation code. The bridge calls the public `espeak_TextToPhonemes` API. The adapter supports only `en-us`, sufficient for Heart.
- Existing Kokoro/Transformers/model Apache notices and ONNX Runtime MIT/third-party notices remain applicable. This experiment does not resolve every combined-work or source-delivery question.

## Rebuild locally

Use the two official Git checkouts above at their exact commits. Install and activate Emscripten 4.0.10 inside its checkout. Put CMake 3.31.6 and Ninja 1.11.1.3 on PATH (tested using isolated PyPI tools). A host C compiler is also needed. On the tested Mac, Apple Clang came from Xcode; Node was 24.21.0.

```sh
PIP_ESPEAK_SOURCE=/absolute/path/to/espeak-ng \
PIP_EMSDK=/absolute/path/to/emsdk \
PIP_BUILD_DIR=/absolute/path/to/a-new-empty-build-directory \
bash experimental/phonemizer/build.sh

node experimental/phonemizer/verify.mjs

# Existing Transformers.js fp32 model cache; this test blocks JS fetch.
PIP_MODEL_CACHE=/absolute/path/to/model-cache \
node experimental/phonemizer/verify-inference.mjs

# Opt-in local bundle; the ordinary build stays unchanged.
npx vite build --config experimental/phonemizer/vite.config.mjs
```

The native build compiles language/phoneme data; the WASM build compiles the library. Packaging retains only `en_dict`, `phondata`, `phonindex`, `phontab`, `intonations`, and `lang/gmw/en` plus `en-US`. Full upstream preferred source must still accompany any eventual covered distribution. Sonic, pcaudiolib, MBROLA, speechPlayer and asynchronous audio output are disabled. The adapter does not synthesize eSpeak audio or contact a service.

## Actual verification, 2026-10-13

Passed: native compilation; WASM compilation; the complete recipe from fresh extracted source; repeat fresh build; four deterministic phoneme cases; empty-input, NUL, language and size guards; actual Kokoro Heart synthesis with replacement phonemizer; Vite worker bundling. No original `eSpeakNGWorker` or `synthesize_ipa` marker was found in the resulting worker bundle.

The Heart inference test produced 55,200 finite samples at 24 kHz (2.3 seconds), peak 0.4400 and RMS 0.06368; generation took 268–288 ms with the model already loaded on this Mac. It used Node CPU fp32 inference plus the source-built WASM phonemizer. This is **not** a browser GPU/WASM benchmark or a listening-quality approval. The native ONNX runtime printed a telemetry-device-ID persistence warning; blocking JS fetch does not prove native telemetry disabled. Do not carry an unverified native-telemetry claim into product copy. The production browser path still requires its own request audit.

Two clean English-only builds produced identical SHA-256 hashes:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| espeak.mjs | 69,614 | `9c7d634675061e2d79c8ac3f83f848c41ff2ad6aaf25b3a9f5b8c161a25d46f9` |
| espeak.wasm | 304,480 | `c84d8827cf96d9164513ae1f6a430e7c6eeff39e0fa4654fa9847c39c33ce4a5` |
| espeak.data | 827,621 | `66c36c462cf1693ab179baaea74a2d4330cbc8dd72eed20696b12e734fa702dd` |

This establishes repeatability on this host/toolchain, not cross-platform bit reproducibility. The earlier all-language experiment had differing dictionaries unrelated to English; it is not the shipped candidate. Pronunciation output differs from the old payload for some vowels (for example “stories” and “source”); broader pronunciation and human listening checks remain necessary.

## Concrete Site worker integration plan

1. Use this opt-in Vite config to alias the exact `phonemizer` import to `adapter.mjs`. Keep Kokoro, the worker protocol, lazy model loading, explicit article extraction, cancellation and bounded chunk prefetch intact. Do not embed compiled files into Site HTML manually.
2. Self-host the complete emitted module-worker bundle and its hashed assets under one origin. The adapter resolves the packaged data/WASM through explicit URLs; it never calls a speech service. Supply the model weights/config/tokenizer/Heart assets via the existing asset-only download path. Pin model revisions and verify hashes before a release.
3. Make “Try listening” call the actual custom-element player after an explicit user gesture. Display model/asset bytes and progress, initialize the worker only on demand, retain IndexedDB cache behavior and show recoverable download/storage errors. The 1,201,715-byte phonemizer package is additional to model and ONNX runtime downloads. Its HTTP caching must be tested separately from the existing model cache.
4. Before serving anything publicly, assemble and test the complete corresponding-source package: pinned upstream trees, full modifications, bridge/adapter, preferred JS source, dependency locks, build/control scripts, toolchain references, retained copyright/license texts and applicable interactive notices. Put clear equivalent source access alongside executable downloads. Review applicable combined-work terms. Merely linking today's upstream repo or these notes is insufficient.
5. Run real browser WebGPU **and** WASM inference with this candidate. Test worker CSP, asset URLs, cold/warm cache behavior, cancellation/retry, repeated controls, changing text, denied GPU, private/storage failure, and audio quality. Vite reported an externalized Node `module` import in the generated cross-environment loader; the browser-only branch must be exercised before acceptance.

**Remaining hold:** browser execution/regression and human voice evaluation are untested for this replacement; complete corresponding-source delivery and notice/terms review are unfinished. No Site edits or public runtime deployment are authorized by these passing local build tests alone.
