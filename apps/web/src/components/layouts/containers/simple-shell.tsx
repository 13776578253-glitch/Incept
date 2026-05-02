import type { ReactNode } from 'react';

type SimpleShellProps = {
  children: ReactNode;
};

export function SimpleShell({ children }: SimpleShellProps) {
  return <section className="page-shell page-shell-simple">{children}</section>;
}
