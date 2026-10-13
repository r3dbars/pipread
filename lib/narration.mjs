import { parseHTML } from "linkedom";
import { chunkText } from "../src/text.js";
export function articleText(source, selector, plain = false) {
  if (plain)
    return source
      .trim()
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  const { document } = parseHTML(source);
  const matches = document.querySelectorAll(selector);
  if (matches.length !== 1)
    throw Error(
      `Selector must match exactly one article (found ${matches.length})`,
    );
  const excluded =
    'nav,header,footer,aside,pre,code,script,style,noscript,template,button,input,select,textarea,svg,canvas,audio,video,article-voice,pipread-audio,[hidden],[inert],[aria-hidden="true"],[data-no-read],[role="navigation"]';
  const hidden = (el) =>
    el.matches(excluded) ||
    /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|opacity\s*:\s*0(?:\s|;|$)|content-visibility\s*:\s*hidden)/i.test(
      el.getAttribute("style") || "",
    );
  for (let el = matches[0]; el; el = el.parentElement)
    if (hidden(el)) throw Error("Selected article is hidden or excluded");
  let text = "";
  const walk = (node) => {
    if (node.nodeType === 3) {
      text += node.textContent;
      return;
    }
    if (node.nodeType !== 1 || hidden(node)) return;
    if (node.tagName === "DETAILS" && !node.hasAttribute("open")) {
      const summary = node.querySelector("summary");
      if (summary) walk(summary);
      return;
    }
    const block =
      /^(P|H[1-6]|DIV|SECTION|ARTICLE|LI|BLOCKQUOTE|BR|FIGCAPTION)$/.test(
        node.tagName,
      );
    if (block) text += "\n";
    for (const child of node.childNodes) walk(child);
    if (block) text += "\n";
  };
  walk(matches[0]);
  return text
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
export function narrationChunks(paragraphs) {
  return paragraphs.flatMap((text, index) =>
    chunkText(text, 240).map((chunk) => ({ text: chunk, paragraph: index })),
  );
}
