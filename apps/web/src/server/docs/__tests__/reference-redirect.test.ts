import { beforeEach, expect, it, vi } from 'vitest';
const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ redirect }));
import DocsReferencePage from '@/app/[locale]/docs/reference/page';
beforeEach(() => vi.clearAllMocks());
it.each(['en', 'zh'] as const)('redirects the retired %s reference sample to its localized docs list', async locale => {
  await DocsReferencePage({ params: Promise.resolve({ locale }) });
  expect(redirect).toHaveBeenCalledExactlyOnceWith(`/${locale}/docs`);
});
