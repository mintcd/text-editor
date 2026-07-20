import { useEffect, useRef, useState, useCallback } from 'react';
import {
  domToText,
  getCaretCharacterOffsetWithin,
  setCaretPosition,
  textToHtml,
  plainTextToHtml,
} from './textEditor.utils';
import {
  defaultTextEditorPlugins,
  getPluginByName,
  getTokenAtOffset,
  type ResolvedTextEditorToken,
  type TextEditorPlugin,
  type TextEditorToken,
} from './textEditor.plugins';

export interface UseTextEditorParams {
  value?: string;
  onChange: (text: string) => void;
  onBlur?: (text: string) => void;
  initialCaretPoint?: { x: number; y: number } | null;
  onInitialCaretAssigned?: () => void;
  plugins?: TextEditorPlugin[];
}

export interface ActiveTextEditorToken {
  plugin: TextEditorPlugin;
  token: TextEditorToken;
}

function elementFromNode(node: Node | null) {
  if (!node) return null;
  return node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
}

function isActiveTokenElement(el: HTMLElement) {
  return el.getAttribute('data-token-mode') === 'active' ||
    el.classList?.contains('latex-code');
}

function findActiveTokenElement(node: Node | null, container: HTMLElement) {
  let el = elementFromNode(node);
  while (el && el !== container) {
    if (isActiveTokenElement(el)) return el;
    el = el.parentElement;
  }
  return null;
}

function activeTokenFromElement(
  el: HTMLElement,
  plugins: TextEditorPlugin[],
): ActiveTextEditorToken | null {
  const pluginName = el.getAttribute('data-editor-token') ||
    (el.classList?.contains('latex-code') ? 'latex' : null);
  if (!pluginName) return null;

  const plugin = getPluginByName(pluginName, plugins);
  if (!plugin) return null;

  const raw = el.textContent ?? '';
  return {
    plugin,
    token: {
      start: 0,
      end: raw.length,
      raw,
    },
  };
}

function activeTokenFromResolved(token: ResolvedTextEditorToken): ActiveTextEditorToken {
  return {
    plugin: token.plugin,
    token: {
      start: token.start,
      end: token.end,
      raw: token.raw,
      type: token.type,
    },
  };
}

function caretPreviewPosition() {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  try {
    const rangeRect = sel.getRangeAt(0).getBoundingClientRect();
    let left = rangeRect.left;
    const maxLeft = Math.max(8, window.innerWidth - 360 - 8);
    if (left > maxLeft) left = maxLeft;

    return {
      top: rangeRect.top,
      left,
    };
  } catch (e) {
    return null;
  }
}

