import { expect, test, type Locator, type Page } from '@playwright/test';
import type {} from './fixture/main.tsx';

async function openFixture(page: Page, value: string, options: { editing?: boolean; plugins?: string; references?: string } = {}) {
  const params = new URLSearchParams({ value });
  if (options.editing) params.set('editing', '1');
  if (options.plugins) params.set('plugins', options.plugins);
  if (options.references) params.set('references', options.references);
  await page.goto('/?' + params);
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', value);
}

test('backslash references search labels and descriptions and insert as one undo step', async ({ page }) => {
  await openFixture(page, 'See ', { editing: true, references: '1' });
  const editor = page.getByRole('textbox', { name: 'Text editor' });
  await editor.press('ControlOrMeta+End');
  await editor.pressSequentially('\\measure');
  const menu = page.getByRole('listbox', { name: 'References' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('option')).toHaveCount(1);
  await expect(menu.getByRole('option')).toContainText('Egoroff theorem');
  await editor.press('Enter');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', 'See [Egoroff theorem](statement:egoroff)');
  await expect(menu).toHaveCount(0);
  await editor.press('ControlOrMeta+Z');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', 'See \\measure');
  await editor.press('ControlOrMeta+Shift+Z');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', 'See [Egoroff theorem](statement:egoroff)');
});

test('reference arrows and pointer selection preserve caret and do not blur the source', async ({ page }) => {
  await openFixture(page, 'Before ', { editing: true, references: '1' });
  const editor = page.getByRole('textbox', { name: 'Text editor' });
  await editor.press('ControlOrMeta+End');
  await editor.pressSequentially('\\');
  const menu = page.getByRole('listbox', { name: 'References' });
  await expect(menu.getByRole('option')).toHaveCount(3);
  await editor.press('ArrowDown');
  await expect(menu.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
  await menu.getByRole('option').nth(1).click();
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', 'Before [Egoroff theorem](statement:egoroff)');
  await expect(editor).toBeFocused();
  await expect(page.getByTestId('blur-count')).toHaveText('0');
  await editor.pressSequentially(' after');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', 'Before [Egoroff theorem](statement:egoroff) after');
});

test('empty results and Escape preserve the literal query and normal Enter editing', async ({ page }) => {
  await openFixture(page, '', { editing: true, references: '1' });
  const editor = page.getByRole('textbox', { name: 'Text editor' });
  await editor.pressSequentially('\\notfound');
  await expect(page.getByRole('listbox').getByRole('status')).toHaveText('No matching references.');
  await editor.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', '\\notfound');
  await editor.press('Enter');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', '\\notfound\n');
});

test('reference completion leaves unfinished math, inline code, and escaped slashes alone', async ({ page }) => {
  for (const value of ['$x+ \\cauchy', '\\(x+ \\cauchy', '`code \\cauchy', '\\\\cauchy']) {
    await openFixture(page, value, { editing: true, references: '1' });
    const editor = page.getByRole('textbox', { name: 'Text editor' });
    await editor.press('ControlOrMeta+End');
    await editor.pressSequentially('a');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(page.getByTestId('value')).toHaveJSProperty('textContent', `${value}a`);
  }
});

test('a dismissed reference can be searched again after changing the source', async ({ page }) => {
  await openFixture(page, '', { editing: true, references: '1' });
  const editor = page.getByRole('textbox', { name: 'Text editor' });
  await editor.pressSequentially('\\cauchy');
  await expect(page.getByRole('option')).toContainText('Cauchy sequence');
  await editor.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await editor.press('ControlOrMeta+A');
  await editor.press('Backspace');
  await editor.pressSequentially('\\cauchy');
  await expect(page.getByRole('option')).toContainText('Cauchy sequence');
  await editor.press('Enter');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', '[Cauchy sequence](statement:cauchy)');
});

test('asynchronous reference searches ignore stale replies and recover after errors', async ({ page }) => {
  await openFixture(page, '', { editing: true, references: 'async' });
  const editor = page.getByRole('textbox', { name: 'Text editor' });
  await editor.pressSequentially('\\slow');
  await editor.press('ControlOrMeta+A');
  await editor.pressSequentially('\\cauchy');
  await expect(page.getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('option')).toContainText('Cauchy sequence');
  await page.waitForTimeout(300);
  await expect(page.getByRole('option')).toContainText('Cauchy sequence');
  await editor.press('ControlOrMeta+A');
  await editor.pressSequentially('\\error');
  await expect(page.getByRole('listbox').getByRole('status')).toHaveText('Reference search failed. Keep typing to retry.');
  await editor.press('ControlOrMeta+A');
  await editor.pressSequentially('\\riesz');
  await expect(page.getByRole('option')).toContainText('Riesz–Fischer');
});

test('reference search waits until IME composition ends', async ({ page }) => {
  await openFixture(page, '', { editing: true, references: '1' });
  const editor = page.getByRole('textbox', { name: 'Text editor' });
  await editor.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    element.textContent = '\\cauchy';
    window.editorTest.setCaretPosition(element as HTMLElement, 7);
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', isComposing: true }));
  });
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', '');
  await editor.evaluate((element) => element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await expect(page.getByRole('option')).toContainText('Cauchy sequence');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', '\\cauchy');
});

test('source toolbar replaces the selected range without committing blur and supports undo', async ({ page }) => {
  await openFixture(page, 'Hello world', { editing: true });
  const editor = page.getByRole('textbox', { name: 'Text editor' });
  await editor.evaluate((element) => window.editorTest.setTextEditorSelection(element as HTMLElement, { anchor: 6, focus: 11 }));
  await settleSelection(page);
  await page.getByRole('button', { name: 'Insert toolbar text' }).click();
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', 'Hello inserted');
  await expect(page.getByTestId('blur-count')).toHaveText('0');
  await page.getByRole('button', { name: 'Toolbar undo' }).click();
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', 'Hello world');
});

async function sourceText(editor: Locator) {
  return editor.evaluate((element) => window.editorTest.domToText(element as HTMLElement));
}

async function settleSelection(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

for (const value of [
  '<img src=x onerror="window.__injected=true"> plain text',
  '$\\unknowncommand{<img src=x onerror="window.__injected=true">}$',
]) {
  test('read mode renders source HTML as literal text: ' + value.slice(0, 18), async ({ page }) => {
    await openFixture(page, value);
    const preview = page.getByTestId('editor-region');
    await expect(preview.locator('img')).toHaveCount(0);
    await expect(preview).toHaveText(value);
    expect(await page.evaluate(() => '__injected' in window)).toBe(false);
  });
}

test('the empty plugin list disables math rendering', async ({ page }) => {
  const value = 'No math $x$ here';
  await openFixture(page, value, { plugins: 'none' });
  await expect(page.getByTestId('editor-region')).toHaveText(value);
  await expect(page.locator('.katex')).toHaveCount(0);
});

test('custom plugins render in read mode', async ({ page }) => {
  await openFixture(page, 'See [[Home]]', { plugins: 'custom' });
  await expect(page.getByTestId('page-reference')).toHaveText('Page: Home');
  await expect(page.getByTestId('editor-region')).toHaveText('See Page: Home');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', 'See [[Home]]');
});

test('clicking a preview initializes the editor without changing its controlled value', async ({ page }) => {
  const value = 'Unchanged $x$ source';
  await openFixture(page, value);
  await page.locator('.editor-host > span').click({ position: { x: 15, y: 20 } });
  const editor = page.getByRole('textbox', { name: 'Text editor' });
  await expect(editor).toBeVisible();
  await expect.poll(() => sourceText(editor)).toBe(value);
  await expect(editor).toBeFocused();
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', value);
  await expect(page.getByTestId('blur-count')).toHaveText('0');
});

test('entering editing without a caret point initializes an unchanged value', async ({ page }) => {
  const value = 'Keyboard-opened editor';
  await openFixture(page, value);
  await page.getByRole('button', { name: 'Edit without caret' }).click();
  const editor = page.getByRole('textbox', { name: 'Text editor' });
  await expect(editor).toHaveText(value);
  await expect.poll(() => sourceText(editor)).toBe(value);
});

test('native Enter preserves lines and trailing blank lines', async ({ page }) => {
  await openFixture(page, 'First', { editing: true, plugins: 'none' });
  const editor = page.getByRole('textbox', { name: 'Text editor' });
  await editor.click();
  await editor.press('ControlOrMeta+End');
  await editor.press('Enter');
  await editor.pressSequentially('Second');
  await editor.press('Enter');
  await editor.press('Enter');

  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', 'First\nSecond\n\n');
  expect(await sourceText(editor)).toBe('First\nSecond\n\n');
  await editor.press('ControlOrMeta+Z');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', 'First\nSecond\n');
  await editor.press('ControlOrMeta+Shift+Z');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', 'First\nSecond\n\n');
});

test('paste prefers plain text and copy returns the original source with newlines', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openFixture(page, '', { editing: true });
  const editor = page.getByRole('textbox', { name: 'Text editor' });
  const value = 'First\n$x$\n<img src=x onerror=alert(1)>\n\n';
  await editor.click();
  await page.evaluate(async (plainText) => {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
        'text/html': new Blob(['<b>Unwanted rich content</b>'], { type: 'text/html' }),
      }),
    ]);
  }, value);
  await editor.press('ControlOrMeta+V');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', value);
  expect(await sourceText(editor)).toBe(value);
  await expect(editor.locator('img, b')).toHaveCount(0);
  await editor.press('ControlOrMeta+A');
  await settleSelection(page);
  await editor.press('ControlOrMeta+C');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(value);
  await editor.press('ControlOrMeta+Z');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', '');
  expect(await sourceText(editor)).toBe('');
  await editor.press('ControlOrMeta+Shift+Z');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', value);
  expect(await sourceText(editor)).toBe(value);
});

