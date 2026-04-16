"use client";

import { useEffect, useRef, useState } from 'react';
import Latex from '../Latex';
import { useTextEditor } from './useTextEditor';

export default function TextEditor({
  value,
  onChange,
  onBlur,
  initialCaretPoint,
  onInitialCaretAssigned,
  inline = false,
  isEditing = false,
  onStartEditing,
  children,
  preserveHeightOnEdit = true,
}: {
  value?: string;
  onChange: (text: string) => void;
  onBlur?: (text: string) => void;
  initialCaretPoint?: { x: number; y: number } | null;
  onInitialCaretAssigned?: () => void;
  inline?: boolean;
  isEditing?: boolean;
  onStartEditing?: (opts?: { initialCaretPoint?: { x: number; y: number } }) => void;
  children?: React.ReactNode;
  preserveHeightOnEdit?: boolean;
}) {
  const previewRef = useRef<HTMLElement | null>(null);
  const [measuredPreviewHeight, setMeasuredPreviewHeight] = useState<number | null>(null);

  const {
    editableRef,
    activeMath,
    previewPos,
    handleInput,
    handleBlur,
    handleFocus,
  } = useTextEditor({
    value,
    onChange,
    onBlur,
    initialCaretPoint,
    onInitialCaretAssigned,
  });

  // Clicking the preview requests edit mode. Measure preview height so we can
  // keep the editor at least that tall to avoid layout jumps for empty content.
  function handlePreviewClick(e: any) {
    e.stopPropagation();
    if (previewRef.current && preserveHeightOnEdit) {
      const rect = previewRef.current.getBoundingClientRect();
      setMeasuredPreviewHeight(rect.height);
    }
    const caret = { x: (e as any).clientX, y: (e as any).clientY };
    if (onStartEditing) onStartEditing({ initialCaretPoint: caret });
  }

  // When editing, watch for outside clicks and treat them as a blur/save.
  useEffect(() => {
    if (!isEditing) return;
    function onDocClick(e: Event) {
      const target = e.target as Node | null;
      // If click is inside editor or inside the preview element, do nothing
      if (editableRef.current && target && editableRef.current.contains(target)) return;
      if (previewRef.current && target && previewRef.current.contains(target)) return;
      handleBlur();
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('touchstart', onDocClick);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('touchstart', onDocClick);
    };
  }, [isEditing, editableRef, previewRef, handleBlur]);

  const editableStyle: any = { outline: 'none', whiteSpace: 'pre-wrap' };


  return (
    <>
      {!isEditing ? (
        <span ref={previewRef as any} onClick={handlePreviewClick} className={`${inline ? 'inline-block' : 'block'} min-w-px min-h-4`}>
          {children ?? <Latex>{value ?? ''}</Latex>}
        </span>
      ) : (
        <>
          <span
            ref={editableRef}
            contentEditable
            suppressContentEditableWarning
            className={`min-h-5 wrap-break-word text-inherit whitespace-pre-wrap ${inline ? 'inline-block' : 'block'}`}
            onInput={handleInput}
            onBlur={handleBlur}
            onFocus={handleFocus}
            style={editableStyle}
          />

          {activeMath && previewPos && (
            <div
              className="z-50 p-2 rounded bg-white dark:bg-gray-700 shadow-lg"
              style={{ position: 'fixed', top: previewPos.top, left: Math.max(0, previewPos.left - 10), transform: 'translateY(calc(-100% - 6px))', minWidth: 80, maxWidth: 360 }}
            >
              <Latex>{activeMath}</Latex>
            </div>
          )}
        </>
      )}
    </>
  );
}
