import { SimpleShell } from '@/components/layouts/containers/simple-shell';
import { NotesHomeFeature } from '@/features/notes';
import type { AppLocale } from '@/i18n/config/locales';
import { getNotesHomePage } from '@/server/notes/loaders';
import { getCurrentViewer } from '@/server/auth';
import { toDocsViewerAccessRole } from '@/server/docs/viewer';

export default async function NotesPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const viewer = await getCurrentViewer();
  const page = await getNotesHomePage({
    locale,
    viewerRole: toDocsViewerAccessRole(viewer),
  });

  return (
    <SimpleShell>
      <NotesHomeFeature page={page} />
    </SimpleShell>
  );
}
