import assert from 'node:assert/strict';
import test from 'node:test';
import { filterReferenceItems, findReferenceQuery, type TextEditorReference } from '../textEditor.references.ts';

const items: TextEditorReference[] = [
  { id: 'a', label: 'Cauchy sequence', description: 'Definition · convergence', text: '[Cauchy](statement:a)' },
  { id: 'b', label: 'Egoroff’s theorem', description: 'Measure theory · almost uniform convergence', text: '[Egoroff](statement:b)' },
  { id: 'c', label: 'Riesz–Fischer', description: 'Completeness · Lp', text: '[Riesz](statement:c)' },
];

test('standalone backslash searches Unicode words and spaces with UTF-16 offsets', () => {
  const source = '😀 See \\Egoroff’s theo';
  assert.deepEqual(findReferenceQuery(source, source.length), { start: 7, end: source.length, query: 'Egoroff’s theo' });
  assert.deepEqual(findReferenceQuery('\\', 1), { start: 0, end: 1, query: '' });
  assert.deepEqual(findReferenceQuery('(\\Cauchy', 8), { start: 1, end: 8, query: 'Cauchy' });
});

test('reference matching searches all label and description terms and normalizes accents', () => {
  assert.deepEqual(filterReferenceItems(items, 'measure convergence').map((item) => item.id), ['b']);
  assert.deepEqual(filterReferenceItems(items, 'COMPLÉTENESS').map((item) => item.id), ['c']);
  assert.deepEqual(filterReferenceItems(items, 'missing'), []);
  assert.equal(filterReferenceItems([...items, items[0]], '').length, 3);
  assert.equal(filterReferenceItems(items, '', 2).length, 2);
});

test('escaped slashes, code, complete and unfinished LaTeX do not open references', () => {
  const suppressed = [
    String.raw`text\\query`, String.raw`text\query`, String.raw`\\query`,
    String.raw`$x + \query`, String.raw`$$x + \query`,
    String.raw`\(x + \query`, String.raw`\[x + \query`,
    String.raw`\begin{align}x + \query`,
    '`code \\query', '``code ` \\query',
    '```md\n\\query', '~~~\n\\query', String.raw`\(`, String.raw`\[`,
  ];
  for (const source of suppressed) assert.equal(findReferenceQuery(source, source.length), null, source);
  for (const source of ['$x$ \\query', '\\(x\\) \\query', '`code` \\query', '```\ncode\n```\n\\query']) assert.equal(findReferenceQuery(source, source.length)?.query, 'query', source);
});

test('invalid source offsets and non-text provider results are refused', () => {
  for (const caret of [-1, 2, 0.5, NaN]) assert.equal(findReferenceQuery('\\', caret), null);
  assert.deepEqual(filterReferenceItems([{ id: 'bad', label: '', text: 'x' }, ...items], 'cauchy').map((item) => item.id), ['a']);
});
