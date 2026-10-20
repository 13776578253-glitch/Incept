'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import type { CcusageModelBreakdown, DailyUsagePoint, ModelUsageSummary } from '../../../domain';
import { formatCompactTokens, formatShortDate } from '../../formatters';

export function modelTokens(model: CcusageModelBreakdown | undefined): number {
  return model ? model.inputTokens + model.outputTokens + model.cacheReadTokens + model.cacheCreationTokens + (model.reasoningTokens ?? 0) : 0;
}

export function ModelHeatmap({ points, models }: { points: DailyUsagePoint[]; models: ModelUsageSummary[] }) {
  const t = useTranslations('dashboard');
  if (!models.length) return <p className="text-sm text-[var(--color-nav-muted)]">{t('page.noUsage')}</p>;
  const width = Math.max(600, 240 + points.length * 34);
  return <div className="dashboard-model-matrix" role="table" aria-label={t('overview.trend.viewMatrix')}
    style={{ minWidth: width, '--matrix-columns': points.length, '--matrix-rows': models.length } as CSSProperties}>
    <div className="dashboard-matrix-header" role="row">
      <span role="columnheader">{t('overview.trend.modelDate')}</span>
      {points.map(point => <span role="columnheader" key={point.date}>{formatShortDate(point.date)}</span>)}
    </div>
    {models.map(model => {
      const values = points.map(point => modelTokens(point.modelBreakdowns.find(item => item.modelName === model.modelName)));
      const maximum = Math.max(1, ...values);
      return <div className="dashboard-matrix-row" role="row" key={model.modelName}>
        <span role="rowheader" title={model.modelName}><span>{model.modelName}</span></span>
        {points.map((point, index) => <div role="cell" key={point.date}>
          <span className="dashboard-matrix-cell" title={model.modelName + ' (' + point.date + '): ' + formatCompactTokens(values[index])}
            aria-label={model.modelName + ' ' + point.date + ': ' + formatCompactTokens(values[index])}
            style={{ backgroundColor: values[index] > 0
              ? `color-mix(in srgb, var(--badge-indigo-dot) ${18 + Math.round(values[index] / maximum * 70)}%, var(--color-row-bg))` : undefined }} />
        </div>)}
      </div>;
    })}
  </div>;
}
