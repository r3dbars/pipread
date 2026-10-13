# Pipread 🐦

### Give your blog a play button.

A small web component that reads articles with a local English voice. No speech API key. No per-character inference bill. Your article stays in the browser.

**Source-only preview.** You can try and integrate it locally today. Public distribution of the compiled speech runtime is still blocked by unresolved eSpeak source provenance. This repository does not include that runtime or model weights. Read the [release boundary](docs/RELEASE.md) before hosting a build for others.

## Listen locally

Requires Node 22.12+ and installed Google Chrome for the tested path.

```sh
git clone https://github.com/r3dbars/pipread.git
cd pipread
npm ci --ignore-scripts
npm run dev
```

Open the localhost URL printed by Vite (normally `http://127.0.0.1:5173`). Press **Listen to this article**. The model downloads only on first use, with progress and best-effort caching.

There is no published npm package. **Do not use `npx pipread`.** Clone this repository and run its included CLI with Node. Repository: [r3dbars/pipread](https://github.com/r3dbars/pipread).

## A tiny CLI, with preview first

Create a standalone source project:

```sh
node bin/pipread.mjs init --dir ../my-reader
# Review the dry-run, then explicitly write:
node bin/pipread.mjs init --dir ../my-reader --write
cd ../my-reader
npm ci --ignore-scripts
npm run dev
```

Add the component to an existing **static HTML** file:

```sh
node bin/pipread.mjs add --html ../my-blog/post.html --selector '#story'
node bin/pipread.mjs add --html ../my-blog/post.html --selector '#story' --write
```

The CLI defaults to dry-run. Writes create a backup, preserve other HTML, refuse conflicting players and symlink paths, and do nothing when repeated with the same configuration. It inserts the player before `</body>`; move the managed block below your byline for the demo layout. Selector validity is checked at runtime. Framework templates need the manual example below.

`add` does not copy runtime assets. Its default script URL is `/voice/dist/article-voice.js`; change it with `--script-url /your/local/path/article-voice.js`. Build the source project with `npm run build`, then arrange the generated `dist/` at that URL on your **local preview server**. Keep all worker/runtime assets and notices together. Public hosting remains on hold.

## Or use two elements

```html
<article id="story">
  <h1>Your title</h1>
  <p>Your story, with <em>emphasis</em> and links intact.</p>
  <p data-no-read>Skip this author note.</p>
</article>
<script type="module" src="/voice/dist/article-voice.js"></script>
<article-voice article="#story" backend="auto"></article-voice>
```

No framework or app server is required after a local build. Use HTTPS or localhost, not `file://`. The [sample HTML](examples/article.html) and [agent setup guide](docs/SETUP.md) explain the source/build layout. MCP would add a server and permissions for a two-element integration, so this project uses a CLI and plain instructions instead.

## What readers get

- Play, pause, resume, ±15 seconds, mute and pitch-preserving speed.
- A timeline for **prepared audio**, with a `+` until full duration is known. Seeking never skips ungenerated text.
- Optional highlighting, off by default. Passage mode follows the actual chunk. **Words (approximate)** is an experimental audio-activity/syllable estimate, not precise alignment. Numbers and abbreviations fall back to passage highlighting. No forced scrolling.
- Explicit article selection; navigation, code and hidden content excluded.
- One English voice: Kokoro `af_heart`. No cloning.

## Local speech still has costs

First use downloads approximately **93 MB of CPU weights** or **326 MB of GPU weights**, plus a 0.52 MB voice and about 22 MB of raw runtime assets (smaller over compressed HTTP). The browser caches assets when storage permits. Switching backends can download both models. Hosts still pay bandwidth; readers use memory, CPU/GPU and battery.

Text/audio stay on-device. Model requests go to Hugging Face and its download infrastructure; those hosts see IP/request metadata. Runtime files come from your site. There is no telemetry SDK or cloud inference. Worker fetches are restricted to same-origin assets and the model path. The upstream model revision currently resolves `main`; it is not content-pinned.

## Engine and architecture

Kokoro-js 1.2.1 + Transformers.js 3.8.1 run in a lazy dedicated worker. Auto prefers WebGPU with vendor-recommended fp32; no adapter selects q8 WASM. GPU initialization errors require an explicit CPU retry, avoiding a silent second large download. Model assets use IndexedDB; small voice embeddings use Cache API. One chunk is prepared ahead. Backward seeking retains a rolling 32 MiB WAV history.

The smaller KittenTTS browser alternative was evaluated, but was not selected because this prototype had stronger end-to-end evidence for Kokoro's GPU and CPU paths. This is a compatibility choice, not a controlled voice-quality ranking.

`src/text.js` maps normalized text back to original DOM nodes. `src/highlight.js` uses CSS Custom Highlight ranges without wrapping text. `src/article-voice.js` coordinates native audio and cancellation. Attribute changes and Stop cancel the session; text is snapshotted on Listen. Model download completion does not guarantee playback permission—Resume handles autoplay restrictions.

## Tested—and not tested

Desktop Chrome 155 on Apple M5 Max: real GPU and WASM generation, caching and playback. Observed first audio in one cold/warm run: GPU **35.57 / 1.90 seconds**, CPU **16.08 / 6.59 seconds**. These are individual measurements, not service-level promises. Cold transfers dominated setup; warm runs made zero external model requests. Controls, text mapping and errors have automated tests; mocked synthesis isolates lifecycle cases.

```sh
npm run test:cli
npm test
npm run build
# With npm run preview in another terminal:
npm run benchmark
```

Safari, Firefox, Edge, actual mobile, offline and background playback are **unverified**. A narrow viewport test is not a mobile test. Browsers lacking modern modules, workers, WebAssembly/SIMD or Intl.Segmenter are unsupported. Highlighting additionally needs CSS Custom Highlight support. Subjective voice quality, word-boundary accuracy and long-session memory have not been independently validated. See [highlighting limits](docs/HIGHLIGHTING.md).

## Troubleshooting

| Symptom | Check |
|---|---|
| Page will not open | Start `npm run dev` and use its printed URL; the terminal must remain running. |
| Long first load | Allow the model download; inspect per-file progress. CPU is the smaller download. |
| GPU error | Press the explicit CPU retry button; this may download another model. |
| No readable text | Check the selector, hidden ancestors and `data-no-read`. |
| No sound | Resume after browser autoplay denial; check mute and system volume. |
| Missing worker or WASM | Keep all build assets together; serve JS/WASM with correct MIME types over localhost/HTTPS. |
| Downloads repeat | Private browsing, quota limits or eviction may prevent caching. |
| Word highlight feels off | Use Passage mode; word timing is approximate, not forced alignment. |

Original code is MIT. Dependencies retain their own licenses, including the embedded eSpeak GPL component. See [third-party notices](THIRD_PARTY_NOTICES.md) and [licensing review](docs/LICENSING.md). A free API bill does not mean a license-free runtime.
