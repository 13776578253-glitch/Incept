import { useId, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import type { BillingCostBreakdown, BillingReadResponse, TokenDashboardData } from '../../../domain';
import type { BillingPreview } from '../../hooks/use-billing-preview';
import { DashboardTableFrame } from '../../components/dashboard-table-frame';
import { ExpandRowsButton } from '../../components/expand-rows-button';
import { ReferenceCostMetric } from '../../components/reference-cost-metric';
import {
  formatCompactTokens,
  formatDateTimeShort,
  formatPercent,
  formatReferenceUsd,
  referenceCoverageRatio,
} from '../../formatters';

const card = 'min-w-0 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)]';
const cardHeader = 'border-b border-[var(--color-border)] px-5 py-3.5';
const kpiCard = 'rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4';
const heading = 'text-[0.95rem] font-semibold text-[var(--color-text)]';
const subtext = 'text-[0.73rem] text-[var(--color-nav-muted)]';
const tableHeaderCell = 'px-2.5 py-2.5 text-right';
const tableValueCell = 'px-2.5 py-2.5 text-right font-mono tabular-nums';

function ShareBar({
  amount,
  maxAmount,
  totalAmount,
  estimatedTokens,
}: {
  amount: number;
  maxAmount: number;
  totalAmount: number;
  estimatedTokens: number;
}) {
  if (estimatedTokens <= 0 || totalAmount <= 0 || maxAmount <= 0) {
    return <span className="font-mono text-[0.72rem] text-[var(--color-nav-muted)]">—</span>;
  }
  const widthPct = amount > 0 ? Math.max(3, Math.round((amount / maxAmount) * 100)) : 0;
  return (
    <div className="inline-flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--color-row-bg)]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${widthPct}%`,
            backgroundColor: 'var(--badge-emerald-dot)',
          }}
        />
      </div>
      <span className="w-12 font-mono text-[0.72rem] tabular-nums text-[var(--color-text-muted)]">
        {formatPercent(amount / totalAmount, 1)}
      </span>
    </div>
  );
}

export function ReferenceCostMetrics({ preview }: { preview: BillingPreview }) {
  const t = useTranslations('dashboard.costs.reference');
  const format = useFormatter();
  const data = preview.status === 'ready' ? preview.data : undefined;
  const ratio = data ? referenceCoverageRatio(data.estimatedTokens, data.unpricedTokens) : null;
  const peakDay = data?.breakdown?.days
    .filter(day => day.estimatedTokens > 0 || Number(day.estimatedCostUsd) > 0)
    .reduce<(typeof data.breakdown.days)[number] | undefined>((best, day) => {
      if (!best) return day;
      const diff = Number(day.estimatedCostUsd) - Number(best.estimatedCostUsd);
      if (diff > 0) return day;
      if (diff === 0 && day.estimatedTokens > best.estimatedTokens) return day;
      return best;
    }, undefined);
  const idleMessage = preview.status === 'loading' ? t('loading') : t('unavailable');

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      <ReferenceCostMetric preview={preview} />

      <div className={kpiCard}>
        <span className="text-[0.75rem] font-medium text-[var(--color-text-muted)]">
          {t('estimatedTokens')}
        </span>
        <div className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] tabular-nums text-[var(--color-text)]">
          {data ? formatCompactTokens(data.estimatedTokens) : '—'}
        </div>
        <p className="mt-1 text-[0.7rem] leading-5 text-[var(--color-nav-muted)]">
          {data
            ? t('estimatedTokensDesc', {
              count: format.number(data.estimatedTokens),
              eligible: formatCompactTokens(data.estimatedTokens + data.unpricedTokens),
            })
            : idleMessage}
        </p>
      </div>

      <div className={kpiCard}>
        <span className="text-[0.75rem] font-medium text-[var(--color-text-muted)]">
          {t('peakDayTitle')}
        </span>
        <div className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] tabular-nums text-[var(--color-text)]">
          {peakDay ? formatReferenceUsd(peakDay.estimatedCostUsd, peakDay.estimatedTokens) : '—'}
        </div>
        <p className="mt-1 text-[0.7rem] leading-5 text-[var(--color-nav-muted)]">
          {peakDay
            ? t('peakDayDesc', {
              date: peakDay.day,
              tokens: formatCompactTokens(peakDay.estimatedTokens),
            })
            : data ? t(data.breakdown ? 'emptyBreakdown' : 'breakdownUnavailable') : idleMessage}
        </p>
      </div>

      <div className={kpiCard}>
        <span className="text-[0.75rem] font-medium text-[var(--color-text-muted)]">
          {t('coverageTitle')}
        </span>
        <div className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] tabular-nums text-[var(--color-text)]">
          {ratio === null ? '—' : formatPercent(ratio, 2)}
        </div>
        <p className="mt-1 text-[0.7rem] leading-5 text-[var(--color-nav-muted)]">
          {data
            ? t('coverageDesc', {
              asOf: formatDateTimeShort(data.asOf),
              excluded: formatCompactTokens(data.excludedTokens),
            })
            : idleMessage}
        </p>
      </div>
    </div>
  );
}

