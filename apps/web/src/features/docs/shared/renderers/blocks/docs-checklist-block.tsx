import type { DocsChecklistBlockModel } from '@/features/docs/block-system';

function ChecklistIcon({
  checked,
}: {
  checked: boolean;
}) {
  if (checked) {
    return (
      <span
        aria-hidden="true"
        className="mt-[0.5rem] inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-[#4d9dff] text-[var(--color-white)]"
      >
        <svg viewBox="0 0 16 16" className="size-3" fill="none">
          <path
            d="M3.5 8.5 6.5 11.5 12.5 4.5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="mt-[0.5rem] inline-flex size-4 shrink-0 rounded-[4px] border border-[var(--color-text)]"
    />
  );
}

// 待办列表块组件，根据待办项和完成状态渲染复选式阅读列表，适用于任务、检查项和进度说明等内容展示
export function DocsChecklistBlock({
  items,
  variant = 'default',
}: DocsChecklistBlockModel) {
  const emphasis = variant === 'emphasis';
  const listClassName = emphasis ? 'space-y-4' : 'space-y-3';
  const itemClassName = emphasis ? 'gap-3.5' : 'gap-3';
  const textClassName = emphasis
    ? 'text-[1.02rem] leading-8 text-[var(--color-text)]'
    : 'text-[1rem] leading-8 text-[var(--color-text-muted)]';
  const completedTextClassName = emphasis
    ? 'text-[color:var(--color-text-completed)] line-through'
    : 'text-[color:var(--color-text-strikethrough)] line-through';

  return (
    <ul className={listClassName}>
      {items.map((item) => (
        <li key={item.id} className={`flex items-start ${itemClassName}`}>
          <ChecklistIcon checked={item.checked} />
          <span
            className={`${textClassName} ${
              item.checked ? completedTextClassName : ''
            }`}
          >
            {item.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
