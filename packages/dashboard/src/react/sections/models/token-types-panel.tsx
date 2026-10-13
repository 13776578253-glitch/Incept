'use client';

import { useTranslations } from 'next-intl';
import { formatCompactTokens, formatFullNumber, formatPercent } from '../../formatters';
import type { ModelsState } from './use-models-state';

type TokenTypesPanelProps = Pick<ModelsState, 'tokenTypeItems' | 'maxTokenTypeVolume'>;

export function TokenTypesPanel({
  tokenTypeItems,
  maxTokenTypeVolume,
}: TokenTypesPanelProps) {
  const t = useTranslations('dashboard');

  return (
    <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)]">
      <div className="border-b border-[var(--color-border)] px-5 py-3.5">
        <h3 className="text-[0.95rem] font-semibold text-[var(--color-text)]">
          {t('models.tokenTypes.title')}
        </h3>
        <p className="text-[0.73rem] text-[var(--color-nav-muted)]">
          {t('models.tokenTypes.subtitle')}
        </p>
        <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-[var(--color-row-bg)]">
          {tokenTypeItems.map((item) => (
            <div
              key={item.key}
              style={{
                width: `${item.share * 100}%`,
                backgroundColor: item.color,
              }}
              className="h-full"
            />
          ))}
        </div>
      </div>

      <div className="divide-y divide-[var(--color-border)] px-5">
        {tokenTypeItems.map((item) => {
          const relPct = Math.max(
            2,
            Math.round((item.tokens / maxTokenTypeVolume) * 100),
          );
          return (
            <div key={item.key} className="py-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[0.8rem] font-medium text-[var(--color-text)]">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.label}
                </span>
                <div className="flex items-center gap-3 font-mono text-[0.78rem] tabular-nums">
                  <span className="font-semibold text-[var(--color-text)]">
                    {formatCompactTokens(item.tokens)}
                  </span>
                  <span className="w-14 text-right text-[var(--color-text-muted)]">
                    {formatPercent(item.share, 2)}
                  </span>
                </div>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-row-bg)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${relPct}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[0.7rem] text-[var(--color-nav-muted)]">
                <span>{item.description}</span>
                <span className="shrink-0 font-mono tabular-nums">
                  {formatFullNumber(item.tokens)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
