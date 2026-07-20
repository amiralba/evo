/**
 * EVO brand mark — a rounded badge with a stylized route (two stops joined by a path).
 * Self-contained inline SVG (the app CSP forbids external images). The badge carries its own
 * gradient, so it reads on both light and dark surfaces; pair it with a text wordmark set by
 * the parent. `size` is the badge edge in px.
 */
export function EvoLogo({ size = 40 }: { size?: number }) {
  // Unique gradient id so multiple marks on one page don't collide.
  const id = `evo-mark-${size}`
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#378ADD" />
          <stop offset="1" stopColor="#1D9E75" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${id})`} />
      <path
        d="M12 28c5.5 0 4-9 9-9s3.5-7 7-7"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeDasharray="0.1 4.2"
        opacity="0.85"
      />
      <circle cx="12" cy="28" r="3.4" fill="#fff" />
      <circle cx="28" cy="12" r="3.4" fill="#fff" />
    </svg>
  )
}
