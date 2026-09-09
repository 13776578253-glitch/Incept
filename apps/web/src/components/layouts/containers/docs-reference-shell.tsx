import type { CSSProperties, ReactNode } from 'react';
import type { DocsLayoutMode } from '@/features/docs/shared/types';

type DocsReferenceShellProps = {
  layoutMode: DocsLayoutMode;
  className?: string;
  style?: CSSProperties;
  sidebar?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
};

// 文档参考页面的布局容器组件，根据不同的布局模式展示侧边栏、内容区和辅助信息
export function DocsReferenceShell({
  layoutMode,
  className,
  style,
  sidebar,
  aside,
  children,
}: DocsReferenceShellProps) {
  return (
    <section
      className={`page-shell page-shell-docs-reference page-shell-docs-reference--${layoutMode} ${className ?? ''}`.trim()}
      data-layout-mode={layoutMode}
      style={style}
    >
      <aside className="page-shell-docs-reference-sidebar">{sidebar}</aside>
      <div className="page-shell-docs-reference-content">{children}</div>
      <aside className="page-shell-docs-reference-aside">{aside}</aside>
    </section>
  );
}
