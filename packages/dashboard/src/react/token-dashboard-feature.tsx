'use client';

import './dashboard.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

import type { TokenDashboardData } from '../domain/index';
import {
  recordKnownDashboardModels,
  useDashboardPreferences,
} from './dashboard-preferences';
import { useDashboardWindow } from './hooks/use-dashboard-window';
import { useBillingPreview } from './hooks/use-billing-preview';
import { reconcileDashboardWithBilling } from './reconcile-billing-models';
import { DashboardToolbar } from './components/dashboard-toolbar';
import { SectionPlaceholder } from './components/section-placeholder';
import { KpiStrip } from './sections/workbench/kpi-strip';
import {
  TrendWorkbench,
  type CacheSubView,
  type WorkbenchTrendTab,
} from './sections/workbench/trend-workbench';
import { CompositionAndModels } from './sections/workbench/composition-and-models';
import type { DiagnosticsTab } from './sections/workbench/diagnostics-drawer';

const DiagnosticsDrawer = dynamic(
  () =>
    import('./sections/workbench/diagnostics-drawer').then(
      (module) => module.DiagnosticsDrawer,
    ),
);
const ImportDialog = dynamic(
  () => import('./imports/import-dialog').then((module) => module.ImportDialog),
  { ssr: false },
);

export function TokenDashboardFeature({
  data: initialData,
  canImport = false,
  canViewDetails = canImport,
  initialStatus = 'live',
  initialValidator,
  billingPreviewEnabled = false,
}: {
  data: TokenDashboardData;
  canImport?: boolean;
  canViewDetails?: boolean;
  initialStatus?: 'history' | 'empty' | 'live';
  initialValidator?: string;
  billingPreviewEnabled?: boolean;
}) {
  const trendRef = useRef<HTMLDivElement>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'range' | 'day'>('range');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [trendTab, setTrendTab] = useState<WorkbenchTrendTab>('volume');
  const [cacheSubView, setCacheSubView] = useState<CacheSubView>('global');
  const [selectedCacheModels, setSelectedCacheModels] = useState<ReadonlySet<string> | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnosticsTab, setDiagnosticsTab] = useState<DiagnosticsTab>('billing');

  const { preferences } = useDashboardPreferences();

  const {
    rangePreset,
    setRangePreset,
    setSelectedTrendIndex,
    filteredDaily,
    data,
    isRefreshing,
    refreshError,
    refresh,
    refreshCycle,
    revalidationCycle,
    viewerRole,
    isPollingPaused,
    hasSnapshot,
    showingHistory,
    remoteInfo,
    remoteDevice,
    setRemoteDevice,
    remoteState,
    refreshInterval,
    lastPageUpdatedAt,
  } = useDashboardWindow(initialData, {
    refreshOnMount: initialStatus !== 'live',
    initialHasSnapshot: initialStatus !== 'empty',
    owner: canImport,
    canViewDetails,
    initialValidator,
    loadRemoteOnMount: initialStatus === 'live',
  });

  const lastBillingRevisionRef = useRef<number | undefined>(
    initialData.sync?.readMode === 'v2' ? initialData.sync.dataRevision : undefined,
  );
  if (data.sync?.readMode === 'v2' && typeof data.sync.dataRevision === 'number') {
    lastBillingRevisionRef.current = data.sync.dataRevision;
  }

  // A server-confirmed role downgrade withdraws Owner-only Billing and import affordances at once.
  const effectiveOwner = canImport && viewerRole === 'owner';
  const billingPreview = useBillingPreview(
    effectiveOwner && billingPreviewEnabled,
    rangePreset,
    revalidationCycle,
    lastBillingRevisionRef.current,
  );

  const { data: displayData } = useMemo(
    () => reconcileDashboardWithBilling(data, billingPreview, filteredDaily),
    [data, billingPreview, filteredDaily],
  );

  useEffect(() => {
    if (displayData.models.length > 0) {
      recordKnownDashboardModels(displayData.models);
    }
  }, [displayData.models]);

  const sortedDaily = useMemo(
    () => [...displayData.daily].sort((a, b) => a.date.localeCompare(b.date)),
    [displayData.daily],
  );

  const selectedDay = useMemo(() => {
    if (sortedDaily.length === 0) return null;
    if (selectedDate) {
      const exact = sortedDaily.find((d) => d.date === selectedDate);
      if (exact) return exact;
    }
    return sortedDaily[sortedDaily.length - 1] ?? null;
  }, [selectedDate, sortedDaily]);

  const orderedTopCacheModels = useMemo(
    () =>
      displayData.models
        .filter((m) => m.slotStatus !== 'configured' && m.totalTokens > 0)
        .sort((a, b) => b.totalTokens - a.totalTokens)
        .slice(0, 4)
        .map((m) => m.modelName),
    [displayData.models],
  );

  const handleToggleCacheModel = (modelName: string) => {
    setSelectedCacheModels((prev) => {
      const next = new Set(prev ?? orderedTopCacheModels);
      if (next.has(modelName)) {
        next.delete(modelName);
      } else {
        next.add(modelName);
      }
      return next;
    });
  };

  const handleInspectModelCache = (modelName: string) => {
    if (viewMode === 'day') {
      setViewMode('range');
    }
    setTrendTab('cache');
    setCacheSubView('models');
    setSelectedCacheModels((prev) => {
      const next = new Set(prev ?? orderedTopCacheModels);
      next.add(modelName);
      return next;
    });
    if (typeof trendRef.current?.scrollIntoView === 'function') {
      trendRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const diagnosticsAlertCount =
    (displayData.collectionIssues?.length ?? 0) > 0
      ? displayData.collectionIssues!.length
      : billingPreview?.status === 'ready'
        ? billingPreview.data.unpricedGroups ?? 0
        : displayData.costs.unpricedModels.length;

  return (
    <div
      data-dashboard-palette={preferences.paletteStyle}
      className="mx-auto w-full max-w-[1440px] px-4 pt-4 pb-20 sm:px-6 md:pt-5 lg:px-10 lg:pt-6 lg:pb-24"
    >
      <DashboardToolbar
        rangePreset={rangePreset}
        setRangePreset={setRangePreset}
        setSelectedTrendIndex={setSelectedTrendIndex}
        viewMode={viewMode}
        onSelectRangeMode={() => setViewMode('range')}
        onSelectSingleDay={() => {
          setViewMode('day');
          if (!selectedDate && sortedDaily.length > 0) {
            setSelectedDate(sortedDaily[sortedDaily.length - 1].date);
          }
        }}
        onOpenDiagnostics={() => {
          setDiagnosticsTab(
            (displayData.collectionIssues?.length ?? 0) > 0 ? 'sources' : 'billing',
          );
          setDiagnosticsOpen(true);
        }}
        diagnosticsBadge={diagnosticsAlertCount > 0}
        diagnosticsAlertCount={diagnosticsAlertCount}
        data={data}
        isRefreshing={isRefreshing}
        refreshError={refreshError}
        onRefresh={refresh}
        refreshCycle={refreshCycle}
        isPollingPaused={isPollingPaused}
        onOpenImport={effectiveOwner ? () => setImportOpen(true) : undefined}
        hasSnapshot={hasSnapshot}
        showingHistory={showingHistory}
        remoteInfo={remoteInfo}
        remoteDevice={remoteDevice}
        setRemoteDevice={setRemoteDevice}
        remoteState={remoteState}
        refreshInterval={refreshInterval}
        lastPageUpdatedAt={lastPageUpdatedAt}
      />

      {effectiveOwner && importOpen ? (
        <ImportDialog onClose={() => setImportOpen(false)} onImported={refresh} />
      ) : null}

      {hasSnapshot ? (
        <>
          {/* Viewport 1 Closure: Frameless Hairline KPI Strip + Fixed-Height Trend Workbench */}
          <div className="space-y-4">
            <KpiStrip
              data={displayData}
              billingPreview={billingPreview}
              viewMode={viewMode}
              selectedDay={selectedDay}
            />

            <div ref={trendRef}>
              <TrendWorkbench
                data={displayData}
                billingPreview={billingPreview}
                preferences={preferences}
                rangePreset={rangePreset}
                viewMode={viewMode}
                selectedDay={selectedDay}
                onSelectDate={(date) => {
                  setSelectedDate(date);
                  setViewMode('day');
                }}
                onExitSingleDay={() => setViewMode('range')}
                activeTab={trendTab}
                onTabChange={setTrendTab}
                cacheSubView={cacheSubView}
                onCacheSubViewChange={setCacheSubView}
                selectedCacheModels={selectedCacheModels}
                onToggleCacheModel={handleToggleCacheModel}
              />
            </div>
          </div>

          {/* Viewport 2 Decoupled Details: Full-Width Models Overview */}
          <div className="mt-6">
            <CompositionAndModels
              data={displayData}
              billingPreview={billingPreview}
              colorOverrides={preferences}
              viewMode={viewMode}
              selectedDay={selectedDay}
              onInspectModelCache={handleInspectModelCache}
            />
          </div>
        </>
      ) : (
        <SectionPlaceholder section="overview" />
      )}

      {diagnosticsOpen ? (
        <DiagnosticsDrawer
          open={diagnosticsOpen}
          onClose={() => setDiagnosticsOpen(false)}
          activeTab={diagnosticsTab}
          onTabChange={setDiagnosticsTab}
          data={displayData}
          billingPreview={billingPreview}
          canViewDetails={canViewDetails}
          remoteInfo={remoteInfo}
          remoteDevice={remoteDevice}
          remoteState={remoteState}
        />
      ) : null}
    </div>
  );
}
