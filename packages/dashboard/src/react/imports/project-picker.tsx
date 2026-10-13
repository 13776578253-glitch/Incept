import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

type Option = { value: string; label: string };

export function ProjectPicker({ value, options, label, searchLabel, emptyLabel, disabled, onChange }: {
  value: string; options: Option[]; label: string; searchLabel: string; emptyLabel: string;
  disabled: boolean; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null), listId = useId();
  const filtered = options.filter(option => !option.value || option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const close = () => { setOpen(false); setQuery(''); trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!open || disabled || !menu.current || !trigger.current) return;
    const panel = menu.current;
    const position = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const width = Math.min(rect.width, window.innerWidth - 16);
      panel.style.width = `${width}px`;
      panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
      const height = panel.offsetHeight || 230;
      const below = window.innerHeight - rect.bottom - 8;
      panel.style.top = `${below >= height || below >= rect.top - 8 ? rect.bottom + 6 : Math.max(8, rect.top - height - 6)}px`;
      panel.style.maxHeight = `${Math.max(0, below >= height || below >= rect.top - 8 ? below - 6 : rect.top - 14)}px`;
    };
    position();
    // The browser top layer escapes both the project scroller and modal clipping
    panel.showPopover?.();
    position();
    search.current?.focus();
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
      panel.hidePopover?.();
    };
  }, [open, disabled]);
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div ref={root} className="min-w-0" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) { setOpen(false); setQuery(''); }
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.target === search.current && (event.key === 'Home' || event.key === 'End')) return;
    if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
      if (!items.length) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : event.key === 'ArrowDown' ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
      items[next]?.focus();
    }
  }}>
    <button ref={trigger} type="button" role="combobox" aria-label={label} aria-haspopup="listbox"
      aria-expanded={open} aria-controls={open ? listId : undefined} disabled={disabled}
      onClick={() => { setQuery(''); setOpen(!open); }} onKeyDown={event => {
        if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); setOpen(true); }
      }} className="dashboard-project-picker-trigger">
      <span className="min-w-0 truncate">{options.find(option => option.value === value)?.label ?? options[0]?.label}</span>
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
    </button>
    {open && !disabled ? <div ref={menu} popover="manual" className="dashboard-project-picker-menu">
      <input ref={search} aria-label={searchLabel} placeholder={searchLabel} value={query}
        onChange={event => setQuery(event.target.value)} className="dashboard-project-picker-search" />
      <div id={listId} role="listbox" aria-label={label} className="dashboard-project-picker-list dashboard-subtle-scrollbar">
        {filtered.map(option => <button key={option.value} type="button" role="option" aria-selected={option.value === value}
          title={option.label} onClick={() => { onChange(option.value); close(); }} className="dashboard-project-picker-option">
          <span className="min-w-0 truncate">{option.label}</span><span aria-hidden="true">{option.value === value ? '✓' : ''}</span>
        </button>)}
        {filtered.length === 1 && query.trim() ? <p className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{emptyLabel}</p> : null}
      </div>
    </div> : null}
  </div>;
}
