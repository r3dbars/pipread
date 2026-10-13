import { defineConfig } from 'vite';
import { readFileSync, readdirSync } from 'node:fs';
export default defineConfig({
  base: './',
  plugins: [{
    name: 'retain-distribution-notices',
    generateBundle() {
      for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'docs/LICENSING.md', 'docs/RELEASE.md', ...readdirSync('licenses').map(name => `licenses/${name}`)]) {
        this.emitFile({ type: 'asset', fileName: file, source: readFileSync(file) });
      }
    },
  }],
  worker: { format: 'es' },
  build: { rollupOptions: { input: { demo: 'index.html', 'article-voice': 'src/article-voice.js' }, output: { entryFileNames: '[name].js' } } },
});
