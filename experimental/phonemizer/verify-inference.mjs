// SPDX-License-Identifier: GPL-3.0-or-later
// Node 24 verification; uses an existing Transformers.js model cache, no downloads.
import {registerHooks} from 'node:module';
import assert from 'node:assert/strict';
assert.ok(process.env.PIP_MODEL_CACHE, 'Set PIP_MODEL_CACHE to an existing Kokoro fp32 cache');
registerHooks({resolve(specifier, context, next) {
  if (specifier === 'phonemizer') return {url: new URL('./adapter.mjs', import.meta.url).href, shortCircuit: true};
  return next(specifier, context);
}});
const {KokoroTTS} = await import('kokoro-js');
const {env} = await import('@huggingface/transformers');
env.cacheDir = process.env.PIP_MODEL_CACHE;
env.allowLocalModels = false;
// Cache keys use remote model URLs; block actual JS fetch even on a cache miss.
globalThis.fetch = () => { throw new Error('Network fetch disabled in this test'); };
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {device: 'cpu', dtype: 'fp32'});
try {
  const started = performance.now();
  const audio = await tts.generate('Good stories deserve a voice.', {voice: 'af_heart', speed: 1});
  let peak = 0, squares = 0;
  for (const x of audio.audio) {
    assert.ok(Number.isFinite(x));
    peak = Math.max(peak, Math.abs(x)); squares += x * x;
  }
  assert.equal(audio.sampling_rate, 24000);
  assert.ok(audio.audio.length > 24000 && peak > 0.01 && peak <= 1);
  console.log(JSON.stringify({samples: audio.audio.length, sampleRate: 24000, seconds: audio.audio.length / 24000, peak, rms: Math.sqrt(squares / audio.audio.length), generationMs: performance.now() - started}));
} finally { await tts.model.dispose(); }
