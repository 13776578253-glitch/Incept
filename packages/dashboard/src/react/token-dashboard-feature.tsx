'use client';

import './dashboard.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import type { TokenDashboardData } from '../domain/index';
import {
  recordKnownDashboardModels,
  resolveColorSchemeForTheme,
  useDashboardPreferences,
  useDocumentThemeMode,
} from './dashboard-preferences';
import { useDashboardWindow } from './hooks/use-dashboard-window';
import { useBillingPreview } from './hooks/use-billing-preview';
import { reconcileDashboardWithBilling } from './reconcile-billing-models';
import { DashboardToolbar } from './components/dashboard-toolbar';
import { KpiStrip, KpiStripPlaceholder } from './sections/workbench/kpi-strip';
import {
  TrendWorkbench,
  type CacheSubView,
  type WorkbenchTrendTab,
} from './sections/workbench/trend-workbench';
import { CompositionAndModels } from './sections/workbench/composition-and-models';

const DiagnosticsDrawer = dynamic(
  () =>
    import('./sections/workbench/diagnostics-drawer').then(
      (module) => module.DiagnosticsDrawer,
    ),
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
  const t = useTranslations('dashboard');
  const trendRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<'range' | 'day'>('range');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [trendTab, setTrendTab] = useState<WorkbenchTrendTab>('volume');
  const [cacheSubView, setCacheSubView] = useState<CacheSubView>('global');
  const [selectedCacheModels, setSelectedCacheModels] = useState<ReadonlySet<string> | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  const { preferences } = useDashboardPreferences();
  const themeMode = useDocumentThemeMode();
  const activeColorScheme = resolveColorSchemeForTheme(preferences, themeMode);
  const effectivePreferences = useMemo(
    () => ({
      ...preferences,
      ...activeColorScheme,
    }),
    [preferences, activeColorScheme],
  );
  const activeColorOverrides = useMemo(
    () => ({
      ...activeColorScheme,
      themeMode,
    }),
    [activeColorScheme, themeMode],
  );

  const {
    rangePreset,
    setRangePreset,
    setSelectedTrendIndex,
    filteredDaily,
    data,
    isRefreshing,
    isRemoteSyncing,
    snapshotLag,
    refreshError,
    refresh,
    refreshCharts,
    triggerRemoteSync,
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

  const handleInspectModelCache = (modelName: string) => {
    if (viewMode === 'day') {
      setViewMode('range');
    }
    setTrendTab('cache');
    setCacheSubView('models');
    setSelectedCacheModels(new Set([modelName]));
    if (typeof trendRef.current?.scrollIntoView === 'function') {
      trendRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const selectedRemoteDevice = remoteInfo?.devices.find((d) => d.id === remoteDevice);
  const preCommitAlertCount = selectedRemoteDevice?.integrity?.actionableSessions ?? 0;
  const unpricedAlertCount =
    billingPreview?.status === 'ready'
      ? billingPreview.data.unpricedGroups ?? 0
      : displayData.costs.unpricedModels.length;
  const diagnosticsAlertCount =
    (displayData.collectionIssues?.length ?? 0) + preCommitAlertCount + unpricedAlertCount;

  return (
    <div
      data-dashboard-palette={activeColorScheme.paletteStyle}
      className="dashboard-page-shell mx-auto w-full max-w-[1440px] px-4 pt-4 pb-12 sm:px-6 md:pt-5 lg:px-10 lg:pt-5 lg:pb-8"
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
          setDiagnosticsOpen(true);
        }}
        diagnosticsBadge={diagnosticsAlertCount > 0}
        diagnosticsAlertCount={diagnosticsAlertCount}
        data={data}
        isRefreshing={isRefreshing}
        isRemoteSyncing={isRemoteSyncing}
        snapshotLag={snapshotLag}
        refreshError={refreshError}
        onRefresh={refresh}
        onRefreshCharts={refreshCharts}
        onTriggerRemoteSync={triggerRemoteSync}
        refreshCycle={refreshCycle}
        isPollingPaused={isPollingPaused}
        hasSnapshot={hasSnapshot}
        showingHistory={showingHistory}
        remoteInfo={remoteInfo}
        remoteDevice={remoteDevice}
        setRemoteDevice={setRemoteDevice}
        remoteState={remoteState}
        refreshInterval={refreshInterval}
        lastPageUpdatedAt={lastPageUpdatedAt}
      />

      {hasSnapshot ? (
        <>
          {/* Viewport 1 Closure: Frameless Hairline KPI Strip + Fixed-Height Trend Workbench */}
          <div className="shrink-0 space-y-3.5">
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
                preferences={effectivePreferences}
                themeMode={themeMode}
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
                onSelectedCacheModelsChange={setSelectedCacheModels}
              />
            </div>
          </div>

          {/* Viewport 2 Decoupled Details: Full-Width Models Overview */}
          <div className="dashboard-models-region mt-5">
            <CompositionAndModels
              data={displayData}
              billingPreview={billingPreview}
              colorOverrides={activeColorOverrides}
              viewMode={viewMode}
              selectedDay={selectedDay}
              onInspectModelCache={handleInspectModelCache}
            />
          </div>
        </>
      ) : (
        <div className="shrink-0 space-y-3.5">
          {isRefreshing ? <KpiStripPlaceholder /> : null}
          <section
            aria-label={t('workbench.trendTitle')}
            className={`dashboard-wb-stage flex items-center justify-center p-4 text-center sm:p-5 ${isRefreshing ? 'dashboard-wb-stage-fixed' : 'min-h-56'}`}
          >
            <p role="status" className="text-sm text-[var(--color-text-muted)]">
              {t(isRefreshing ? 'page.loadingFirst' : refreshError ? 'page.firstLoadFailed' : 'page.noSnapshot')}
            </p>
          </section>
        </div>
      )}

      {diagnosticsOpen ? (
        <DiagnosticsDrawer
          open={diagnosticsOpen}
          onClose={() => setDiagnosticsOpen(false)}
          data={displayData}
          billingPreview={billingPreview}
          remoteInfo={remoteInfo}
          remoteDevice={remoteDevice}
          remoteState={remoteState}
        />
      ) : null}
    </div>
  );
}
