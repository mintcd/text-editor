import katex from 'katex';

export interface LatexFragment {
  start: number;
  end: number;
  raw: string;
  math: string;
  display: boolean;
}

type Delimiter = {
  left: string;
  right: string;
  display: boolean;
  environment?: boolean;
};

const delimiters: Delimiter[] = [
  { left: '$$', right: '$$', display: true },
  { left: '\\(', right: '\\)', display: false },
  { left: '$', right: '$', display: false },
  { left: '\\[', right: '\\]', display: true },
];

const defaultMacros: Record<string, string> = {};
for (let code = 65; code <= 90; code++) {
  const letter = String.fromCharCode(code);
  defaultMacros[`\\${letter}${letter}`] = `\\mathbb{${letter}}`;
  defaultMacros[`\\${letter}`] = `\\mathcal{${letter}}`;
}
defaultMacros['\\sc#1'] = '\\require{html}\\htmlClass{textsc}{\\text{#1}}';

const escapeHtml = (text: string) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\r/g, '&#13;');

/* Delimiters inside braces or escaped characters belong to the expression. */
function findEndOfMath(text: string, delimiter: string, start: number): number {
  let braceLevel = 0;
  for (let index = start; index < text.length; index++) {
    if (braceLevel <= 0 && text.startsWith(delimiter, index)) return index;
    if (text[index] === '\\') index++;
    else if (text[index] === '{') braceLevel++;
    else if (text[index] === '}') braceLevel--;
  }
  return -1;
}

/** The editor and preview share the same source ranges and delimiter rules. */
export function findLatexFragments(text: string): LatexFragment[] {
  const fragments: LatexFragment[] = [];
  for (let start = 0; start < text.length; start++) {
    let delimiter = delimiters.find(({ left }) => text.startsWith(left, start));
    if (!delimiter && text.startsWith('\\begin{', start)) {
      const environment = /^\\begin\{([a-zA-Z]+\*?)\}/.exec(text.slice(start));
      if (environment) {
        delimiter = {
          left: environment[0],
          right: `\\end{${environment[1]}}`,
          display: true,
          environment: true,
        };
      }
    }

    if (delimiter) {
      const closing = findEndOfMath(text, delimiter.right, start + delimiter.left.length);
      if (closing !== -1) {
        const end = closing + delimiter.right.length;
        const raw = text.slice(start, end);
        fragments.push({
          start,
          end,
          raw,
          math: delimiter.environment ? raw : text.slice(start + delimiter.left.length, closing),
          display: delimiter.display,
        });
        start = end - 1;
        continue;
      }
      // Keep the rest literal when an opener is unfinished, as auto-render does.
      break;
    } else if (text[start] === '\\') {
      start++;
    }
  }
  return fragments;
}

/** Render untrusted source, escaping prose and invalid expressions as text. */
export function renderLatexFragment(raw: string): string {
  const fragments: string[] = [];
  // KaTeX can mutate macros through definitions; isolate separate renders.
  const macros = { ...defaultMacros };
  let offset = 0;
  for (const token of findLatexFragments(raw)) {
    fragments.push(escapeHtml(raw.slice(offset, token.start)));
    try {
      fragments.push(katex.renderToString(token.math, {
        displayMode: token.display,
        macros,
        output: 'html',
        trust: false,
      }));
    } catch {
      fragments.push(escapeHtml(token.raw));
    }
    offset = token.end;
  }
  fragments.push(escapeHtml(raw.slice(offset)));
  return fragments.join('');
}