export function useTextEditor({
  value,
  onChange,
  onBlur,
  initialCaretPoint,
  onInitialCaretAssigned,
  plugins = defaultTextEditorPlugins,
}: UseTextEditorParams) {
  const editableRef = useRef<HTMLDivElement | null>(null);
  const [activeToken, setActiveToken] = useState<ActiveTextEditorToken | null>(null);
  const [previewPos, setPreviewPos] = useState<{ top: number; left: number } | null>(null);
  const programmaticChange = useRef(false);

  const setActivePreview = useCallback((nextToken: ActiveTextEditorToken | null) => {
    if (!nextToken || !nextToken.plugin.renderFloatingPreview) {
      setActiveToken(null);
      setPreviewPos(null);
      return;
    }

    setActiveToken(nextToken);
    setPreviewPos(caretPreviewPosition());
  }, []);

  // Update innerHTML when the external value changes (but don't clobber while focused).
  useEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    el.innerHTML = textToHtml(value ?? '', undefined, plugins);
  }, [value, plugins]);

  // When the selection changes, detect whether the caret is inside a plugin
  // token and re-render active/inactive decorations around the caret.
  const updateActiveToken = useCallback(() => {
    if (programmaticChange.current) return;

    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) {
      setActivePreview(null);
      return;
    }

    const node = sel.anchorNode;
    const container = editableRef.current;
    if (!node || !container || !container.contains(node)) {
      setActivePreview(null);
      return;
    }

    const activeEl = findActiveTokenElement(node, container);
    if (activeEl) {
      setActivePreview(activeTokenFromElement(activeEl, plugins));
      return;
    }

    const caretOffset = getCaretCharacterOffsetWithin(container);
    const txt = domToText(container);
    const foundToken = getTokenAtOffset(txt, caretOffset, plugins);
    const newHtml = textToHtml(txt, caretOffset, plugins);

    if (!foundToken) {
      setActivePreview(null);
    }

    if (container.innerHTML === newHtml) {
      if (foundToken) {
        programmaticChange.current = true;
        try {
          setCaretPosition(container, caretOffset);
          setActivePreview(activeTokenFromResolved(foundToken));
        } finally {
          requestAnimationFrame(() => {
            programmaticChange.current = false;
          });
        }
      }
      return;
    }

    programmaticChange.current = true;
    try {
      container.innerHTML = newHtml;
      setCaretPosition(container, caretOffset);
      setActivePreview(foundToken ? activeTokenFromResolved(foundToken) : null);
    } finally {
      requestAnimationFrame(() => {
        programmaticChange.current = false;
      });
    }
  }, [plugins, setActivePreview]);

  useEffect(() => {
    document.addEventListener('selectionchange', updateActiveToken);
    return () => document.removeEventListener('selectionchange', updateActiveToken);
  }, [updateActiveToken]);

  // If a client coordinate was provided when entering edit mode, try to
  // place the caret at that viewport point inside the editable element.
  useEffect(() => {
    if (!initialCaretPoint) return;
    const el = editableRef.current;
    if (!el) return;

    requestAnimationFrame(() => {
      // ensure content is rendered as plain text so caret-from-point works
      if (!el.innerHTML || el.innerHTML.trim() === '') el.innerHTML = plainTextToHtml(value ?? '');
      el.focus();

      const x = initialCaretPoint.x;
      const y = initialCaretPoint.y;
      let assigned = false;

      try {
        // Try modern / legacy APIs to get a caret range at the client point
        let range: Range | null = null;
        const docAny = document as any;
        if (docAny.caretRangeFromPoint) {
          range = docAny.caretRangeFromPoint(x, y);
        } else if (docAny.caretPositionFromPoint) {
          const pos = docAny.caretPositionFromPoint(x, y);
          if (pos) {
            range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
          }
        }

        if (range && el.contains(range.startContainer)) {
          const sel = document.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
            assigned = true;
          }
        }
      } catch (e) {
        // ignore
      }

      const txt = domToText(el);
      let caret = 0;
      if (assigned) {
        caret = getCaretCharacterOffsetWithin(el);
      } else {
        // Fallback: approximate caret position horizontally across the text
        const rect = el.getBoundingClientRect();
        const relX = Math.max(0, Math.min(1, (x - rect.left) / Math.max(1, rect.width)));
        caret = Math.round(relX * (txt.length || 0));
      }

      const newHtml = textToHtml(txt, caret, plugins);
      if (el.innerHTML !== newHtml) el.innerHTML = newHtml;
      setCaretPosition(el, caret);

      if (onInitialCaretAssigned) onInitialCaretAssigned();
    });
  }, [initialCaretPoint, value, onInitialCaretAssigned, plugins]);

  const handleInput = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;
    // capture caret position in plain-text representation before we modify DOM
    const caret = getCaretCharacterOffsetWithin(el);
    const txt = domToText(el);
    const newHtml = textToHtml(txt, caret, plugins);
    if (el.innerHTML !== newHtml) {
      el.innerHTML = newHtml;
      setCaretPosition(el, caret);
    }
    onChange(txt);
  }, [onChange, plugins]);

  const handleBlur = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;
    const txt = domToText(el);
    if (onBlur) onBlur(txt);
    setActivePreview(null);
  }, [onBlur, setActivePreview]);

  const handleFocus = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      if (!el.innerHTML || el.innerHTML.trim() === '') el.innerHTML = plainTextToHtml(value ?? '');
      const caret = getCaretCharacterOffsetWithin(el);
      const txt = domToText(el);
      const newHtml = textToHtml(txt, caret, plugins);
      if (el.innerHTML !== newHtml) {
        el.innerHTML = newHtml;
        setCaretPosition(el, caret);
      }
    });
  }, [value, plugins]);

  return {
    editableRef,
    activeToken,
    activeMath: activeToken?.plugin.name === 'latex' ? activeToken.token.raw : null,
    previewPos,
    handleInput,
    handleBlur,
    handleFocus,
  };
}
