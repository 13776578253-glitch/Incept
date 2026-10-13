'use client';

import { DashboardTableFrame } from '../../components/dashboard-table-frame';
import { useTranslations } from 'next-intl';
import type { TokenDashboardData } from '../../../domain/index';
import { formatKnownCost, formatCompactTokens, formatUsd, formatPercent } from '../../formatters';

type ModelPricingTableProps = {
  maxModelCost: number;
  data: TokenDashboardData;
};

export function ModelPricingTable({
  maxModelCost,
  data,
}: ModelPricingTableProps) {
  const t = useTranslations('dashboard');

  return (
    <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)]">
      <div className="border-b border-[var(--color-border)] px-5 py-3.5">
        <h3 className="text-[0.95rem] font-semibold text-[var(--color-text)]">
          {t('costs.pricingTable.title')}
        </h3>
        <p className="text-[0.73rem] text-[var(--color-nav-muted)]">
          {t('costs.pricingTable.subtitle')}
        </p>
        <p className="mt-1 text-[0.73rem] text-[var(--color-nav-muted)]">
          {t('costs.pricingTable.greyModelNote')}
        </p>
      </div>

      <DashboardTableFrame maxHeight={520}>
        <table aria-label={t("costs.pricingTable.title")} className="dashboard-data-table w-full min-w-[600px] border-collapse text-left text-[0.76rem]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-nav-muted)]">
              <th className="py-2.5 pr-3">{t('costs.pricingTable.colModel')}</th>
              <th className="px-2.5 py-2.5">{t('costs.pricingTable.colSource')}</th>
              <th className="px-2.5 py-2.5">{t('costs.pricingTable.colRates')}</th>
              <th className="px-2.5 py-2.5 text-right">
                {t('costs.pricingTable.colTokens')}
              </th>
              <th className="px-2.5 py-2.5 text-right">
                {t('costs.pricingTable.colCost')}
              </th>
              <th className="py-2.5 pl-2.5 text-right">
                {t('costs.pricingTable.colShare')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)] tabular-nums">
            {data.models.map((m) => {
              const isSlot = m.slotStatus === 'configured';
              const relCostPct =
                m.missingPricing || isSlot
                  ? 0
                  : Math.max(3, Math.round((m.cost / maxModelCost) * 100));

              return (
                <tr
                  key={m.modelName}
                  className={`${isSlot ? 'opacity-75' : ''
                    }`}
                >
                  <td className="py-2.5 pr-3 font-mono text-[0.76rem] font-medium text-[var(--color-text)]">
                    {m.modelName}
                  </td>
                  <td className="px-2.5 py-2.5 font-mono text-[0.68rem] text-[var(--color-nav-muted)]">
                    {m.source}
                  </td>
                  <td className="px-2.5 py-2.5 font-mono text-[0.7rem] text-[var(--color-text-muted)]">
                    {m.unitPricing ? (
                      <span>
                        ${m.unitPricing.inputPerMillion} / $
                        {m.unitPricing.outputPerMillion} / $
                        {m.unitPricing.cacheReadPerMillion ?? '—'} / $
                        {m.unitPricing.cacheWritePerMillion ?? '—'}
                      </span>
                    ) : (
                      <span className="text-[var(--color-nav-muted)]">
                        {t('costs.pricingTable.missingRate')}
                      </span>
                    )}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono text-[var(--color-text-muted)]">
                    {isSlot ? '—' : formatCompactTokens(m.totalTokens)}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono font-semibold text-[var(--color-text)]">
                    {isSlot ? '—' : formatKnownCost(m.cost, m.missingPricing)}
                  </td>
                  <td className="py-2.5 pl-2.5 text-right">
                    {isSlot || m.missingPricing ? (
                      <span className="font-mono text-[0.72rem] text-[var(--color-nav-muted)]">
                        —
                      </span>
                    ) : (
                      <div className="inline-flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--color-row-bg)]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${relCostPct}%`,
                              backgroundColor: 'var(--badge-emerald-dot)',
                            }}
                          />
                        </div>
                        <span className="w-12 font-mono text-[0.72rem] text-[var(--color-text-muted)]">
                          {formatPercent(m.shareOfCost, 1)}
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DashboardTableFrame>
    </div>
  );
}
