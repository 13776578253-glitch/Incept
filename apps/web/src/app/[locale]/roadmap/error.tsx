'use client';

import { RoadmapError } from '@incept/roadmap/react';
import { useTranslations } from 'next-intl';

export default function RoadmapMapError() {
  const t = useTranslations('roadmap');

  return <RoadmapError title={t('error.title')} description={t('error.description')} />;
}
