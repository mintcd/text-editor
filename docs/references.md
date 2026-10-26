# Searchable references

`TextEditor` can complete a reference after a standalone backslash in prose.
The host supplies labels, searchable descriptions, and the exact source to insert:

```tsx
import TextEditor, { type TextEditorReference } from '@notes/text-editor';

const references: TextEditorReference[] = [{
  id: 'a-stable-id',
  label: 'Cauchy sequence',
  description: 'Definition · convergence',
  text: '[Cauchy sequence](statement:a-stable-id)',
}];

<TextEditor value={source} onChange={setSource} isEditing references={references} />
```

Type `\`, then search words from the label or description. Matching ignores case
and accents. Multiple words must all match. Up/Down selects an option; Enter or a
pointer click inserts its `text`. Escape closes the dropdown and preserves the
literal source. Empty results leave normal editing available. A reference insertion
is one source history edit: undo restores the backslash query and selection.

Queries use the editor's UTF-16 source offsets. Completion does not activate in
math, inline code, fenced code, escaped backslashes, or noncollapsed selections.
Recognized math opening delimiters such as `\(` close the menu. During IME
composition the browser keeps ownership of the source and no search is performed.

## Remote search

`searchReferences(query, { signal })` can replace the local list. It returns an
array or a promise of `TextEditorReference[]`. Respect `signal` when fetching;
the editor also ignores late replies after the query changes or the menu closes.
Errors appear in the menu and another edit retries search. Results must still
match the query in their label or description. Keep provider functions and local
arrays stable with React `useCallback` and `useMemo`.

The editor shows at most 20 unique IDs. It escapes labels through React rendering;
`text` remains ordinary source, never executable HTML. Storage IDs, link syntax,
permissions, and saving belong to the host.

## Toolbar and read-only integration

`editorRef` accepts a React ref to `TextEditorHandle`: `focus()`, `insertText(text)`,
`getSelection()` returning `{ start, end, text } | null`, `undo()`, and `redo()`.
Toolbar buttons should prevent the default pointer-down focus change before
calling these methods. Insertions replace the selection and participate in source
history. `readOnly` keeps an editing node mounted while disabling editing and
reference completion; it does not reset undo history.

Terminal unit checks use native Node TypeScript stripping with
`node --test tests/*.test.ts` (Node 22.18 or newer; Node 24 recommended). React TSX
still requires the consuming app's bundler. Relative source imports include their
`.ts` or `.tsx` extension, and runtime TypeScript uses erasable syntax.
