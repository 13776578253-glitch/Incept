import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationLink } from '@/components/layouts/navigation-link';

const state = vi.hoisted(() => ({ pending: false }));

vi.mock('next/link', () => ({
  default: ({ children, href, className, ...props }: {
    children: ReactNode;
    href: string;
    className: string;
  }) => <a href={href} className={className} {...props}>{children}</a>,
  useLinkStatus: () => ({ pending: state.pending }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => () => 'Loading page…',
}));

describe('NavigationLink', () => {
  beforeEach(() => {
    state.pending = false;
  });

  it('keeps the link destination and exposes feedback while navigation is pending', () => {
    const { container, rerender } = render(
      <NavigationLink href="/en/docs" aria-current="page" className="existing-style">
        Docs
      </NavigationLink>,
    );

    const link = screen.getByRole('link', { name: 'Docs' });
    expect(link.getAttribute('href')).toBe('/en/docs');
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(link.className).toContain('existing-style');
    expect(container.querySelector('[data-navigation-pending="true"]')).toBeNull();

    state.pending = true;
    rerender(
      <NavigationLink href="/en/docs" aria-current="page" className="existing-style">
        Docs
      </NavigationLink>,
    );
    expect(container.querySelector('[data-navigation-pending="true"]')).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Loading page…');

    state.pending = false;
    rerender(<NavigationLink href="/en/docs">Docs</NavigationLink>);
    expect(container.querySelector('[data-navigation-pending="true"]')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
  });
});
