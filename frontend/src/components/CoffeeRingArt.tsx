interface Props {
  className?: string
  size?: number
}

/**
 * Spilled coffee ring art.
 */
export function CoffeeRingArt({ className = '', size = 120 }: Props) {
  return (
    <div
      className={`coffee-ring-art ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
      title="Spilled Coffee Art"
    >
      <svg
        viewBox="0 0 160 160"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="coffee-ring-svg"
      >
        {/* Outer irregular coffee ring */}
        <circle
          cx="80"
          cy="80"
          r="66"
          stroke="var(--accent)"
          strokeWidth="3.5"
          strokeDasharray="18 4 36 6 12 3 50 8"
          opacity="0.25"
        />
        {/* Inner secondary seep ring */}
        <circle
          cx="82"
          cy="78"
          r="58"
          stroke="var(--accent)"
          strokeWidth="1.8"
          strokeDasharray="8 6 24 8 32 4"
          opacity="0.18"
        />
        {/* Wet pooling rim */}
        <path
          d="M 120,40 C 145,65 148,110 120,135 C 95,150 50,140 32,115"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.28"
        />
        {/* Coffee splatter droplets */}
        <circle cx="146" cy="48" r="3" fill="var(--accent)" opacity="0.32" />
        <circle cx="154" cy="58" r="1.5" fill="var(--accent)" opacity="0.25" />
        <circle cx="24" cy="132" r="2.5" fill="var(--accent)" opacity="0.3" />
        <circle cx="18" cy="122" r="1.5" fill="var(--accent)" opacity="0.2" />
        <circle cx="98" cy="154" r="2" fill="var(--accent)" opacity="0.25" />
      </svg>
    </div>
  )
}
