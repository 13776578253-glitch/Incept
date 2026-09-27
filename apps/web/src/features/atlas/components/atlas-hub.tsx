import { AtlasCard } from './atlas-card';
import type { AtlasCardModel } from '../atlas-registry';

type AtlasHubProps = {
  items: AtlasCardModel[];
  eyebrow: string;
  title: string;
  description: string;
  note: {
    title: string;
    description: string;
  };
};

// 图谱总览：每张卡片进入 /atlas/<key>，子页面存在但可能尚未实现
export function AtlasHub({
  items,
  eyebrow,
  title,
  description,
  note,
}: AtlasHubProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-10 px-6 pt-10 pb-16 lg:px-10">
      <header className="max-w-[720px] space-y-3">
        <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
          {eyebrow}
        </p>
        <h1 className="text-[2rem] font-semibold leading-[1.08] tracking-[-0.05em] text-[var(--color-text)] md:text-[2.45rem]">
          {title}
        </h1>
        <p className="text-[1.02rem] leading-8 text-[var(--color-text-muted)]">{description}</p>
      </header>

      <ul className="grid max-w-[1120px] gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.key} className="list-none">
            <AtlasCard item={item} />
          </li>
        ))}
      </ul>

      <footer className="max-w-[640px] space-y-2 border-t border-[var(--color-border)] pt-6">
        <p className="text-[0.95rem] font-medium text-[var(--color-text)]">{note.title}</p>
        <p className="text-[0.95rem] leading-7 text-[var(--color-text-muted)]">
          {note.description}
        </p>
      </footer>
    </div>
  );
}
