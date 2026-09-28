import { redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/config/locales';

export default async function ArchitectureMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ project?: string; rd?: string; surface?: string }>;
}) {
  const { locale } = await params;
  const { project, rd, surface } = await searchParams;

  const query = new URLSearchParams();
  if (project) query.set('project', project);
  if (rd) query.set('rd', rd);
  if (surface) query.set('surface', surface);
  const queryString = query.toString();

  redirect(`/${locale}/atlas/roadmap${queryString ? `?${queryString}` : ''}`);
}
