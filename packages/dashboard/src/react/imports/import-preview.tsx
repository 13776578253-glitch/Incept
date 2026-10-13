import { useTranslations } from 'next-intl';
import { formatCompactTokens } from '../formatters';
import type { ImportDialogState } from './use-import-dialog';
import { ProjectPicker } from './project-picker';

export function ImportPreviewPanel({ preview, mappings, changeMapping, busy }: ImportDialogState) {
  const t = useTranslations('dashboard.imports');
  if (!preview) return null;
  return <div className="space-y-5">
    <p className="text-sm text-[var(--color-text-muted)]">{preview.device.label} · {preview.exportedAt.slice(0, 10)}</p>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {([['added', preview.added], ['duplicate', preview.duplicateLocal + preview.duplicateImported], ['conflicts', preview.conflicts],
        ['tokens', formatCompactTokens(preview.addedTokens)]] as const).map(([label, value]) =>
        <div key={label} className="rounded-xl bg-[var(--color-row-bg)] p-3"><div className="text-xs text-[var(--color-nav-muted)]">{t(label)}</div>
          <strong className="mt-1 block font-mono text-lg">{value}</strong></div>)}
    </div>
    <div className="space-y-2"><h3 className="text-sm font-semibold">{t('projects')}</h3><p className="text-xs text-[var(--color-nav-muted)]">{t('projectHint')}</p>
      <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
        {preview.projects.map(project => <div key={project.key} className="grid gap-2 rounded-xl bg-[var(--color-row-bg)] p-3 sm:grid-cols-2 sm:items-start">
          <span className="min-w-0 text-xs"><span className="block truncate font-medium" title={project.path}>{project.name}</span>
            <span className="mt-1 block truncate text-[var(--color-nav-muted)]" title={project.path}>{project.path ?? project.key}</span></span>
          <ProjectPicker label={t('mapProject', { name: project.name })} disabled={busy} value={mappings[project.key] ?? ''}
            searchLabel={t('searchProjects')} emptyLabel={t('noMatchingProjects')} onChange={value => changeMapping(project.key, value)}
            options={[{ value: '', label: t('keepExternal') }, ...preview.targets.map(target => ({ value: target.key,
              label: target.name + (target.key === project.suggestedTarget ? ' · ' + t('suggested') : '') }))]} />
        </div>)}
      </div>
    </div>
    <div className="space-y-2"><h3 className="text-sm font-semibold">{t('models')}</h3>
      <div className="max-h-40 overflow-y-auto rounded-xl border border-[var(--color-border)]">
        {preview.models.map(model => <div key={model.name} className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-3 py-2 text-xs last:border-0">
          <span className="min-w-0 break-all font-mono">{model.name}{model.name !== model.resolvedName ? ' → ' + model.resolvedName : ''}</span>
          <span className="shrink-0 text-[var(--color-nav-muted)]">{t(model.priced ? 'priced' : 'unpriced')}</span>
        </div>)}
      </div>
    </div>
    {preview.warnings.map(warning => <p key={warning} className="text-xs text-[var(--color-nav-muted)]">{warning}</p>)}
  </div>;
}
