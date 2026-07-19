import { SimpleShell } from '@/components/layouts/containers/simple-shell';
import { NotesHomeFeature } from '@/features/notes';
import type { AppLocale } from '@/i18n/config/locales';
import { getNotesHomePage } from '@/server/notes/loaders';

export default async function NotesPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const page = await getNotesHomePage({
    locale,
    viewerRole: 'guest',
  });

  return (
    <SimpleShell>
      <NotesHomeFeature page={page} />
    </SimpleShell>
  );
}
