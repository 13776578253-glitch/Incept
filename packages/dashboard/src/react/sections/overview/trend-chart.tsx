'use client';

import { useMemo, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { formatCompactTokens, formatPercent, formatUsd } from '../../formatters';
import type { DashboardWindow } from '../../hooks/use-dashboard-window';
import type { OverviewState } from './use-overview-state';
import { modelSeries, modelShares, tokenShares } from './trend-series';

type TrendChartProps = Pick<OverviewState, 'trendItems' | 'activeTrendIndex' | 'trendMetric' | 'maxTrendValue'>
  & { setSelectedTrendIndex: DashboardWindow['setSelectedTrendIndex'] };

export function TrendChart({ trendItems, activeTrendIndex, trendMetric, maxTrendValue, setSelectedTrendIndex }: TrendChartProps) {
  const t = useTranslations('dashboard');
  const series = useMemo(() => modelSeries(trendItems), [trendItems]);
  const isShare = trendMetric === 'stacked' || trendMetric === 'models';
  const color = trendMetric === 'cost' ? 'var(--badge-emerald-dot)' : 'var(--badge-sky-dot)';
  const legend = trendMetric === 'models' && trendItems.length ? modelShares(trendItems[activeTrendIndex], series)
    : trendMetric === 'stacked' && trendItems.length ? tokenShares(trendItems[activeTrendIndex]) : [];
  const segmentName = (id: string) => trendMetric === 'models' ? id : t('overview.trend.parts.' + id);

  return (
    <div className="dashboard-trend-chart">
      <div className="dashboard-trend-scroll dashboard-subtle-scrollbar">
        <div className="dashboard-trend-columns" style={{ minWidth: Math.max(480, trendItems.length * 32) }}>
          {trendItems.map((item, index) => {
            const selected = index === activeTrendIndex;
            const segments = trendMetric === 'models' ? modelShares(item, series)
              : trendMetric === 'stacked' ? tokenShares(item).filter(part => part.tokens > 0) : [];
            const value = trendMetric === 'cost' ? item.cost : item.totalTokens;
            const hasValue = isShare ? segments.length > 0 : value > 0;
            const height = trendMetric === 'stacked' ? (hasValue ? 100 : 0)
              : hasValue && value > 0 ? Math.max(2, value / maxTrendValue * 100) : 0;
            const label = trendMetric === 'stacked' ? (hasValue ? '100%' : '—')
              : trendMetric === 'cost' ? formatUsd(value, 1) : formatCompactTokens(value);
            const title = isShare
              ? item.fullLabel + '\n' + segments.map(part => segmentName(part.id) + ': ' + formatPercent(part.share, 1)).join('\n')
              : item.fullLabel + ': ' + label;
            return (
              <button key={item.fullLabel} type="button" className="dashboard-trend-column"
                aria-label={title} title={title} data-selected={selected}
                onMouseEnter={() => setSelectedTrendIndex(index)}
                onFocus={() => setSelectedTrendIndex(index)}
                onClick={() => setSelectedTrendIndex(index)}>
                <div className="dashboard-trend-plot">
                  {trendItems.length <= 31 ? (
                    <span className="dashboard-trend-value" style={{ bottom: `calc(${height}% + 6px)` }}>{label}</span>
                  ) : null}
                  <div className="dashboard-trend-bar" data-selected={selected && hasValue}
                    style={{ height: height + '%', backgroundColor: color, '--trend-color': color } as CSSProperties}>
                    {isShare ? segments.map(part => (
                      <span key={part.id} role="img" className="dashboard-trend-segment"
                        aria-label={segmentName(part.id) + ': ' + formatPercent(part.share, 1)}
                        title={segmentName(part.id) + ': ' + formatPercent(part.share, 1) + ' · ' + formatCompactTokens(part.tokens)}
                        style={{ height: part.share * 100 + '%', backgroundColor: part.color }} />
                    )) : null}
                  </div>
                </div>
                <span className="dashboard-trend-date">
                  {trendItems.length <= 20 || index % Math.ceil(trendItems.length / 12) === 0 || selected ? item.label : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="dashboard-trend-legend dashboard-subtle-scrollbar" aria-label={t('overview.trend.legend')}>
        {legend.map(part => (
          <span key={part.id} className="dashboard-trend-legend-item">
            <i style={{ backgroundColor: part.color }} />
            {segmentName(part.id)} <span>{formatPercent(part.share, 1)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
