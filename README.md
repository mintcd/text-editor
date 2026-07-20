Text Editor component extracted as a local submodule.

This folder is intended to be replaced with a git submodule pointing to a shared `text-editor` repository.

Contents:
- `TextEditor.tsx` - default export component
- `useTextEditor.ts` - hook used by the component
- `textEditor.plugins.ts` - lightweight plugin contract and built-in plugins
- `textEditor.utils.ts` - helper functions
- `Latex.tsx` - KaTeX renderer used by the built-in LaTeX plugin
- `index.ts` - re-export

The editor keeps plain text as the source of truth. Inline behavior is provided
through a static plugin list that can match text ranges, render active/inactive
HTML for those ranges, and optionally render a floating preview at the caret.
LaTeX is implemented as the first built-in plugin. Custom plugins should use
`renderTokenSpan` so decorated HTML can be converted back to the original plain
text reliably.

To turn this into a real git submodule:

1. Create a remote repository for the text-editor package.
2. Push the package contents there.
3. In this repo run: `git submodule add <repo-url> view/components/text-editor`
