'use client';

import { useState } from 'react';
import type { DocsCodeBlockModel } from '@/features/docs/block-system';

// 代码块组件，根据提供的代码内容、编程语言、可选的标题和变体（如紧凑或块状）渲染格式化的代码展示，适用于文档中的代码示例和技术说明
export function DocsCodeBlock({
  code,
  language: _language,
  caption: _caption,
  variant = 'block',
}: DocsCodeBlockModel) {
  const [copied, setCopied] = useState(false);

  // 代码块外框样式
  const frameClassName =
    variant === 'compact'
      ? 'group relative overflow-hidden rounded-[6px] border border-[#ececec] bg-[#fcfcfc] shadow-none dark:border-transparent dark:bg-[#1f1f1f]'
      : 'group relative overflow-hidden rounded-[7px] border border-[#ececec] bg-[#fcfcfc] shadow-none dark:border-transparent dark:bg-[#1f1f1f]';
  
  // 代码块工具栏样式
  const toolbarClassName =
    variant === 'compact'
      ? 'pointer-events-none absolute right-2 top-2 z-10 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'
      : 'pointer-events-none absolute right-2 top-2 z-10 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100';
  
  // 代码块内容样式
  const contentClassName =
    variant === 'compact'
      ? 'overflow-x-auto pl-10 pr-[4.75rem] pb-10 pt-10 text-[0.81rem] leading-[1.45rem] text-[var(--color-text)]'
      : 'overflow-x-auto pl-[2.5rem] pr-[5rem] pb-11 pt-11 text-[0.86rem] leading-[1.6rem] text-[var(--color-text)]';

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
    <figure className={frameClassName}>
      <div className={toolbarClassName}>
        {/* <span className="text-[0.68rem] leading-4 text-[var(--color-text-soft)]">
          {language}
        </span> */}
        {/* <span
          className="h-3 w-px bg-[color:color-mix(in_srgb,var(--color-text)_10%,transparent)]"
          aria-hidden="true"
        /> */}
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex size-8 items-center justify-center rounded-[4px] border border-transparent bg-transparent text-[#9a9a9a] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-text)_14%,transparent)] hover:bg-[#f6f6f6] hover:text-[#333333] dark:text-[var(--color-text-soft)] dark:hover:bg-[color:color-mix(in_srgb,var(--color-bg)_72%,var(--color-text)_28%)] dark:hover:text-[var(--color-text)]"
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
        <pre className={`${contentClassName} docs-code-scrollbar`}>
          <span className="inline-flex min-w-full items-stretch">
            <code className="block min-w-full whitespace-pre font-mono font-medium tracking-[0.005em]">
              {code}
            </code>
            <span aria-hidden="true" className="shrink-0 basis-10" />
          </span>
        </pre>
        <div className="pointer-events-none absolute left-0 top-0 h-[calc(100%-8px)] w-7 bg-[#fcfcfc] dark:bg-[#1f1f1f]" />
        <div className="pointer-events-none absolute right-0 top-0 h-[calc(100%-8px)] w-7 bg-[#fcfcfc] dark:bg-[#1f1f1f]" />
      </div>
    </figure>
  );
}
