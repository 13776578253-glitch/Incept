import type { AppLocale } from '@/i18n/config/locales';
import {
  findPublishedNoteBySlug,
  listPublishedNotesHomeEntries,
} from '@incept/db/docs';
import type { DbDocsLocale } from '@incept/db/docs';
import type {
  DocsAccessRole,
  DocsArticlePageModel,
  DocsHomePageModel,
} from '@/features/docs/shared/types';
import {
  mapDocsArticleRecordToPageModel,
  mapDocsHomeEntriesToPageGroups,
} from '@/server/docs/mappers';
import { canAccessDocsArticle } from '@/server/docs/access';

const notesHomeIntro = {
  eyebrow: 'Notes',
  title: 'Notes and personal writing',
  description:
    'A quieter place for personal essays, observations, and less formal writing.',
};

export async function getNotesHomePage({
  locale,
  viewerRole,
}: {
  locale: AppLocale;
  viewerRole: DocsAccessRole;
}): Promise<DocsHomePageModel> {
  const entries = await listPublishedNotesHomeEntries({
    locale: locale as DbDocsLocale,
  });

  return {
    intro: notesHomeIntro,
    groups: mapDocsHomeEntriesToPageGroups(
      entries,
      viewerRole,
      canAccessDocsArticle,
      '/notes',
    ),
  };
}

export async function getNotesArticlePage({
  locale,
  slug,
  viewerRole,
}: {
  locale: AppLocale;
  slug: string;
  viewerRole: DocsAccessRole;
}): Promise<DocsArticlePageModel | null> {
  const record = await findPublishedNoteBySlug({
    locale: locale as DbDocsLocale,
    slug,
  });

  if (!record) {
    return null;
  }

  if (!canAccessDocsArticle(viewerRole, record.accessRole)) {
    return null;
  }

  return mapDocsArticleRecordToPageModel(record);
}
