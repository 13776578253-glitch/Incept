import type { ReactNode } from 'react';
import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';
import { AtlasPlaceholder } from './components/atlas-placeholder';

export type AtlasPlaceholderScreenProps = {
  locale: AppLocale;
  t: (key: string) => string;
  title: string;
  // 该图谱完成后要放的内容，目前不传
  children?: ReactNode;
};

// 3 个子图谱路由共用的占位接线。
// 某个图谱真正实现时，替换它自己的 page.tsx 即可，其余两个不受影响。
export function AtlasPlaceholderScreen({
  locale,
  t,
  title,
  children,
}: AtlasPlaceholderScreenProps) {
  return (
    <AtlasPlaceholder
      eyebrow={t('placeholder.eyebrow')}
      title={title}
      description={t('placeholder.description')}
      backLabel={t('placeholder.back')}
      backHref={withLocalePath(locale, '/atlas')}
    >
      {children}
    </AtlasPlaceholder>
  );
}
