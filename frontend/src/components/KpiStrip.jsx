import Sparkline from './Sparkline'
import TrendPill from './TrendPill'
import { BRAND } from '../theme/brand'

/**
 * Row of KPI cards. `items`: [{ label, value, subtext?, accent?, tooltip?,
 * trend?, change? }].
 *  - `accent` (a hex color) draws a left border + light tint for numbers that
 *    need attention.
 *  - `tooltip` is a hover explanation.
 *  - `trend` (number[]) renders a sparkline under the value.
 *  - `change` ({ current, previous, goodWhen }) renders a ▲/▼ delta pill next
 *    to the value.
 *
 * `columns` sets the lg column count (default 5).
 */
export default function KpiStrip({ items, columns = 5 }) {
  const lg = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6' }[columns] ?? 'lg:grid-cols-5'
  return (
    <div className={`grid grid-cols-2 gap-4 md:grid-cols-3 ${lg}`}>
      {items.map((item) => (
        <div
          key={item.label}
          title={item.tooltip}
          className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          style={
            item.accent
              ? { borderLeftWidth: 3, borderLeftColor: item.accent, backgroundColor: `${item.accent}0a` }
              : undefined
          }
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-[#898781]">{item.label}</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-[#0b0b0b]">{item.value}</span>
            {item.change && (
              <TrendPill current={item.change.current} previous={item.change.previous} goodWhen={item.change.goodWhen} />
            )}
          </div>
          {item.subtext && <div className="mt-1 text-xs text-[#898781]">{item.subtext}</div>}
          {item.trend && item.trend.filter((n) => Number.isFinite(n)).length > 1 && (
            <div className="mt-2">
              <Sparkline data={item.trend} width={120} height={26} color={item.accent ?? BRAND.primary} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
