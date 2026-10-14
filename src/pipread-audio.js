/** Copyright 2026 Justin Betker. MIT; see pipread-player.LICENSE.txt.
 * Standalone static-audio player. No model, inference runtime, or dependencies. */
const excluded = 'nav,header,footer,aside,pre,code,script,style,noscript,template,button,input,select,textarea,svg,canvas,audio,video,article-voice,pipread-audio,[hidden],[inert],[aria-hidden="true"],[data-no-read],[role="navigation"]';

/** Read only visible text inside an explicit article root, preserving block boundaries. */
function snapshotArticle(selector, doc = document) {
  if (!selector) throw new Error('Set an article selector first.');
  let root;
  try { root = doc.querySelector(selector); } catch { throw new Error('Invalid article selector.'); }
  if (!root) throw new Error('Article not found. Check the article selector.');
  const parts = [];
  const origins = [];
  const append = (value, node = null) => { parts.push(value); for (let i=0;i<value.length;i++) origins.push(node ? {node, offset:i} : null); };
  function walk(node) {
    if (node.nodeType === 3) { append(node.textContent, node); return; }
    if (node.nodeType !== 1) return;
    if (node.matches(excluded)) return;
    const style = doc.defaultView.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.contentVisibility === 'hidden' || Number(style.opacity) === 0) return;
    if (node.tagName === 'DETAILS' && !node.open) {
      const summary = [...node.children].find(child => child.tagName === 'SUMMARY');
      if (summary) walk(summary);
      return;
    }
    const block = /^(block|list-item|flex|grid|table)/.test(style.display) || node.tagName === 'BR';
    if (block) append('\n');
    for (const child of node.childNodes) walk(child);
    if (block) append('\n');
  }
  // Hidden ancestors matter even when the explicit selector starts inside one.
  for (let el = root.parentElement; el; el = el.parentElement) {
    const s = doc.defaultView.getComputedStyle(el);
    if (el.matches(excluded) || s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) throw new Error('Article is hidden.');
  }
  walk(root);
  const raw = parts.join('');
  let text = ''; const mapping = [];
  // Collapse whitespace once while retaining each emitted character's source offset.
  let pending = null;
  for (let i=0;i<raw.length;i++) {
    const ch = raw[i];
    if (/\s/.test(ch)) { pending = pending === '\n' || ch === '\n' ? '\n' : ' '; continue; }
    if (pending && text) { text += pending; mapping.push(null); }
    pending = null; text += ch; mapping.push(origins[i]);
  }
  if (!text) throw new Error('No readable article text found.');
  if (text.length > 100000) throw new Error('Article is too long (100,000 character limit).');
  return { text, mapping, root };
}


let serial=0;
class ReadingHighlight {
  constructor(doc=document, colors={word:'#ffcb9d', passage:'#ffe8d0', foreground:'#20221f'}) { this.doc=doc;this.colors=colors;this.name=`article-voice-${++serial}`; }
  get supported() { return !!this.doc.defaultView.CSS?.highlights && !!this.doc.defaultView.Highlight; }
  clear() { this.doc.defaultView.CSS?.highlights?.delete(this.name);this.style?.remove();this.style=null;this.last=null; }
  render(mapped, mode, seconds, timings) {
    if(!this.supported || !mapped) { this.clear();return; }
    const word=mode==='words' && timings?.find(w=>seconds>=w.start && seconds<w.end);
    // During measured silence, retain passage context but no guessed active word.
    const from=word ? word.offset:0,to=word ? word.offset+word.length:mapped.points.length;
    const key=`${mode}:${from}:${to}`;
    if(this.last?.mapped===mapped && this.last.key===key) return;
    this.clear();
    const ranges=[]; let range=null, prior=null;
    for(const p of mapped.points.slice(from,to)) {
      if(!p) continue;
      if(!p.node.isConnected) {this.clear();return;}
      if(prior && prior.node===p.node && prior.offset+1===p.offset) range.setEnd(p.node,p.offset+1);
      else {range=this.doc.createRange();range.setStart(p.node,p.offset);range.setEnd(p.node,p.offset+1);ranges.push(range);}
      prior=p;
    }
    const style=this.doc.createElement('style');
    style.textContent=`::highlight(${this.name}) { background-color: ${word ? this.colors.word : this.colors.passage}; color: ${this.colors.foreground}; }`;
    this.doc.head.append(style);this.style=style;
    this.doc.defaultView.CSS.highlights.set(this.name,new this.doc.defaultView.Highlight(...ranges));
    this.last={mapped,key,word:word||null};
  }
}

