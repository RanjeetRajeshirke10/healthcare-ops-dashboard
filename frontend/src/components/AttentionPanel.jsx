import { STATUS } from '../theme/chartColors'
import { BRAND } from '../theme/brand'

const SEVERITY = {
  critical: STATUS.critical,
  warning: STATUS.warning,
  info: BRAND.primary,
  good: STATUS.good,
}

/**
 * Prioritised exception list — the "what needs a human" panel. Each item is
 * `{ severity: 'critical'|'warning'|'info'|'good', title, metric?, detail? }`.
 * Items should be passed already sorted worst-first.
 */
export default function AttentionPanel({ items, title = 'Needs attention' }) {
  if (!items?.length) return null

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#0b0b0b]">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS.warning }} />
        {title}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-[#52514e]">{items.length}</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {items.map((it, i) => {
          const color = SEVERITY[it.severity] ?? SEVERITY.info
          return (
            <li key={i} className="flex items-start gap-3 py-2.5 first:pt-1 last:pb-0.5">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-[#0b0b0b]">{it.title}</span>
                  {it.metric != null && (
                    <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color }}>
                      {it.metric}
                    </span>
                  )}
                </div>
                {it.detail && <p className="mt-0.5 text-xs leading-snug text-[#52514e]">{it.detail}</p>}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
