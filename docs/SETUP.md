# Setup for a blog

Use the README's `generate` configuration and standalone `<pipread-audio>` example. Render Markdown/framework posts into static HTML before extraction. Use an explicit selector and review the timing JSON transcript.

`init --dir …` makes an empty-directory source scaffold; install dependencies inside it. `generate --config …` defaults to dry-run. `--write` downloads pinned model assets only when new or changed narration needs generation. `add` defaults to static playback and requires `--manifest` and `--article`; `--browser-local` is an explicit opt-in to the held browser synthesis experiment.

Publish the generated output folder, not node_modules, the model cache, or a browser synthesis bundle. Preserve the generated player's license file. No API key is needed. A CI runner needs the same local dependencies and persistent output/model caches; the CLI does not grant deployment permissions or install a workflow in your blog. Pipread’s own repository includes test/build CI, which does not generate narration or deploy sites.

HTML editing creates backups and refuses ambiguous closing tags, symlinks, and conflicting components. Generation uses a separate managed output directory, integrity checks, locks and manifest backups. Deleted posts retire manifest entries but keep audio files. Publish files before the manifest, or deploy the site atomically.

Keep the model cache outside the published output directory, with neither containing the other. Restore the entire generated output, including its hidden `.pipread-output.json` ownership marker; a nonempty output without that marker is refused. Deleted articles are removed from the current manifest: retained audio URLs alone do not keep old player embeds working. Retain a versioned manifest with its assets when preserving older deployed pages.
