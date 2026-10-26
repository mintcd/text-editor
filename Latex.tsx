'use client'

import type { CSSProperties } from 'react';
import 'katex/dist/katex.min.css';
import { renderLatexFragment } from './latexRenderer.ts';

export { renderLatexFragment } from './latexRenderer.ts';

export default function Latex({ children, style }: {
  children: string,
  style?: CSSProperties
}) {
  return (
    <span
      className="__latex"
      style={{ whiteSpace: 'pre-wrap', ...style }}
      dangerouslySetInnerHTML={{ __html: renderLatexFragment(String(children)) }}
    />
  );
}