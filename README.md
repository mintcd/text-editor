Text Editor component extracted as a local submodule.

This folder is intended to be replaced with a git submodule pointing to a shared `text-editor` repository.

Contents:
- `TextEditor.tsx` - default export component
- `useTextEditor.ts` - hook used by the component
- `textEditor.utils.ts` - helper functions
- `index.ts` - re-export

To turn this into a real git submodule:

1. Create a remote repository for the text-editor package.
2. Push the package contents there.
3. In this repo run: `git submodule add <repo-url> view/components/text-editor`
