import assert from 'node:assert/strict';
import test from 'node:test';
import { TextEditorHistory, type TextEditorSnapshot } from '../textEditor.history';

const snapshot = (text: string, anchor = text.length, focus = anchor): TextEditorSnapshot => ({
  text,
  selection: { anchor, focus },
});

test('typing, backspace and forward delete each coalesce into one undo step', () => {
  for (const [kind, states] of [
    ['insertText', [snapshot(''), snapshot('a'), snapshot('ab')]],
    ['deleteContentBackward', [snapshot('ab'), snapshot('a'), snapshot('')]],
    ['deleteContentForward', [snapshot('ab', 0), snapshot('b', 0), snapshot('', 0)]],
  ] as const) {
    let time = 0;
    const history = new TextEditorHistory(() => time);
    history.record(states[0], states[1], kind);
    time = 1000;
    history.record(states[1], states[2], kind);
    assert.deepEqual(history.undo(states[2]), states[0]);
    assert.equal(history.undo(states[0]), null);
    assert.deepEqual(history.redo(states[0]), states[2]);
  }
});

test('a pause or input-kind change starts a separate undo step', () => {
  let time = 0;
  const history = new TextEditorHistory(() => time);
  history.record(snapshot(''), snapshot('a'), 'insertText');
  time = 1001;
  history.record(snapshot('a'), snapshot('ab'), 'insertText');
  history.record(snapshot('ab'), snapshot('a'), 'deleteContentBackward');
  assert.deepEqual(history.undo(snapshot('a')), snapshot('ab'));
  assert.deepEqual(history.undo(snapshot('ab')), snapshot('a'));
  assert.deepEqual(history.undo(snapshot('a')), snapshot(''));
});

test('moving the caret or replacing a range breaks coalescing', () => {
  const history = new TextEditorHistory(() => 0);
  history.record(snapshot(''), snapshot('ab'), 'insertText');
  history.record(snapshot('ab', 0), snapshot('xab', 1), 'insertText');
  history.record(snapshot('xab', 2, 1), snapshot('xyb', 2), 'insertText');
  assert.deepEqual(history.undo(snapshot('xyb', 2)), snapshot('xab', 2, 1));
  assert.deepEqual(history.undo(snapshot('xab', 2, 1)), snapshot('ab', 0));
  assert.deepEqual(history.undo(snapshot('ab', 0)), snapshot(''));
});

test('paste, cut, newline and composition edits are separate transactions', () => {
  for (const kind of ['insertFromPaste', 'deleteByCut', 'insertParagraph', 'insertLineBreak', 'insertCompositionText']) {
    const history = new TextEditorHistory(() => 0);
    history.record(snapshot('a'), snapshot('ab'), kind);
    history.record(snapshot('ab'), snapshot('abc'), kind);
    assert.deepEqual(history.undo(snapshot('abc')), snapshot('ab'));
    assert.deepEqual(history.undo(snapshot('ab')), snapshot('a'));
  }
});

test('redo restores the selection captured when undo was requested', () => {
  const history = new TextEditorHistory(() => 0);
  const before = snapshot('hello', 4, 1);
  const after = snapshot('ho', 1);
  const current = snapshot('ho', 2, 0);
  history.record(before, after, 'deleteByCut');
  assert.deepEqual(history.undo(current), before);
  assert.deepEqual(history.redo(before), current);
});

test('editing after undo discards redo and starts a fresh group', () => {
  const history = new TextEditorHistory(() => 0);
  history.record(snapshot(''), snapshot('a'), 'insertText');
  assert.deepEqual(history.undo(snapshot('a')), snapshot(''));
  history.record(snapshot(''), snapshot('b'), 'insertText');
  assert.equal(history.redo(snapshot('b')), null);
  assert.deepEqual(history.undo(snapshot('b')), snapshot(''));
});

test('undo and redo break the next edit group', () => {
  const history = new TextEditorHistory(() => 0);
  history.record(snapshot(''), snapshot('a'), 'insertText');
  history.undo(snapshot('a'));
  history.redo(snapshot(''));
  history.record(snapshot('a'), snapshot('ab'), 'insertText');
  assert.deepEqual(history.undo(snapshot('ab')), snapshot('a'));
  assert.deepEqual(history.undo(snapshot('a')), snapshot(''));
});

test('snapshots cannot mutate internal selections', () => {
  const history = new TextEditorHistory(() => 0);
  const before = snapshot('a', 0);
  const after = snapshot('ab', 2);
  history.record(before, after, 'insertText');
  before.selection.anchor = 99;
  const restored = history.undo(after)!;
  assert.deepEqual(restored, snapshot('a', 0));
  after.selection.anchor = 99;
  restored.selection.anchor = 88;
  assert.deepEqual(history.redo(snapshot('a', 0)), snapshot('ab', 2));
});

test('selection-only changes do not create edits or discard redo', () => {
  const history = new TextEditorHistory(() => 0);
  history.record(snapshot(''), snapshot('a'), 'insertText');
  history.undo(snapshot('a'));
  history.record(snapshot(''), snapshot('', 0), 'insertText');
  assert.deepEqual(history.redo(snapshot('')), snapshot('a'));
});

test('history retains the latest 100 steps', () => {
  const history = new TextEditorHistory(() => 0);
  for (let index = 0; index < 101; index++) {
    history.record(snapshot(String(index)), snapshot(String(index + 1)), 'insertFromPaste');
  }
  let current = snapshot('101');
  for (let index = 100; index >= 1; index--) {
    current = history.undo(current)!;
    assert.deepEqual(current, snapshot(String(index)));
  }
  assert.equal(history.undo(current), null);
  for (let index = 2; index <= 101; index++) {
    current = history.redo(current)!;
    assert.deepEqual(current, snapshot(String(index)));
  }
});

test('reset removes undo, redo and coalescing state', () => {
  const history = new TextEditorHistory(() => 0);
  history.record(snapshot(''), snapshot('a'), 'insertText');
  history.undo(snapshot('a'));
  history.reset();
  assert.equal(history.undo(snapshot('')), null);
  assert.equal(history.redo(snapshot('')), null);
  history.record(snapshot('a'), snapshot('ab'), 'insertText');
  assert.deepEqual(history.undo(snapshot('ab')), snapshot('a'));
});
