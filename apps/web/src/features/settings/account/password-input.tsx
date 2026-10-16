'use client';

import { useState, type ComponentProps } from 'react';

type PasswordInputProps = Omit<ComponentProps<'input'>, 'type'> & {
  language: 'zh' | 'en';
  passwordLabel?: string;
};

export function PasswordInput({ language, passwordLabel, className, onChange, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const label = passwordLabel ?? (language === 'zh' ? '密码' : 'password');
  return (
    <div className="relative min-w-0">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${className ?? ''} pr-12 [&::-ms-reveal]:hidden [&::-ms-clear]:hidden`}
        onChange={(event) => {
          if (!event.target.value) setVisible(false);
          onChange?.(event);
        }}
      />
      <button
        type="button"
        disabled={props.disabled}
        aria-label={language === 'zh' ? `${visible ? '隐藏' : '显示'}${label}` : `${visible ? 'Hide' : 'Show'} ${label}`}
        aria-pressed={visible}
        onClick={() => setVisible(current => !current)}
        className="absolute inset-y-0 right-1 my-auto flex size-9 items-center justify-center rounded-lg text-[var(--color-nav-muted)] transition-colors hover:bg-[var(--color-row-hover-bg)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#5ba4cf] disabled:opacity-50"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          {visible ? <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.8 5.2A10 10 0 0 1 12 5c6 0 10 7 10 7a18 18 0 0 1-3.2 3.9M6.2 6.2A19 19 0 0 0 2 12s4 7 10 7a10 10 0 0 0 5-1.4" /></> : <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>}
        </svg>
      </button>
    </div>
  );
}
