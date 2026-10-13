'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { TokenDashboardData } from '../../../domain/index';
import { SectionHeader } from '../../components/section-header';
import { CostMetrics } from './cost-metrics';
import { PricingCoveragePanel } from './pricing-coverage-panel';
import { ModelPricingTable } from './model-pricing-table';

type CostsSectionProps = {
  data: TokenDashboardData;
};

export function CostsSection({
  data,
}: CostsSectionProps) {
  const t = useTranslations('dashboard');
  const maxModelCost = useMemo(
    () => Math.max(0.01, ...data.models.map((m) => m.cost)),
    [data.models],
  );

  return (
    <section
      aria-labelledby="costs"
      className="space-y-5 border-t border-[var(--color-border)] pt-10"
    >
      <SectionHeader
        id="costs"
        eyebrow={t('costs.eyebrow')}
        title={t('costs.title')}
        description={t('costs.description')}
        accentColor="var(--badge-emerald-dot)"
      />

      {/* 4 Cost Highlight KPI Cards */}
      <CostMetrics data={data} />

      {/* 2-Column Flat Panels: Coverage Diagnostics + Unit Rate Table */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
        {/* Flat Panel: Price Coverage & Credibility Diagnostics */}
        <PricingCoveragePanel data={data} />

        {/* Flat Panel: Unit Rates & Cost Attribution Table */}
        <ModelPricingTable maxModelCost={maxModelCost} data={data} />
      </div>
    </section>
  );
}
