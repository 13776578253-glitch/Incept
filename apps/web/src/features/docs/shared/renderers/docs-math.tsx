import { ParseError, renderToString } from 'katex';
import 'katex/dist/katex.min.css';

export function DocsMath({ tex, displayMode = false }: { tex: string; displayMode?: boolean }) {
  let html: string | undefined;
  try {
    html = renderToString(tex, { displayMode, strict: 'ignore', trust: false, maxSize: 20 });
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
  }

  return html === undefined
    ? <code className="whitespace-pre-wrap [overflow-wrap:anywhere]">{tex}</code>
    : <span dangerouslySetInnerHTML={{ __html: html }} />;
}
