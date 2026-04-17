interface ScoreDialProps {
  value: number
  size?: number
  className?: string
}

export function ScoreDial({ value, size = 52, className = '' }: ScoreDialProps) {
  const pct = Math.max(0, Math.min(1, value))
  const color = pct >= 0.8 ? 'var(--color-green)' : pct >= 0.5 ? 'var(--color-orange)' : 'var(--color-destructive)'
  const r = size / 2 - 3
  const c = size / 2
  const circ = 2 * Math.PI * r
  const dash = circ * pct

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--color-muted)" strokeWidth={4} />
        <circle
          cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          style={{ transition: 'stroke-dasharray 0.4s' }}
        />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center font-bold tabular-nums"
        style={{ fontSize: size * 0.22 }}
      >
        {Math.round(pct * 100)}
      </div>
    </div>
  )
}
