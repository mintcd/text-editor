import {
  defaultTextEditorPlugins,
  escapeHtml,
  getTextEditorTokens,
  latexPlugin,
  mathRegex,
  type TextEditorPlugin,
} from './textEditor.plugins.ts';

export { escapeHtml, mathRegex };

// Mark source line breaks so they are distinguishable from the empty-line BRs
// browsers insert into contentEditable. The extra trailing BR gives the final
// empty line a visible caret position without adding a character to the value.
const escapeTextWithBreaks = (text: string) =>
  escapeHtml(text).replace(/\n/g, '<br data-editor-linebreak="true"/>');

const withTrailingPlaceholder = (html: string, text: string) =>
  text.endsWith('\n') ? `${html}<br data-editor-placeholder="true"/>` : html;

export const plainTextToHtml = (text = '') => withTrailingPlaceholder(escapeTextWithBreaks(text), text);

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
      out += escapeTextWithBreaks(text.slice(lastIndex, token.start));
    }

    if (typeof caretOffset === 'number') {
      const isActive = caretOffset >= token.start && caretOffset <= token.end;
      if (isActive) {
        out += token.plugin.renderActive?.(token) ?? escapeTextWithBreaks(token.raw);
      } else {
        out += token.plugin.renderInactive?.(token) ?? escapeTextWithBreaks(token.raw);
      }
    } else {
      out += token.plugin.renderActive?.(token) ?? escapeTextWithBreaks(token.raw);
    }

    lastIndex = token.end;
  }

  if (lastIndex < text.length) {
    out += escapeTextWithBreaks(text.slice(lastIndex));
  }
  return withTrailingPlaceholder(out, text);
};

const isInactiveTokenElement = (el: HTMLElement) =>
  el.getAttribute('data-token-mode') === 'inactive' ||
  el.classList?.contains('katex-preview');

// These are the block containers commonly produced by Enter or HTML paste.
// Rendering and text offsets deliberately share this one serialization model.
const blockTags = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'DT', 'DD',
  'FIGCAPTION', 'FIGURE', 'FOOTER', 'HEADER', 'H1', 'H2', 'H3', 'H4',
  'H5', 'H6', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION',
  'TABLE', 'TR', 'UL',
]);

type DomPoint = { node: Node; offset: number };
type NodeOffsets = { start: number; end: number; boundaries?: number[] };
type TextSegment = {
  kind: 'text' | 'atomic' | 'break';
  start: number;
  end: number;
  node?: Node;
  before: DomPoint;
  after: DomPoint;
};

const isBlock = (node: Node) =>
  node.nodeType === 1 && blockTags.has((node as HTMLElement).tagName) &&
  !isInactiveTokenElement(node as HTMLElement);

const isMeaningful = (node: Node) =>
  node.nodeType === 1 || (node.nodeType === 3 && (node.nodeValue?.length ?? 0) > 0);

function meaningfulSibling(node: Node, direction: 'previousSibling' | 'nextSibling') {
  let sibling = node[direction];
  while (sibling && !isMeaningful(sibling)) sibling = sibling[direction];
  return sibling;
}

function isPlaceholderBreak(node: HTMLElement, root: HTMLElement) {
  if (node.hasAttribute('data-editor-placeholder')) return true;
  if (node.hasAttribute('data-editor-linebreak')) return false;
  const parent = node.parentNode;
  if (!parent) return false;
  if (meaningfulSibling(node, 'nextSibling')) return false;
  // A terminal BR inside a browser-created line is a caret placeholder.
  if (parent !== root && isBlock(parent)) return true;
  if (parent === root) {
    const previous = meaningfulSibling(node, 'previousSibling');
    return !previous || (previous.nodeType === 1 && (previous as HTMLElement).tagName === 'BR');
  }
  return false;
}

