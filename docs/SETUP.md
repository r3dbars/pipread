# Agent and maintainer setup

## Scope

This is a source-only local preview. Do not create remote repositories, publish packages, deploy, or redistribute built speech assets as part of setup. See RELEASE.md for the unresolved runtime provenance boundary.

## Install from GitHub

Clone the source-only repository and run:

```sh
git clone https://github.com/r3dbars/pipread.git
cd pipread
npm ci --ignore-scripts
npm run test:cli
npm run build
npm run dev
```

No npm package has been published. Use `node bin/pipread.mjs --help` from the cloned checkout. No install lifecycle script is needed. `npm ci --ignore-scripts` deliberately skips native inference dependency installers; Node inference is not supported. The browser's tested ONNX runtime is bundled by Vite.

## Preview, then integrate

1. Use `init --dir <new-empty-directory>` for a dry-run; add `--write` after reviewing it. Initialize once; repeated calls do not overwrite files.
2. Run npm install/build commands in that generated source directory. The player source contains bare package imports and needs the Vite build. It is not a standalone unbuilt script.
3. Use `add --html <existing-file> --selector '<CSS-selector>'` to preview the exact HTML insertion; add `--write` to save with a sibling `.article-voice-backup`.
4. Host the generated `dist/` locally at the configured `--script-url`, retaining sibling assets and notices. `add` only edits HTML; it does not deploy or copy runtime assets.
5. Verify the selector and placement in a browser. For framework templates, manually insert the two elements from README instead of running the HTML editor.
6. Roll back by restoring the backup after reviewing any subsequent edits. Never overwrite unrelated host changes blindly.

Only named static HTML files are edited. No recursive website scanning, shell execution, package install, credential access or network action occurs inside the CLI. The CLI rejects symlink paths; on macOS `/tmp` aliases `/private/tmp`, so use the canonical path when testing temporary directories.

## Verification

`npm test` needs installed Google Chrome. It tests extraction, lifecycle, pitch, highlights and desktop/narrow layouts. It writes ignored screenshots/results. One optional test decodes `docs/samples/heart-wasm.wav`, a locally generated fixture excluded from source distribution. Without it that test is skipped. For fresh real inference evidence, `npm run benchmark` downloads the official models, runs cold/warm GPU/CPU generation and writes audio/results under the OS temporary directory. To run the optional PCM test, copy the benchmark's `article-voice-wasm.wav` into `docs/samples/heart-wasm.wav` locally.

Highlight timings measure media position and estimated PCM activity, not verified spoken-word boundaries. No cloud alignment is added. Test a human-annotated speech sample before claiming exact word synchronization.
