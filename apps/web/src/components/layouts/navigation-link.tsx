import type { ComponentProps } from 'react';
import Link from 'next/link';
import { NavigationPending } from './navigation-pending';

export function NavigationLink({ children, className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props} className={`navigation-link ${className ?? ''}`}>
      {children}
      <NavigationPending />
    </Link>
  );
}
