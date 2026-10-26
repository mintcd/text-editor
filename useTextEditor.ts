"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ClipboardEvent } from 'react';
import { TextEditorHistory, type TextEditorSnapshot } from './textEditor.history.ts';
import {
  domToText,
  getCaretCharacterOffsetWithin,
  getTextEditorSelection,
  setCaretPosition,
  setTextEditorSelection,
  textToHtml,
} from './textEditor.utils.ts';
import {
  defaultTextEditorPlugins,
  getTokenAtOffset,
  type TextEditorPlugin,
  type TextEditorToken,
} from './textEditor.plugins.ts';
import { filterReferenceItems, findReferenceQuery, type ReferenceQuery, type SearchTextEditorReferences, type TextEditorReference } from './textEditor.references.ts';

export interface UseTextEditorParams {
  value?: string;
  onChange: (text: string) => void;
  onBlur?: (text: string) => void;
  initialCaretPoint?: { x: number; y: number } | null;
  onInitialCaretAssigned?: () => void;
  plugins?: TextEditorPlugin[];
  /** Pass the component's edit mode so newly mounted editable nodes initialize. */
  isEditing?: boolean;
  references?: readonly TextEditorReference[];
  searchReferences?: SearchTextEditorReferences;
  readOnly?: boolean;
}

export interface ActiveTextEditorToken {
  plugin: TextEditorPlugin;
  token: TextEditorToken;
}

type CaretPointDocument = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
};

function caretPreviewPosition() {
  const selection = document.getSelection();
  if (!selection?.rangeCount) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  return {
    top: rect.top,
    left: Math.max(8, Math.min(rect.left, window.innerWidth - 368)),
  };
}

