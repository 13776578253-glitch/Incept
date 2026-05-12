import type { DocsListBlockModel } from '@/features/docs/block-system';

// 列表块组件，根据提供的列表项和列表样式（有序或无序）渲染对应的列表结构，适用于文档中的项目列表、步骤说明等内容展示
export function DocsListBlock({
  items,
  listStyle = 'unordered',
}: DocsListBlockModel) {
  const commonClassName =
    'space-y-3 pl-5 text-[1rem] leading-8 text-[var(--color-text-muted)]';

  if (listStyle === 'ordered') {
    return (
      <ol className={commonClassName}>
        {items.map((item) => (
          <li key={item} className="list-decimal">
            {item}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ul className={commonClassName}>
      {items.map((item) => (
        <li key={item} className="list-disc">
          {item}
        </li>
      ))}
    </ul>
  );
}
