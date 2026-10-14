// Art-prep tool, not part of the deployed site. Needs Node, playwright-core and an installed Google Chrome.
// Split pip-bird.png into stacked, same-frame parts for animation. node birdsplit.mjs <png> <outDir> <size>
import { chromium } from 'playwright-core'; import fs from 'node:fs';
const [src, out, size] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true }); const p = await b.newPage();
const res = await p.evaluate(async ({ d, size }) => {
  const img = new Image(); img.src = d; await img.decode(); const W = img.naturalWidth, H = img.naturalHeight, N = W * H;
  const c = new OffscreenCanvas(W, H), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); const px = g.getImageData(0, 0, W, H).data;
  const part = new Uint8Array(N); // 0 body, 1 wing, 2 eye, 3 legs, 4 chirp
  const box = (x, y, b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
  const EYE = [790, 415, 893, 544], LEGS = [500, 1028, 657, 1140], CHIRP = [1080, 330, 1210, 603];
  for (let i = 0; i < N; i++) { if (px[i * 4 + 3] < 8) continue; const x = i % W, y = (i / W) | 0, R = px[i*4], G = px[i*4+1], B = px[i*4+2], L = (R + G + B) / 765;
    if (R > 200 && G > 200 && B > 170) part[i] = 1; else if (L < .45 && box(x, y, EYE)) part[i] = 2; else if (box(x, y, LEGS) && L < .42 && R - B < 60) part[i] = 3; else if (box(x, y, CHIRP)) part[i] = 4; }
  // grow wing/eye by 3px into body so anti-aliased rims travel with the part
  for (const k of [1, 2]) for (let pass = 0; pass < 3; pass++) { const prev = part.slice(); for (let i = W; i < N - W; i++) if (prev[i] === 0 && px[i * 4 + 3] > 8 && (prev[i - 1] === k || prev[i + 1] === k || prev[i - W] === k || prev[i + W] === k)) part[i] = k; }
  // mean body orange
  let s = [0, 0, 0], n = 0; for (let i = 0; i < N; i++) if (part[i] === 0 && px[i * 4 + 3] > 250 && px[i * 4] > 180 && px[i*4] - px[i*4+2] > 80) { s[0] += px[i*4]; s[1] += px[i*4+1]; s[2] += px[i*4+2]; n++; }
  const mean = s.map(v => v / n);
  const layers = [];
  for (let k = 0; k < 5; k++) {
    const L = new ImageData(W, H);
    for (let i = 0; i < N; i++) {
      if (k === 0 && (part[i] === 1 || part[i] === 2)) { // fill the pocket under wing / eye
        const shade = part[i] === 1 ? .9 : 1, noise = (Math.random() - .5) * 6;
        L.data[i*4] = mean[0] * shade + noise; L.data[i*4+1] = mean[1] * shade + noise; L.data[i*4+2] = mean[2] * shade + noise; L.data[i*4+3] = 255; continue; }
      if (part[i] !== k) continue; L.data.set(px.subarray(i * 4, i * 4 + 4), i * 4);
    }
    const full = new OffscreenCanvas(W, H); full.getContext('2d').putImageData(L, 0, 0);
    const sm = new OffscreenCanvas(size, size), sg = sm.getContext('2d'); sg.imageSmoothingQuality = 'high'; sg.drawImage(full, 0, 0, size, size);
    const blob = await sm.convertToBlob({ type: 'image/webp', quality: .9 }); const buf = new Uint8Array(await blob.arrayBuffer()); let str = ''; for (const x of buf) str += String.fromCharCode(x);
    layers.push(btoa(str));
  }
  return { layers, mean };
}, { d: 'data:image/png;base64,' + fs.readFileSync(src).toString('base64'), size: +size });
['body', 'wing', 'eye', 'legs', 'chirp'].forEach((n, i) => { fs.writeFileSync(`${out}/${n}.webp`, Buffer.from(res.layers[i], 'base64')); console.log(n, fs.statSync(`${out}/${n}.webp`).size); });
console.log('mean', res.mean.map(Math.round)); await b.close();
