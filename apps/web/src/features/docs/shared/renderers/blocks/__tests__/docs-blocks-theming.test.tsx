import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DocsInlineContent } from '../../docs-inline-content';
import { DocsCalloutBlock } from '../docs-callout-block';
import { DocsChecklistBlock } from '../docs-checklist-block';
import { DocsCodeBlock } from '../docs-code-block';
import { DocsQuoteBlock } from '../docs-quote-block';
import { DocsTableBlock } from '../docs-table-block';

describe('Docs blocks semantic theming integration', () => {
  it('renders Callout with semantic left accent bar, icon, and surface tint without legacy borders', () => {
    const { container } = render(
      <DocsCalloutBlock
        id="callout-tip"
        type="callout"
        tone="tip"
        title="设计建议"
        text="保持克制的颜色层次"
      />,
    );

    const card = container.firstElementChild as HTMLElement;
    const accentBar = card.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(accentBar).toHaveStyle({ backgroundColor: 'var(--callout-tip-accent)' });
    expect(card.innerHTML).toContain('var(--callout-tip-accent)');
    expect(screen.getByText('设计建议')).toBeInTheDocument();
    expect(screen.getByText('保持克制的颜色层次')).toBeInTheDocument();
  });

  it('renders Quote with docs-quote-border and docs font sizing', () => {
    const { container } = render(
      <DocsQuoteBlock
        id="quote-1"
        type="quote"
        text="Simple things should be simple"
        attribution="Alan Kay"
      />,
    );

    const figure = container.querySelector('figure');
    expect(figure?.className).toContain('border-l-[color:var(--docs-quote-border)]');
    expect(screen.getByText('Simple things should be simple')).toBeInTheDocument();
    expect(screen.getByText('Alan Kay')).toBeInTheDocument();
  });

  it('renders Checklist using theme accent token instead of hardcoded blue hex', () => {
    const { container } = render(
      <DocsChecklistBlock
        id="checklist-1"
        type="checklist"
        items={[
          { id: 'c1', text: 'Done item', checked: true },
          { id: 'c2', text: 'Todo item', checked: false },
        ]}
      />,
    );

    expect(container.innerHTML).not.toContain('#4d9dff');
    expect(container.innerHTML).toContain('bg-[var(--color-accent)]');
    expect(screen.getByText('Done item')).toBeInTheDocument();
    expect(screen.getByText('Todo item')).toBeInTheDocument();
  });

  it('renders InlineContent with theme semantic tokens instead of hardcoded warm brown or yellow hex', () => {
    const { container } = render(
      <p>
        <DocsInlineContent
          content={[
            { type: 'link', label: 'Architecture', href: '/zh/docs/arch' },
            { type: 'mark', text: 'Highlighted' },
            { type: 'inlineCode', code: 'const x = 1' },
          ]}
        />
      </p>,
    );

    expect(container.innerHTML).not.toContain('#f3e8a8');
    expect(container.innerHTML).not.toContain('#f7f4ef');
    expect(container.innerHTML).toContain('var(--docs-mark-bg)');
    expect(container.innerHTML).toContain('var(--docs-inline-code-bg)');
  });

  it('renders Table with subtle container border and surface header', () => {
    const { container } = render(
      <DocsTableBlock
        id="table-1"
        type="table"
        align={['left', 'center']}
        header={[[{ type: 'text', text: 'Column' }], [{ type: 'text', text: 'Value' }]]}
        rows={[[[{ type: 'text', text: 'Theme' }], [{ type: 'text', text: '6' }]]]}
      />,
    );

    const wrapper = container.firstElementChild as HTMLElement;
    const thead = container.querySelector('thead');
    expect(wrapper.className).toContain('border-[var(--color-border-subtle)]');
    expect(thead?.className).toContain('bg-[var(--color-surface)]');
  });

  it('renders CodeBlock with semantic toolbar styling and accessible copy action', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    const { container } = render(
      <DocsCodeBlock id="code-1" type="code" language="ts" code="const a = 1;">
        <code>const a = 1;</code>
      </DocsCodeBlock>,
    );

    expect(container.innerHTML).not.toContain('#9a9a9a');
    expect(container.innerHTML).not.toContain('#f6f6f6');
    expect(container.innerHTML).toContain('var(--docs-code-accent)');
    expect(container.querySelectorAll('.docs-code-accent-decor')).toHaveLength(2);

    const copyBtn = screen.getByRole('button', { name: 'Copy code' });
    await user.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith('const a = 1;');
    expect(screen.getByRole('button', { name: 'Copied code' })).toBeInTheDocument();
  });
});