// Offsets are UTF-16 positions in the normalized paragraph text, not DOM offsets.
// Only supplied word intervals are used. No word positions are interpolated.
export function validatedWords(timing) {
  const groups = new Map(), invalid = new Set();
  if (!Array.isArray(timing?.words)) return groups;
  for (const word of timing.words) {
    const p = word?.paragraph, paragraph = timing.paragraphs[p];
    if (!Number.isInteger(p) || !paragraph) continue;
    const previous = groups.get(p)?.at(-1);
    const offset = word.offset, endOffset = offset + word.length;
    const slice = paragraph.text.slice(offset, endOffset);
    const splitsSurrogate = i => i > 0 && i < paragraph.text.length &&
      /[\uD800-\uDBFF]/.test(paragraph.text[i - 1]) && /[\uDC00-\uDFFF]/.test(paragraph.text[i]);
    if (!Number.isInteger(offset) || !Number.isInteger(word.length) || offset < 0 || word.length <= 0 ||
        endOffset > paragraph.text.length || splitsSurrogate(offset) || splitsSurrogate(endOffset) ||
        !slice.trim() || (word.text !== undefined && word.text !== slice) ||
        !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < paragraph.start ||
        word.end > paragraph.end || word.start >= word.end ||
        (previous && (word.start < previous.end || offset < previous.offset + previous.length))) {
      invalid.add(p); continue;
    }
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(word);
  }
  for (const p of invalid) groups.delete(p);
  return groups;
}

export function mapParagraphs(selector, paragraphs, doc = document) {
  const snapshot = snapshotArticle(selector, doc);
  // Both extractors collapse whitespace; retain the original UTF-16 node mapping.
  const text = snapshot.text.replace(/\s/g, ' ');
  const expected = paragraphs.map(p => p.text).join(' ');
  if (text !== expected) throw Error('Published narration differs from article text');
  let cursor = 0;
  const mapped = paragraphs.map(p => {
    const result = { text: p.text, points: snapshot.mapping.slice(cursor, cursor + p.text.length) };
    cursor += p.text.length + 1;
    return result;
  });
  return { root: snapshot.root, mapped };
}

export class StaticReadingHighlight {
  constructor(selector, timing, doc = document) {
    const { root, mapped } = mapParagraphs(selector, timing.paragraphs, doc);
    this.mapped = mapped;
    this.words = validatedWords(timing);
    this.renderer = new ReadingHighlight(doc, {word:'#ffdbb5', passage:'#ffdbb5', foreground:'inherit'});
    this.observer = new doc.defaultView.MutationObserver(() => {
      this.invalid = true;
      this.renderer.clear();
    });
    this.observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
  }
  paint(paragraph, seconds) {
    if (this.invalid) { this.renderer.clear(); return; }
    this.renderer.render(this.mapped[paragraph], 'words', seconds, this.words.get(paragraph));
  }
  clear() { this.renderer.clear(); }
  dispose() { this.observer.disconnect(); this.clear(); }
}

