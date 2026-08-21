/**
 * The wordmark's mark: three ruler ticks, one long and two short.
 *
 * It is the only decorative graphic in the product, and it is brass rather than a
 * score colour on purpose. Red, amber and green mean something here.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 18 18"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="var(--brass)"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M1.6 13.4h14.8" />
      <path d="M4.5 13.4V9.6" />
      <path d="M9 13.4V4.6" />
      <path d="M13.5 13.4V9.6" />
    </svg>
  );
}
