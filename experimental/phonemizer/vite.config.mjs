import {defineConfig, mergeConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import base from '../../vite.browser-local.config.js';
export default mergeConfig(base, defineConfig({
  resolve: {alias: [{find: /^phonemizer$/, replacement: fileURLToPath(new URL('./adapter.mjs', import.meta.url))}]},
  build: {outDir: 'experimental/phonemizer/generated/site-build'},
}));
