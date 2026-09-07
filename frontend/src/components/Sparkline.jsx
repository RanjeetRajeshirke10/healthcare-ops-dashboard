import { BRAND } from '../theme/brand'

/**
 * Tiny inline trend line for KPI cards and table cells — pure SVG, no
 * Recharts. Stretches to the given width; the last point gets a dot.
 */
export default function Sparkline({ data, width = 104, height = 30, color = BRAND.primary, fill = true, strokeWidth = 1.5 }) {
  const nums = (data ?? []).map(Number).filter((n) => Number.isFinite(n))
  if (nums.length < 2) return <svg width={width} height={height} aria-hidden="true" />

  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1
  const stepX = width / (nums.length - 1)
  const pts = nums.map((n, i) => [i * stepX, height - 1 - ((n - min) / span) * (height - 2)])
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const gid = `spark-${String(color).replace(/[^a-z0-9]/gi, '')}`
  const [lx, ly] = pts[pts.length - 1]

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {fill && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.16" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${gid})`} />
        </>
      )}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="1.8" fill={color} />
    </svg>
  )
}
