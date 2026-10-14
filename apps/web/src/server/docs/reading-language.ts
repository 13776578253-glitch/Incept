import 'server-only';
import { cookies } from 'next/headers';
import { prisma } from '@incept/db';
import type { DbDocsHomeEntryRecord } from '@incept/db/docs';
import type { AppLocale } from '@/i18n/config/locales';
import { DOCUMENT_LANGUAGE_COOKIE, isDocumentLanguage } from '@/features/docs/language/preference';

export async function getDocumentLanguage(interfaceLocale: AppLocale): Promise<AppLocale> {
  const value = (await cookies()).get(DOCUMENT_LANGUAGE_COOKIE)?.value;
  return isDocumentLanguage(value) ? value : interfaceLocale;
}

type Translation = { locale: string; slug: string };
const chooseTranslation = (translations: Translation[], preferred: AppLocale) =>
  translations.find(value => value.locale === preferred) ?? translations[0];

// Resolve the URL's identity first, then choose the published reading version.
export async function resolveArticleReadingRoute(interfaceLocale: AppLocale, slug: string, note = false) {
  const preferred = await getDocumentLanguage(interfaceLocale);
  for (const routeLocale of [interfaceLocale, interfaceLocale === 'zh' ? 'en' : 'zh'] as AppLocale[]) {
    const document = await prisma.docsDocument.findFirst({
      where: { isListed: true, kind: note ? 'note' : { not: 'note' }, collectionItem: { is: null },
        locales: { some: { locale: routeLocale, slug, status: 'published' } } },
      select: { locales: { where: { status: 'published', locale: { in: ['zh', 'en'] } }, select: { locale: true, slug: true } } },
    });
    if (document) {
      const translation = chooseTranslation(document.locales, preferred)!;
      return { locale: translation.locale as AppLocale, slug: translation.slug };
    }
  }
  return { locale: preferred, slug };
}

export async function resolveCollectionReadingRoute(interfaceLocale: AppLocale, collectionSlug: string, articleSlug: string) {
  const preferred = await getDocumentLanguage(interfaceLocale);
  for (const routeLocale of [interfaceLocale, interfaceLocale === 'zh' ? 'en' : 'zh'] as AppLocale[]) {
    const collection = await prisma.docsCollection.findFirst({
      where: { locales: { some: { locale: routeLocale, slug: collectionSlug, status: 'published' } },
        items: { some: { isActive: true, document: { locales: { some: { locale: routeLocale, slug: articleSlug, status: 'published' } } } } } },
      select: { locales: { where: { status: 'published' }, select: { locale: true, slug: true } },
        items: { where: { isActive: true, document: { locales: { some: { locale: routeLocale, slug: articleSlug, status: 'published' } } } },
          select: { document: { select: { locales: { where: { status: 'published' }, select: { locale: true, slug: true } } } } } } },
    });
    if (!collection) continue;
    const translations = collection.items[0]?.document?.locales ?? [];
    const language = [preferred, preferred === 'zh' ? 'en' : 'zh'].find(value =>
      collection.locales.some(item => item.locale === value) && translations.some(item => item.locale === value));
    if (language) return { locale: language as AppLocale,
      collectionSlug: collection.locales.find(item => item.locale === language)!.slug,
      articleSlug: translations.find(item => item.locale === language)!.slug };
  }
  return { locale: preferred, collectionSlug, articleSlug };
}

export async function preferredHomeEntries(interfaceLocale: AppLocale, load: (input: { locale: AppLocale }) => Promise<DbDocsHomeEntryRecord[]>) {
  const preferred = await getDocumentLanguage(interfaceLocale);
  const [primary, fallback] = await Promise.all([load({ locale: preferred }), load({ locale: preferred === 'zh' ? 'en' : 'zh' })]);
  const entries = new Map<string, DbDocsHomeEntryRecord>();
  for (const entry of [...primary, ...fallback]) {
    const key = entry.entryType === 'collection' ? `collection:${entry.collectionId}` : `document:${entry.documentId}`;
    if (!entries.has(key)) entries.set(key, entry);
  }
  return [...entries.values()];
}
