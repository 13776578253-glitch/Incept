import type { AtlasCardModel } from '../atlas-registry';

type AtlasCardProps = {
  item: AtlasCardModel;
};

// 图谱卡片：整卡可点，描述下方补一行「计划画什么」，避免把未实现的图谱说成可用
export function AtlasCard({ item }: AtlasCardProps) {
  return (
    <a
      href={item.href}
      className="group flex h-full flex-col gap-3 rounded-xl border border-[var(--color-border)] p-5 transition-colors hover:border-[var(--color-text-soft)]"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="font-medium text-[var(--color-text)]">{item.label}</span>
        <span
          aria-hidden="true"
          className="text-[var(--color-text-soft)] transition-transform group-hover:translate-x-0.5"
        >
          →
        </span>
      </span>
      <span className="text-[0.95rem] leading-7 text-[var(--color-text-muted)]">
        {item.description}
      </span>
      <span className="mt-auto border-t border-[var(--color-border)] pt-3 text-[0.82rem] leading-6 text-[var(--color-text-soft)]">
        {item.note}
      </span>
    </a>
  );
}
