import { renderLatexFragment } from '../Latex';

export const mathRegex = /(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\\begin\{[a-zA-Z]+\}[\s\S]*?\\end\{[a-zA-Z]+\})/g;

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const plainTextToHtml = (text = '') => escapeHtml(text).replace(/\n/g, '<br/>');

export const renderKatexPreview = (raw: string, escapedRaw: string) => {
  let rendered = escapedRaw;
  try {
    rendered = renderLatexFragment(raw);
  } catch (e) { }

  return `<span class="katex-preview" contenteditable="false" data-raw="${escapedRaw}" style="cursor: text; display: inline-block;">${rendered}</span>`;
};

// Convert plain text into HTML. If `caretOffset` is provided, only the
// math segment that contains that character offset will be wrapped as a
// `.latex-code` span; otherwise all math segments are wrapped.
export const textToHtml = (text = '', caretOffset?: number) => {
  const regex = new RegExp(mathRegex);
  let lastIndex = 0;
  let out = '';
  let m: RegExpExecArray | null;
  const spanStyle = "font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace; color: #065f46; background: rgba(16,185,129,0.06); padding: 0 4px; border-radius: 4px;";

  while ((m = regex.exec(text))) {
    if (m.index > lastIndex) {
      out += escapeHtml(text.slice(lastIndex, m.index)).replace(/\n/g, '<br/>');
    }

    const start = m.index;
    const end = regex.lastIndex; // exclusive
    const raw = m[0];
    const escaped = escapeHtml(raw);

    if (typeof caretOffset === 'number') {
      const isActive = caretOffset >= start && caretOffset <= end;
      if (isActive) {
        out += `<span class="latex-code" style="${spanStyle}">${escaped}</span>`;
      } else {
        out += renderKatexPreview(raw, escaped);
      }
    } else {
      out += `<span class="latex-code" style="${spanStyle}">${escaped}</span>`;
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    out += escapeHtml(text.slice(lastIndex)).replace(/\n/g, '<br/>');
  }
  return out;
};

// Reconstruct plain text from DOM inside editable area.
export const domToText = (el: HTMLElement) => {
  let text = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.nodeValue ?? '';
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const n = node as HTMLElement;
      if (n.tagName === 'BR') {
        text += '\n';
        return;
      }
      if (n.classList && n.classList.contains('katex-preview')) {
        text += n.getAttribute('data-raw') ?? '';
        return;
      }
      if (n.classList && n.classList.contains('latex-code')) {
        // preserve the raw latex text (including delimiters) and
        // do NOT recurse into children to avoid duplicating the inner text.
        text += n.textContent ?? '';
        return;
      }
      for (let i = 0; i < node.childNodes.length; i++) {
        walk(node.childNodes[i]);
      }
    }
  };
  walk(el);
  return text;
};

// Get the caret offset (in characters) within the editable element's plain-text representation.
export const getCaretCharacterOffsetWithin = (element: HTMLElement) => {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;

  let offset = 0;
  let found = false;

  const walkChild = (node: Node) => {
    if (found) return;
    if (node === sel.anchorNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += sel.anchorOffset;
      } else {
        // The caret is at an element boundary
        for (let i = 0; i < sel.anchorOffset; i++) {
          walkChild(node.childNodes[i]);
        }
      }
      found = true;
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.nodeValue?.length ?? 0;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === 'BR') {
        offset += 1;
      } else if (el.classList?.contains('katex-preview')) {
        if (el.contains(sel.anchorNode)) {
          // caret inside inactive katex node, snap to bounds
          found = true;
        } else {
          offset += (el.getAttribute('data-raw') || '').length;
        }
      } else if (el.classList?.contains('latex-code')) {
        // recurse! because latex-code has normal text nodes
        for (let i = 0; i < el.childNodes.length; i++) {
          walkChild(el.childNodes[i]);
          if (found) return;
        }
      } else {
        for (let i = 0; i < el.childNodes.length; i++) {
          walkChild(el.childNodes[i]);
          if (found) return;
        }
      }
    }
  };

  for (let i = 0; i < element.childNodes.length; i++) {
    walkChild(element.childNodes[i]);
    if (found) break;
  }

  return offset;
};

// Set caret to a given character offset inside the editable element's plain-text representation.
export const setCaretPosition = (element: HTMLElement, chars: number) => {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(true);
  let nodeStack: Node[] = Array.from(element.childNodes);
  let charCount = 0;
  let found = false;

  const walk = (nodes: Node[]) => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.nodeType === Node.TEXT_NODE) {
        const textLen = node.nodeValue?.length ?? 0;
        if (charCount + textLen > chars) {
          range.setStart(node, Math.max(0, chars - charCount));
          range.collapse(true);
          found = true;
          return;
        }
        charCount += textLen;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.tagName === 'BR') {
          // treat <br> as a single newline character
          if (charCount === chars) {
            range.setStartBefore(el);
            range.collapse(true);
            found = true;
            return;
          } else if (charCount + 1 >= chars) {
            range.setStartAfter(el);
            range.collapse(true);
            found = true;
            return;
          }
          charCount += 1;
        } else if (el.classList && el.classList.contains('katex-preview')) {
          const rawLen = (el.getAttribute('data-raw') || '').length;
          if (charCount + rawLen >= chars) {
            if (chars === charCount) {
              range.setStartBefore(el);
            } else {
              range.setStartAfter(el);
            }
            range.collapse(true);
            found = true;
            return;
          }
          charCount += rawLen;
        } else if (el.classList && el.classList.contains('latex-code')) {
          const txt = el.textContent ?? '';
          const len = txt.length;
          if (charCount + len >= chars) {
            // put caret inside the first text node of the latex element
            let targetNode: Node | null = null;
            for (let j = 0; j < el.childNodes.length; j++) {
              if (el.childNodes[j].nodeType === Node.TEXT_NODE) {
                targetNode = el.childNodes[j];
                break;
              }
            }
            if (targetNode) {
              range.setStart(targetNode, Math.max(0, chars - charCount));
              range.collapse(true);
              found = true;
              return;
            } else {
              // fallback: place after element
              range.setStartAfter(el);
              range.collapse(true);
              found = true;
              return;
            }
          }
          charCount += len;
        } else {
          // recurse into children
          walk(Array.from(node.childNodes));
          if (found) return;
        }
      }
    }
  };

  walk(nodeStack);
  if (!found) {
    range.selectNodeContents(element);
    range.collapse(false);
  }
  const sel = document.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
};