export function useTextEditor<EditableElement extends HTMLElement = HTMLDivElement>({
  value = '',
  onChange,
  onBlur,
  initialCaretPoint,
  onInitialCaretAssigned,
  plugins = defaultTextEditorPlugins,
  isEditing = true,
  references,
  searchReferences,
  readOnly = false,
}: UseTextEditorParams) {
  const editableRef = useRef<EditableElement | null>(null);
  const [activeToken, setActiveToken] = useState<ActiveTextEditorToken | null>(null);
  const [previewPos, setPreviewPos] = useState<{ top: number; left: number } | null>(null);
  const composing = useRef(false);
  const history = useRef(new TextEditorHistory());
  const pendingInput = useRef<{ snapshot: TextEditorSnapshot; kind: string } | null>(null);
  const committed = useRef(false);
  const lastNotified = useRef(value);
  const changingDom = useRef(false);
  const frame = useRef<number | null>(null);
  const mountedElement = useRef<HTMLElement | null>(null);
  const latest = useRef({ value, onInitialCaretAssigned });
  latest.current = { value, onInitialCaretAssigned };
  const [referenceQuery, setReferenceQuery] = useState<ReferenceQuery | null>(null);
  const [referenceItems, setReferenceItems] = useState<TextEditorReference[]>([]);
  const [referenceStatus, setReferenceStatus] = useState<'loading' | 'ready' | 'error'>('ready');
  const [referencePosition, setReferencePosition] = useState<{ top: number; left: number } | null>(null);
  const [referenceIndex, setReferenceIndex] = useState(0);
  const dismissedReference = useRef<string | null>(null);
  const referenceState = useRef({ query: referenceQuery, items: referenceItems, index: referenceIndex });
  referenceState.current = { query: referenceQuery, items: referenceItems, index: referenceIndex };
  const lastSelection = useRef<{ anchor: number; focus: number } | null>(null);

  const closeReferences = useCallback(() => {
    const element = editableRef.current;
    const selection = element ? getTextEditorSelection(element) : null;
    if (element && selection) dismissedReference.current = `${domToText(element)}\0${selection.focus}`;
    setReferenceQuery(null);
    setReferenceItems([]);
  }, []);

  const updateReferences = useCallback((text: string, caret: number) => {
    const signature = `${text}\0${caret}`;
    if (dismissedReference.current !== null && dismissedReference.current !== signature) dismissedReference.current = null;
    if (readOnly || (!references && !searchReferences) || composing.current || dismissedReference.current === signature) {
      setReferenceQuery(null);
      return;
    }
    const query = findReferenceQuery(text, caret);
    setReferenceQuery((previous) => previous?.start === query?.start && previous?.end === query?.end && previous?.query === query?.query ? previous : query);
    if (query) {
      const selection = document.getSelection();
      const rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
      if (rect) setReferencePosition({ top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 230)), left: Math.max(8, Math.min(rect.left, window.innerWidth - 330)) });
    }
  }, [references, searchReferences, readOnly]);

  useEffect(() => { if (readOnly) setReferenceQuery(null); }, [readOnly]);

  useEffect(() => {
    if (!referenceQuery) { setReferenceItems([]); return; }
    const controller = new AbortController();
    setReferenceStatus('loading');
    setReferenceItems([]);
    setReferenceIndex(0);
    Promise.resolve().then(() => searchReferences ? searchReferences(referenceQuery.query, { signal: controller.signal }) : references ?? [])
      .then((items) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(items)) throw new Error('Reference search must return an array');
        setReferenceItems(filterReferenceItems(items, referenceQuery.query));
        setReferenceStatus('ready');
      }).catch(() => {
        if (controller.signal.aborted) return;
        setReferenceItems([]);
        setReferenceStatus('error');
      });
    return () => controller.abort();
  }, [referenceQuery?.query, Boolean(referenceQuery), references, searchReferences]);

  const clearPreview = useCallback(() => {
    setActiveToken(null);
    setPreviewPos(null);
  }, []);

  const rewrite = useCallback((element: HTMLElement, text: string, caret?: number) => {
    const html = textToHtml(text, caret, plugins);
    if (element.innerHTML === html) return;
    const selection = getTextEditorSelection(element);
    changingDom.current = true;
    element.innerHTML = html;
    if (selection) setTextEditorSelection(element, selection);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      changingDom.current = false;
      frame.current = null;
    });
  }, [plugins]);

  // Controlled values are authoritative, including when a different Page is
  // loaded while focus remains in the editor.
  useLayoutEffect(() => {
    const element = editableRef.current;
    if (!isEditing || !element) {
      mountedElement.current = null;
      return;
    }
    if (composing.current) return;
    const starting = mountedElement.current !== element;
    mountedElement.current = element;
    const externalChange = domToText(element) !== value;
    if (starting || externalChange) {
      history.current.reset();
      pendingInput.current = null;
      dismissedReference.current = null;
      setReferenceQuery(null);
    }
    const selection = getTextEditorSelection(element);
    const focused = document.activeElement === element;
    rewrite(element, value, focused && selection ? selection.focus : undefined);
    lastNotified.current = value;
    if (starting && !initialCaretPoint) {
      element.focus();
      setCaretPosition(element, value.length);
    }
    if (externalChange) clearPreview();
  }, [value, isEditing, initialCaretPoint, rewrite, clearPreview]);

  useEffect(() => {
    if (isEditing) committed.current = false;
    else {
      composing.current = false;
      clearPreview();
      setReferenceQuery(null);
    }
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      changingDom.current = false;
    };
  }, [isEditing, clearPreview]);

  const showPreview = useCallback((text: string, caret: number) => {
    updateReferences(text, caret);
    const token = getTokenAtOffset(text, caret, plugins);
    if (token?.plugin.renderFloatingPreview) {
      setActiveToken({ plugin: token.plugin, token });
      setPreviewPos(caretPreviewPosition());
    } else {
      clearPreview();
    }
  }, [plugins, clearPreview, updateReferences]);

  const updateActiveToken = useCallback(() => {
    const element = editableRef.current;
    if (!isEditing || !element || composing.current || changingDom.current) return;
    const selection = getTextEditorSelection(element);
    if (selection) lastSelection.current = selection;
    if (!selection || selection.anchor !== selection.focus) {
      clearPreview();
      setReferenceQuery(null);
      return;
    }
    const text = domToText(element);
    rewrite(element, text, selection.focus);
    showPreview(text, selection.focus);
  }, [isEditing, rewrite, showPreview, clearPreview]);

  useEffect(() => {
    if (!isEditing) return;
    document.addEventListener('selectionchange', updateActiveToken);
    window.addEventListener('resize', updateActiveToken);
    window.addEventListener('scroll', updateActiveToken, true);
    return () => {
      document.removeEventListener('selectionchange', updateActiveToken);
      window.removeEventListener('resize', updateActiveToken);
      window.removeEventListener('scroll', updateActiveToken, true);
    };
  }, [isEditing, updateActiveToken]);

  useEffect(() => {
    if (!isEditing || !initialCaretPoint) return;
    const element = editableRef.current;
    if (!element) return;
    const caretFrame = requestAnimationFrame(() => {
      if (editableRef.current !== element) return;
      element.focus();
      const caretDocument = document as CaretPointDocument;
      const { x, y } = initialCaretPoint;
      let range: Range | null = null;
      if (caretDocument.caretRangeFromPoint) {
        range = caretDocument.caretRangeFromPoint(x, y);
      } else if (caretDocument.caretPositionFromPoint) {
        const point = caretDocument.caretPositionFromPoint(x, y);
        if (point) {
          range = document.createRange();
          range.setStart(point.offsetNode, point.offset);
          range.collapse(true);
        }
      }
      if (range && element.contains(range.startContainer)) {
        const selection = document.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      } else {
        setCaretPosition(element, latest.current.value.length);
      }
      const caret = getCaretCharacterOffsetWithin(element);
      rewrite(element, domToText(element), caret);
      setCaretPosition(element, caret);
      latest.current.onInitialCaretAssigned?.();
    });
    return () => cancelAnimationFrame(caretFrame);
  }, [isEditing, initialCaretPoint, rewrite]);

  const snapshot = useCallback((): TextEditorSnapshot | null => {
    const element = editableRef.current;
    if (!element) return null;
    const text = domToText(element);
    return {
      text,
      selection: getTextEditorSelection(element) ?? { anchor: text.length, focus: text.length },
    };
  }, []);

  const notifyChange = useCallback((text: string) => {
    committed.current = false;
    if (text !== lastNotified.current) {
      const after = snapshot();
      const before = pendingInput.current?.snapshot ?? {
        text: lastNotified.current,
        selection: { anchor: lastNotified.current.length, focus: lastNotified.current.length },
      };
      if (after) history.current.record(before, after, pendingInput.current?.kind ?? 'other');
      lastNotified.current = text;
      onChange(text);
    }
    pendingInput.current = null;
  }, [onChange, snapshot]);

  const restoreHistory = useCallback((direction: 'undo' | 'redo') => {
    const current = snapshot();
    const element = editableRef.current;
    if (!current || !element) return;
    const next = history.current[direction](current);
    pendingInput.current = null;
    if (!next) return;
    rewrite(element, next.text, next.selection.focus);
    setTextEditorSelection(element, next.selection);
    committed.current = false;
    lastNotified.current = next.text;
    onChange(next.text);
    showPreview(next.text, next.selection.focus);
  }, [snapshot, rewrite, onChange, showPreview]);

  const handleInput = useCallback(() => {
    const element = editableRef.current;
    if (!element || composing.current || readOnly) return;
    const text = domToText(element);
    const caret = getCaretCharacterOffsetWithin(element);
    rewrite(element, text, caret);
    notifyChange(text);
    showPreview(text, caret);
  }, [rewrite, notifyChange, showPreview, readOnly]);

  const handleCompositionStart = useCallback(() => {
    composing.current = true;
    const before = snapshot();
    if (before) pendingInput.current = { snapshot: before, kind: 'insertCompositionText' };
    clearPreview();
    setReferenceQuery(null);
  }, [clearPreview, snapshot]);

  const handleCompositionEnd = useCallback(() => {
    composing.current = false;
    handleInput();
  }, [handleInput]);

  const insertText = useCallback((text: string, kind = 'insertFromPaste') => {
    const element = editableRef.current;
    if (!element || readOnly) return;
    const selection = getTextEditorSelection(element) ?? lastSelection.current ?? { anchor: domToText(element).length, focus: domToText(element).length };
    if (!selection) return;
    const source = domToText(element);
    pendingInput.current = { snapshot: { text: source, selection }, kind };
    const start = Math.min(selection.anchor, selection.focus);
    const end = Math.max(selection.anchor, selection.focus);
    const next = source.slice(0, start) + text + source.slice(end);
    rewrite(element, next, start + text.length);
    setCaretPosition(element, start + text.length);
    notifyChange(next);
    lastSelection.current = { anchor: start + text.length, focus: start + text.length };
    updateReferences(next, start + text.length);
  }, [rewrite, notifyChange, updateReferences, readOnly]);

  const selectReference = useCallback((item: TextEditorReference) => {
    const element = editableRef.current;
    const query = referenceState.current.query;
    if (!element || !query || composing.current || readOnly) return;
    const source = domToText(element);
    const selection = getTextEditorSelection(element);
    if (!selection || selection.anchor !== selection.focus || selection.focus !== query.end || source.slice(query.start, query.end) !== `\\${query.query}`) { closeReferences(); return; }
    pendingInput.current = { snapshot: { text: source, selection }, kind: 'insertReference' };
    const next = source.slice(0, query.start) + item.text + source.slice(query.end);
    const caret = query.start + item.text.length;
    rewrite(element, next, caret);
    element.focus();
    setCaretPosition(element, caret);
    lastSelection.current = { anchor: caret, focus: caret };
    notifyChange(next);
    dismissedReference.current = `${next}\0${caret}`;
    setReferenceQuery(null);
  }, [closeReferences, notifyChange, rewrite, readOnly]);

  // Native pre-wrap Enter can insert an extra invisible LF as a caret
  // placeholder. Insert one source newline explicitly instead.
  useEffect(() => {
    const element = editableRef.current;
    if (!isEditing || !element) return;
    function handleBeforeInput(event: InputEvent) {
      if (readOnly || composing.current || event.isComposing) return;
      if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
        event.preventDefault();
        restoreHistory(event.inputType === 'historyUndo' ? 'undo' : 'redo');
      } else if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
        event.preventDefault();
        insertText('\n', event.inputType);
      } else {
        const before = snapshot();
        if (before) pendingInput.current = { snapshot: before, kind: event.inputType };
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (readOnly || composing.current || event.isComposing) return;
      const menu = referenceState.current;
      if (menu.query && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeReferences(); return; }
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && menu.items.length) {
          event.preventDefault(); event.stopPropagation();
          setReferenceIndex((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + menu.items.length) % menu.items.length);
          return;
        }
        if (event.key === 'Enter' && menu.items[menu.index]) { event.preventDefault(); event.stopPropagation(); selectReference(menu.items[menu.index]); return; }
      }
      if (event.altKey || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && !(key === 'y' && event.ctrlKey)) return;
      event.preventDefault();
      event.stopPropagation();
      restoreHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo');
    }
    element.addEventListener('beforeinput', handleBeforeInput);
    element.addEventListener('keydown', handleKeyDown);
    return () => {
      element.removeEventListener('beforeinput', handleBeforeInput);
      element.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditing, insertText, restoreHistory, snapshot, closeReferences, selectReference, readOnly]);

  const handlePaste = useCallback((event: ClipboardEvent<HTMLElement>) => {
    event.preventDefault();
    insertText(event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'));
  }, [insertText]);

  const handleCopy = useCallback((event: ClipboardEvent<HTMLElement>) => {
    const element = editableRef.current;
    if (!element) return;
    const selection = getTextEditorSelection(element);
    if (!selection || selection.anchor === selection.focus) return;
    const text = domToText(element);
    event.clipboardData.setData('text/plain', text.slice(
      Math.min(selection.anchor, selection.focus),
      Math.max(selection.anchor, selection.focus),
    ));
    event.preventDefault();
  }, []);

  const handleCut = useCallback((event: ClipboardEvent<HTMLElement>) => {
    handleCopy(event);
    if (event.defaultPrevented) insertText('', 'deleteByCut');
  }, [handleCopy, insertText]);

  const handleBlur = useCallback(() => {
    const element = editableRef.current;
    if (!element || committed.current) return;
    const text = domToText(element);
    composing.current = false;
    notifyChange(text);
    committed.current = true;
    clearPreview();
    setReferenceQuery(null);
    onBlur?.(text);
  }, [onBlur, notifyChange, clearPreview]);

  const handleFocus = useCallback(() => {
    committed.current = false;
    updateActiveToken();
  }, [updateActiveToken]);

  return {
    editableRef,
    activeToken,
    activeMath: activeToken?.plugin.name === 'latex' ? activeToken.token.raw : null,
    previewPos,
    handleInput,
    handleBlur,
    handleFocus,
    handlePaste,
    handleCopy,
    handleCut,
    handleCompositionStart,
    handleCompositionEnd,
    referenceQuery,
    referenceItems,
    referenceStatus,
    referencePosition,
    referenceIndex,
    selectReference,
    closeReferences,
    insertText,
    undo: () => { if (!readOnly) restoreHistory('undo'); },
    redo: () => { if (!readOnly) restoreHistory('redo'); },
    getSelection: () => {
      const element = editableRef.current;
      if (!element) return null;
      const selected = getTextEditorSelection(element) ?? lastSelection.current;
      if (!selected) return null;
      const start = Math.min(selected.anchor, selected.focus), end = Math.max(selected.anchor, selected.focus);
      return { start, end, text: domToText(element).slice(start, end) };
    },
  };
}
