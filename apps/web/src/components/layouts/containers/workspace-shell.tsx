import type { ReactNode } from 'react';

type WorkspaceShellProps = {
  children: ReactNode;
};

export function WorkspaceShell({ children }: WorkspaceShellProps) {
  return (
    <section className="page-shell page-shell-workspace">{children}</section>
  );
}
