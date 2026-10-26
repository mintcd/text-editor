export { default } from './TextEditor.tsx';
export type { TextEditorProps, TextEditorHandle } from './TextEditor.tsx';
export { filterReferenceItems, findReferenceQuery } from './textEditor.references.ts';
export type { TextEditorReference, SearchTextEditorReferences, ReferenceQuery } from './textEditor.references.ts';
export { useTextEditor } from './useTextEditor.ts';
export {
  defaultTextEditorPlugins,
  escapeAttribute,
  escapeHtml,
  getTextEditorTokens,
  getTokenAtOffset,
  latexPlugin,
  mathRegex,
  renderTokenSpan,
} from './textEditor.plugins.ts';
export type {
  ActiveTextEditorToken,
  UseTextEditorParams,
} from './useTextEditor.ts';
export type {
  ResolvedTextEditorToken,
  TextEditorPlugin,
  TextEditorToken,
  TextEditorTokenMode,
} from './textEditor.plugins.ts';
