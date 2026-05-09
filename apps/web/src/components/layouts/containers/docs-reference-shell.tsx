import type { ReactNode } from 'react';
import type { DocsLayoutMode } from '@/features/docs/shared/types';

type DocsReferenceShellProps = {
  layoutMode: DocsLayoutMode;
  sidebar?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
};

export function DocsReferenceShell({
  layoutMode,
  sidebar,
  aside,
  children,
}: DocsReferenceShellProps) {
  return (
    <section
      className="page-shell page-shell-docs-reference"
      data-layout-mode={layoutMode}
    >
      <aside className="page-shell-docs-reference-sidebar">{sidebar}</aside>
      <div className="page-shell-docs-reference-content">{children}</div>
      <aside className="page-shell-docs-reference-aside">{aside}</aside>
    </section>
  );
}
