import { useEffect, useRef, useState, useCallback } from 'react';
import {
  domToText,
  getCaretCharacterOffsetWithin,
  setCaretPosition,
  textToHtml,
  plainTextToHtml,
  mathRegex,
} from './textEditor.utils';

export interface UseTextEditorParams {
  value?: string;
  onChange: (text: string) => void;
  onBlur?: (text: string) => void;
  initialCaretPoint?: { x: number; y: number } | null;
  onInitialCaretAssigned?: () => void;
}

export function useTextEditor({
  value,
  onChange,
  onBlur,
  initialCaretPoint,
  onInitialCaretAssigned,
}: UseTextEditorParams) {
  const editableRef = useRef<HTMLDivElement | null>(null);
  const [activeMath, setActiveMath] = useState<string | null>(null);
  const [previewPos, setPreviewPos] = useState<{ top: number; left: number } | null>(null);
  const programmaticChange = useRef(false);

  // Update innerHTML when the external value changes (but don't clobber while focused).
  useEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    el.innerHTML = textToHtml(value ?? '');
  }, [value]);

  // When the selection changes, detect whether the caret is inside a latex-code span
  // and if so, capture the fragment for a live preview and position.
  const updateActiveMath = useCallback(() => {
    if (programmaticChange.current) return;

    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) {
      setActiveMath(null);
      setPreviewPos(null);
      return;
    }
    const node = sel.anchorNode;
    if (!node) {
      setActiveMath(null);
      setPreviewPos(null);
      return;
    }

    const container = editableRef.current;
    if (!container) return;

    // If selection is already inside a wrapped latex element, use that.
    let el = node.nodeType === 3 ? (node.parentElement as HTMLElement | null) : (node as HTMLElement | null);
    let isInsideLatexCode = false;
    while (el && el !== container) {
      if (el.classList && el.classList.contains('latex-code')) {
        isInsideLatexCode = true;
        const raw = el.textContent ?? '';
        setActiveMath(raw);
        try {
          const rangeRect = sel.getRangeAt(0).getBoundingClientRect();
          let left = rangeRect.left;
          const maxLeft = Math.max(8, window.innerWidth - 360 - 8);
          if (left > maxLeft) left = maxLeft;
          const top = rangeRect.top;
          setPreviewPos({ top, left });
        } catch (e) {
          setPreviewPos(null);
        }
        break;
      }
      el = el.parentElement;
    }

    if (isInsideLatexCode) {
      return;
    }

    // Not inside a wrapped latex element: see if we need to wrap one, or if we just
    // exited one and need to unwrap it (turn it back into katex-preview).
    const caretOffset = getCaretCharacterOffsetWithin(container);
    const txt = domToText(container);

    let m: RegExpExecArray | null;
    let foundMatch: RegExpExecArray | null = null;
    mathRegex.lastIndex = 0;
    while ((m = mathRegex.exec(txt))) {
      const start = m.index;
      const end = mathRegex.lastIndex;
      if (caretOffset >= start && caretOffset <= end) {
        foundMatch = m;
        break;
      }
    }

    // We didn't find any math segment under the caret.
    if (!foundMatch) {
      setActiveMath(null);
      setPreviewPos(null);
      // We must still re-render in case we just left a math segment.
    }

    const newHtml = textToHtml(txt, caretOffset);

    // We didn't actually change the HTML because it's already active, 
    // but the browser natively placed the cursor in the adjacent text node instead of inside the span's text node.
    // We should force it back inside and recalculate the preview position.
    if (container.innerHTML === newHtml && foundMatch) {
      programmaticChange.current = true;
      try {
        setCaretPosition(container, caretOffset);

        const sel2 = document.getSelection();
        if (sel2 && sel2.rangeCount > 0) {
          try {
            const rangeRect = sel2.getRangeAt(0).getBoundingClientRect();
            let left = rangeRect.left;
            const maxLeft = Math.max(8, window.innerWidth - 360 - 8);
            if (left > maxLeft) left = maxLeft;
            const top = rangeRect.top;

            let anchorEl = sel2.anchorNode && typeof sel2.anchorNode.nodeType === 'number' && sel2.anchorNode.nodeType === 3 ? (sel2.anchorNode.parentElement as HTMLElement | null) : (sel2.anchorNode as HTMLElement | null);
            while (anchorEl && anchorEl !== container && !(anchorEl.classList && anchorEl.classList.contains('latex-code'))) {
              anchorEl = anchorEl.parentElement;
            }
            const isLatexEl = anchorEl && anchorEl !== container && anchorEl.classList && anchorEl.classList.contains('latex-code');
            const raw = isLatexEl ? anchorEl?.textContent : foundMatch[0];
            if (raw) setActiveMath(raw);
            setPreviewPos({ top, left });
          } catch (e) { }
        }
      } finally {
        requestAnimationFrame(() => {
          programmaticChange.current = false;
        });
      }
      return;
    }

    if (container.innerHTML !== newHtml) {
      programmaticChange.current = true;
      try {
        container.innerHTML = newHtml;
        setCaretPosition(container, caretOffset);

        // After restoring the caret, compute preview position from selection.
        const sel2 = document.getSelection();
        if (sel2 && sel2.rangeCount > 0 && foundMatch) {
          try {
            const rangeRect = sel2.getRangeAt(0).getBoundingClientRect();
            let left = rangeRect.left;
            const maxLeft = Math.max(8, window.innerWidth - 360 - 8);
            if (left > maxLeft) left = maxLeft;
            const top = rangeRect.top;

            // find the latex element we just wrapped
            let anchorEl = sel2.anchorNode && sel2.anchorNode.nodeType === 3 ? (sel2.anchorNode.parentElement as HTMLElement | null) : (sel2.anchorNode as HTMLElement | null);
            while (anchorEl && anchorEl !== container && !(anchorEl.classList && anchorEl.classList.contains('latex-code'))) {
              anchorEl = anchorEl.parentElement;
            }
            const isLatexEl = anchorEl && anchorEl !== container && anchorEl.classList && anchorEl.classList.contains('latex-code');
            const raw = isLatexEl ? anchorEl?.textContent : (foundMatch ? foundMatch[0] : null);
            if (raw) setActiveMath(raw);
            setPreviewPos({ top, left });
          } catch (e) {
            setPreviewPos(null);
          }
        }
      } finally {
        requestAnimationFrame(() => {
          programmaticChange.current = false;
        });
      }
    }
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', updateActiveMath);
    return () => document.removeEventListener('selectionchange', updateActiveMath);
  }, [updateActiveMath]);

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

      // Render only the active math and restore caret
      const newHtml = textToHtml(txt, caret);
      if (el.innerHTML !== newHtml) el.innerHTML = newHtml;
      setCaretPosition(el, caret);

      if (onInitialCaretAssigned) onInitialCaretAssigned();
    });
  }, [initialCaretPoint, value, onInitialCaretAssigned]);

  const handleInput = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;
    // capture caret position in plain-text representation before we modify DOM
    const caret = getCaretCharacterOffsetWithin(el);
    const txt = domToText(el);
    const newHtml = textToHtml(txt, caret);
    if (el.innerHTML !== newHtml) {
      el.innerHTML = newHtml;
      // restore caret to equivalent character offset
      setCaretPosition(el, caret);
    }
    onChange(txt);
  }, [onChange]);

  const handleBlur = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;
    const txt = domToText(el);
    if (onBlur) onBlur(txt);
    setActiveMath(null);
    setPreviewPos(null);
  }, [onBlur]);

  const handleFocus = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      if (!el.innerHTML || el.innerHTML.trim() === '') el.innerHTML = plainTextToHtml(value ?? '');
      const caret = getCaretCharacterOffsetWithin(el);
      const txt = domToText(el);
      const newHtml = textToHtml(txt, caret);
      if (el.innerHTML !== newHtml) {
        el.innerHTML = newHtml;
        setCaretPosition(el, caret);
      }
    });
  }, [value]);

  return {
    editableRef,
    activeMath,
    previewPos,
    handleInput,
    handleBlur,
    handleFocus,
  };
}