test('selecting a token keeps the selection and typing replaces it', async ({ page }) => {
  await openFixture(page, '$x$', { editing: true });
  const editor = page.getByRole('textbox', { name: 'Text editor' });
  await editor.click();
  await editor.press('ControlOrMeta+Home');
  await settleSelection(page);
  await editor.press('Shift+End');
  await settleSelection(page);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('$x$');
  await editor.pressSequentially('replacement');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', 'replacement');
});

test('typing replaces a plain text selection without duplicating surrounding content', async ({ page }) => {
  await openFixture(page, 'alpha beta gamma', { editing: true, plugins: 'none' });
  const editor = page.getByRole('textbox', { name: 'Text editor' });
  await editor.click();
  await editor.evaluate((element) => {
    window.editorTest.setTextEditorSelection(element as HTMLElement, { anchor: 6, focus: 10 });
  });
  await settleSelection(page);
  await editor.pressSequentially('new');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', 'alpha new gamma');
});

test('composition preserves the browser-owned DOM until composition ends', async ({ page }) => {
  await openFixture(page, 'Compose ', { editing: true });
  const editor = page.getByRole('textbox', { name: 'Text editor' });
  await editor.click();
  const preserved = await editor.evaluate(async (element) => {
    const editorElement = element as HTMLElement;
    editorElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composingNode = document.createTextNode('$x$');
    editorElement.append(composingNode);
    const range = document.createRange();
    range.setStart(composingNode, 3);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    editorElement.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertCompositionText',
      data: '$x$',
      isComposing: true,
    }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return editorElement.contains(composingNode) && composingNode.nodeValue === '$x$';
  });
  expect(preserved).toBe(true);
  await expect(editor.locator('[data-editor-token]')).toHaveCount(0);
  await editor.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '$x$' }));
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: '$x$',
      isComposing: false,
    }));
  });
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', 'Compose $x$');
  await expect(editor.locator('[data-editor-token="latex"]')).toHaveCount(1);
});

