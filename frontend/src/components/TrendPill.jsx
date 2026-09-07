import { STATUS, CHROME } from '../theme/chartColors'

/**
 * Period-over-period delta badge: "▲ 4.2%" / "▼ 1.1%", coloured by whether
 * the move is good. `goodWhen` says which direction is favourable.
 */
export default function TrendPill({ current, previous, goodWhen = 'up', label = 'vs prior period' }) {
  const a = Number(current)
  const b = Number(previous)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null

  const pctChange = ((a - b) / Math.abs(b)) * 100
  if (Math.abs(pctChange) < 0.1) {
    return <span className="text-[11px] font-medium" style={{ color: CHROME.muted }}>flat</span>
  }

  const up = a > b
  const good = goodWhen === 'up' ? up : !up
  const color = good ? STATUS.good : STATUS.serious

  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums" style={{ color }} title={label}>
      {up ? '▲' : '▼'} {Math.abs(pctChange).toFixed(1)}%
    </span>
  )
}
