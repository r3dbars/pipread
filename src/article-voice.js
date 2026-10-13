import { snapshotArticle, chunkText, mapChunks } from './text.js';
import { ReadingHighlight, speechActivity, approximateWords } from './highlight.js';
import { pcmWav } from './audio.js';

const clock = value => `${Math.floor(value / 60).toString().padStart(2, '0')}:${Math.floor(value % 60).toString().padStart(2, '0')}`;
const speaker = muted => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z" fill="currentColor"/>${muted ? '<path d="m16 9 5 6m0-6-5 6"/>' : '<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'}</svg>`;
const rewind = forward => `<svg width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="${forward ? 'transform:scaleX(-1)' : ''}"><path d="M8 8a11 11 0 1 1-3 8M8 3v6H2"/></svg><small>15</small>`;
const HISTORY_LIMIT = 32 * 1024 * 1024; // ~11 minutes of 24 kHz mono WAV; never unbounded.
const style = `
:host{display:block;color:#20221f;font:14px/1.5 system-ui,sans-serif;max-width:720px}
*{box-sizing:border-box}[hidden]{display:none!important}button,select,input{font:inherit}button,select{cursor:pointer;color:inherit}button{background:none;border:0;padding:8px}button:disabled{opacity:.35;cursor:default}button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #b96b45;outline-offset:4px}
.launch{border:1px solid #edbe99;background:#ffe1c7;border-radius:30px;padding:8px 17px;margin-bottom:12px}.player{border:1px solid #ded7cc;border-radius:17px;background:#fcf9f3;padding:18px 16px 12px}.main{display:grid;grid-template-columns:62px minmax(0,1fr);gap:20px;align-items:center}.primary{border-radius:50%;background:#ffad78;color:#24231f;width:62px;height:62px;font-size:23px;display:grid;place-items:center}.title{font-size:14px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 0 9px}.title span{font-weight:400;color:#74766f}.timeline{display:flex;gap:10px;align-items:center}.time{font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap}.seek{min-width:20px;width:100%;height:4px;accent-color:#e99158;cursor:pointer;margin:0}.mute{font-size:18px;padding:3px;min-width:32px}.controls{display:flex;justify-content:center;align-items:center;gap:20px;margin-top:4px}.skip{font-size:22px;position:relative;line-height:1}.skip small{font-size:10px;position:absolute;inset:19px 0 auto}select{background:transparent;border:0;padding:7px;font-weight:600}.foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px}.status,.coverage{font-size:11px;color:#70736b;margin:3px 0}.stop{font-size:11px;text-decoration:underline}.cpu{border:1px solid;border-radius:15px;font-size:12px}progress{width:100%;height:4px;accent-color:#20221f}.highlight-options{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px;font-size:12px}.highlight-options select{font-size:12px;font-weight:400}.highlight-note{font-size:11px;color:#70736b;margin:0}.ready{font-size:11px;color:#70736b;margin:0 0 10px}
@media(max-width:480px){.main{grid-template-columns:46px minmax(0,1fr);gap:12px}.primary{width:46px;height:46px;font-size:19px}.timeline{gap:6px}.controls{gap:12px}.title{font-size:12px}.player{padding-top:15px}.foot{align-items:flex-start}.time{font-size:10px}}
`;

