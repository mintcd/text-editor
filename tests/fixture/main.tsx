import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TextEditor, { type TextEditorHandle } from '../../TextEditor.tsx';
import { filterReferenceItems, type TextEditorReference, type SearchTextEditorReferences } from '../../textEditor.references.ts';
import {
  escapeHtml,
  renderTokenSpan,
  type TextEditorPlugin,
} from '../../textEditor.plugins.ts';
import './style.css';
import {
  domToText,
  plainTextToHtml,
  textToHtml,
  getCaretCharacterOffsetWithin,
  setCaretPosition,
  getTextEditorSelection,
  setTextEditorSelection,
} from '../../textEditor.utils.ts';

const editorTest = {
  domToText,
  plainTextToHtml,
  textToHtml,
  getCaretCharacterOffsetWithin,
  setCaretPosition,
  getTextEditorSelection,
  setTextEditorSelection,
};
export type EditorTestApi = typeof editorTest;
declare global {
  interface Window {
    editorTest: EditorTestApi;
  }
}
Object.assign(window, { editorTest });

const pageReferencePlugin: TextEditorPlugin = {
  name: 'page-reference',
  match(text) {
    return Array.from(text.matchAll(/\[\[([^\]]+)\]\]/g), (match) => ({
      start: match.index!,
      end: match.index! + match[0].length,
      raw: match[0],
      type: 'page-reference',
    }));
  },
  renderActive(token) {
    return renderTokenSpan({
      pluginName: 'page-reference',
      mode: 'active',
      raw: token.raw,
      html: escapeHtml(token.raw),
    });
  },
  renderInactive(token) {
    return renderTokenSpan({
      pluginName: 'page-reference',
      mode: 'inactive',
      raw: token.raw,
      html: '<strong data-testid="page-reference">Page: ' + escapeHtml(token.raw.slice(2, -2)) + '</strong>',
      contentEditable: false,
    });
  },
};
const customPlugins = [pageReferencePlugin];
const noPlugins: TextEditorPlugin[] = [];
const referenceItems: TextEditorReference[] = [
  { id: 'cauchy', label: 'Cauchy sequence', description: 'Definition · convergence', text: '[Cauchy sequence](statement:cauchy)' },
  { id: 'egoroff', label: 'Egoroff theorem', description: 'Theorem · measure theory', text: '[Egoroff theorem](statement:egoroff)' },
  { id: 'riesz', label: 'Riesz–Fischer', description: 'Completeness in Lp', text: '[Riesz–Fischer](statement:riesz)' },
];
const asyncReferences: SearchTextEditorReferences = (query) => new Promise((resolve, reject) => {
  window.setTimeout(() => {
    if (query === 'error') reject(new Error('Search unavailable'));
    else if (query === 'slow') resolve([{ id: 'slow', label: 'slow result', text: 'slow result' }]);
    else resolve(filterReferenceItems(referenceItems, query));
  }, query === 'slow' ? 250 : 10);
});

function Fixture() {
  const editorRef = useRef<TextEditorHandle>(null);
  const query = new URLSearchParams(window.location.search);
  const [value, setValue] = useState(() => query.get('value') ?? 'Hello $x$');
  const [isEditing, setIsEditing] = useState(() => query.get('editing') === '1');
  const [initialCaretPoint, setInitialCaretPoint] = useState<{ x: number; y: number } | null>(null);
  const [blurCount, setBlurCount] = useState(0);
  const plugins = query.get('plugins') === 'none' ? noPlugins
    : query.get('plugins') === 'custom' ? customPlugins : undefined;

  return (
    <main>
      <h1>Text editor regression fixture</h1>
      <div className="controls">
        <button onClick={() => setIsEditing(true)}>Edit without caret</button>
        <button onClick={() => setIsEditing(false)}>Show preview</button>
        <button
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={() => setValue('External replacement $y$')}
        >Replace value while focused</button>
        <button data-testid="outside">Outside target</button>
        <button onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={() => editorRef.current?.insertText('inserted')}>Insert toolbar text</button>
        <button onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={() => editorRef.current?.undo()}>Toolbar undo</button>
      </div>
      <div className="editor-host" data-testid="editor-region">
        <TextEditor
          value={value}
          onChange={setValue}
          onBlur={() => setBlurCount((count) => count + 1)}
          isEditing={isEditing}
          initialCaretPoint={initialCaretPoint}
          onInitialCaretAssigned={() => setInitialCaretPoint(null)}
          onStartEditing={(options) => {
            setInitialCaretPoint(options?.initialCaretPoint ?? null);
            setIsEditing(true);
          }}
          plugins={plugins}
          references={query.get('references') === '1' ? referenceItems : undefined}
          searchReferences={query.get('references') === 'async' ? asyncReferences : undefined}
          editorRef={editorRef}
        />
      </div>
      <p>Controlled value:</p>
      <output data-testid="value">{value}</output>
      <p>Blur count: <output data-testid="blur-count">{blurCount}</output></p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Fixture />);



