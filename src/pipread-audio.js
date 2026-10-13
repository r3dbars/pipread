/** Copyright 2026 Justin Betker. MIT; see pipread-player.LICENSE.txt.
 * Standalone static-audio player. No model, inference runtime, or dependencies. */
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
    this.audio.onplay = () => {
      this.button.textContent = "Pause";
      this.status.textContent = "Playing prepared narration.";
    };
    this.audio.onpause = () => {
      this.button.textContent = "Resume";
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
      const entry = manifest.articles?.[this.getAttribute("article")];
      if (manifest.version !== 1 || !entry)
        throw Error("This article has no published narration");
      const safe = (name) => {
        if (!/^[a-f0-9]{64}\.(wav|json)$/.test(name))
          throw Error("Invalid audio manifest");
        return this.url(name, manifestUrl);
      };
      let timing = null;
      try {
        const r = await fetch(safe(entry.timing), {
          signal: this.abort.signal,
        });
        if (r.ok) timing = await r.json();
      } catch (e) {
        if (e.name === "AbortError") throw e;
      }
      if (serial !== this.serial) return;
      this.timing = timing?.version === 1 && Array.isArray(timing.paragraphs) && timing.paragraphs.every(p => typeof p.text === 'string' && Number.isFinite(p.start) && Number.isFinite(p.end) && p.start >= 0 && p.end >= p.start) ? timing : null;
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
    globalThis.CSS?.highlights?.delete(this.key);
    this.highlightStyle?.remove();
    this.highlightStyle = null;
  }
  paint() {
    this.clearHighlight();
    if (!this.highlight.checked || !this.timing || !globalThis.CSS?.highlights)
      return;
    const p = this.timing.paragraphs?.find(
      (p) =>
        this.audio.currentTime >= p.start && this.audio.currentTime < p.end,
    );
    if (!p) return;
    let root;
    try {
      root = document.querySelector(this.getAttribute("selector") || "article");
    } catch {
      return;
    }
    if (!root) return;
    const normalize = (s) => s.replace(/\s+/g, " ").trim();
    const node = [
      root,
      ...root.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,blockquote,div"),
    ].find((n) => normalize(n.textContent) === normalize(p.text));
    if (!node) return;
    const range = new Range();
    range.selectNodeContents(node);
    CSS.highlights.set(this.key, new Highlight(range));
    this.highlightStyle = document.createElement("style");
    this.highlightStyle.textContent = `::highlight(${this.key}){background:#ffdbb5;color:inherit}`;
    document.head.append(this.highlightStyle);
  }
}
if (!customElements.get("pipread-audio"))
  customElements.define("pipread-audio", PipreadAudio);
