import type { RoadmapEntry, RoadmapLocale } from '../domain';

import type { RoadmapChrome } from './copy';
import { IconLink } from './icons';
import { RoadmapChip } from './roadmap-chip';

type RoadmapCardProps = {
  entry: RoadmapEntry;
  locale: RoadmapLocale;
  chrome: RoadmapChrome;
  onSelect?: (entry: RoadmapEntry) => void;
};

// 条目卡：主语言标题 + 次语言一行（双语对等可见）、chips。
// T4 硬化：无投票/评论——卡片不渲染任何计数或投票/评论痕迹。
export function RoadmapCard({ entry, locale, chrome, onSelect }: RoadmapCardProps) {
  const secondary = locale === 'en' ? 'zh' : 'en';
  const links = entry.links ?? [];

  return (
    <article
      onClick={() => onSelect?.(entry)}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && onSelect) {
          event.preventDefault();
          onSelect(entry);
        }
      }}
      tabIndex={onSelect ? 0 : undefined}
      className={`flex flex-col gap-2.5 rounded-xl border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-card-bg,var(--color-bg))] px-4 py-3.5 outline-none shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:border-[var(--roadmap-border-hover,var(--color-text-soft))] hover:bg-[var(--roadmap-card-hover-bg,var(--roadmap-card-bg))] hover:shadow-[0_4px_12px_rgba(15,23,42,0.05)] ${
        onSelect ? 'cursor-pointer' : ''
      }`}
    >
      <div className="space-y-0.5">
        <h3
          className="line-clamp-2 text-[0.92rem] font-semibold leading-[1.38] text-[var(--color-text)]"
          title={entry.title[locale]}
        >
          {entry.title[locale]}
        </h3>
        <p
          className="truncate text-[0.78rem] leading-[1.35] text-[var(--color-text-soft)]"
          title={entry.title[secondary]}
        >
          {entry.title[secondary]}
        </p>
      </div>
      <p className="line-clamp-2 text-[0.8rem] leading-[1.48] text-[var(--color-text-muted)]">
        {entry.summary[locale]}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <RoadmapChip kind="type" entryType={entry.type} label={chrome.typeLabels[entry.type]} />
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
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--roadmap-chip-border,var(--color-border))] bg-[var(--roadmap-chip-bg)] px-2 py-0.5 text-[0.71rem] font-medium leading-4 text-[var(--color-text-muted)] transition-colors hover:border-[var(--roadmap-border-hover,var(--color-text-soft))] hover:text-[var(--color-text)]"
          >
            <IconLink />
            {link.label[locale]}
          </a>
        ))}
      </div>
    </article>
  );
}

