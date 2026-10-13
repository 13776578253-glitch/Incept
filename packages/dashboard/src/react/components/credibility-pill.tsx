'use client';



export function CredibilityPill({
  label,
  tone,
}: {
  label: string;
  tone: 'sky' | 'indigo' | 'emerald' | 'rose';
}) {
  const styles = {
    sky: {
      bg: 'var(--badge-sky-bg)',
      border: 'var(--badge-sky-border)',
      fg: 'var(--badge-sky-fg)',
    },
    indigo: {
      bg: 'var(--badge-indigo-bg)',
      border: 'var(--badge-indigo-border)',
      fg: 'var(--badge-indigo-fg)',
    },
    emerald: {
      bg: 'var(--badge-emerald-bg)',
      border: 'var(--badge-emerald-border)',
      fg: 'var(--badge-emerald-fg)',
    },
    rose: {
      bg: 'var(--badge-rose-bg)',
      border: 'var(--badge-rose-border)',
      fg: 'var(--badge-rose-fg)',
    },
  }[tone];

  return (
    <span
      className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.64rem] font-medium leading-none"
      style={{
        backgroundColor: styles.bg,
        borderColor: styles.border,
        color: styles.fg,
      }}
    >
      {label}
    </span>
  );
}
