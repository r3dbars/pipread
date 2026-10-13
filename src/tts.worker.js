import { KokoroTTS } from 'kokoro-js';
import { env } from '@huggingface/transformers';
import { createModelCache } from './model-cache.js';

// No telemetry or cloud inference. Disable local path probing and use browser asset caching.
env.allowLocalModels = false;
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = createModelCache(message => self.postMessage(message));
env.backends.onnx.wasm.numThreads = 1;
// Bundle matching runtime assets with the widget; no runtime CDN dependency.
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL('../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs', import.meta.url).href,
  wasm: new URL('../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm', import.meta.url).href,
};
// Kokoro/Transformers expose no generation analytics. Enforce an asset-only
// fetch policy as well, so analytics POSTs or unexpected hosts cannot be added silently.
const assetFetch = self.fetch.bind(self);
self.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, self.location.href);
  const method = (init?.method || input?.method || 'GET').toUpperCase();
  const local = url.origin === self.location.origin;
  const model = url.origin === 'https://huggingface.co' && url.pathname.startsWith('/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/');
  if (!['GET', 'HEAD'].includes(method) || (!local && !model)) throw new Error('Blocked non-asset network request.');
  return assetFetch(input, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer' });
};
let tts;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      const start = performance.now();
      tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        device: data.backend,
        dtype: data.backend === 'webgpu' ? 'fp32' : 'q8',
        progress_callback: p => self.postMessage({ type: 'progress', file: p.file, status: p.status, progress: p.progress, loaded: p.loaded, total: p.total }),
      });
      self.postMessage({ type: 'ready', ms: performance.now() - start, backend: data.backend });
    } else if (data.type === 'generate') {
      const start = performance.now();
      const audio = await tts.generate(data.text, { voice: 'af_heart', speed: 1 });
      self.postMessage({ type: 'audio', index: data.index, samples: audio.audio, sampleRate: audio.sampling_rate, ms: performance.now() - start }, [audio.audio.buffer]);
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || String(error), phase: data.type });
  }
};
