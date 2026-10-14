# Pipread website

`public/` is the complete static website: branding, layered bird/landscape art,
local fonts and icons, the prerecorded Kokoro demo and acoustic word timings.
It is independent of the reusable `<pipread-audio>` component at the repository
root. No model or speech inference runtime is served to visitors.

From the repository root:

```sh
npm ci --ignore-scripts
npm run site:dev
npm run test:site
npm run build:site
```

Open the localhost URL printed by Vite. `dist-site/` is a plain copy of the
website suitable for a static host; building does not deploy anything.

The demo Highlight button starts on Paragraph and cycles **Paragraph → Off →
Word → Paragraph**. Words use `assets/voice-words.json` from local forced
alignment; the report in `alignment/quality.json` records uncertainty. Both
highlight modes follow the audio media clock through seeking, pause and speed
changes. The title is passage 0; body paragraphs are 1–6. The website currently
highlights body text, so the spoken title does not receive a word marker.

`tests/` provides five Node suites, including each real body-word midpoint and
the full control cycle, and clipboard success/fallback behavior. These DOM/audio fixtures are not a substitute for a real
browser or listening audit. The README GIF is an actual muted live-site capture.

Optional art-preparation scripts under `tools/art/` use the repository's
Playwright dependency and an installed Google Chrome (`channel: chrome`). They
are not needed to view, build, test or publish the website. Their exported art is
already included. Asset licensing and provenance are in `../docs/ASSETS.md`.
