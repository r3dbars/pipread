// SPDX-License-Identifier: GPL-3.0-or-later
// Local evaluation only. See README.md and the repository distribution hold.
import createEspeak from './generated/espeak.mjs';
const assets = {
  'espeak.wasm': new URL('./generated/espeak.wasm', import.meta.url),
  'espeak.data': new URL('./generated/espeak.data', import.meta.url),
};
const ready = createEspeak({ locateFile(name) {
  const url = assets[name];
  if (!url) throw new Error('Unexpected phonemizer asset: ' + name);
  return url.protocol === 'file:' ? decodeURIComponent(url.pathname) : url.href;
} }).then(module => {
  if (module.ccall('pip_init', 'number', [], []) !== 0) throw new Error('eSpeak initialization failed');
  return module;
});

// This narrow adapter intentionally exposes only the English voice used by Pipread.
// A worker handles one synchronous call at a time; no global page mutation or telemetry.
export async function phonemize(text, language = 'en-us') {
  if (language !== 'en-us') throw new Error('This evaluation adapter supports en-us only');
  if (typeof text !== 'string' || text.includes('\0') || text.length > 10000) throw new Error('Invalid phonemizer input');
  if (!text.trim()) return [];
  const module = await ready;
  const output = module.ccall('pip_phonemize', 'string', ['string', 'string'], [text, language]);
  if (!output) throw new Error('Phonemization failed');
  return output.split('\n').filter(Boolean);
}
