'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

type DocsImportSuccessToastProps = {
  visible: boolean;
};

// 导入成功提示，显示在正式文章页中，并在短暂停留后自动收起与清理 URL 参数
export function DocsImportSuccessToast({
  visible,
}: DocsImportSuccessToastProps) {
  const [isVisible, setIsVisible] = useState(visible);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('docs.importFeedback');

  useEffect(() => {
    setIsVisible(visible);
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsVisible(false);
      const nextSearchParams = new URLSearchParams(searchParams.toString());
      nextSearchParams.delete('imported');
      const nextQuery = nextSearchParams.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    }, 4200);

    return () => window.clearTimeout(timeout);
  }, [pathname, router, searchParams, visible]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-5 top-[calc(var(--navbar-height)+1rem)] z-40 w-[min(28rem,calc(100vw-2.5rem))]">
      <div className="pointer-events-auto rounded-[0.8rem] border border-emerald-200/70 bg-white/96 px-4 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur dark:border-emerald-500/20 dark:bg-[#101713]/96 dark:shadow-none">
        <p className="text-[0.74rem] font-medium uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
          {t('eyebrow')}
        </p>
        <p className="mt-2 text-[0.96rem] font-medium text-[var(--color-text)]">
          {t('title')}
        </p>
        <p className="mt-1 text-[0.9rem] leading-7 text-[var(--color-text-soft)]">
          {t('description')}
        </p>
      </div>
    </div>
  );
}
