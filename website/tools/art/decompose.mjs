// Art-prep tool, not part of the deployed site. Needs Node, playwright-core and an installed Google Chrome.
// Split the approved landscape painting into individual objects with alpha.
// node decompose.mjs <mountain-paper.webp> <outDir>
// Each layer is "color-to-alpha" against the page paper, so stacking the layers over the
// paper reproduces the painting; areas one object hid behind another are diffusion-filled.
import { chromium } from 'playwright-core'; import fs from 'node:fs';
const [src, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true }); const p = await b.newPage();
p.on('console', m => console.log('[page]', m.text()));
const res = await p.evaluate(async d => {
  const img = new Image(); img.src = d; await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight, N = W * H;
  const cv = new OffscreenCanvas(W, H), g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const S = g.getImageData(0, 0, W, H).data;
  const P = [254, 250, 243];
  const R = i => S[i * 4], G = i => S[i * 4 + 1], B = i => S[i * 4 + 2];
  const alphaOf = i => { let a = 0; for (let k = 0; k < 3; k++) a = Math.max(a, 1 - Math.min(1, S[i * 4 + k] / P[k])); return a; };
  const A = new Float32Array(N); for (let i = 0; i < N; i++) A[i] = alphaOf(i);
  const lum = i => (R(i) * .3 + G(i) * .59 + B(i) * .11) / 255;
  const inBox = (x, y, bx) => x >= bx[0] && x < bx[2] && y >= bx[1] && y < bx[3];

  // ---- regions (source px) ----
  const SUN = { cx: 192, cy: 332, r: 66 };
  const SHORE_ROCKS = [[0, 428, 132, 522], [126, 498, 214, 538]];
  const HORIZON = 474, FEATHER = 4;
  const RIGHT_X = 1480;
  const TALL = [1890, 186, 2172, 470], LOW = [1840, 478, 2150, 712];

  // ---- per-pixel weights per layer (sum ≤ 1); holes marked for fill ----
  const names = ['sun', 'mountains', 'lake', 'rock', 'plantTall', 'plantLow'];
  const w = Object.fromEntries(names.map(n => [n, new Float32Array(N)]));
  const hole = Object.fromEntries(names.map(n => [n, new Uint8Array(N)]));
  // leaves run olive to yellow-green: green-minus-blue clearly exceeds red-minus-green (tan rock does not)
  const plantish = i => { const r = R(i), gg = G(i), bb = B(i); return (gg - bb) - (r - gg) > 28 || (gg >= r - 4 && gg - bb > 14) || (lum(i) < .42 && (r + gg) / 2 - bb > 18); };
  const greyish = i => R(i) - B(i) < 22; // mountains are cool grey; sun and shore rocks are warm
  // plant masks with 2px dilation
  const plantMask = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = RIGHT_X; x < W; x++) { const i = y * W + x; if (A[i] > .06 && plantish(i) && (inBox(x, y, TALL) || inBox(x, y, LOW))) plantMask[i] = inBox(x, y, TALL) ? 1 : 2; }
  for (let pass = 0; pass < 2; pass++) { const m2 = plantMask.slice(); for (let y = 1; y < H - 1; y++) for (let x = RIGHT_X; x < W - 1; x++) { const i = y * W + x; if (m2[i] || A[i] < .04) continue; const n = m2[i - 1] || m2[i + 1] || m2[i - W] || m2[i + W]; if (n && (inBox(x, y, TALL) || inBox(x, y, LOW))) plantMask[i] = n; } plantMask.set(plantMask); }
  let sunCount = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (x >= RIGHT_X) {
      if (plantMask[i] === 1) { w.plantTall[i] = 1; hole.rock[i] = 1; }
      else if (plantMask[i] === 2) { w.plantLow[i] = 1; hole.rock[i] = 1; }
      else w.rock[i] = 1;
      continue;
    }
    const dSun = Math.hypot(x - SUN.cx, y - SUN.cy);
    if (dSun <= SUN.r + 4) {
      if (!(greyish(i) && A[i] > .1)) { w.sun[i] = 1; sunCount++; continue; }
      if (dSun <= SUN.r) hole.sun[i] = 1; // disc hidden behind the ridge: filled from the sun's own colour
    }
    if (SHORE_ROCKS.some(bx => inBox(x, y, bx)) && A[i] > .06 && !(greyish(i) && y < HORIZON)) { w.lake[i] = 1; if (y < HORIZON) hole.mountains[i] = 1; continue; }
    const t = Math.min(1, Math.max(0, (y - (HORIZON - FEATHER / 2)) / FEATHER));
    w.mountains[i] = 1 - t; w.lake[i] = t;
  }
  console.log('sun px', sunCount);

  // ---- diffusion fill of hidden areas, in source RGB ----
  function filled(layer, region, iters) {
    const [x0, y0, x1, y1] = region, rw = x1 - x0, rh = y1 - y0;
    const col = new Float32Array(rw * rh * 3), known = new Uint8Array(rw * rh);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) { const i = (y + y0) * W + x + x0, j = y * rw + x; known[j] = hole[layer][i] ? 0 : 1; for (let k = 0; k < 3; k++) col[j * 3 + k] = S[i * 4 + k]; }
    // seed each hole run by interpolating the nearest known pixels on its row, then relax
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) { const j = y * rw + x; if (known[j]) continue;
      let l = x, r = x; while (l >= 0 && !known[y * rw + l]) l--; while (r < rw && !known[y * rw + r]) r++;
      const L = l >= 0 ? y * rw + l : null, Rr = r < rw ? y * rw + r : null, t = (x - l) / Math.max(1, r - l);
      for (let k = 0; k < 3; k++) col[j * 3 + k] = L !== null && Rr !== null ? col[L * 3 + k] * (1 - t) + col[Rr * 3 + k] * t : L !== null ? col[L * 3 + k] : Rr !== null ? col[Rr * 3 + k] : col[j * 3 + k]; }
    for (let it = 0; it < iters; it++) {
      const rev = it % 2;
      for (let yy = 0; yy < rh; yy++) for (let xx = 0; xx < rw; xx++) { const y = rev ? rh - 1 - yy : yy, x = rev ? rw - 1 - xx : xx; const j = y * rw + x; if (known[j]) continue; let s0 = 0, s1 = 0, s2 = 0, n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= rw || Y >= rh) continue; const q = Y * rw + X; s0 += col[q * 3]; s1 += col[q * 3 + 1]; s2 += col[q * 3 + 2]; n++; }
        col[j * 3] = s0 / n; col[j * 3 + 1] = s1 / n; col[j * 3 + 2] = s2 / n; }
    }
    return { region, rw, rh, col };
  }
  const fills = {
    rock: filled('rock', [RIGHT_X, 150, W, H], 500),
    mountains: filled('mountains', [0, 250, 400, 520], 300),
    sun: filled('sun', [SUN.cx - SUN.r - 2, SUN.cy - SUN.r - 2, SUN.cx + SUN.r + 2, SUN.cy + SUN.r + 2], 200),
  };
  const colourAt = (layer, x, y, i) => { const f = fills[layer]; if (f && hole[layer][i]) { const [x0, y0] = f.region, j = (y - y0) * f.rw + (x - x0); return [f.col[j * 3], f.col[j * 3 + 1], f.col[j * 3 + 2]]; } return [S[i * 4], S[i * 4 + 1], S[i * 4 + 2]]; };

  // ---- build each layer: colour-to-alpha against P ----
  const results = {};
  for (const name of names) {
    const L = new Uint8ClampedArray(N * 4); let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; let wt = w[name][i];
      if (hole[name][i]) wt = 1; // filled area belongs to this layer
      if (!wt) continue;
      const c = colourAt(name, x, y, i); const r = c.map((v, k) => Math.min(1, v / P[k]));
      let a = Math.max(1 - r[0], 1 - r[1], 1 - r[2]);
      if (a < .028) continue;
      a = a * Math.min(1, (a - .028) / .03);
      const out = r.map((rk, k) => (1 - (1 - rk) / Math.max(a, 1e-4)) * P[k]);
      L[i * 4] = out[0]; L[i * 4 + 1] = out[1]; L[i * 4 + 2] = out[2]; L[i * 4 + 3] = Math.round(a * wt * 255);
      if (L[i * 4 + 3] > 2) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x + 1); by1 = Math.max(by1, y + 1); }
    }
    const pad = 4; bx0 = Math.max(0, bx0 - pad); by0 = Math.max(0, by0 - pad); bx1 = Math.min(W, bx1 + pad); by1 = Math.min(H, by1 + pad);
    const cw = bx1 - bx0, ch = by1 - by0, oc = new OffscreenCanvas(cw, ch), og = oc.getContext('2d');
    const id = og.createImageData(cw, ch); for (let y = 0; y < ch; y++) id.data.set(L.subarray(((y + by0) * W + bx0) * 4, ((y + by0) * W + bx1) * 4), y * cw * 4);
    og.putImageData(id, 0, 0);
    const blob = await oc.convertToBlob({ type: 'image/webp', quality: .86 }); const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (const x of buf) s += String.fromCharCode(x);
    results[name] = { box: [bx0, by0, bx1, by1], webp: btoa(s), bytes: buf.length };
  }
  return { W, H, results };
}, 'data:image/webp;base64,' + fs.readFileSync(src).toString('base64'));
const meta = { source: { width: res.W, height: res.H }, layers: {} };
for (const [n, r] of Object.entries(res.results)) { fs.writeFileSync(`${out}/${n}.webp`, Buffer.from(r.webp, 'base64')); meta.layers[n] = r.box; console.log(n, r.box, r.bytes); }
fs.writeFileSync(`${out}/layers.json`, JSON.stringify(meta, null, 1));
await b.close();
