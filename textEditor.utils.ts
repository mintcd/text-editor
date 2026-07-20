import {
  defaultTextEditorPlugins,
  escapeHtml,
  getTextEditorTokens,
  latexPlugin,
  mathRegex,
  type TextEditorPlugin,
} from './textEditor.plugins';

export { escapeHtml, mathRegex };

export const plainTextToHtml = (text = '') => escapeHtml(text).replace(/\n/g, '<br/>');

export const renderKatexPreview = (raw: string, escapedRaw: string) => {
  return latexPlugin.renderInactive?.({ start: 0, end: raw.length, raw }) ?? escapedRaw;
};

// Convert plain text into HTML. If `caretOffset` is provided, only the
// token that contains that character offset will be rendered as active;
// otherwise all tokens are rendered as active to preserve the old behavior.
export const textToHtml = (
  text = '',
  caretOffset?: number,
  plugins: TextEditorPlugin[] = defaultTextEditorPlugins,
) => {
  const tokens = getTextEditorTokens(text, plugins);
  let lastIndex = 0;
  let out = '';

  for (const token of tokens) {
    if (token.start > lastIndex) {
      out += escapeHtml(text.slice(lastIndex, token.start)).replace(/\n/g, '<br/>');
    }

    if (typeof caretOffset === 'number') {
      const isActive = caretOffset >= token.start && caretOffset <= token.end;
      if (isActive) {
        out += token.plugin.renderActive?.(token) ?? escapeHtml(token.raw);
      } else {
        out += token.plugin.renderInactive?.(token) ?? escapeHtml(token.raw);
      }
    } else {
      out += token.plugin.renderActive?.(token) ?? escapeHtml(token.raw);
    }

    lastIndex = token.end;
  }

  if (lastIndex < text.length) {
    out += escapeHtml(text.slice(lastIndex)).replace(/\n/g, '<br/>');
  }
  return out;
};

const isInactiveTokenElement = (el: HTMLElement) =>
  el.getAttribute('data-token-mode') === 'inactive' ||
  el.classList?.contains('katex-preview');

const isActiveTokenElement = (el: HTMLElement) =>
  el.getAttribute('data-token-mode') === 'active' ||
  el.classList?.contains('latex-code');

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
      if (isInactiveTokenElement(n)) {
        text += n.getAttribute('data-raw') ?? '';
        return;
      }
      if (isActiveTokenElement(n)) {
        // Active token spans render their source text directly.
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
      } else if (isInactiveTokenElement(el)) {
        if (el.contains(sel.anchorNode)) {
          // caret inside an inactive token node, snap to bounds
          found = true;
        } else {
          offset += (el.getAttribute('data-raw') || '').length;
        }
      } else if (isActiveTokenElement(el)) {
        // Active token spans have normal editable text nodes.
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
  const nodeStack: Node[] = Array.from(element.childNodes);
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
        } else if (isInactiveTokenElement(el)) {
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
        } else if (isActiveTokenElement(el)) {
          const rawLen = (el.textContent || '').length;
          if (charCount + rawLen >= chars) {
            let remaining = Math.max(0, chars - charCount);

            const placeInside = (target: Node) => {
              if (found) return;
              if (target.nodeType === Node.TEXT_NODE) {
                const textLen = target.nodeValue?.length ?? 0;
                if (remaining <= textLen) {
                  range.setStart(target, remaining);
                  range.collapse(true);
                  found = true;
                  return;
                }
                remaining -= textLen;
                return;
              }

              for (let j = 0; j < target.childNodes.length; j++) {
                placeInside(target.childNodes[j]);
                if (found) return;
              }
            };

            placeInside(el);
            if (!found) {
              range.setStartAfter(el);
              range.collapse(true);
              found = true;
            }
            return;
          }
          charCount += rawLen;
        } else {
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
