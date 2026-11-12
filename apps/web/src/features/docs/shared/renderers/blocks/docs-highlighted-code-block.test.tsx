import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { highlightDocsCode } from '@/features/docs/code-highlighting/highlight-code';
import { DocsHighlightedCodeBlock } from './docs-highlighted-code-block';

vi.mock('@/features/docs/code-highlighting/highlight-code', () => ({
  highlightDocsCode: vi.fn(),
}));
vi.mock('@/server/docs/code-palette', () => ({
  getDocsCodePalette: vi.fn(async () => 'vscode'),
}));
vi.mock('@/server/navigation-timing', () => ({
  traceNavigation: async (_phase: string, work: () => unknown) => work(),
}));

describe('DocsHighlightedCodeBlock', () => {
  beforeEach(() => vi.resetAllMocks());

  it('keeps theme-specific and typographic styles while emitting default-colored text directly', async () => {
    const defaultStyle = {
      color: '#111111',
      '--shiki-dark': '#dddddd',
      '--shiki-warm': '#777777',
    };
    vi.mocked(highlightDocsCode).mockResolvedValue({
      style: {
        '--shiki-light': '#111111',
        '--shiki-dark': '#dddddd',
        '--shiki-warm': '#777777',
      },
      lines: [
        [
          { content: 'plain ', style: defaultStyle },
          { content: 'dark ', style: { ...defaultStyle, '--shiki-dark': '#ffffff' } },
          { content: 'warm ', style: { ...defaultStyle, '--shiki-warm': '#ffffff' } },
          { content: 'italic', style: { ...defaultStyle, '--shiki-dark-font-style': 'italic' } },
        ],
        [],
      ],
    });

    const { container } = render(await DocsHighlightedCodeBlock({
      id: 'code', type: 'code', language: 'typescript', code: 'plain dark warm italic\n',
    }));

    const lines = container.querySelectorAll('.docs-code-line');
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toBe('plain dark warm italic');
    expect(lines[0].firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(lines[0].querySelectorAll('.docs-code-token')).toHaveLength(3);
    expect(lines[0].querySelectorAll('.docs-code-token')[0]).toHaveStyle('--shiki-dark: #ffffff');
    expect(lines[0].querySelectorAll('.docs-code-token')[1]).toHaveStyle('--shiki-warm: #ffffff');
    expect(lines[0].querySelectorAll('.docs-code-token')[2]).toHaveStyle('--shiki-dark-font-style: italic');
    expect(lines[1].textContent).toBe('\u200b');
  });

  it('keeps unsupported language text intact', async () => {
    vi.mocked(highlightDocsCode).mockResolvedValue(null);
    const code = 'raw <content>\n  line 2';
    const { container } = render(await DocsHighlightedCodeBlock({
      id: 'plain', type: 'code', language: 'custom', code,
    }));
    expect(container.querySelector('code')?.textContent).toBe(code);
  });

  it('keeps token elements when the block supplies a theme font style', async () => {
    vi.mocked(highlightDocsCode).mockResolvedValue({
      style: {
        '--shiki-light': '#111111',
        '--shiki-dark': '#dddddd',
        '--shiki-warm': '#777777',
        '--shiki-dark-font-style': 'italic',
      },
      lines: [[{
        content: 'styled',
        style: { color: '#111111', '--shiki-dark': '#dddddd', '--shiki-warm': '#777777' },
      }]],
    });
    const { container } = render(await DocsHighlightedCodeBlock({
      id: 'styled', type: 'code', language: 'typescript', code: 'styled',
    }));
    expect(container.querySelector('.docs-code-token')?.textContent).toBe('styled');
  });
});
