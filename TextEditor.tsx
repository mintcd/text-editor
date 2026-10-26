"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, ReactNode, Ref } from 'react';
import { useTextEditor } from './useTextEditor.ts';
import { defaultTextEditorPlugins, type TextEditorPlugin } from './textEditor.plugins.ts';
import { textToHtml } from './textEditor.utils.ts';
import type { SearchTextEditorReferences, TextEditorReference } from './textEditor.references.ts';

export interface TextEditorHandle {
  focus(): void;
  insertText(text: string): void;
  getSelection(): { start: number; end: number; text: string } | null;
  undo(): void;
  redo(): void;
}

export interface TextEditorProps {
  value?: string;
  onChange: (text: string) => void;
  onBlur?: (text: string) => void;
  initialCaretPoint?: { x: number; y: number } | null;
  onInitialCaretAssigned?: () => void;
  inline?: boolean;
  isEditing?: boolean;
  onStartEditing?: (opts?: { initialCaretPoint?: { x: number; y: number } }) => void;
  children?: ReactNode;
  preserveHeightOnEdit?: boolean;
  plugins?: TextEditorPlugin[];
  'aria-label'?: string;
  references?: readonly TextEditorReference[];
  searchReferences?: SearchTextEditorReferences;
  editorRef?: Ref<TextEditorHandle>;
  readOnly?: boolean;
}

