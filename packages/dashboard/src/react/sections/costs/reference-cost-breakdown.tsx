import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import type { BillingCostBreakdown, BillingReadResponse, TokenDashboardData } from '../../../domain';
import { DashboardTableFrame } from '../../components/dashboard-table-frame';
import { ExpandRowsButton } from '../../components/expand-rows-button';
import { formatUsd } from '../../formatters';

const panel = 'min-w-0 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4 sm:p-5';
const heading = 'text-[0.95rem] font-semibold text-[var(--color-text)]';
const cell = 'px-2 py-2.5 text-right tabular-nums';

export function ReferenceCostBreakdown({ data, sources }: { data: BillingReadResponse; sources: TokenDashboardData['sources'] }) {
  const t = useTranslations('dashboard.costs.reference');
  const format = useFormatter();
  const [expanded, setExpanded] = useState(false);
  const [showDays, setShowDays] = useState(false);
  const [channel, setChannel] = useState('');
  const details = data.breakdown;
  const sourceName = (id: string) => sources.find(source => source.sourceId === id)?.label ?? id;
  const channels = [...new Set(details?.models.flatMap(model => model.channels.map(row => row.channel)))];
  const activeChannel = channels.find(id => id === channel);
  const models = (details?.models ?? []).flatMap(model => {
    const cost = activeChannel ? model.channels.find(row => row.channel === activeChannel) : model;
    return cost ? [{ model: model.model, cost }] : [];
  }).sort((a, b) => Number(b.cost.estimatedCostUsd) - Number(a.cost.estimatedCostUsd)
    || b.cost.unpricedTokens - a.cost.unpricedTokens || a.model.localeCompare(b.model));

  function headers(label: string) {
    return <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
      <th scope="col" className="py-2.5 pr-2 text-left">{label}</th>
      <th scope="col" className={cell}>{t('usdColumn')}</th>
      <th scope="col" className={cell}>{t('estimatedTokens')}</th>
      <th scope="col" className={cell}>{t('unpricedTokens')}</th>
      <th scope="col" className={cell}>{t('excludedTokens')}</th>
    </tr>;
  }

  function cells(cost: BillingCostBreakdown) {
    return <>
      <td className={cell}>{cost.estimatedTokens > 0 ? formatUsd(Number(cost.estimatedCostUsd)) : '—'}</td>
      <td className={cell}>{format.number(cost.estimatedTokens)}</td>
      <td className={cell}>{format.number(cost.unpricedTokens)}</td>
      <td className={cell}>{format.number(cost.excludedTokens)}</td>
    </>;
  }

  return <>
    {data.liveRevision !== undefined && <div className={panel}>
      <h3 className={heading}>{t('diagnostics')}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {([
          ['revision', data.revision], ['liveRevision', data.liveRevision],
          ['unpricedGroups', data.unpricedGroups], ['conflicted', data.conflicted],
        ] as const).map(([key, count]) => (
          <div key={key}>
            <dt className="text-[var(--color-text-muted)]">{t(key)}</dt>
            <dd className="mt-1 font-mono tabular-nums text-[var(--color-text)]">
              {count === undefined ? '—' : format.number(count, { useGrouping: key !== 'revision' && key !== 'liveRevision' })}
            </dd>
          </div>
        ))}
      </dl>
      {details && details.unpriced.length > 0 && (
        <details className="mt-3 border-t border-[var(--color-border)] pt-2">
          <summary className="min-h-11 cursor-pointer py-2 text-sm">{t('unpricedDetails')}</summary>
          <DashboardTableFrame maxHeight={320}>
            <table aria-label={t('unpricedDetails')} className="w-full min-w-[32rem] text-sm">
              <thead><tr className="text-left text-[var(--color-text-muted)]">
                <th scope="col" className="py-2 pr-2">{t('channel')}</th>
                <th scope="col" className="py-2 pr-2">{t('model')}</th>
                <th scope="col" className="py-2 pr-2">{t('reason')}</th>
                <th scope="col" className={cell}>{t('observations')}</th>
              </tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {details.unpriced.map(group => <tr key={JSON.stringify([group.channel, group.model, group.reason])}>
                  <td className="py-2 pr-2">{sourceName(group.channel)}</td>
                  <th scope="row" className="py-2 pr-2 text-left font-mono font-normal">{group.model}</th>
                  <td className="py-2 pr-2" title={group.reason}>
                    {t.has('reasons.' + group.reason) ? t('reasons.' + group.reason) : group.reason}
                  </td>
                  <td className={cell}>{format.number(group.observations)}</td>
                </tr>)}
              </tbody>
            </table>
          </DashboardTableFrame>
        </details>
      )}
    </div>}
    {!details ? <p className="px-1 text-sm text-[var(--color-text-muted)]">{t('breakdownUnavailable')}</p> : <>
      <div className={panel}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className={heading}>{t('modelCosts')}</h3>
          {channels.length > 1 && <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            {t('channel')}
            <select className="min-h-11 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2 text-[var(--color-text)]"
              value={activeChannel ?? ''} onChange={event => { setChannel(event.target.value); setExpanded(false); }}>
              <option value="">{t('allChannels')}</option>
              {channels.sort((a, b) => sourceName(a).localeCompare(sourceName(b))).map(id => <option key={id} value={id}>{sourceName(id)}</option>)}
            </select>
          </label>}
        </div>
        {models.length ? <DashboardTableFrame maxHeight={expanded ? 460 : undefined}>
          <table aria-label={t('modelCosts')} className="w-full min-w-[34rem] text-sm">
            <thead>{headers(t('model'))}</thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {(expanded ? models : models.slice(0, 10)).map(({ model, cost }) => <tr key={model}>
                <th scope="row" className="break-all py-2.5 pr-2 text-left font-mono font-medium">{model}</th>
                {cells(cost)}
              </tr>)}
            </tbody>
          </table>
        </DashboardTableFrame> : <p className="text-sm text-[var(--color-text-muted)]">{t('emptyBreakdown')}</p>}
        <ExpandRowsButton expanded={expanded} count={models.length} limit={10} onToggle={() => setExpanded(!expanded)}
          expandLabel={t('showAllModels', { count: models.length })} collapseLabel={t('showFewerModels')} />
      </div>
      <details className={panel} open={showDays} onToggle={event => setShowDays(event.currentTarget.open)}>
        <summary className={heading + ' min-h-11 cursor-pointer py-2'}>{t('dailyCosts')}</summary>
        {showDays && (details.days.length ? <DashboardTableFrame maxHeight={420}>
          <table aria-label={t('dailyCosts')} className="w-full min-w-[34rem] text-sm">
            <thead>{headers(t('day'))}</thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {[...details.days].reverse().map(day => <tr key={day.day}>
                <th scope="row" className="whitespace-nowrap py-2.5 pr-2 text-left font-mono font-medium">{day.day}</th>
                {cells(day)}
              </tr>)}
            </tbody>
          </table>
        </DashboardTableFrame> : <p className="text-sm text-[var(--color-text-muted)]">{t('emptyBreakdown')}</p>)}
      </details>
    </>}
  </>;
}
