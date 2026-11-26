'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';
import type { DocsCodeBlockModel } from '@/features/docs/block-system';

// 代码块组件，根据提供的代码内容、编程语言、可选的标题和变体（如紧凑或块状）渲染格式化的代码展示，适用于文档中的代码示例和技术说明
export function DocsCodeBlock({
  code,
  language,
  variant = 'block',
  children,
  highlightStyle,
}: DocsCodeBlockModel & {
  children: ReactNode;
  highlightStyle?: Record<string, string>;
}) {
  const [copied, setCopied] = useState(false);

  // 代码块外框样式
  const frameClassName =
    variant === 'compact'
      ? 'docs-code-block group relative overflow-hidden rounded-[8px] border shadow-none'
      : 'docs-code-block group relative overflow-hidden rounded-[10px] border shadow-none';

  // 代码块工具栏样式：桌面悬停/聚焦显现，触屏常驻轻微可见便于复制
  const toolbarClassName =
    'absolute right-2 top-2 z-10 flex items-center gap-1 opacity-75 transition-opacity duration-200 [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100';

  // 代码块内容样式
  const contentClassName =
    variant === 'compact'
      ? 'docs-code-scrollbar overflow-x-auto px-4 py-3.5 pr-14 text-[0.81rem] leading-[1.45rem] md:px-5 md:py-5 md:pr-16'
      : 'docs-code-scrollbar overflow-x-auto px-4 py-4 pr-14 text-[0.85rem] leading-[1.6rem] md:px-6 md:py-6 md:pr-20';

  // 处理复制代码的功能，使用 Clipboard API 将代码内容复制到剪贴板，并提供用户反馈（如按钮文本变化和短暂的状态显示）
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <figure className={frameClassName} style={highlightStyle as CSSProperties | undefined}>
      <span
        aria-hidden="true"
        className="docs-code-accent-decor pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-[2px] opacity-50 transition-opacity duration-200 group-hover:opacity-80 group-focus-within:opacity-80"
        style={{ backgroundColor: 'var(--docs-code-accent)' }}
      />
      <div className={toolbarClassName}>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="docs-code-accent-decor size-1.5 shrink-0 rounded-full opacity-75"
            style={{ backgroundColor: 'var(--docs-code-accent)' }}
          />
          <span className="docs-code-language text-[0.68rem] leading-4">
            {language}
          </span>
        </span>
        <span
          className="docs-code-toolbar-divider h-3 w-px"
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={handleCopy}
          style={copied ? { color: 'var(--docs-code-accent)' } : undefined}
          className={`inline-flex size-8 cursor-pointer items-center justify-center rounded-[6px] border border-transparent bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--docs-code-accent)] hover:bg-[var(--docs-code-toolbar-hover)] hover:text-[var(--docs-code-toolbar-hover-text)] ${
            copied ? '' : 'text-[var(--docs-code-toolbar-text)]'
          }`}
          aria-label={copied ? 'Copied code' : 'Copy code'}
          title={copied ? 'Copied' : 'Copy'}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {copied ? (
              <path d="M4.5 10.5 8 14l7.5-8" />
            ) : (
              <>
                <rect x="7" y="7" width="9" height="9" rx="2" />
                <path d="M4 13.5V6a2 2 0 0 1 2-2h7.5" />
              </>
            )}
          </svg>
        </button>
      </div>
      <div className="relative">
        <pre className={contentClassName}>
          <span className="inline-flex min-w-full items-stretch">
            {children}
            <span aria-hidden="true" className="shrink-0 basis-10" />
          </span>
        </pre>
      </div>
    </figure>
  );
}
