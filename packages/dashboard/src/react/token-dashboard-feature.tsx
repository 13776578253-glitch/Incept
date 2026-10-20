'use client';

import './dashboard.css';
import { useState } from 'react';
import dynamic from 'next/dynamic';

import type { TokenDashboardData } from '../domain/index';
import { useDashboardWindow } from './hooks/use-dashboard-window';
import { DashboardToolbar } from './components/dashboard-toolbar';
import { OverviewSection } from './sections/overview/overview-section';
import { DeferredSection } from './components/deferred-section';
import { SectionPlaceholder } from './components/section-placeholder';

const ProjectsSection = dynamic(() => import('./sections/projects/projects-section').then(module => module.ProjectsSection),
  { loading: () => <SectionPlaceholder section="projects" /> });
const CostsSection = dynamic(() => import('./sections/costs/costs-section').then(module => module.CostsSection),
  { loading: () => <SectionPlaceholder section="costs" /> });
const ModelsSection = dynamic(() => import('./sections/models/models-section').then(module => module.ModelsSection),
  { loading: () => <SectionPlaceholder section="models" /> });
const ImportDialog = dynamic(() => import('./imports/import-dialog').then(module => module.ImportDialog), { ssr: false });

export function TokenDashboardFeature({
  data: initialData,
  canImport = false,
  canViewDetails = canImport,
  initialStatus = 'live',
}: { data: TokenDashboardData; canImport?: boolean; canViewDetails?: boolean; initialStatus?: 'history' | 'empty' | 'live' }) {
  const [importOpen, setImportOpen] = useState(false);
  const {
    rangePreset,
    setRangePreset,
    selectedTrendIndex,
    setSelectedTrendIndex,
    filteredDaily,
    data,
    isRefreshing,
    refreshError,
    refresh,
    refreshCycle,
    isPollingPaused,
    hasSnapshot,
    showingHistory,
  } = useDashboardWindow(initialData, { refreshOnMount: initialStatus !== 'live', initialHasSnapshot: initialStatus !== 'empty', owner: canImport, canViewDetails });

  return (
    <div className="mx-auto w-full max-w-[1480px] px-6 pt-6 pb-24 md:pt-8 lg:px-10 lg:pt-9 lg:pb-28">
      {/* =====================================================================
          TOKLENS v0.1.2 UNIFIED TOP TOOLBAR (统一顶部工具栏)
      ===================================================================== */}
      <DashboardToolbar
        rangePreset={rangePreset}
        setRangePreset={setRangePreset}
        setSelectedTrendIndex={setSelectedTrendIndex}
        data={data}
        isRefreshing={isRefreshing}
        refreshError={refreshError}
        onRefresh={refresh}
        refreshCycle={refreshCycle}
        isPollingPaused={isPollingPaused}
        onOpenImport={canImport ? () => setImportOpen(true) : undefined}
        hasSnapshot={hasSnapshot}
        showingHistory={showingHistory}
      />
      {canImport && importOpen ? <ImportDialog onClose={() => setImportOpen(false)} onImported={refresh} /> : null}

      <div className="mt-2 space-y-14 md:mt-3 md:space-y-16">
        {/* =====================================================================
            SECTION 01: OVERVIEW (全局使用量、趋势、模型分布 — TokLens v0.1.2 布局)
        ===================================================================== */}
        {hasSnapshot ? <OverviewSection
          data={data}
          filteredDaily={filteredDaily}
          selectedTrendIndex={selectedTrendIndex}
          setSelectedTrendIndex={setSelectedTrendIndex}
        /> : <SectionPlaceholder section="overview" />}

        {/* =====================================================================
            SECTION 02: MODELS & SOURCES (按模型、客户端来源、Token 类型拆解)
        ===================================================================== */}
        <DeferredSection section="models" enabled={hasSnapshot}><ModelsSection data={data} /></DeferredSection>

        {/* =====================================================================
            SECTION 03: COSTS & COVERAGE (API 等效费用、价格覆盖率)
        ===================================================================== */}
        <DeferredSection section="costs" enabled={hasSnapshot}><CostsSection data={data} /></DeferredSection>

        {/* =====================================================================
            SECTION 04: PROJECTS & SESSIONS (项目排行表格 + 会话主从检查器)
        ===================================================================== */}
        <DeferredSection section="projects" enabled={hasSnapshot || !canViewDetails}><ProjectsSection data={data} canViewDetails={canViewDetails} /></DeferredSection>
      </div>
    </div>
  );
}