export class ArticleVoice extends HTMLElement {
  static observedAttributes = ['article', 'backend'];
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `<style>${style}</style><button class="launch" aria-expanded="false" aria-controls="player">♬ Listen to this article</button><p class="ready">Local English voice · First use downloads ~326 MB GPU / ~93 MB CPU, plus runtime.</p><section class="player" id="player" aria-label="Article audio player" hidden><div class="main"><button class="primary" type="button" aria-label="Listen to this article">▶</button><div><p class="title"></p><div class="timeline"><span class="time elapsed">00:00</span><input class="seek" type="range" min="0" max="0" step="0.1" value="0" aria-label="Seek within prepared audio" disabled><span class="time duration">—</span><button class="mute" aria-label="Mute" aria-pressed="false">${speaker(false)}</button></div><div class="controls"><button class="skip back" aria-label="Back 15 seconds">${rewind(false)}</button><select aria-label="Playback speed"><option value="0.75">0.75×</option><option value="1" selected>1.0×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2.0×</option></select><button class="skip forward" aria-label="Forward 15 seconds">${rewind(true)}</button></div></div></div><progress aria-label="Current asset download" hidden></progress><p class="coverage">Audio is prepared as you listen. Total duration is not yet known.</p><div class="foot"><p class="status" role="status" aria-live="polite">Ready when you are · English / Heart</p><button class="stop" type="button" disabled>Stop</button></div><div class="highlight-options"><label><input type="checkbox" class="highlight-toggle"> Highlight as read</label><select aria-label="Highlight mode"><option value="passage">Passage</option><option value="words">Words (approximate)</option></select></div><p class="highlight-note">Optional · no scrolling. Word timing is estimated; numbers and abbreviations use passage highlighting.</p><button class="cpu" type="button" hidden>Try CPU (~93 MB)</button></section>`;
    this.launch = this.shadowRoot.querySelector('.launch');
    this.panel = this.shadowRoot.querySelector('.player');
    this.seekbar = this.shadowRoot.querySelector('.seek');
    this.clips = []; this.knownDuration = 0; this.historyBytes = 0; this.position = 0; this.muted = false;
    this.launch.onclick = () => { this.start(); this.primary.focus(); };
    this.seekbar.oninput = () => this.seek(Number(this.seekbar.value));
    this.shadowRoot.querySelector('.back').onclick = () => this.seek(this.elapsed() - 15);
    this.shadowRoot.querySelector('.forward').onclick = () => this.seek(this.elapsed() + 15);
    this.muteButton = this.shadowRoot.querySelector('.mute');
    this.muteButton.onclick = () => {
      this.muted = !this.muted;
      if (this.source) this.source.muted = this.muted;
      this.muteButton.setAttribute('aria-pressed', String(this.muted));
      this.muteButton.setAttribute('aria-label', this.muted ? 'Unmute' : 'Mute');
      this.muteButton.innerHTML = speaker(this.muted);
    };
    this.primary = this.shadowRoot.querySelector('.primary');
    this.stopButton = this.shadowRoot.querySelector('.stop');
    this.cpuButton = this.shadowRoot.querySelector('.cpu');
    this.cpuButton.onclick = () => { this.setAttribute('backend', 'wasm'); this.start(); };
    this.status = this.shadowRoot.querySelector('.status');
    this.progress = this.shadowRoot.querySelector('progress');
    this.speed = this.shadowRoot.querySelector('select[aria-label="Playback speed"]');
    this.highlighter = new ReadingHighlight(this.ownerDocument);
    this.highlightToggle = this.shadowRoot.querySelector('.highlight-toggle');
    this.highlightMode = this.shadowRoot.querySelector('[aria-label="Highlight mode"]');
    this.highlightToggle.onchange = this.highlightMode.onchange = () => this.syncHighlight();
    if (!this.highlighter.supported) { this.highlightToggle.disabled=true; this.shadowRoot.querySelector('.highlight-note').textContent='Highlighting is unavailable in this browser (CSS Custom Highlight API required).'; }
    this.state = 'idle'; this.epoch = 0;
    this.primary.onclick = () => this.toggle();
    this.stopButton.onclick = () => this.stop();
    this.speed.onchange = () => { if (this.source) this.source.playbackRate = Number(this.speed.value); };
  }
  disconnectedCallback() { this.stop(); }
  attributeChangedCallback() { if (this.state && this.state !== 'idle') this.stop(); }
  say(message) { this.status.textContent = message + (this.cacheWarning ? ' · Cache unavailable; next use may download again.' : ''); }
  setState(state, message) {
    this.state = state;
    const label = ({ idle: '▶ Listen to this article', loading: 'Cancel loading', playing: 'Ⅱ Pause', buffering: 'Ⅱ Pause', paused: '▶ Resume', error: '↻ Try again', ended: '↻ Listen again' })[state];
    this.primary.setAttribute('aria-label', label.replace(/^[^A-Za-z]+/, ''));
    this.primary.textContent = ['playing', 'buffering'].includes(state) ? 'Ⅱ' : state === 'loading' ? '×' : '▶';
    this.launch.hidden = state !== 'idle';
    this.shadowRoot.querySelector('.ready').hidden = state !== 'idle';
    this.panel.hidden = state === 'idle';
    this.launch.setAttribute('aria-expanded', String(state !== 'idle'));
    this.updateTimeline();
    this.syncHighlight();
    this.stopButton.disabled = ['idle', 'ended', 'error'].includes(state);
    this.progress.hidden = state !== 'loading';
    this.cpuButton.hidden = !(state === 'error' && (this.backend === 'webgpu' || this.getAttribute('backend') === 'webgpu'));
    if (message) this.say(message);
    this.dispatchEvent(new CustomEvent('voice-state', { detail: { state, message } }));
  }
  async toggle() {
    if (this.state === 'loading') return this.stop();
    if (['playing', 'buffering'].includes(this.state)) {
      this.paused = true; this.source?.pause(); this.setState('paused', 'Paused'); return;
    }
    if (this.state === 'paused') {
      this.paused = false;
      const epoch = this.epoch;
      if (this.source) await this.playCurrent(epoch);
      else if (!this.paused) { this.setState('buffering', 'Resuming…'); this.playNext(); }
      return;
    }
    this.start();
  }
  async start() {
    this.stop(false);
    const epoch = this.epoch;
    this.cacheWarning = false;
    this.started = performance.now(); this.metrics = {}; this.queue = []; this.next = 0; this.played = 0; this.busy = false; this.paused = false;
    this.setState('loading', 'Checking this device…');
    try {
      this.snapshot = snapshotArticle(this.getAttribute('article'));
      this.chunks = chunkText(this.snapshot.text);
      this.mappedChunks = mapChunks(this.snapshot, this.chunks);
      this.highlightInvalid = false;
      if(this.highlighter.supported) this.shadowRoot.querySelector('.highlight-note').textContent='Optional · no scrolling. Word timing is estimated; numbers and abbreviations use passage highlighting.';
      this.articleObserver = new MutationObserver(() => { this.highlightInvalid=true; this.highlighter.clear(); this.shadowRoot.querySelector('.highlight-note').textContent='Article changed. Restart narration to restore highlighting.'; });
      this.articleObserver.observe(this.snapshot.root,{subtree:true,childList:true,characterData:true});
      this.shadowRoot.querySelector('.title').textContent = document.querySelector(this.getAttribute('article')).querySelector('h1,h2')?.innerText.replace(/\s+/g, ' ').trim() || 'Listen to this article';
      const preference = this.getAttribute('backend') || 'auto';
      if (!['auto', 'webgpu', 'wasm'].includes(preference)) throw new Error('Backend must be auto, webgpu, or wasm.');
      let gpu = false;
      if (preference !== 'wasm') { try { gpu = !!(await navigator.gpu?.requestAdapter()); } catch {} }
      if (epoch !== this.epoch) return;
      if (preference === 'webgpu' && !gpu) throw new Error('WebGPU is unavailable. Try CPU below.');
      this.backend = gpu && preference !== 'wasm' ? 'webgpu' : 'wasm';
      this.launchWorker(epoch);
    } catch (e) { if (epoch === this.epoch) this.fail(e.message); }
  }
  launchWorker(epoch) {
    this.say(`Loading ${this.backend === 'webgpu' ? 'GPU' : 'CPU'} voice… First use can take a while.`);
    this.worker = new Worker(new URL('./tts.worker.js', import.meta.url), { type: 'module' });
    this.worker.onerror = () => { if (epoch === this.epoch) this.fail('Voice worker failed. Check network access and reload.'); };
    this.worker.onmessage = ({ data }) => {
      if (epoch !== this.epoch) return;
      if (data.type === 'cache' || data.type === 'cache-warning') {
        if (data.type === 'cache-warning') this.cacheWarning = true;
        this.dispatchEvent(new CustomEvent('voice-cache', { detail: data }));
      } else if (data.type === 'progress') {
        this.dispatchEvent(new CustomEvent('voice-progress', { detail: data }));
        if (Number.isFinite(data.progress)) { this.progress.max = 100; this.progress.value = data.progress; }
        else this.progress.removeAttribute('value');
        this.say(`${data.file || 'Voice assets'} · ${Number.isFinite(data.progress) ? Math.round(data.progress) + '%' : data.status || 'loading'}`);
      } else if (data.type === 'ready') {
        clearTimeout(this.deadline);
        this.metrics.loadMs = data.ms; this.setState(this.paused ? 'paused' : 'buffering', 'Preparing the first sentence…'); this.prefetch();
      } else if (data.type === 'audio') {
        clearTimeout(this.deadline);
        this.busy = false;
        if (!data.samples?.length || !Number.isFinite(data.sampleRate)) return this.fail('The voice returned empty audio.');
        try {
          data.wordTimings = approximateWords(this.chunks[data.index], speechActivity(data.samples,data.sampleRate));
          data.blob = pcmWav(data.samples, data.sampleRate);
          data.duration = data.samples.length / data.sampleRate;
          data.start = this.knownDuration;
          this.knownDuration += data.duration;
          this.historyBytes += data.blob.size;
          this.clips.push(data);
          this.trimHistory();
        } catch (error) { return this.fail(error.message); }
        this.queue.push(data); this.updateTimeline(); this.playNext(); this.prefetch();
      } else if (data.type === 'error') {
        // Never silently start a second large download after GPU initialization fails.
        this.fail(`${this.backend === 'webgpu' ? 'GPU failed. Try CPU below. ' : ''}${data.message}`);
      }
    };
    this.armTimeout();
    this.worker.postMessage({ type: 'load', backend: this.backend });
  }
  prefetch() {
    // At most the current audio plus ONE queued or in-flight chunk.
    if (this.busy || this.queue.length || this.next >= this.chunks.length || !this.worker || this.played < this.next - 1) return;
    this.busy = true; this.armTimeout();
    const index = this.next++;
    this.worker.postMessage({ type: 'generate', text: this.chunks[index], index });
  }
  playNext() {
    if (this.source || this.paused || !this.queue.length) return;
    const data = this.queue.shift();
    this.openClip(data, 0);
  }
  openClip(data, offset = 0) {
    this.releaseAudio();
    this.queue = this.queue.filter(c => c !== data);
    const url = URL.createObjectURL(data.blob);
    const source = new Audio(url);
    source.preservesPitch = true;
    source.muted = this.muted;
    source.currentTime = offset;
    this.position = data.start + offset;
    this.played = data.index;
    source.ontimeupdate = () => this.updateTimeline();
    source.playbackRate = Number(this.speed.value);
    this.audioURL = url; this.source = source; this.currentChunk = data;
    const epoch = this.epoch;
    source.onended = () => {
      if (epoch !== this.epoch) return;
      this.position = data.start + data.duration;
      this.releaseAudio(); this.played = data.index + 1;
      if (this.played === this.chunks.length) {
        clearTimeout(this.deadline); this.worker?.terminate(); this.worker = null;
        this.setState('ended', 'Finished · Thanks for listening');
      } else {
        if (!this.paused) this.setState('buffering', 'Preparing the next sentence…');
        const following = this.clips.find(c => c.index === this.played);
        if (following) { this.queue = this.queue.filter(c => c !== following); this.openClip(following); }
        else { this.playNext(); this.prefetch(); }
      }
    };
    source.onerror = () => { if (epoch === this.epoch) this.fail('Unable to play generated audio. Try again.'); };
    if (!this.paused) this.playCurrent(epoch);
    this.updateTimeline(); this.prefetch();
  }
  async playCurrent(epoch) {
    const source = this.source;
    const data = this.currentChunk;
    try { await source.play(); }
    catch (error) {
      if (epoch !== this.epoch || this.paused || source !== this.source) return;
      if (error.name === 'NotAllowedError') {
        this.paused = true; this.setState('paused', 'Press Resume to allow audio playback.');
      } else this.fail('Audio playback failed. Please retry.');
      return;
    }
    if (epoch !== this.epoch || this.paused || source !== this.source) return;
    if (!this.metrics.firstAudioMs) {
      this.metrics.firstAudioMs = performance.now() - this.started;
      this.metrics.firstGenerationMs = data.ms;
      this.dispatchEvent(new CustomEvent('voice-metrics', { detail: { ...this.metrics, backend: this.backend, chunks: this.chunks.length, firstSamples: data.samples?.length || Math.round(data.duration * data.sampleRate), sampleRate: data.sampleRate } }));
    }
    // PCM is no longer needed once the browser has decoded this bounded clip.
    data.samples = null;
    this.setState('playing', `${this.backend === 'webgpu' ? 'GPU' : 'CPU'} · Passage ${data.index + 1} of ${this.chunks.length}`);
  }
  releaseAudio() {
    if (this.source) {
      this.source.onended = this.source.onerror = this.source.ontimeupdate = null;
      this.source.pause(); this.source.removeAttribute('src'); this.source.load(); this.source = null;
    }
    if (this.audioURL) URL.revokeObjectURL(this.audioURL);
    this.audioURL = null; this.currentChunk = null;
  }
  elapsed() { return this.currentChunk ? this.currentChunk.start + (this.source?.currentTime || 0) : this.position; }
  trimHistory() {
    while (this.historyBytes > HISTORY_LIMIT && this.clips.length > 2 && this.clips[0].index < this.played) {
      const old = this.clips.shift(); this.historyBytes -= old.blob.size;
    }
  }
  updateTimeline() {
    if (!this.seekbar) return;
    const elapsed = this.elapsed();
    const beginning = this.clips?.[0]?.start || 0;
    const complete = this.chunks && this.next === this.chunks.length && !this.busy && this.knownDuration > 0;
    this.seekbar.min = beginning; this.seekbar.max = this.knownDuration || 0;
    this.seekbar.value = elapsed; this.seekbar.disabled = !this.clips?.length;
    this.seekbar.setAttribute('aria-valuetext', `${clock(elapsed)}; prepared through ${clock(this.knownDuration || 0)}`);
    this.shadowRoot.querySelector('.elapsed').textContent = clock(elapsed);
    this.shadowRoot.querySelector('.duration').textContent = this.knownDuration ? clock(this.knownDuration) + (complete ? '' : '+') : '—';
    this.shadowRoot.querySelector('.coverage').textContent = this.knownDuration
      ? `${complete ? 'All audio prepared' : 'Prepared audio only · total duration pending'} · Seek ${clock(beginning)}–${clock(this.knownDuration)}${!complete ? ` · ${Math.max(0, (this.chunks?.length || 0) - (this.next || 0) + (this.busy ? 1 : 0))} passages remaining` : ''}`
      : 'Audio is prepared as you listen. Total duration is not yet known.';
    for (const b of this.shadowRoot.querySelectorAll('.skip')) b.disabled = !this.clips?.length;
    this.syncHighlight();
  }
  seek(requested) {
    if (!this.clips.length || !Number.isFinite(requested)) return;
    const target = Math.max(this.clips[0].start, Math.min(requested, this.knownDuration - .02));
    const clip = this.clips.find(c => target >= c.start && target < c.start + c.duration);
    if (!clip) return;
    if (this.state === 'ended') { this.paused = true; this.setState('paused', 'Paused'); }
    this.openClip(clip, target - clip.start);
    if (requested >= this.knownDuration) this.say('Reached the prepared audio. More is generated as you listen.');
    this.trimHistory();
  }
  syncHighlight() {
    cancelAnimationFrame(this.highlightFrame);
    if (!this.highlightToggle?.checked || this.highlightInvalid || !this.currentChunk || !['playing','paused','buffering'].includes(this.state)) { this.highlighter?.clear(); return; }
    this.highlighter.render(this.mappedChunks?.[this.currentChunk.index], this.highlightMode.value, this.source?.currentTime || 0, this.currentChunk.wordTimings);
    // Paint against the media clock, never a wall-clock word timer. Pause freezes it.
    if (this.state === 'playing') this.highlightFrame = requestAnimationFrame(() => this.syncHighlight());
  }
  armTimeout() {
    clearTimeout(this.deadline);
    this.deadline = setTimeout(() => this.fail('Voice processing timed out. Check your connection, then retry or choose CPU.'), 180000);
  }
  stop(render = true) {
    clearTimeout(this.deadline);
    cancelAnimationFrame(this.highlightFrame); this.highlighter?.clear(); this.articleObserver?.disconnect();
    this.mappedChunks = null; this.snapshot = null;
    this.epoch++; this.worker?.terminate(); this.worker = null;
    this.releaseAudio();
    this.queue = []; this.clips = []; this.knownDuration = 0; this.historyBytes = 0; this.position = 0; this.busy = false; this.paused = false;
    if (render) this.setState('idle', 'Stopped · Cached assets stay on this device');
  }
  fail(message) { this.stop(false); this.setState('error', message); }
}
if (!customElements.get('article-voice')) customElements.define('article-voice', ArticleVoice);
