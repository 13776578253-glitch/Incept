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
  const tokenKeys = Object.keys(tokenStyle);
  if (tokenKeys.length < 2 || typeof tokenStyle.color !== 'string') {
    return false;
  }
  if (tokenStyle.color !== blockStyle['--shiki-light']) {
    return false;
  }
  const hasTypographyOverride = (style: Record<string, string>) =>
    Object.keys(style).some((key) => key.endsWith('-font-style') || key.endsWith('-font-weight'));

  if (hasTypographyOverride(tokenStyle) || hasTypographyOverride(blockStyle)) {
    return false;
  }

  return tokenKeys.every(
    (key) => key === 'color' || (key.startsWith('--shiki-') && tokenStyle[key] === blockStyle[key]),
  );
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