test('an external value replaces the focused document', async ({ page }) => {
  await openFixture(page, 'Old document', { editing: true });
  const editor = page.getByRole('textbox', { name: 'Text editor' });
  await editor.click();
  await page.getByRole('button', { name: 'Replace value while focused' }).click();
  await expect(editor).toBeFocused();
  await expect.poll(() => sourceText(editor)).toBe('External replacement $y$');
  await editor.press('ControlOrMeta+End');
  await editor.pressSequentially('!');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', 'External replacement $y$!');
  await editor.press('ControlOrMeta+Z');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', 'External replacement $y$');
  await editor.press('ControlOrMeta+Z');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', 'External replacement $y$');
  expect(await sourceText(editor)).toBe('External replacement $y$');
});

test('one outside click commits blur once while the editor stays mounted', async ({ page }) => {
  await openFixture(page, 'Save once', { editing: true });
  const editor = page.getByRole('textbox', { name: 'Text editor' });
  await editor.click();
  await page.getByTestId('outside').click();
  await settleSelection(page);
  await expect(page.getByTestId('blur-count')).toHaveText('1');
  await expect(editor).toBeVisible();
});

test('canonical HTML roundtrips text and every UTF-16 caret position', async ({ page }) => {
  await openFixture(page, '');
  const results = await page.evaluate(() => {
    const api = window.editorTest;
    const inputs = ['', '\n', 'A\n', 'A\n\n', '\nA', 'A\r\nB', 'A\rB', '<&>\n', 'A😀\nB'];
    const errors: string[] = [];
    const container = document.createElement('div');
    container.contentEditable = 'true';
    document.body.append(container);
    for (const input of inputs) {
      const expected = input;
      for (const render of [api.plainTextToHtml, (value: string) => api.textToHtml(value, undefined, [])]) {
        container.innerHTML = render(input);
        if (api.domToText(container) !== expected) errors.push('text:' + JSON.stringify(input));
        for (let offset = 0; offset <= expected.length; offset++) {
          api.setCaretPosition(container, offset);
          const actual = api.getCaretCharacterOffsetWithin(container);
          if (actual !== offset) errors.push('caret:' + JSON.stringify(input) + ':' + offset + ':' + actual);
        }
      }
    }
    container.remove();
    return errors;
  });
  expect(results).toEqual([]);
});

