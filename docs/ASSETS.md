# Branding and demo assets

- Pipread's bird, paper textures and landscape artwork are project branding assets,
  supplied with the website source. PNG originals and derived WebP layers are
  retained. The optional art tools describe how the bird/landscape layers were
  prepared; their random texture fills need not reproduce pixels exactly.
- Fraunces is bundled with its SIL Open Font License in
  `website/public/assets/fonts/OFL.txt`.
- Solar icons by 480 Design retain their CC BY 4.0 attribution in
  `website/public/assets/icons/ATTRIBUTION.txt` and the website footer.
- Demo narration is generated locally with Kokoro Heart. Model weights and
  synthesizer runtimes are not included. The WAV SHA-256 is
  `4d232dd92529cfabd9f0bd2cb0901da5a4d8a36d464428425ddb3d9220efbed7`;
  duration is 88.675 seconds. Transcript and paragraph/chunk timings accompany it.
- `voice-words.json` contains 242 acoustic forced-alignment tokens. Its SHA-256 is
  `daa0505b401b210972d1bb9e3dc28055a838546e3d6ac86c1c4f67d9a2f5dca6`.
  See `website/alignment/` for model/package provenance and quality limitations.
- `docs/media/pipread-word-highlighting.gif` is a real website capture: 880×640,
  8.59 seconds, 63 distinct decoded frames. Audio time advances 3.249–11.703
  seconds while the word highlight advances from “Pipread” to “Sometimes”. It
  was captured muted and is not evidence of an audible timing audit. SHA-256:
  `7b87e3df3588b76b6baa6cabd935777be7ca03df6a1a8e60645602358d31b041`.

Repository code licensing and third-party runtime notices remain in LICENSE,
THIRD_PARTY_NOTICES.md and licenses/. Publishing the static demo does not clear
the separate browser-local synthesis runtime's unresolved distribution work.
