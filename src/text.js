const excluded = 'nav,header,footer,aside,pre,code,script,style,noscript,template,button,input,select,textarea,svg,canvas,audio,video,article-voice,[hidden],[inert],[aria-hidden="true"],[data-no-read],[role="navigation"]';

/** Read only visible text inside an explicit article root, preserving block boundaries. */
export function snapshotArticle(selector, doc = document) {
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

export function extractArticle(selector, doc = document) { return snapshotArticle(selector, doc).text; }

export function chunkText(text, max = 240) {
  const result = [];
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  for (const paragraph of text.split(/\n+/).filter(Boolean)) {
    let chunk = '';
    for (const { segment } of segmenter.segment(paragraph)) {
      for (const word of segment.trim().split(/\s+/)) {
        // Split pathological unbroken tokens too; model context is finite.
        for (let i = 0; i < word.length; i += max) {
          const part = word.slice(i, i + max);
          if (chunk.length + part.length + 1 > max) { if (chunk) result.push(chunk); chunk = ''; }
          chunk += (chunk ? ' ' : '') + part;
        }
      }
      // First audio starts after a single sentence; subsequent sentences also stay bounded.
      if (chunk) { result.push(chunk); chunk = ''; }
    }
    if (chunk) result.push(chunk);
  }
  return result;
}

/** Monotonic character matching avoids ambiguity from repeated words. */
export function mapChunks(snapshot, chunks) {
  let cursor = 0;
  return chunks.map(text => {
    const points = [];
    for (const ch of text.split('')) {
      if (/\s/.test(ch)) { points.push(null); continue; }
      while (/\s/.test(snapshot.text[cursor] || '') && cursor < snapshot.text.length) cursor++;
      if (snapshot.text[cursor] !== ch) throw new Error('Article mapping changed. Restart narration.');
      points.push(snapshot.mapping[cursor++]);
    }
    return {text, points};
  });
}
