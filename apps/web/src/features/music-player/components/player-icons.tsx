type PlayerIconProps = {
  className?: string;
};

export function PlayerPlayIcon({ className }: PlayerIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className} fill="currentColor">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

export function PlayerPauseIcon({ className }: PlayerIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className} fill="currentColor">
      <path d="M7 4.5h3.2v15H7zM13.8 4.5H17v15h-3.2z" />
    </svg>
  );
}

export function PlayerChevronIcon({ className }: PlayerIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function PlayerCloseIcon({ className }: PlayerIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function PlayerPreviousIcon({ className }: PlayerIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className} fill="currentColor">
      <path d="M7 5h2v14H7zM19 5.6v12.8a1 1 0 0 1-1.55.83l-9.1-6.4a1 1 0 0 1 0-1.66l9.1-6.4A1 1 0 0 1 19 5.6Z" />
    </svg>
  );
}

export function PlayerNextIcon({ className }: PlayerIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className} fill="currentColor">
      <path d="M15 5h2v14h-2zM5 5.6v12.8a1 1 0 0 0 1.55.83l9.1-6.4a1 1 0 0 0 0-1.66l-9.1-6.4A1 1 0 0 0 5 5.6Z" />
    </svg>
  );
}

export function PlayerRepeatIcon({ className }: PlayerIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12a6 6 0 0 1 6-6h10" />
      <path d="m17 3 3 3-3 3" />
      <path d="M20 12a6 6 0 0 1-6 6H4" />
      <path d="m7 21-3-3 3-3" />
    </svg>
  );
}
