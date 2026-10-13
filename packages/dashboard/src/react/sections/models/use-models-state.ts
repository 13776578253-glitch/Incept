import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TokenDashboardData } from '../../../domain/index';

export function useModelsState(data: TokenDashboardData) {
  const t = useTranslations('dashboard');

  const [selectedModelSource, setSelectedModelSource] = useState<string>('all');

  const [modelSort, setModelSort] = useState<'tokens' | 'cost' | 'output'>('tokens');

  const modelSourceFilters = useMemo(() => {
    const counts = new Map<string, number>();
    for(const m of data.models) {
      counts.set(m.source, (counts.get(m.source) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([source, count]) => ({ source, count }));
  }, [data.models]);

  const sortedModels = useMemo(() => {
    return data.models
      .filter((m) => selectedModelSource === 'all' || m.source === selectedModelSource)
      .sort((a, b) => {
        if(a.slotStatus !== b.slotStatus) {
          return a.slotStatus === 'measured' ? -1 : 1;
        }
        if(modelSort === 'cost') return b.cost - a.cost;
        if(modelSort === 'output') return b.outputTokens - a.outputTokens;
        return b.totalTokens - a.totalTokens;
      });
  }, [data.models, selectedModelSource, modelSort]);

  const maxSortedModelMetric = useMemo(() => {
    if(!sortedModels.length) return 1;
    if(modelSort === 'cost') {
      return Math.max(0.01, ...sortedModels.map((m) => m.cost));
    }
    if(modelSort === 'output') {
      return Math.max(1, ...sortedModels.map((m) => m.outputTokens));
    }
    return Math.max(1, ...sortedModels.map((m) => m.totalTokens));
  }, [sortedModels, modelSort]);

  const tokenTypeItems = [
    {
      key: 'cacheRead',
      label: t('models.tokenTypes.cacheRead'),
      description: t('models.tokenTypes.cacheReadDesc'),
      tokens: data.totals.cacheReadTokens,
      share:
        data.totals.totalTokens > 0
          ? data.totals.cacheReadTokens / data.totals.totalTokens
          : 0,
      color: 'var(--badge-sky-dot)',
    },
    {
      key: 'input',
      label: t('models.tokenTypes.input'),
      description: t('models.tokenTypes.inputDesc'),
      tokens: data.totals.inputTokens,
      share:
        data.totals.totalTokens > 0
          ? data.totals.inputTokens / data.totals.totalTokens
          : 0,
      color: 'var(--badge-indigo-dot)',
    },
    {
      key: 'output',
      label: t('models.tokenTypes.output'),
      description: t('models.tokenTypes.outputDesc'),
      tokens: data.totals.outputTokens,
      share:
        data.totals.totalTokens > 0
          ? data.totals.outputTokens / data.totals.totalTokens
          : 0,
      color: 'var(--badge-emerald-dot)',
    },
    {
      key: 'reasoning',
      label: t('models.tokenTypes.reasoning'),
      description: t('models.tokenTypes.reasoningDesc'),
      tokens: data.totals.reasoningTokens + data.totals.cacheCreationTokens,
      share:
        data.totals.totalTokens > 0
          ? (data.totals.reasoningTokens + data.totals.cacheCreationTokens) /
          data.totals.totalTokens
          : 0,
      color: 'var(--badge-amber-dot)',
    },
  ];

  const maxTokenTypeVolume = Math.max(1, ...tokenTypeItems.map((i) => i.tokens));

  return { selectedModelSource, setSelectedModelSource, modelSort, setModelSort, modelSourceFilters, sortedModels, maxSortedModelMetric, tokenTypeItems, maxTokenTypeVolume };
}

export type ModelsState = ReturnType<typeof useModelsState>;
