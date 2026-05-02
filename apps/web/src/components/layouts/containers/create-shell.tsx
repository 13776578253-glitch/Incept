import type { ReactNode } from 'react';

type CreateShellProps = {
  children: ReactNode;
};

export function CreateShell({ children }: CreateShellProps) {
  return <section className="page-shell page-shell-create">{children}</section>;
}
