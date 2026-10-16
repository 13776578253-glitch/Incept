import { redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/config/locales';

export default async function DocsReferencePage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/docs`);
}
