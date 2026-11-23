import type { DocsListBlockModel } from '@/features/docs/block-system';
import { DocsInlineContent } from '../docs-inline-content';

// 列表块组件，根据提供的列表项和列表样式（有序或无序）渲染对应的列表结构，适用于文档中的项目列表、步骤说明等内容展示
export function DocsListBlock({
  items,
  listStyle = 'unordered',
  variant = 'default',
}: DocsListBlockModel) {
  const commonClassName =
    variant === 'emphasis'
      ? 'space-y-2 md:space-y-2.5 pl-5 text-[length:calc(var(--docs-font-size)*1.02)] leading-[var(--docs-paragraph-line-height)] text-[var(--color-text)]'
      : 'space-y-2 md:space-y-2.5 pl-5 text-[length:var(--docs-font-size)] leading-[var(--docs-paragraph-line-height)] text-[var(--color-text-muted)]';

  const ListTag = listStyle === 'ordered' ? 'ol' : 'ul';
  const markerClassName = listStyle === 'ordered' ? 'list-decimal' : 'list-disc';
  return (
    <ListTag className={commonClassName}>
      {items.map((item, index) => (
        <li key={index} className={markerClassName}>
          {typeof item === 'string' ? item : <DocsInlineContent content={item} />}
        </li>
      ))}
    </ListTag>
  );
}
