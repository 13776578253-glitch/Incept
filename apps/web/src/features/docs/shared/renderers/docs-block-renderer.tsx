import type { DocsContentBlockModel } from '@/features/docs/block-system';
import { DocsCalloutBlock } from './blocks/docs-callout-block';
import { DocsCodeBlock } from './blocks/docs-code-block';
import { DocsDividerBlock } from './blocks/docs-divider-block';
import { DocsHeadingBlock } from './blocks/docs-heading-block';
import { DocsListBlock } from './blocks/docs-list-block';
import { DocsParagraphBlock } from './blocks/docs-paragraph-block';
import { DocsQuoteBlock } from './blocks/docs-quote-block';

// 文档内容块渲染器，根据块的类型选择对应的组件进行渲染
// 具体的渲染样式 / 组件逻辑在各自的组件文件中实现，保持渲染器的简洁和可维护性
export function DocsBlockRenderer({ block }: { block: DocsContentBlockModel }) {
  switch (block.type) {
    case 'paragraph':
      return <DocsParagraphBlock {...block} />;
    case 'list':
      return <DocsListBlock {...block} />;
    case 'callout':
      return <DocsCalloutBlock {...block} />;
    case 'heading':
      return <DocsHeadingBlock {...block} />;
    case 'quote':
      return <DocsQuoteBlock {...block} />;
    case 'code':
      return <DocsCodeBlock {...block} />;
    case 'divider':
      return <DocsDividerBlock {...block} />;
    default:
      return null;
  }
}
