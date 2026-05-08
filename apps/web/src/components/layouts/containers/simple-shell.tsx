import type { ReactNode } from 'react';

type SimpleShellProps = {
  children: ReactNode;
};

// 页面容器组件，提供基础的布局结构和样式，适用于文档相关的页面
export function SimpleShell({ children }: SimpleShellProps) {
  return <section className="page-shell page-shell-simple">{children}</section>;
}
