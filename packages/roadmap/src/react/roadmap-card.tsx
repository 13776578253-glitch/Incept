import type { RoadmapEntry, RoadmapLocale } from '../domain';

import type { RoadmapChrome } from './copy';
import { IconLink } from './icons';
import { RoadmapChip } from './roadmap-chip';

type RoadmapCardProps = {
  entry: RoadmapEntry;
  locale: RoadmapLocale;
  chrome: RoadmapChrome;
};

// 条目卡：主语言标题 + 次语言一行（双语对等可见）、chips。
// T4 硬化：无投票/评论——卡片不渲染任何计数或投票/评论痕迹。
export function RoadmapCard({ entry, locale, chrome }: RoadmapCardProps) {
  const secondary = locale === 'en' ? 'zh' : 'en';
  const links = entry.links ?? [];

  return (
    <article className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-5 transition-transform duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:border-[var(--color-text-soft)]">
      <h3
        className="line-clamp-2 text-[1rem] font-medium leading-snug text-[var(--color-text)]"
        title={entry.title[locale]}
      >
        {entry.title[locale]}
      </h3>
      <p
        className="truncate text-[0.82rem] leading-6 text-[var(--color-text-soft)]"
        title={entry.title[secondary]}
      >
        {entry.title[secondary]}
      </p>
      <p className="line-clamp-2 text-[0.82rem] leading-6 text-[var(--color-text-muted)]">
        {entry.summary[locale]}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <RoadmapChip kind="type" label={chrome.typeLabels[entry.type]} />
        <RoadmapChip
          kind="priority"
          priority={entry.priority}
          label={chrome.priorityLabels[entry.priority]}
        />
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[0.76rem] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-text-soft)] hover:text-[var(--color-text)]"
          >
            <IconLink />
            {link.label[locale]}
          </a>
        ))}
      </div>
    </article>
  );
}