export default function TextEditor({
  value = '',
  onChange,
  onBlur,
  initialCaretPoint,
  onInitialCaretAssigned,
  inline = false,
  isEditing = false,
  onStartEditing,
  children,
  preserveHeightOnEdit = true,
  plugins = defaultTextEditorPlugins,
  'aria-label': label = 'Text editor',
  references,
  searchReferences,
  editorRef,
  readOnly = false,
}: TextEditorProps) {
  const referenceListId = useId();
  const previewRef = useRef<HTMLSpanElement | null>(null);
  const [measuredPreviewHeight, setMeasuredPreviewHeight] = useState<number | null>(null);
  const {
    editableRef,
    activeToken,
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
    insertText,
    getSelection,
    undo,
    redo,
  } = useTextEditor<HTMLSpanElement>({
    value, onChange, onBlur, initialCaretPoint, onInitialCaretAssigned, plugins, isEditing,
    references, searchReferences, readOnly,
  });

  useImperativeHandle(editorRef, () => ({
    focus: () => editableRef.current?.focus(),
    insertText: (text) => { editableRef.current?.focus(); insertText(text, 'insertFromToolbar'); },
    getSelection, undo, redo,
  }), [editableRef, insertText, getSelection, undo, redo]);
  useEffect(() => {
    if (referenceQuery && referenceItems[referenceIndex]) document.getElementById(`${referenceListId}-${referenceIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [referenceQuery, referenceIndex, referenceItems, referenceListId]);

  function startEditing(point?: { x: number; y: number }) {
    if (previewRef.current && preserveHeightOnEdit) {
      setMeasuredPreviewHeight(previewRef.current.getBoundingClientRect().height);
    }
    onStartEditing?.(point ? { initialCaretPoint: point } : undefined);
  }

  function handlePreviewClick(event: MouseEvent<HTMLSpanElement>) {
    event.stopPropagation();
    startEditing({ x: event.clientX, y: event.clientY });
  }

  useEffect(() => {
    if (!isEditing) return;
    function onOutsidePointer(event: Event) {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (editableRef.current?.contains(target)) return;
      handleBlur();
    }
    document.addEventListener('pointerdown', onOutsidePointer);
    return () => document.removeEventListener('pointerdown', onOutsidePointer);
  }, [isEditing, editableRef, handleBlur]);

  const editableStyle: CSSProperties = {
    display: inline ? 'inline-block' : 'block',
    outline: 'none',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    minHeight: preserveHeightOnEdit ? measuredPreviewHeight ?? '1em' : '1em',
  };
  const activePreview = activeToken?.plugin.renderFloatingPreview?.(activeToken.token);

  return (
    <>
      {!isEditing ? (
        <span
          ref={previewRef}
          onClick={handlePreviewClick}
          role={onStartEditing ? 'button' : undefined}
          tabIndex={onStartEditing ? 0 : undefined}
          aria-label={onStartEditing ? 'Edit ' + label : undefined}
          onKeyDown={(event) => {
            if (onStartEditing && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              startEditing();
            }
          }}
          className={(inline ? 'inline' : 'block') + ' min-w-px min-h-4'}
          style={{ display: inline ? 'inline' : 'block', whiteSpace: 'pre-wrap', minWidth: 1, minHeight: '1em' }}
        >
          {children ?? <span dangerouslySetInnerHTML={{ __html: textToHtml(value, -1, plugins) }} />}
        </span>
      ) : (
        <>
          <span
            ref={editableRef}
            contentEditable={!readOnly}
            suppressContentEditableWarning
            role="textbox"
            aria-label={label}
            aria-multiline
            aria-readonly={readOnly}
            aria-autocomplete={references || searchReferences ? 'list' : undefined}
            aria-haspopup={references || searchReferences ? 'listbox' : undefined}
            aria-expanded={references || searchReferences ? Boolean(referenceQuery) : undefined}
            aria-controls={referenceQuery ? referenceListId : undefined}
            aria-activedescendant={referenceQuery && referenceItems[referenceIndex] ? `${referenceListId}-${referenceIndex}` : undefined}
            className={'min-h-5 wrap-break-word text-inherit whitespace-pre-wrap ' + (inline ? 'inline-block' : 'block')}
            onInput={handleInput}
            onBlur={handleBlur}
            onFocus={handleFocus}
            onPaste={handlePaste}
            onCopy={handleCopy}
            onCut={handleCut}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            style={editableStyle}
          />
          {referenceQuery && referencePosition && !readOnly && (
            <div
              id={referenceListId}
              role="listbox"
              aria-label="References"
              onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
              onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
              style={{ position: 'fixed', zIndex: 1000, top: referencePosition.top, left: referencePosition.left, width: 320, maxWidth: 'calc(100vw - 16px)', maxHeight: 220, overflowY: 'auto', background: '#fff', color: '#17223b', border: '1px solid #d6dcea', borderRadius: 8, boxShadow: '0 8px 24px #18263c26', padding: 5, font: '14px/1.4 system-ui, sans-serif' }}
            >
              <div style={{ padding: '5px 8px', color: '#63708b', fontSize: 12 }}>References · type to search</div>
              {referenceStatus !== 'ready' || !referenceItems.length ? (
                <div role="status" style={{ padding: '8px' }}>{referenceStatus === 'loading' ? 'Searching references…' : referenceStatus === 'error' ? 'Reference search failed. Keep typing to retry.' : 'No matching references.'}</div>
              ) : referenceItems.map((item, index) => (
                <div
                  key={item.id}
                  id={`${referenceListId}-${index}`}
                  role="option"
                  aria-selected={index === referenceIndex}
                  onClick={() => selectReference(item)}
                  style={{ padding: '7px 9px', cursor: 'pointer', borderRadius: 5, background: index === referenceIndex ? '#edf2ff' : undefined }}
                >
                  <div>{item.label}</div>
                  {item.description && <div style={{ color: '#63708b', fontSize: 12 }}>{item.description}</div>}
                </div>
              ))}
            </div>
          )}
          {activePreview && previewPos && (
            <div
              className="z-50 p-2 rounded bg-white dark:bg-gray-700 shadow-lg"
              style={{ position: 'fixed', top: previewPos.top, left: previewPos.left, transform: 'translateY(calc(-100% - 6px))', minWidth: 80, maxWidth: 360, pointerEvents: 'none' }}
            >
              {activePreview}
            </div>
          )}
        </>
      )}
    </>
  );
}
