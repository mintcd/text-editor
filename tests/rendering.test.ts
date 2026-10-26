import assert from 'node:assert/strict';
import test from 'node:test';
import { findLatexFragments, renderLatexFragment } from '../latexRenderer.ts';

test('prose is escaped before inserting generated HTML', () => {
  assert.equal(
    renderLatexFragment('<img src=x onerror="alert(1)">&\n<script>alert(2)</script>'),
    '&lt;img src=x onerror="alert(1)"&gt;&amp;\n&lt;script&gt;alert(2)&lt;/script&gt;',
  );
});

test('invalid expressions preserve escaped source and delimiters', () => {
  const source = '$\\unknown{<img src=x onerror="alert(1)">}$';
  assert.equal(renderLatexFragment(source), source.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
});

test('carriage returns survive browser HTML parsing in prose and invalid math', () => {
  assert.equal(renderLatexFragment('one\r\ntwo\rthree'), 'one&#13;\ntwo&#13;three');
  assert.equal(renderLatexFragment('$\\unknown{a\r\nb}$'), '$\\unknown{a&#13;\nb}$');
});

test('valid math renders alongside escaped prose', () => {
  const html = renderLatexFragment('<b> $x^2$ & tail');
  assert.ok(html.startsWith('&lt;b&gt; '));
  assert.ok(html.includes('class="katex"'));
  assert.ok(html.endsWith(' &amp; tail'));
});

test('all supported delimiters use exact source ranges', () => {
  const expressions = ['$x$', '$$y$$', String.raw`\(z\)`, String.raw`\[w\]`, String.raw`\begin{align*}a&=b\end{align*}`];
  const source = expressions.join(' plain ');
  const tokens = findLatexFragments(source);
  assert.deepEqual(tokens.map(({ raw }) => raw), expressions);
  assert.deepEqual(tokens.map(({ display }) => display), [false, true, false, true, true]);
  for (const token of tokens) {
    assert.equal(source.slice(token.start, token.end), token.raw);
    assert.match(renderLatexFragment(token.raw), /class="katex/);
  }
});

test('escaped delimiters stay literal and do not hide later expressions', () => {
  const source = String.raw`Price \$5; \\(literal\\); $x$`;
  assert.deepEqual(findLatexFragments(source).map(({ raw }) => raw), ['$x$']);
});

test('closing delimiters inside braces or escaped characters do not end math', () => {
  const source = String.raw`before $a{b$c}\$d$ after`;
  assert.deepEqual(findLatexFragments(source).map(({ raw }) => raw), [String.raw`$a{b$c}\$d$`]);
});

test('an unfinished delimiter remains plain text', () => {
  for (const source of ['before $$x', String.raw`before \(x`, String.raw`\begin{align}x\end{gather}`]) {
    assert.deepEqual(findLatexFragments(source), []);
    assert.equal(renderLatexFragment(source), source);
  }
});

test('unsafe KaTeX commands never create executable markup', () => {
  const html = renderLatexFragment(String.raw`$\href{javascript:alert(1)}{x}$ $\htmlClass{injected}{x}$`);
  assert.doesNotMatch(html, /href\s*=|class="injected"|<script|<img/);
});

test('macro definitions do not leak across document renders', () => {
  assert.match(renderLatexFragment(String.raw`$\gdef\custom{a}\custom$`), /class="katex/);
  assert.equal(renderLatexFragment(String.raw`$\custom$`), String.raw`$\custom$`);
  assert.match(renderLatexFragment(String.raw`$\RR$`), /class="katex/);
});
