import type { ReactNode } from 'react';
import type { MockDocsLayoutMode } from '@/lib/mock/shared/mock-types';

type DocsReferenceShellProps = {
  layoutMode: MockDocsLayoutMode;
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
