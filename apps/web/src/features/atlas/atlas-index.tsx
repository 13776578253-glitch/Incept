'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';
import { AtlasHub } from './components/atlas-hub';
import { atlasEntries, type AtlasCardModel } from './atlas-registry';

// 图谱总览：每张卡片进入 /atlas/<key>
export function AtlasIndexFeature() {
  const t = useTranslations('atlas');
  const locale = useLocale() as AppLocale;

  const items: AtlasCardModel[] = atlasEntries.map((entry) => ({
    key: entry.key,
    label: t(entry.labelKey),
    description: t(entry.descriptionKey),
    note: t(entry.noteKey),
    href: withLocalePath(locale, entry.path),
  }));

  return (
    <AtlasHub
      items={items}
      eyebrow={t('intro.eyebrow')}
      title={t('intro.title')}
      description={t('intro.description')}
      note={{
        title: t('note.title'),
        description: t('note.description'),
      }}
    />
  );
}
