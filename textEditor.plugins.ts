import { createElement, type ReactNode } from 'react';
import Latex, { renderLatexFragment } from './Latex';

export type TextEditorTokenMode = 'active' | 'inactive';

export interface TextEditorToken {
  start: number;
  end: number;
  raw: string;
  type?: string;
}

export interface ResolvedTextEditorToken extends TextEditorToken {
  plugin: TextEditorPlugin;
}

export interface TextEditorPlugin {
  name: string;
  match: (text: string) => TextEditorToken[];
  renderActive?: (token: TextEditorToken) => string;
  renderInactive?: (token: TextEditorToken) => string;
  renderFloatingPreview?: (token: TextEditorToken) => ReactNode;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const escapeAttribute = (s: string) =>
  escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function renderTokenSpan({
  pluginName,
  mode,
  raw,
  html,
  className,
  style,
  contentEditable,
}: {
  pluginName: string;
  mode: TextEditorTokenMode;
  raw: string;
  html: string;
  className?: string;
  style?: string;
  contentEditable?: boolean;
}) {
  const classAttr = className ? ` class="${escapeAttribute(className)}"` : '';
  const styleAttr = style ? ` style="${escapeAttribute(style)}"` : '';
  const editableAttr = typeof contentEditable === 'boolean' ? ` contenteditable="${contentEditable ? 'true' : 'false'}"` : '';

  return `<span data-editor-token="${escapeAttribute(pluginName)}" data-token-mode="${mode}" data-raw="${escapeAttribute(raw)}"${editableAttr}${classAttr}${styleAttr}>${html}</span>`;
}

export const mathRegex = /(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\\begin\{[a-zA-Z]+\}[\s\S]*?\\end\{[a-zA-Z]+\})/g;

const latexCodeStyle = "font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace; color: #065f46; background: rgba(16,185,129,0.06); padding: 0 4px; border-radius: 4px;";

export const latexPlugin: TextEditorPlugin = {
  name: 'latex',

  match(text: string) {
    const regex = new RegExp(mathRegex.source, mathRegex.flags);
    const tokens: TextEditorToken[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text))) {
      tokens.push({
        start: match.index,
        end: regex.lastIndex,
        raw: match[0],
        type: 'math',
      });
    }

    return tokens;
  },

  renderActive(token) {
    return renderTokenSpan({
      pluginName: 'latex',
      mode: 'active',
      raw: token.raw,
      html: escapeHtml(token.raw),
      className: 'latex-code',
      style: latexCodeStyle,
    });
  },

  renderInactive(token) {
    let rendered = escapeHtml(token.raw);
    try {
      rendered = renderLatexFragment(token.raw);
    } catch (e) { }

    return renderTokenSpan({
      pluginName: 'latex',
      mode: 'inactive',
      raw: token.raw,
      html: rendered,
      className: 'katex-preview',
      style: 'cursor: text; display: inline-block;',
      contentEditable: false,
    });
  },

  renderFloatingPreview(token) {
    return createElement(Latex, null, token.raw);
  },
};

export const defaultTextEditorPlugins: TextEditorPlugin[] = [latexPlugin];

export function getTextEditorTokens(text: string, plugins: TextEditorPlugin[] = defaultTextEditorPlugins) {
  const tokens: ResolvedTextEditorToken[] = [];

  for (const plugin of plugins) {
    for (const token of plugin.match(text)) {
      if (token.start < 0 || token.end <= token.start || token.end > text.length) continue;
      tokens.push({
        ...token,
        raw: token.raw || text.slice(token.start, token.end),
        plugin,
      });
    }
  }

  tokens.sort((a, b) => a.start - b.start || b.end - a.end);

  const selected: ResolvedTextEditorToken[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.start < cursor) continue;
    selected.push(token);
    cursor = token.end;
  }

  return selected;
}

export function getTokenAtOffset(
  text: string,
  offset: number,
  plugins: TextEditorPlugin[] = defaultTextEditorPlugins,
) {
  return getTextEditorTokens(text, plugins).find((token) => offset >= token.start && offset <= token.end) ?? null;
}

export function getPluginByName(name: string, plugins: TextEditorPlugin[] = defaultTextEditorPlugins) {
  return plugins.find((plugin) => plugin.name === name) ?? null;
}
