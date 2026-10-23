export interface TextEditorSnapshot {
  text: string;
  selection: { anchor: number; focus: number };
}

const historyLimit = 100;
const coalescingInterval = 1000;
const coalescingKinds = new Set(['insertText', 'deleteContentBackward', 'deleteContentForward']);

const copySnapshot = ({ text, selection }: TextEditorSnapshot): TextEditorSnapshot => ({
  text,
  selection: { ...selection },
});

const isCollapsed = ({ selection }: TextEditorSnapshot) => selection.anchor === selection.focus;

/** Text history survives DOM decoration, which invalidates native browser undo. */
export class TextEditorHistory {
  private undoStack: TextEditorSnapshot[] = [];
  private redoStack: TextEditorSnapshot[] = [];
  private lastEdit: { kind: string; after: TextEditorSnapshot; time: number } | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  record(before: TextEditorSnapshot, after: TextEditorSnapshot, kind: string): void {
    if (before.text === after.text) {
      this.lastEdit = null;
      return;
    }

    const time = this.now();
    const previous = this.lastEdit;
    const elapsed = previous ? time - previous.time : Infinity;
    const coalesce = previous !== null &&
      coalescingKinds.has(kind) && previous.kind === kind &&
      elapsed >= 0 && elapsed <= coalescingInterval &&
      previous.after.text === before.text &&
      isCollapsed(previous.after) && isCollapsed(before) && isCollapsed(after) &&
      previous.after.selection.anchor === before.selection.anchor;

    if (!coalesce) {
      this.undoStack.push(copySnapshot(before));
      if (this.undoStack.length > historyLimit) this.undoStack.shift();
    }
    this.redoStack = [];
    this.lastEdit = { kind, after: copySnapshot(after), time };
  }

  undo(current: TextEditorSnapshot): TextEditorSnapshot | null {
    this.lastEdit = null;
    const before = this.undoStack.pop();
    if (!before) return null;
    this.redoStack.push(copySnapshot(current));
    return copySnapshot(before);
  }

  redo(current: TextEditorSnapshot): TextEditorSnapshot | null {
    this.lastEdit = null;
    const after = this.redoStack.pop();
    if (!after) return null;
    this.undoStack.push(copySnapshot(current));
    return copySnapshot(after);
  }

  reset(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.lastEdit = null;
  }
}
