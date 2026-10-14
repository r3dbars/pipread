'use strict';
// The hero scene: Pip's one-time arrival, then small signs of life.
// Decorative only. It never touches the player, and visitors who prefer reduced motion
// keep the finished, still scene that the stylesheet draws without any script.
(() => {
 const root = document.documentElement;
 const scene = document.querySelector('.hero-scene');
 const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
 if (!scene || calm.matches || typeof Element.prototype.animate !== 'function') {
  root.classList.remove('scene-intro');
  return;
 }
 const q = selector => scene.querySelector(selector);
 const perch = q('.bird-perch'), pip = q('.pip'), turn = q('.pip-turn'), pose = q('.pip-pose');
 const wing = q('.pip-wing'), legs = q('.pip-legs'), eye = q('.pip-eye'), chirp = q('.pip-chirp');
 const shadow = q('.pip-shadow'), sunLayer = q('.sun-layer'), tallPlant = q('.plant-tall'), lowPlant = q('.plant-low');

 // ---- Timeline, in ms after take-off ----
 const CRUISE = 5200;       // from a speck by the sun to the approach above the rock
 const GLIDE = 1000;        // the unhurried glide in
 const FLY = CRUISE + GLIDE; // feet touch the rock
 const TURN = FLY + 720;    // a small hop round to face the page
 const CHIRP = TURN + 620;  // and a hello
 const END = CHIRP + 520;
 const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
 const smooth = t => t * t * (3 - 2 * t);
 const at = ms => clamp(ms / END, 0, 1);
 const HINGE = 17.68; // the wing's top edge, in degrees from horizontal
 const wingAt = deg => `rotate(${HINGE}deg) rotateX(${deg}deg) rotate(${-HINGE}deg)`;

 // Keyframes from [ms, props] pairs; the last pair is held to the end of the timeline.
 function track(points) {
  const frames = [...points].sort((a, b) => a[0] - b[0]).map(([ms, props]) => ({ offset: at(ms), ...props }));
  if (frames[frames.length - 1].offset < 1) frames.push({ ...frames[frames.length - 1], offset: 1 });
  return frames;
 }

 // ---- The flight path, measured from the live layout ----
 function plan() {
  const p = perch.getBoundingClientRect();
  const s = sunLayer.getBoundingClientRect();
  const card = document.querySelector('.article-card')?.getBoundingClientRect();
  const size = p.width;
  const feet = { x: p.left + size * .47, y: p.top + size * .905 };
  // The sun object sits at 16.273% of its group and is 17.585% wide (see style.css).
  const sunW = s.width * .17585;
  const start = { x: s.left + s.width * .16273 + sunW * .55, y: s.top + sunW * .62 };
  // Skim low across the lake, just above the paper card and below the button.
  const low = card ? card.top - 7 : feet.y + size;
  const approach = { x: feet.x - Math.max(64, size * 1.25), y: feet.y - Math.max(34, size * .7) };
  // On narrow screens that approach would pass behind the button: start right of it, below it, and hop up.
  const cta = document.querySelector('.listen-button')?.getBoundingClientRect();
  if (cta && approach.x - size * .5 < cta.right + 8) {
   approach.x = Math.max(approach.x, Math.min(feet.x - 8, cta.right + size * .55));
   approach.y = Math.max(approach.y, cta.bottom + 6 + size * .8);
  }
  const c1 = { x: start.x + (approach.x - start.x) * .3, y: low };
  const c2 = { x: start.x + (approach.x - start.x) * .72, y: low };
  const bez = (a, b, c, d, t) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
  const cruise = u => ({ x: bez(start.x, c1.x, c2.x, approach.x, u), y: bez(start.y, c1.y, c2.y, approach.y, u) });
  return { size, feet, approach, cruise, cta, card };
 }

 function choreograph() {
  const { size, feet, approach, cruise, cta, card } = plan();
  const path = [], tilt = [];
  // Cruise. Pip flies toward us at a steady speed, easing off near the end, so in perspective it
  // barely seems to move while far away and grows faster as it nears. For a straight path in
  // depth, screen position moves in step with apparent size, so progress along the curve is tied
  // to scale.
  const S0 = .12, S1 = .86;
  const scaleAt = t => 1 / (1 / S0 - (1 / S0 - 1 / S1) * (1 - (1 - t) ** 1.5));
  const progressAt = t => (scaleAt(t) - S0) / (S1 - S0);
  // Small birds fly in bounds: a burst of beats lifts them, then wings fold and they dip.
  const BOUND = 760, BURST = .6;
  const lift = ms => { const ph = (ms % BOUND) / BOUND; return ph < BURST ? (1 - Math.cos(Math.PI * ph / BURST)) / 2 : (1 + Math.cos(Math.PI * (ph - BURST) / (1 - BURST))) / 2; };
  const bounding = t => 1 - smooth(clamp((t - .8) / .2, 0, 1)); // steadies for the approach
  const BOB = .22; // bound height, as a share of Pip's apparent size

  // The curve, resampled by length so equal progress is equal distance on screen.
  const DENSE = 240, line = [];
  for (let i = 0, len = 0, prev = cruise(0); i <= DENSE; i++) {
   const pt = cruise(i / DENSE); len += Math.hypot(pt.x - prev.x, pt.y - prev.y); prev = pt; line.push({ ...pt, len });
  }
  for (const pt of line) { pt.a = pt.len / line[DENSE].len; pt.scale = S0 + (S1 - S0) * pt.a; }
  // Keep clear of the page: under the button (even at the top of a bound) and above the paper card.
  // Each point gets the range it may occupy; corrections are blended into their neighbours so the
  // path bends rather than kinks.
  const over = (pt, box, pad) => box && pt.x + .33 * size * pt.scale > box.left - pad && pt.x - .37 * size * pt.scale < box.right + pad;
  const delta = line.map(pt => {
   const lo = over(pt, cta, 6) ? cta.bottom + 5 + (.725 + BOB) * size * pt.scale : -Infinity;
   const hi = over(pt, card, 40) ? card.top - 4 : Infinity;
   return (lo <= hi ? clamp(pt.y, lo, hi) : lo) - pt.y;
  });
  const reach = 16, falloff = d => d === 0 ? 1 : d < reach ? .5 + .5 * Math.cos(Math.PI * d / reach) : 0;
  line.forEach((pt, i) => {
   let down = 0, up = 0;
   delta.forEach((d, j) => { const w = falloff(Math.abs(i - j)); down = Math.max(down, d * w); up = Math.min(up, d * w); });
   pt.y += down + up;
   if (over(pt, card, 40) && !over(pt, cta, 6)) pt.y = Math.min(pt.y, card.top - 4);
  });
  const pointAt = a => {
   let i = 0; while (i < DENSE - 1 && line[i + 1].a < a) i++;
   const p0 = line[i], p1 = line[i + 1], k = clamp((a - p0.a) / Math.max(1e-6, p1.a - p0.a), 0, 1);
   return { x: p0.x + (p1.x - p0.x) * k, y: p0.y + (p1.y - p0.y) * k };
  };
  const flightAt = ms => {
   const t = clamp(ms / CRUISE, 0, 1), base = pointAt(progressAt(t)), scale = scaleAt(t);
   return { x: base.x, y: base.y - lift(ms) * BOB * size * scale * bounding(t), scale, t };
  };
  const STEP = 60;
  for (let ms = 0; ms <= CRUISE; ms += STEP) {
   const now = flightAt(ms), next = flightAt(Math.min(CRUISE, ms + STEP));
   // Nose follows the path, lifting through each burst and tipping down into each dip.
   const climb = (lift(ms + 30) - lift(ms - 30)) * bounding(now.t);
   const pitch = clamp(Math.atan2(next.y - now.y, next.x - now.x + 1e-3) * 180 / Math.PI * .35, -9, 9) - clamp(climb * 30, -7, 7);
   const haze = clamp(1 - progressAt(now.t) / .45, 0, 1);
   path.push([ms, {
    transform: `translate(${(now.x - feet.x).toFixed(1)}px,${(now.y - feet.y).toFixed(1)}px) scale(${now.scale.toFixed(3)})`,
    opacity: clamp(ms / 500, 0, 1),
    filter: `saturate(${(1 - .45 * haze).toFixed(2)}) brightness(${(1 + .08 * haze).toFixed(3)})`,
   }]);
   tilt.push([ms, { transform: `translateY(0px) rotate(${pitch.toFixed(1)}deg) scale(1,1)` }]);
  }
  // Glide in: float up a touch, flare, and settle onto the feet.
  for (let i = 1; i <= 10; i++) {
   const g = i / 10, e = 1 - (1 - g) ** 2;
   const x = approach.x + (feet.x - approach.x) * e;
   const y = approach.y + (feet.y - approach.y) * e - Math.sin(g * Math.PI) * size * .12;
   path.push([CRUISE + (FLY - CRUISE) * g, {
    transform: `translate(${(x - feet.x).toFixed(1)}px,${(y - feet.y).toFixed(1)}px) scale(${(.86 + .14 * g).toFixed(3)})`,
    opacity: 1, filter: 'saturate(1) brightness(1)',
   }]);
  }
  const flare = (ms, deg) => tilt.push([ms, { transform: `translateY(0px) rotate(${deg}deg) scale(1,1)` }]);
  flare(FLY - 220, -14); flare(FLY - 70, -4);
  const body = (ms, y, deg, sx, sy) => tilt.push([ms, { transform: `translateY(${(y * size).toFixed(1)}px) rotate(${deg}deg) scale(${sx},${sy})` }]);
  body(FLY, 0, 0, 1, 1); body(FLY + 90, 0, 0, 1.12, .85); body(FLY + 220, 0, 0, .96, 1.05); body(FLY + 360, 0, 0, 1, 1);
  body(TURN, 0, 0, 1, 1); body(TURN + 170, -.16, 0, .98, 1.03); body(TURN + 340, 0, 0, 1.06, .92); body(TURN + 470, 0, 0, 1, 1);
  // Facing the page, the body is mirrored: a negative turn here lifts the beak.
  body(CHIRP, 0, 0, 1, 1); body(CHIRP + 150, 0, -8, 1, 1); body(CHIRP + 320, 0, 2, 1, 1); body(CHIRP + 480, 0, 0, 1, 1);

  // Wing: bursts of three beats with the wing folded between them, steady beats to slow down for
  // the approach, a held glide, one braking flare, then folded.
  const beats = [], BEAT = BOUND * BURST / 3;
  let t = 0;
  for (; t + BOUND <= CRUISE * .8; t += BOUND) {
   for (let b = 0; b < 3; b++) beats.push([t + b * BEAT, { transform: wingAt(-28) }], [t + b * BEAT + BEAT * .55, { transform: wingAt(150) }]);
   beats.push([t + 3 * BEAT, { transform: wingAt(-18) }], [t + 3 * BEAT + 70, { transform: wingAt(0) }], [t + BOUND - 1, { transform: wingAt(0) }]);
  }
  for (const period = 200; t + period <= CRUISE; t += period) beats.push([t, { transform: wingAt(-28) }], [t + period * .55, { transform: wingAt(150) }]);
  beats.push([t, { transform: wingAt(-28) }], [CRUISE + 120, { transform: wingAt(95) }], [FLY - 300, { transform: wingAt(100) }],
   [FLY - 220, { transform: wingAt(160) }], [FLY - 70, { transform: wingAt(-20) }], [FLY + 80, { transform: wingAt(20) }], [FLY + 200, { transform: wingAt(0) }],
   [TURN + 60, { transform: wingAt(0) }], [TURN + 170, { transform: wingAt(70) }], [TURN + 340, { transform: wingAt(0) }]);

  const options = { duration: END, fill: 'both', easing: 'linear' };
  const moves = [
   pip.animate(track(path), options),
   pose.animate(track(tilt), options),
   wing.animate(track(beats), options),
   // Legs fold away in flight and swing down to reach for the rock just before touchdown.
   legs.animate(track([[0, { opacity: 0, transform: 'rotate(70deg) scaleY(.35)' }], [CRUISE + GLIDE * .3, { opacity: 0, transform: 'rotate(70deg) scaleY(.35)' }],
    [CRUISE + GLIDE * .5, { opacity: 1, transform: 'rotate(30deg) scaleY(.8)' }], [FLY - 120, { opacity: 1, transform: 'rotate(-12deg) scaleY(1)' }], [FLY + 60, { opacity: 1, transform: 'rotate(0deg) scaleY(1)' }],
    [TURN + 60, { opacity: 1, transform: 'rotate(0deg) scaleY(1)' }], [TURN + 170, { opacity: 1, transform: 'rotate(25deg) scaleY(.9)' }], [TURN + 340, { opacity: 1, transform: 'rotate(0deg) scaleY(1)' }]]), options),
   turn.animate(track([[0, { transform: 'scaleX(1)' }], [TURN + 90, { transform: 'scaleX(1)', easing: 'cubic-bezier(.5,0,.5,1)' }], [TURN + 270, { transform: 'scaleX(-1)' }]]), options),
   chirp.animate(track([[0, { opacity: 0, transform: 'scale(.3)' }], [CHIRP, { opacity: 0, transform: 'scale(.3)' }],
    [CHIRP + 140, { opacity: 1, transform: 'scale(1.18)' }], [CHIRP + 300, { opacity: 1, transform: 'scale(1)' }]]), options),
   shadow.animate(track([[0, { opacity: 0, transform: 'scale(.5)' }], [CRUISE + GLIDE * .2, { opacity: 0, transform: 'scale(.5)' }], [FLY, { opacity: 1, transform: 'scale(1)' }],
    [TURN + 60, { opacity: 1, transform: 'scale(1)' }], [TURN + 170, { opacity: .7, transform: 'scale(.82)' }], [TURN + 340, { opacity: 1, transform: 'scale(1)' }]]), options),
   eye.animate(track([[0, { transform: 'scaleY(1)' }], [CHIRP - 420, { transform: 'scaleY(1)' }], [CHIRP - 340, { transform: 'scaleY(.12)' }], [CHIRP - 260, { transform: 'scaleY(1)' }]]), options),
  ];
  // The landing breeze reaches the plants beside the perch.
  const rustle = (el, amount, delay) => el && el.animate(
   [0, 2.4, -1.6, .9, -.3, 0].map((deg, i, all) => ({ rotate: `${(deg * amount).toFixed(2)}deg`, offset: i / (all.length - 1) })),
   { duration: 1700, delay: FLY + delay, easing: 'ease-out' });
  rustle(tallPlant, 1, 0); rustle(lowPlant, .55, 120);

  // A width change would move the perch mid-flight, so land at once. Height-only resizes
  // (a phone's address bar collapsing while scrolling) leave the flight alone.
  const width = window.innerWidth;
  const hurry = () => { for (const move of moves) move.finish(); };
  const resized = () => { if (Math.abs(window.innerWidth - width) > 1) hurry(); };
  const land = () => {
   root.classList.remove('scene-intro');
   for (const move of moves) move.cancel(); // the stylesheet's resting pose is the final frame
   window.removeEventListener('resize', resized);
   idle();
  };
  moves[0].finished.then(land, land);
  window.addEventListener('resize', resized);
  calm.addEventListener?.('change', hurry, { once: true });
 }

 // ---- After landing: a blink now and then, and a chirp whenever the article starts playing ----
 let resting = false;
 function idle() {
  resting = true;
  const blink = () => {
   if (!calm.matches && !document.hidden) eye.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(.12)', offset: .5 }, { transform: 'scaleY(1)' }], { duration: 170, easing: 'ease-in-out' });
   setTimeout(blink, 3800 + Math.random() * 4200);
  };
  setTimeout(blink, 2600);
 }
 document.getElementById('audio')?.addEventListener('play', () => {
  if (!resting || calm.matches) return;
  pose.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-8deg)', offset: .35 }, { transform: 'rotate(2deg)', offset: .7 }, { transform: 'rotate(0deg)' }], { duration: 520, easing: 'ease-in-out' });
  chirp.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)', offset: .4 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
  wing.animate([{ transform: wingAt(0) }, { transform: wingAt(55), offset: .4 }, { transform: wingAt(0) }], { duration: 360, easing: 'ease-in-out' });
 });

 // ---- Desktop pointer depth: the layers lean a few pixels away from the cursor ----
 const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
 let aimX = 0, aimY = 0, nowX = 0, nowY = 0, frame = 0;
 function lean() {
  nowX += (aimX - nowX) * .06; nowY += (aimY - nowY) * .06;
  scene.style.setProperty('--mx', nowX.toFixed(3)); scene.style.setProperty('--my', nowY.toFixed(3));
  frame = Math.abs(aimX - nowX) + Math.abs(aimY - nowY) > .002 ? requestAnimationFrame(lean) : 0;
 }
 const aim = (x, y) => { if (calm.matches) x = y = 0; aimX = x; aimY = y; if (!frame) frame = requestAnimationFrame(lean); };
 window.addEventListener('pointermove', e => { if (finePointer.matches && e.pointerType === 'mouse') aim(-(e.clientX / innerWidth - .5) * 2, -(e.clientY / innerHeight - .5) * 2); }, { passive: true });
 window.addEventListener('mouseout', e => { if (!e.relatedTarget) aim(0, 0); });

 // ---- Start once the scene has settled, the parts are decoded and someone is looking ----
 const parts = [...scene.querySelectorAll('.pip-parts img, .sun img')];
 const decoded = Promise.all(parts.map(img => img.decode().catch(() => {})));
 const settled = new Promise(resolve => setTimeout(resolve, 1150));
 const visible = () => new Promise(resolve => {
  if (!document.hidden) return resolve();
  const seen = () => { if (!document.hidden) { document.removeEventListener('visibilitychange', seen); resolve(); } };
  document.addEventListener('visibilitychange', seen);
 });
 Promise.race([decoded, new Promise(r => setTimeout(r, 2500))]).then(() => settled).then(visible).then(choreograph);
})();
