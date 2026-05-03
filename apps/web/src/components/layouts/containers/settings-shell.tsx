import type { ReactNode } from 'react';

type SettingsShellProps = {
  sidebar: ReactNode;
  children: ReactNode;
};

export function SettingsShell({ sidebar, children }: SettingsShellProps) {
  return (
    <section className="page-shell page-shell-settings">
      <aside className="page-shell-settings-sidebar">
        {sidebar}
      </aside>
      <div className="page-shell-settings-content">{children}</div>
    </section>
  );
}
