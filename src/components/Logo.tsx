/** The Chapter mark: an open book whose right page is a rising bar. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path d="M8 10.5c2.6-.9 5.2-.6 7.3.9v11.3c-2.1-1.4-4.7-1.7-7.3-.9V10.5Z" fill="#fff" opacity="0.92" />
      <path d="M16.7 11.4c2.1-1.5 4.7-1.8 7.3-.9v11.3c-2.6-.8-5.2-.5-7.3.9V11.4Z" fill="#fff" opacity="0.55" />
      <path d="M19 19.5l2-2.5 1.8 1.4" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ size = 28, showText = true }: { size?: number; showText?: boolean }) {
  return (
    <span className="row-sm" style={{ gap: 10 }}>
      <LogoMark size={size} />
      {showText && (
        <span className="serif" style={{ fontSize: size * 0.9, lineHeight: 1, letterSpacing: '-0.01em' }}>
          Chapter
        </span>
      )}
    </span>
  );
}
