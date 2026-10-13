'use client';

import { useTranslations } from 'next-intl';
import type { TokenDashboardData } from '../../../domain/index';
import { SectionHeader } from '../../components/section-header';
import { useModelsState } from './use-models-state';
import { TokenTypesPanel } from './token-types-panel';
import { SourcesPanel } from './sources-panel';
import { ModelsTable } from './models-table';

type ModelsSectionProps = {
  data: TokenDashboardData;
};

export function ModelsSection({
  data,
}: ModelsSectionProps) {
  const t = useTranslations('dashboard');
  const {
    selectedModelSource,
    setSelectedModelSource,
    modelSort,
    setModelSort,
    modelSourceFilters,
    sortedModels,
    maxSortedModelMetric,
    tokenTypeItems,
    maxTokenTypeVolume,
  } = useModelsState(data);

  return (
    <section
      aria-labelledby="models"
      className="space-y-5 border-t border-[var(--color-border)] pt-10"
    >
      <SectionHeader
        id="models"
        eyebrow={t('models.eyebrow')}
        title={t('models.title')}
        description={t('models.description')}
        accentColor="var(--badge-indigo-dot)"
      />

      {/* 2-Column Flat Panels: Token Types + Client/Source Distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.25fr)]">
        {/* Flat Panel 1: Token Type Breakdown */}
        <TokenTypesPanel tokenTypeItems={tokenTypeItems} maxTokenTypeVolume={maxTokenTypeVolume} />

        {/* Flat Panel 2: Client & Source Distribution (All 7 Local Sources) */}
        <SourcesPanel data={data} />
      </div>

      {/* Full Model & Slot Breakdown Table (30 Models across all sources) */}
      <ModelsTable
        selectedModelSource={selectedModelSource}
        setSelectedModelSource={setSelectedModelSource}
        modelSort={modelSort}
        setModelSort={setModelSort}
        modelSourceFilters={modelSourceFilters}
        sortedModels={sortedModels}
        maxSortedModelMetric={maxSortedModelMetric}
        data={data}
      />
    </section>
  );
}
