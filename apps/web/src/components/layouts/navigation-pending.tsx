'use client';

import { useLinkStatus } from 'next/link';
import { useTranslations } from 'next-intl';

export function NavigationPending() {
  const { pending } = useLinkStatus();
  const t = useTranslations('navigation');

  return (
    <>
      <span
        aria-hidden="true"
        className="navigation-pending"
        data-navigation-pending={pending ? 'true' : undefined}
      />
      <span role="status" aria-live="polite" className="sr-only">
        {pending ? t('loading') : ''}
      </span>
    </>
  );
}