test('native block elements and root selections share source offsets', async ({ page }) => {
  await openFixture(page, '');
  const results = await page.evaluate(() => {
    const api = window.editorTest;
    const cases = [
      ['A<div>B</div>', 'A\nB'],
      ['<div>A</div><div>B</div>', 'A\nB'],
      ['<div>A</div><div><br></div>', 'A\n'],
      ['<div><br></div><div><br></div>', '\n'],
      ['A<br><br>', 'A\n'],
      ['<br>', ''],
    ];
    const errors: string[] = [];
    const container = document.createElement('div');
    container.contentEditable = 'true';
    document.body.append(container);
    for (const [html, expected] of cases) {
      container.innerHTML = html;
      if (api.domToText(container) !== expected) errors.push('text:' + html + ':' + JSON.stringify(api.domToText(container)));
      const selection = window.getSelection()!;
      selection.setBaseAndExtent(container, 0, container, container.childNodes.length);
      const rootSelection = api.getTextEditorSelection(container);
      if (rootSelection?.anchor !== 0 || rootSelection.focus !== expected.length) errors.push('root:' + html);
      for (let offset = 0; offset <= expected.length; offset++) {
        api.setCaretPosition(container, offset);
        if (api.getCaretCharacterOffsetWithin(container) !== offset) errors.push('caret:' + html + ':' + offset);
      }
    }
    container.innerHTML = api.plainTextToHtml('A\nB\nC');
    for (const [anchor, focus] of [[0, 5], [5, 0], [1, 4], [4, 1]]) {
      api.setTextEditorSelection(container, { anchor, focus });
      const selection = api.getTextEditorSelection(container);
      if (selection?.anchor !== anchor || selection.focus !== focus) errors.push('direction:' + anchor + ':' + focus);
    }
    container.remove();
    return errors;
  });
  expect(results).toEqual([]);
});





for (const key of ['Enter', 'Space']) {
  test('keyboard preview activation focuses the editor with ' + key, async ({ page }) => {
    await openFixture(page, 'Keyboard document');
    const preview = page.getByRole('button', { name: 'Edit Text editor' });
    await preview.focus();
    await preview.press(key);
    const editor = page.getByRole('textbox', { name: 'Text editor' });
    await expect(editor).toBeFocused();
    await expect.poll(() => sourceText(editor)).toBe('Keyboard document');
  });
}

test('typing a math token displays its floating preview', async ({ page }) => {
  await openFixture(page, '', { editing: true });
  const editor = page.getByRole('textbox', { name: 'Text editor' });
  await editor.click();
  await editor.pressSequentially('$x$');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', '$x$');
  await expect(page.locator('.editor-host > div .katex')).toBeVisible();
});


test('math decorations preserve CRLF source in active and inactive modes', async ({ page }) => {
  await openFixture(page, '');
  const results = await page.evaluate(() => {
    const api = window.editorTest;
    const source = 'A $x\r\ny$ B';
    const errors: string[] = [];
    const container = document.createElement('div');
    container.contentEditable = 'true';
    document.body.append(container);
    for (const caret of [0, 5]) {
      container.innerHTML = api.textToHtml(source, caret);
      if (api.domToText(container) !== source) errors.push('source:' + caret);
      if (caret === 5) {
        for (let offset = 0; offset <= source.length; offset++) {
          api.setCaretPosition(container, offset);
          if (api.getCaretCharacterOffsetWithin(container) !== offset) errors.push('caret:' + offset);
        }
      }
    }
    container.remove();
    return errors;
  });
  expect(results).toEqual([]);
});


test('typing a decorated token supports undo and redo as one edit', async ({ page }) => {
  await openFixture(page, '', { editing: true });
  const editor = page.getByRole('textbox', { name: 'Text editor' });
  await editor.click();
  await editor.pressSequentially('$x$');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', '$x$');
  await editor.press('ControlOrMeta+Z');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', '');
  expect(await sourceText(editor)).toBe('');
  await editor.press('ControlOrMeta+Shift+Z');
  await expect(page.getByTestId('value')).toHaveJSProperty('textContent', '$x$');
  expect(await sourceText(editor)).toBe('$x$');
});

