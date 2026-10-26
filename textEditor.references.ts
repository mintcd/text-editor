import { findLatexFragments } from './latexRenderer.ts';

export interface TextEditorReference {
  id: string;
  label: string;
  description?: string;
  /** Exact source inserted by completion; serialization belongs to the host. */
  text: string;
}

export interface ReferenceQuery {
  start: number;
  end: number;
  query: string;
}

export type SearchTextEditorReferences = (
  query: string,
  context: { signal: AbortSignal },
) => readonly TextEditorReference[] | Promise<readonly TextEditorReference[]>;

const normalized = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();

export function filterReferenceItems(items: readonly TextEditorReference[], query: string, limit = 20): TextEditorReference[] {
  const terms = normalized(query).trim().split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item || typeof item.id !== 'string' || !item.id || typeof item.label !== 'string' || !item.label || typeof item.text !== 'string' || (item.description !== undefined && typeof item.description !== 'string') || seen.has(item.id)) return false;
    seen.add(item.id);
    const searchable = normalized(`${item.label} ${item.description ?? ''}`);
    return terms.every((term) => searchable.includes(term));
  }).map((item, index) => ({ item, index, starts: normalized(item.label).startsWith(normalized(query).trim()) }))
    .sort((a, b) => Number(b.starts) - Number(a.starts) || a.index - b.index)
    .slice(0, Math.max(0, limit)).map(({ item }) => item);
}

/** Find a standalone backslash query in prose, using UTF-16 source offsets. */
export function findReferenceQuery(text: string, caret: number): ReferenceQuery | null {
  if (!Number.isInteger(caret) || caret < 0 || caret > text.length) return null;
  const before = text.slice(0, caret);
  const match = /(?:^|[\s([{:;,])\\([\p{L}\p{N}\p{M} '\u2019_./-]*)$/u.exec(before);
  if (!match) return null;
  const start = caret - match[1].length - 1;
  const throughCaret = text.slice(0, caret);
  // Unclosed fences, inline code, and unfinished math are still editing contexts.
  let fence: string | null = null;
  let inlineTicks = 0;
  let math: string | null = null;
  for (let index = 0; index < start;) {
    const rest = throughCaret.slice(index);
    if (index === 0 || throughCaret[index - 1] === '\n') {
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(rest);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
        index += marker[0].length;
        continue;
      }
    }
    if (fence) { index++; continue; }
    if (rest[0] === '`' && !math) {
      const ticks = /^`+/.exec(rest)![0].length;
      inlineTicks = inlineTicks === ticks ? 0 : inlineTicks || ticks;
      index += ticks;
      continue;
    }
    if (inlineTicks) { index++; continue; }
    if (rest[0] === '\\') {
      if (rest.startsWith('\\(') && !math) { math = '\\)'; index += 2; continue; }
      if (rest.startsWith('\\[') && !math) { math = '\\]'; index += 2; continue; }
      if (math && rest.startsWith(math)) { math = null; index += 2; continue; }
      const environment = /^\\begin\{([a-zA-Z]+\*?)\}/.exec(rest);
      if (!math && environment) { math = `\\end{${environment[1]}}`; index += environment[0].length; continue; }
      // Skip escaped punctuation and paired backslashes.
      index += 2;
      continue;
    }
    if (rest[0] === '$') {
      const delimiter = rest.startsWith('$$') ? '$$' : '$';
      if (math === delimiter) math = null;
      else if (!math) math = delimiter;
      index += delimiter.length;
      continue;
    }
    index++;
  }
  if (fence || inlineTicks || math) return null;
  if (findLatexFragments(text).some((fragment) => start >= fragment.start && start < fragment.end)) return null;
  return { start, end: caret, query: match[1] };
}