class PipreadAudio extends HTMLElement {
  static observedAttributes = ["manifest", "article", "selector"];
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>:host{display:block;font:14px system-ui;color:#34362e}.player{background:#faf6ed;border:1px solid #e7decc;border-radius:18px;padding:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center}button,select{font:inherit;border:1px solid #d6c8ad;border-radius:20px;padding:9px 14px;background:#ffd3aa;color:inherit}audio{width:min(100%,430px)}small{flex-basis:100%;color:#676459}label{display:flex;gap:5px;align-items:center}</style><div class="player"><button type="button">Listen to this article</button><audio controls preload="none"></audio><button type="button" data-skip="-15" aria-label="Back 15 seconds" disabled>−15s</button><button type="button" data-skip="15" aria-label="Forward 15 seconds" disabled>+15s</button><label>Speed <select aria-label="Playback speed"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><label><input type="checkbox"> Highlight passage</label><small role="status">Prepared narration. No speech model download.</small></div>`;
    this.button = this.shadowRoot.querySelector("button");
    this.audio = this.shadowRoot.querySelector("audio");
    this.status = this.shadowRoot.querySelector("small");
    this.highlight = this.shadowRoot.querySelector("input");
    this.speed = this.shadowRoot.querySelector("select");
    this.button.onclick = () => this.toggle();
    this.skips = [...this.shadowRoot.querySelectorAll('[data-skip]')];
    for (const button of this.skips) button.onclick = () => {
      if (Number.isFinite(this.audio.duration)) this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, this.audio.currentTime + Number(button.dataset.skip)));
    };
    this.speed.onchange = () => {
      this.audio.playbackRate = Number(this.speed.value);
    };
    this.highlight.onchange = () => this.paint();
    this.audio.ontimeupdate = () => this.paint();
    this.audio.onseeking = () => this.paint();
    this.audio.onseeked = () => this.paint();
    this.audio.onratechange = () => this.paint();
    this.audio.onplay = () => {
      this.button.textContent = "Pause";
      this.status.textContent = "Playing prepared narration.";
      this.paint();
    };
    this.audio.onpause = () => {
      this.button.textContent = "Resume";
      this.paint();
    };
    this.audio.onended = () => {
      this.button.textContent = "Replay";
      this.clearHighlight();
    };
    this.audio.onerror = () => {
      this.status.textContent =
        "Audio could not load. Check the published file and try again.";
      this.button.textContent = "Retry";
      this.ready = false;
      this.clearHighlight();
    };
    this.key = "pipread-" + Math.random().toString(36).slice(2);
    this.serial = 0;
  }
  connectedCallback() {
    if (!globalThis.CSS?.highlights || !globalThis.Highlight) {
      this.highlight.disabled = true;
      this.highlight.title =
        "Passage highlighting is unavailable in this browser";
    }
  }
  disconnectedCallback() {
    this.reset();
  }
  attributeChangedCallback() {
    if (this.audio) this.reset();
  }
  reset() {
    this.serial++;
    this.abort?.abort();
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.ready = false;
    for (const button of this.skips) button.disabled = true;
    this.loading = false;
    this.timing = null;
    this.reader?.dispose();
    this.reader = null;
    this.mappingAttempted = false;
    this.button.disabled = false;
    this.button.textContent = "Listen to this article";
    this.clearHighlight();
  }
  url(path, base = location.href) {
    const url = new URL(path, base);
    if (
      url.origin !== location.origin ||
      !["http:", "https:"].includes(url.protocol)
    )
      throw Error("Use same-origin HTTP audio assets");
    return url.href;
  }
  async toggle() {
    if (this.loading) return;
    if (this.ready) {
      if (!this.audio.paused) {
        this.audio.pause();
        return;
      }
      try {
        await this.audio.play();
      } catch {
        this.status.textContent =
          "Press play in the audio controls to continue.";
      }
      return;
    }
    const serial = ++this.serial;
    this.abort = new AbortController();
    this.loading = true;
    this.button.disabled = true;
    this.status.textContent = "Loading prepared narration…";
    try {
      if (!this.getAttribute("manifest") || !this.getAttribute("article")) throw Error("Set manifest and article attributes first");
      const manifestUrl = this.url(this.getAttribute("manifest"));
      const response = await fetch(manifestUrl, { signal: this.abort.signal });
      if (!response.ok) throw Error("Manifest is unavailable");
      const manifest = await response.json();
      if (serial !== this.serial) return;
      const entry = manifest.articles?.[this.getAttribute("article")];
      if (manifest.version !== 1 || !entry)
        throw Error("This article has no published narration");
      const safe = (name) => {
        if (!/^[a-f0-9]{64}\.(wav|json)$/.test(name))
          throw Error("Invalid audio manifest");
        return this.url(name, manifestUrl);
      };
      // Optional metadata must never delay playable audio. Late responses are
      // scoped to this load so resetting a source cannot restore stale ranges.
      this.timing = null;
      this.reader?.dispose(); this.reader = null; this.mappingAttempted = false;
      const signal = this.abort.signal;
      Promise.resolve().then(() => fetch(safe(entry.timing), { signal }))
        .then(r => r.ok ? r.json() : null)
        .then(timing => {
          if (serial !== this.serial) return;
          this.timing = timing?.version === 1 && Array.isArray(timing.paragraphs) && timing.paragraphs.every((p, i, ps) => p && typeof p.text === 'string' && Number.isFinite(p.start) && Number.isFinite(p.end) && p.start >= 0 && p.end >= p.start && (!i || p.start >= ps[i-1].end)) ? timing : null;
          this.paint();
        }).catch(() => { /* Audio remains usable without highlighting. */ });
      if (serial !== this.serial) return;
      this.audio.src = safe(entry.audio);
      this.audio.playbackRate = Number(this.speed.value);
      this.audio.preservesPitch = true;
      this.ready = true;
      for (const button of this.skips) button.disabled = false;
      try {
        await this.audio.play();
      } catch {
        this.status.textContent = "Ready. Press play in the audio controls.";
      }
    } catch (error) {
      if (serial !== this.serial) return;
      this.status.textContent = error.message;
      this.button.textContent = "Retry";
    } finally {
      if (serial === this.serial) {
        this.loading = false;
        this.button.disabled = false;
      }
    }
  }
  clearHighlight() {
    cancelAnimationFrame(this.highlightFrame);
    this.reader?.clear();
    globalThis.CSS?.highlights?.delete(this.key);
    this.highlightStyle?.remove();
    this.highlightStyle = null;
  }
  paint() {
    cancelAnimationFrame(this.highlightFrame);
    if (!this.ready || !this.highlight.checked || !this.timing || !globalThis.CSS?.highlights || this.audio.ended) {
      this.clearHighlight(); return;
    }
    if (!this.mappingAttempted) {
      this.mappingAttempted = true;
      try {
        this.reader = new StaticReadingHighlight(this.getAttribute('selector') || 'article', this.timing);
        // Preserve this instance's existing highlight identity.
        this.reader.renderer.name = this.key;
      } catch { this.reader = null; }
    }
    const index = this.timing.paragraphs.findIndex(p => this.audio.currentTime >= p.start && this.audio.currentTime < p.end);
    if (index < 0) this.reader?.clear();
    else this.reader?.paint(index, this.audio.currentTime);
    if (!this.audio.paused && !this.audio.ended) this.highlightFrame = requestAnimationFrame(() => this.paint());
  }
}
if (!customElements.get("pipread-audio"))
  customElements.define("pipread-audio", PipreadAudio);
