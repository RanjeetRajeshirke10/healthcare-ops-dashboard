import { HEALTH_STATUS_COLOR } from '../theme/chartColors'

const ICON = { green: '✓', yellow: '!', red: '✕' }

/**
 * Status pill for the Data Quality "data health" panel. Status color always
 * ships with an icon + label (never color alone), per the dataviz skill.
 */
export default function HealthIndicator({ status, label }) {
  const color = HEALTH_STATUS_COLOR[status] ?? HEALTH_STATUS_COLOR.yellow
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: `${color}1a`, color }}
    >
      <span aria-hidden="true">{ICON[status] ?? '!'}</span>
      {label}
    </span>
  )
}