export function ReferenceCostBreakdown({
  data,
  sources,
  channel,
  onChannelChange,
}: {
  data: BillingReadResponse;
  sources: TokenDashboardData['sources'];
  channel: string;
  onChannelChange: (channel: string) => void;
}) {
  const t = useTranslations('dashboard.costs.reference');
  const format = useFormatter();
  const channelSelectId = useId();
  const [expandedState, setExpandedState] = useState<{ scope: string; expanded: boolean }>({
    scope: `${data.range}:${channel}`,
    expanded: false,
  });
  const [showDays, setShowDays] = useState(false);

  const details = data.breakdown;
  const sourceName = (id: string) => sources.find(source => source.sourceId === id)?.label ?? id;
  const channels = [...new Set(details?.models.flatMap(model => model.channels.map(row => row.channel)))];
  const activeChannel = channels.find(id => id === channel);
  const scopeKey = `${data.range}:${activeChannel ?? ''}`;
  const expanded = expandedState.scope === scopeKey && expandedState.expanded;
  const setExpanded = (next: boolean) => setExpandedState({ scope: scopeKey, expanded: next });

  const models = (details?.models ?? []).flatMap(model => {
    const cost = activeChannel ? model.channels.find(row => row.channel === activeChannel) : model;
    return cost ? [{ model: model.model, cost }] : [];
  }).sort((a, b) => Number(b.cost.estimatedCostUsd) - Number(a.cost.estimatedCostUsd)
    || b.cost.unpricedTokens - a.cost.unpricedTokens || a.model.localeCompare(b.model));

  const maxModelCost = Math.max(0.0001, ...models.map(item => Number(item.cost.estimatedCostUsd)));
  const totalModelCost = models.reduce((sum, item) => sum + Number(item.cost.estimatedCostUsd), 0);
  const daysDesc = [...(details?.days ?? [])].reverse();
  const maxDayCost = Math.max(0.0001, ...daysDesc.map(day => Number(day.estimatedCostUsd)));
  const totalDayCost = daysDesc.reduce((sum, day) => sum + Number(day.estimatedCostUsd), 0);

  const eligible = data.estimatedTokens + data.unpricedTokens;
  const ratio = referenceCoverageRatio(data.estimatedTokens, data.unpricedTokens);
  const coverageText = ratio === null ? t('notApplicable') : formatPercent(ratio, 2);
  const estimatedWidthPct = ratio === null ? 0 : ratio * 100;
  const unpricedWidthPct = eligible > 0 ? (data.unpricedTokens / eligible) * 100 : 0;

  function headers(label: string) {
    return (
      <tr className="border-b border-[var(--color-border)] text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[var(--color-nav-muted)]">
        <th scope="col" className="py-2.5 pr-3 text-left">{label}</th>
        <th scope="col" className={tableHeaderCell}>{t('usdColumn')}</th>
        <th scope="col" className={tableHeaderCell}>{t('estimatedTokens')}</th>
        <th scope="col" className={tableHeaderCell}>{t('unpricedTokens')}</th>
        <th scope="col" className={tableHeaderCell}>{t('excludedTokens')}</th>
        <th scope="col" className="py-2.5 pl-2.5 text-right">{t('costShareColumn')}</th>
      </tr>
    );
  }

  function cells(cost: BillingCostBreakdown, maxAmount: number, totalAmount: number) {
    return (
      <>
        <td className="px-2.5 py-2.5 text-right font-mono font-semibold tabular-nums text-[var(--color-text)]">
          {formatReferenceUsd(cost.estimatedCostUsd, cost.estimatedTokens)}
        </td>
        <td className={`${tableValueCell} text-[var(--color-text-muted)]`}>{format.number(cost.estimatedTokens)}</td>
        <td className={`${tableValueCell} text-[var(--color-text-muted)]`}>{format.number(cost.unpricedTokens)}</td>
        <td className={`${tableValueCell} text-[var(--color-text-muted)]`}>{format.number(cost.excludedTokens)}</td>
        <td className="py-2.5 pl-2.5 text-right">
          <ShareBar
            amount={Number(cost.estimatedCostUsd)}
            maxAmount={maxAmount}
            totalAmount={totalAmount}
            estimatedTokens={cost.estimatedTokens}
          />
        </td>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
        <div className={card}>
          <div className={cardHeader}>
            <h3 className={heading}>{t('diagnostics')}</h3>
            <p className={subtext}>{t('diagnosticsSubtitle')}</p>
          </div>

          <div className="divide-y divide-[var(--color-border)] px-5">
            <div className="py-3.5">
              <div className="flex items-center justify-between text-[0.78rem]">
                <span className="font-medium text-[var(--color-text)]">{t('coverageBarLabel')}</span>
                <span className="font-mono font-semibold tabular-nums text-[var(--color-text)]">{coverageText}</span>
              </div>
              <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-[var(--color-row-bg)]">
                {estimatedWidthPct > 0 && (
                  <div style={{ width: `${estimatedWidthPct}%`, backgroundColor: 'var(--badge-emerald-dot)' }} />
                )}
                {unpricedWidthPct > 0 && (
                  <div style={{ width: `${unpricedWidthPct}%`, backgroundColor: 'var(--badge-rose-dot)' }} />
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[0.7rem] tabular-nums text-[var(--color-nav-muted)]">
                <span>
                  {t('estimatedTokens')}:{' '}
                  <strong className="text-[var(--color-text)]">{formatCompactTokens(data.estimatedTokens)}</strong>
                </span>
                <span>
                  {t('unpricedTokens')}:{' '}
                  <strong className="text-[var(--color-text)]">{formatCompactTokens(data.unpricedTokens)}</strong>
                </span>
                <span>
                  {t('excludedTokens')}:{' '}
                  <strong className="text-[var(--color-text)]">{formatCompactTokens(data.excludedTokens)}</strong>
                </span>
              </div>
            </div>

            {([
              ['revision', data.revision],
              ['liveRevision', data.liveRevision],
              ['unpricedGroups', data.unpricedGroups],
              ['conflicted', data.conflicted],
            ] as const).map(([key, count]) => (
              <div key={key} className="flex items-center justify-between gap-3 py-3 text-[0.78rem]">
                <span className="text-[var(--color-text-muted)]">{t(key)}</span>
                <span className="font-mono font-semibold tabular-nums text-[var(--color-text)]">
                  {count === undefined ? '—' : format.number(count, { useGrouping: key !== 'revision' && key !== 'liveRevision' })}
                </span>
              </div>
            ))}

            <div className="flex items-center justify-between gap-3 py-3 text-[0.78rem]">
              <span className="text-[var(--color-text-muted)]">{t('asOf')}</span>
              <span className="font-mono text-[0.72rem] tabular-nums text-[var(--color-text)]">
                {formatDateTimeShort(data.asOf)}
              </span>
            </div>

            {details && details.unpriced.length > 0 ? (
              <details className="dashboard-disclosure py-1">
                <summary className="dashboard-disclosure-summary text-[0.78rem] font-medium text-[var(--color-text)]">
                  <span>{t('unpricedDetails')}</span>
                  <span className="font-mono text-[0.7rem] text-[var(--color-nav-muted)]">
                    ({format.number(details.unpriced.length)})
                  </span>
                </summary>
                <div className="-mx-5 pb-2">
                  <DashboardTableFrame maxHeight={320} scrollLabel={t('unpricedDetails')}>
                    <table aria-label={t('unpricedDetails')} className="dashboard-data-table w-full min-w-[30rem] border-collapse text-left text-[0.75rem]">
                      <thead>
                        <tr className="border-b border-[var(--color-border)] text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[var(--color-nav-muted)]">
                          <th scope="col" className="whitespace-nowrap py-2 pr-2">{t('channel')}</th>
                          <th scope="col" className="whitespace-nowrap px-2 py-2">{t('model')}</th>
                          <th scope="col" className="whitespace-nowrap px-2 py-2">{t('reason')}</th>
                          <th scope="col" className="whitespace-nowrap py-2 pl-2 text-right">{t('observations')}</th>
                        </tr>
                      </thead>
                      <tbody className="tabular-nums">
                        {details.unpriced.map(group => (
                          <tr key={JSON.stringify([group.channel, group.model, group.reason])}>
                            <td className="whitespace-nowrap py-2 pr-2 text-[var(--color-text-muted)]">{sourceName(group.channel)}</td>
                            <th scope="row" className="whitespace-nowrap px-2 py-2 text-left font-mono font-normal text-[var(--color-text)]">{group.model}</th>
                            <td className="px-2 py-2 text-[var(--color-text-muted)]" title={group.reason}>
                              {t.has('reasons.' + group.reason) ? t('reasons.' + group.reason) : group.reason}
                            </td>
                            <td className="py-2 pl-2 text-right font-mono text-[var(--color-text)]">{format.number(group.observations)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </DashboardTableFrame>
                </div>
              </details>
            ) : details && (data.unpricedGroups ?? 0) === 0 ? (
              <div className="flex items-center gap-2 py-3 text-[0.75rem]" style={{ color: 'var(--badge-emerald-fg)' }}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: 'var(--badge-emerald-dot)' }} />
                {t('allCovered')}
              </div>
            ) : null}
          </div>
        </div>

        <div className={card}>
          <div className={`${cardHeader} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <h3 className={heading}>{t('modelCosts')}</h3>
              <p className={subtext}>{t('modelCostsSubtitle', { count: models.length })}</p>
            </div>
            {channels.length > 1 && (
              <label htmlFor={channelSelectId} className="inline-flex items-center gap-2 text-[0.75rem] font-medium text-[var(--color-text-muted)]">
                <span>{t('channel')}</span>
                <select
                  id={channelSelectId}
                  name="billing-channel"
                  className="dashboard-refresh-button"
                  value={activeChannel ?? ''}
                  onChange={event => {
                    onChannelChange(event.target.value);
                    setExpanded(false);
                  }}
                >
                  <option value="">{t('allChannels')}</option>
                  {channels.sort((a, b) => sourceName(a).localeCompare(sourceName(b))).map(id => (
                    <option key={id} value={id}>{sourceName(id)}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {!details ? (
            <p className="px-5 py-6 text-sm text-[var(--color-text-muted)]">{t('breakdownUnavailable')}</p>
          ) : models.length ? (
            <DashboardTableFrame maxHeight={expanded ? 460 : undefined} scrollLabel={t('modelCosts')}>
              <table aria-label={t('modelCosts')} className="dashboard-data-table w-full min-w-[40rem] border-collapse text-left text-[0.76rem]">
                <thead>{headers(t('model'))}</thead>
                <tbody className="tabular-nums">
                  {(expanded ? models : models.slice(0, 10)).map(({ model, cost }) => (
                    <tr key={model}>
                      <th scope="row" className="whitespace-nowrap py-2.5 pr-3 text-left font-mono font-medium text-[var(--color-text)]">
                        {model}
                      </th>
                      {cells(cost, maxModelCost, totalModelCost)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </DashboardTableFrame>
          ) : (
            <p className="px-5 py-6 text-sm text-[var(--color-text-muted)]">{t('emptyBreakdown')}</p>
          )}
          <ExpandRowsButton
            expanded={expanded}
            count={models.length}
            limit={10}
            onToggle={() => setExpanded(!expanded)}
            expandLabel={t('showAllModels', { count: models.length })}
            collapseLabel={t('showFewerModels')}
          />
        </div>
      </div>

      {details && (
        <div className={card}>
          <details className="dashboard-disclosure" open={showDays} onToggle={event => setShowDays(event.currentTarget.open)}>
            <summary className={`dashboard-disclosure-summary px-5 py-3.5 ${heading}`}>
              <span>{t('dailyCosts')}</span>
              <span className="font-mono text-[0.72rem] font-normal text-[var(--color-nav-muted)]">
                ({t('dailyCount', { count: daysDesc.length })})
              </span>
            </summary>
            {showDays && (
              <div className="border-t border-[var(--color-border)]">
                {daysDesc.length ? (
                  <DashboardTableFrame maxHeight={420} scrollLabel={t('dailyCosts')}>
                    <table aria-label={t('dailyCosts')} className="dashboard-data-table w-full min-w-[40rem] border-collapse text-left text-[0.76rem]">
                      <thead>{headers(t('day'))}</thead>
                      <tbody className="tabular-nums">
                        {daysDesc.map(day => (
                          <tr key={day.day}>
                            <th scope="row" className="whitespace-nowrap py-2.5 pr-3 text-left font-mono font-medium text-[var(--color-text)]">
                              {day.day}
                            </th>
                            {cells(day, maxDayCost, totalDayCost)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </DashboardTableFrame>
                ) : (
                  <p className="px-5 py-6 text-sm text-[var(--color-text-muted)]">{t('emptyBreakdown')}</p>
                )}
              </div>
            )}
          </details>
        </div>
      )}
    </div>
  );
}
