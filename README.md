# Text editor

A reusable React plain-text editor with inline LaTeX decoration and a small plugin API. The persisted value is always the original string; generated HTML and KaTeX markup are presentation only.

## Use from another app

This is a source package intended for a TypeScript-aware bundler, including a local dependency or Git submodule. Install its dependencies when using a submodule; React is a peer dependency. The default LaTeX component includes KaTeX CSS. Essential editing layout also works without Tailwind.

```tsx
'use client';

import { useState } from 'react';
import TextEditor from '@notes/text-editor';

export function EditableBody({
  body,
  onChange,
  onSave,
}: {
  body: string;
  onChange: (body: string) => void;
  onSave: (body: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <TextEditor
      aria-label="Page body"
      value={body}
      onChange={onChange}
      isEditing={editing}
      onStartEditing={() => setEditing(true)}
      onBlur={(text) => {
        onSave(text);
        setEditing(false);
      }}
    />
  );
}
```

The parent controls both the value and edit mode. A new external value replaces the displayed text even while focused. A newly mounted editing view initializes from that value and receives focus. `onChange` reports plain text after input; IME composition is left intact until it ends. `onBlur` commits once for a focus/editing session, including an outside pointer interaction.

The default read view uses the same plugin list as editing. `plugins={[]}` disables decorations. `children` remains an explicit custom read-view override. Preview activation works with click, Enter, or Space; optional `initialCaretPoint` and `onInitialCaretAssigned` support placing the caret at a click.

Copy and cut return original source, including decorated formulas. Paste inserts only clipboard plain text and normalizes clipboard CRLF/CR line endings to LF. Values supplied through props retain their exact line endings; selection offsets use JavaScript UTF-16 string indices.

Undo/redo stores up to 100 source-text edits, including selections, independently of rendered DOM. Consecutive typing or deletion coalesces within one second; paste, cut, newline, and composition each form separate edits. Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes. External value replacement and a new editing session reset history.

## Page integration boundary

Keep Page identity, names, tags, permissions, persistence, autosave timing, and conflict handling in the consuming app. Give the editor a string body and callbacks. Do not save its editable DOM or rendered HTML.

Key the editing component by Page ID when navigating between Pages, for example `<EditableBody key={page.id} ... />`. This resets composition, selection, and edit state for the new Page. Switching Pages should explicitly save or discard the outgoing draft in the app before replacement; replacing a prop is not a save operation.

No Page schema or storage adapter is built into this package. This keeps it usable in both the notes app and the future asset-library Page object.

## Plugins

Exported `TextEditorPlugin` defines a name, `match(text)` source ranges, optional active/inactive HTML renderers, and an optional React floating preview. Ranges must have integer offsets within the string. Overlaps resolve by earliest start, then longest range, then plugin order. Raw token text is derived from the original source.

Use `renderTokenSpan` to preserve source when displaying a decorated token. Active tokens must expose their editable source text; inactive spans retain it in `data-raw`. Escape user strings with `escapeHtml` or `escapeAttribute` when constructing plugin HTML. Plugins are trusted application code: renderer HTML is inserted directly, so never accept renderer implementations or arbitrary HTML from a Page.

Built-in LaTeX supports `$...$`, `$$...$$`, `\(...\)`, `\[...\]`, and matching `\begin{...}...\end{...}` environments. Prose and invalid expressions are escaped, invalid math retains its source delimiters, and KaTeX trust is disabled.

## Development

Use Node.js 22.12 or later.

```sh
npm ci
npm run typecheck
npm test
npm run test:browser
```

Browser regressions use installed Chrome by default. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use another Chromium executable. The isolated Vite fixture runs on port 4185; tests cover actual keyboard/clipboard behavior plus rendering, newlines, directional selection, controlled updates, composition events, and blur callbacks.
