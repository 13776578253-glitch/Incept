import type { CSSProperties } from 'react';

import type { DocsCodeBlockModel } from '@/features/docs/block-system';
import { highlightDocsCode } from '@/features/docs/code-highlighting/highlight-code';
import { getDocsCodePalette } from '@/server/docs/code-palette';

import { DocsCodeBlock } from './docs-code-block';

export async function DocsHighlightedCodeBlock(props: DocsCodeBlockModel) {
  const codePalette = await getDocsCodePalette();
  const highlighted = await highlightDocsCode(props.code, props.language, codePalette);

  return (
    <DocsCodeBlock
      {...props}
      highlightStyle={highlighted?.style}
    >
      <code className="docs-code-highlight block min-w-full whitespace-pre font-mono font-medium tracking-[0.005em]">
        {highlighted ? (
          highlighted.lines.map((line, lineIndex) => (
            <span className="docs-code-line block min-h-[1em]" key={lineIndex}>
              {line.length === 0
                ? '\u200b'
                : line.map((token, tokenIndex) => (
                    <span
                      className="docs-code-token"
                      key={tokenIndex}
                      style={token.style as CSSProperties}
                    >
                      {token.content}
                    </span>
                  ))}
            </span>
          ))
        ) : (
          props.code
        )}
      </code>
    </DocsCodeBlock>
  );
}
