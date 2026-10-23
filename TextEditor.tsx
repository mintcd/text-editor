"use client";

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { useTextEditor } from './useTextEditor';
import { defaultTextEditorPlugins, type TextEditorPlugin } from './textEditor.plugins';
import { textToHtml } from './textEditor.utils';

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
}: TextEditorProps) {
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
  } = useTextEditor<HTMLSpanElement>({
    value, onChange, onBlur, initialCaretPoint, onInitialCaretAssigned, plugins, isEditing,
  });

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
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label={label}
            aria-multiline
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
