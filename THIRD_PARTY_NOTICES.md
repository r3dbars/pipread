# Third-party notices

Original Pipread code is MIT. The complete built bundle is not solely MIT.

| Component | Pinned version / model | Upstream declaration |
|---|---|---|
| [kokoro-js](https://github.com/hexgrad/kokoro/tree/main/kokoro.js) | 1.2.1 | Apache-2.0 |
| [Kokoro weights](https://huggingface.co/hexgrad/Kokoro-82M) / [ONNX conversion](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) | v1.0, q8 and fp32 | Apache-2.0 |
| [Transformers.js](https://github.com/huggingface/transformers.js) | 3.8.1 | Apache-2.0 |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | 1.22.0-dev.20250409-89f8206ba4 | MIT + upstream third-party notices |
| [phonemizer.js](https://github.com/xenova/phonemizer.js) wrapper | 1.2.1 | Apache-2.0 |
| [eSpeak NG](https://github.com/espeak-ng/espeak-ng#license-information), embedded by phonemizer.js | upstream bundled implementation | GPL-3.0-or-later |
| [Phonon 31m](https://huggingface.co/gradium/phonon-31m-en) / [ptts](https://github.com/gradium-ai/xn-ptts) (optional local CLI) | phonon-31m-en, ptts 0.4.x | Apache-2.0 (weights); MIT OR Apache-2.0 (runtime) |

The bundle also includes `@huggingface/jinja@0.5.10` (MIT). eSpeak attribution includes Jonathan Duddington and Reece H. Dunn; the complete attribution set for the exact embedded build still needs confirmation.

Copies of the main dependency license texts are in `licenses/`. Preserve upstream notices when redistributing. eSpeak NG's license differs from the npm wrapper metadata. Before publishing a bundled distribution, resolve the corresponding-source and license obligations for the exact embedded eSpeak build; this local prototype does not claim that all bundled runtime code is permissively licensed. Upstream wrapper source: <https://github.com/xenova/phonemizer.js>; eSpeak source: <https://github.com/espeak-ng/espeak-ng>.

No model weights are committed. Assets are downloaded directly by the browser. No voice cloning feature is included.

See [the exact source-provenance review and publication prerequisites](docs/LICENSING.md). The build includes this notice, upstream license texts and the review. These files are not a claim of completed GPL corresponding-source compliance.