function createTextModel(root: HTMLElement) {
  let text = '';
  const offsets = new Map<Node, NodeOffsets>();
  const segments: TextSegment[] = [];

  const outside = (node: Node, after: boolean): DomPoint => {
    const parent = node.parentNode;
    if (!parent) return { node: root, offset: 0 };
    const index = Array.prototype.indexOf.call(parent.childNodes, node) as number;
    return { node: parent, offset: index + (after ? 1 : 0) };
  };

  const append = (value: string, segment: Omit<TextSegment, 'start' | 'end'>) => {
    const start = text.length;
    text += value;
    if (value.length) segments.push({ ...segment, start, end: text.length });
  };

  const contributesTextOrLine = (node: Node): boolean => {
    if (node.nodeType === 3) return (node.nodeValue?.length ?? 0) > 0;
    if (node.nodeType !== 1) return false;
    const element = node as HTMLElement;
    if (element.tagName === 'BR') return !isPlaceholderBreak(element, root);
    if (isInactiveTokenElement(element)) return (element.getAttribute('data-raw')?.length ?? 0) > 0;
    if (isBlock(node)) return true;
    return Array.from(node.childNodes).some(contributesTextOrLine);
  };

  const walk = (node: Node) => {
    const start = text.length;
    if (node.nodeType === 3) {
      const value = node.nodeValue ?? '';
      append(value, {
        kind: 'text', node,
        before: { node, offset: 0 }, after: { node, offset: value.length },
      });
      offsets.set(node, { start, end: text.length });
      return;
    }
    if (node.nodeType !== 1) {
      offsets.set(node, { start, end: start });
      return;
    }

    const element = node as HTMLElement;
    if (element !== root && element.tagName === 'BR') {
      if (!isPlaceholderBreak(element, root)) {
        append('\n', { kind: 'break', before: outside(node, false), after: outside(node, true) });
      }
      offsets.set(node, { start, end: text.length, boundaries: [start] });
      return;
    }
    if (element !== root && isInactiveTokenElement(element)) {
      append(element.getAttribute('data-raw') ?? '', {
        kind: 'atomic', node, before: outside(node, false), after: outside(node, true),
      });
      const boundaries = Array.from({ length: node.childNodes.length + 1 }, (_, index) =>
        index === 0 ? start : text.length,
      );
      offsets.set(node, { start, end: text.length, boundaries });
      return;
    }

    const boundaries = [start];
    let previous: { block: boolean; text: string } | undefined;
    for (let index = 0; index < node.childNodes.length; index++) {
      const child = node.childNodes[index];
      const block = isBlock(child);
      if (previous && (previous.block || block) && !previous.text.endsWith('\n') &&
          contributesTextOrLine(child)) {
        append('\n', {
          kind: 'break',
          before: { node, offset: index },
          after: { node: child, offset: 0 },
        });
      }
      const childStart = text.length;
      walk(child);
      const childText = text.slice(childStart);
      if (block || childText.length > 0) previous = { block, text: childText };
      boundaries.push(text.length);
    }
    offsets.set(node, { start, end: text.length, boundaries });
  };

  walk(root);

  const offsetAtPoint = (node: Node, offset: number) => {
    const entry = offsets.get(node);
    if (entry) {
      if (node.nodeType === 3) return entry.start + Math.max(0, Math.min(offset, entry.end - entry.start));
      return entry.boundaries?.[Math.max(0, Math.min(offset, node.childNodes.length))] ?? entry.start;
    }
    // Inactive token renderers may have arbitrary internal markup. Treat them
    // as atomic source text and snap interior selection points to an edge.
    let current: Node | null = node;
    let atStart = offset === 0;
    while (current && current !== root) {
      atStart = atStart && !current.previousSibling;
      current = current.parentNode;
      const ancestor = current && offsets.get(current);
      if (ancestor) return atStart ? ancestor.start : ancestor.end;
    }
    return 0;
  };

  const pointAtOffset = (offset: number): DomPoint => {
    const target = Math.max(0, Math.min(Number.isFinite(offset) ? Math.trunc(offset) : 0, text.length));
    for (const segment of segments) {
      if (target > segment.end) continue;
      if (segment.kind === 'text') return { node: segment.node!, offset: target - segment.start };
      return target <= segment.start ? segment.before : segment.after;
    }
    return { node: root, offset: 0 };
  };

  return { text, offsetAtPoint, pointAtOffset };
}

// The canonical value uses UTF-16 offsets, matching DOM Range and JavaScript
// string indexing. Token previews contribute their source rather than markup.
export const domToText = (element: HTMLElement) => createTextModel(element).text;

export interface TextEditorSelection {
  anchor: number;
  focus: number;
}

// Both endpoints must belong to this editor. A selection in another editor
// must not become a caret at the end of this one during a render.
export const getTextEditorSelection = (element: HTMLElement): TextEditorSelection | null => {
  const selection = element.ownerDocument.getSelection();
  if (!selection?.anchorNode || !selection.focusNode || selection.rangeCount === 0 ||
      !element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) return null;
  const model = createTextModel(element);
  return {
    anchor: model.offsetAtPoint(selection.anchorNode, selection.anchorOffset),
    focus: model.offsetAtPoint(selection.focusNode, selection.focusOffset),
  };
};

export const setTextEditorSelection = (element: HTMLElement, value: TextEditorSelection) => {
  const selection = element.ownerDocument.getSelection();
  if (!selection) return;
  const model = createTextModel(element);
  const anchor = model.pointAtOffset(value.anchor);
  const focus = model.pointAtOffset(value.focus);
  if (typeof selection.setBaseAndExtent === 'function') {
    selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
    return;
  }
  const range = element.ownerDocument.createRange();
  const backward = value.anchor > value.focus;
  const start = backward ? focus : anchor;
  const end = backward ? anchor : focus;
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  selection.removeAllRanges();
  selection.addRange(range);
  if (backward && typeof selection.extend === 'function') {
    selection.collapse(anchor.node, anchor.offset);
    selection.extend(focus.node, focus.offset);
  }
};

export const getCaretCharacterOffsetWithin = (element: HTMLElement) =>
  getTextEditorSelection(element)?.anchor ?? 0;

export const setCaretPosition = (element: HTMLElement, chars: number) =>
  setTextEditorSelection(element, { anchor: chars, focus: chars });
