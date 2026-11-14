'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { TokenDashboardData } from '../../../domain/index';
import { SectionHeader } from '../../components/section-header';
import { CostMetrics } from './cost-metrics';
import { PricingCoveragePanel } from './pricing-coverage-panel';
import { ModelPricingTable } from './model-pricing-table';
import { ReferenceCostMetric } from '../../components/reference-cost-metric';
import type { BillingPreview } from '../../hooks/use-billing-preview';
import { ReferenceCostBreakdown } from './reference-cost-breakdown';

type CostsSectionProps = {
  data: TokenDashboardData;
  billingPreview?: BillingPreview;
};

export function CostsSection({
  data,
  billingPreview,
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
        description={t(billingPreview ? 'costs.reference.description' : 'costs.description')}
        accentColor="var(--badge-emerald-dot)"
      />

      {billingPreview ? <>
        <ReferenceCostMetric preview={billingPreview} showBreakdown />
        {billingPreview.status === 'ready' && <ReferenceCostBreakdown key={billingPreview.data.range}
          data={billingPreview.data} sources={data.sources} />}
      </> : (
        <>
          <CostMetrics data={data} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
            <PricingCoveragePanel data={data} />
            <ModelPricingTable maxModelCost={maxModelCost} data={data} />
          </div>
        </>
      )}
    </section>
  );
}
