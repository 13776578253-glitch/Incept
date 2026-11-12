import type { CSSProperties } from 'react';

import type { DocsCodeBlockModel } from '@/features/docs/block-system';
import { highlightDocsCode } from '@/features/docs/code-highlighting/highlight-code';
import { getDocsCodePalette } from '@/server/docs/code-palette';
import { traceNavigation } from '@/server/navigation-timing';

import { DocsCodeBlock } from './docs-code-block';

function usesDefaultCodeColor(
  tokenStyle: Record<string, string>,
  blockStyle: Record<string, string>,
) {
  return Object.keys(tokenStyle).length === 3 &&
    typeof tokenStyle.color === 'string' &&
    typeof tokenStyle['--shiki-dark'] === 'string' &&
    typeof tokenStyle['--shiki-warm'] === 'string' &&
    tokenStyle.color === blockStyle['--shiki-light'] &&
    tokenStyle['--shiki-dark'] === blockStyle['--shiki-dark'] &&
    tokenStyle['--shiki-warm'] === blockStyle['--shiki-warm'] &&
    !blockStyle['--shiki-dark-font-style'] &&
    !blockStyle['--shiki-dark-font-weight'] &&
    !blockStyle['--shiki-warm-font-style'] &&
    !blockStyle['--shiki-warm-font-weight'];
}

export async function DocsHighlightedCodeBlock(props: DocsCodeBlockModel) {
  const codePalette = await getDocsCodePalette();
  const highlighted = await traceNavigation(
    'shiki_highlight',
    () => highlightDocsCode(props.code, props.language, codePalette),
  );

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
                : line.map((token, tokenIndex) =>
                    usesDefaultCodeColor(token.style, highlighted.style)
                      ? token.content
                      : (
                        <span
                          className="docs-code-token"
                          key={tokenIndex}
                          style={token.style as CSSProperties}
                        >
                          {token.content}
                        </span>
                      ),
                  )}
            </span>
          ))
        ) : (
          props.code
        )}
      </code>
    </DocsCodeBlock>
  );
}
