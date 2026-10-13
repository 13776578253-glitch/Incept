'use client';

import './dashboard.css';
import { useState } from 'react';
import { ImportDialog } from './imports/import-dialog';

import type { TokenDashboardData } from '../domain/index';
import { useDashboardWindow } from './hooks/use-dashboard-window';
import { DashboardToolbar } from './components/dashboard-toolbar';
import { ProjectsSection } from './sections/projects/projects-section';
import { CostsSection } from './sections/costs/costs-section';
import { ModelsSection } from './sections/models/models-section';
import { OverviewSection } from './sections/overview/overview-section';

export function TokenDashboardFeature({
  data: initialData,
  canImport = false,
}: { data: TokenDashboardData; canImport?: boolean }) {
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
  } = useDashboardWindow(initialData);

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
      />
      {canImport && importOpen ? <ImportDialog onClose={() => setImportOpen(false)} onImported={refresh} /> : null}

      <div className="mt-2 space-y-14 md:mt-3 md:space-y-16">
        {/* =====================================================================
            SECTION 01: OVERVIEW (全局使用量、趋势、模型分布 — TokLens v0.1.2 布局)
        ===================================================================== */}
        <OverviewSection
          data={data}
          filteredDaily={filteredDaily}
          selectedTrendIndex={selectedTrendIndex}
          setSelectedTrendIndex={setSelectedTrendIndex}
        />

        {/* =====================================================================
            SECTION 02: MODELS & SOURCES (按模型、客户端来源、Token 类型拆解)
        ===================================================================== */}
        <ModelsSection data={data} />

        {/* =====================================================================
            SECTION 03: COSTS & COVERAGE (API 等效费用、价格覆盖率)
        ===================================================================== */}
        <CostsSection data={data} />

        {/* =====================================================================
            SECTION 04: PROJECTS & SESSIONS (项目排行表格 + 会话主从检查器)
        ===================================================================== */}
        <ProjectsSection data={data} />
      </div>
    </div>
  );
}
