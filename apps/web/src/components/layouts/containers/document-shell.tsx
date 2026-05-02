import type { ReactNode } from 'react';

type DocumentShellProps = {
  sidebar: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
};

export function DocumentShell({
  sidebar,
  children,
  aside,
}: DocumentShellProps) {
  return (
    <section className="page-shell page-shell-document">
      <aside className="page-shell-sidebar">{sidebar}</aside>
      <div className="page-shell-content">{children}</div>
      <aside className="page-shell-aside">{aside}</aside>
    </section>
  );
}
