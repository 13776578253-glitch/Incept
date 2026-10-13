import { useTranslations } from 'next-intl';
import { SectionHeader } from './section-header';

export function SectionPlaceholder({ section }: { section: 'overview' | 'models' | 'costs' | 'projects' }) {
  const t = useTranslations('dashboard');
  const colors = { overview: 'sky', models: 'indigo', costs: 'emerald', projects: 'amber' };
  return <section aria-labelledby={section} aria-busy="true" className={section === 'overview' ? 'space-y-5' : 'space-y-5 border-t border-[var(--color-border)] pt-10'}>
    <SectionHeader id={section} eyebrow={t(section + '.eyebrow')} title={t(section + '.title')}
      description={t(section + '.description')} accentColor={`var(--badge-${colors[section]}-dot)`} />
    <div aria-hidden="true" className="dashboard-section-skeleton">
      <div /><div /><div /><div />
    </div>
  </section>;
}
