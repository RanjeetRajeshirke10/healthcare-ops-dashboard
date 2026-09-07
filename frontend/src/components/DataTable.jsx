import { BRAND } from '../theme/brand'

/**
 * Generic table. columns: [{ key, label, format?(value, row), title?, align?,
 * dataBar? }].
 *  - `align: 'right'` right-aligns the header + cells (use for numeric columns).
 *  - `dataBar: true` draws a faint proportional bar behind the cell value,
 *    scaled to the column's max numeric value (override with `dataBarMax`).
 *
 * `onRowClick(row)` makes rows a click-to-filter control; `isRowActive(row)`
 * highlights the active row. `maxHeight` constrains the body to an internal
 * scroll area with a sticky header. `rowClickHint` overrides the row title.
 */
export default function DataTable({ columns, rows, onRowClick, isRowActive, maxHeight, rowClickHint = 'Click to filter to this row' }) {
  const barMax = {}
  for (const col of columns) {
    if (col.dataBar) {
      barMax[col.key] =
        col.dataBarMax ?? Math.max(1, ...rows.map((r) => Number(r[col.key])).filter(Number.isFinite))
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50" style={maxHeight ? { position: 'sticky', top: 0, zIndex: 1 } : undefined}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  title={col.title}
                  className={`whitespace-nowrap bg-slate-50 px-4 py-3 font-medium text-[#52514e] ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const active = isRowActive?.(row)
              return (
                <tr
                  key={row.id ?? i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  title={onRowClick ? rowClickHint : undefined}
                  className={`border-b border-slate-100 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                  style={active ? { backgroundColor: BRAND.primaryTint } : undefined}
                >
                  {columns.map((col) => {
                    const raw = row[col.key]
                    const content = col.format ? col.format(raw, row) : raw
                    const pct =
                      col.dataBar && Number.isFinite(Number(raw))
                        ? Math.max(0, Math.min(100, (Number(raw) / barMax[col.key]) * 100))
                        : null
                    return (
                      <td
                        key={col.key}
                        className={`relative whitespace-nowrap px-4 py-3 text-[#0b0b0b] [font-variant-numeric:tabular-nums] ${col.align === 'right' ? 'text-right' : ''}`}
                      >
                        {pct != null && (
                          <span
                            className="pointer-events-none absolute inset-y-1.5 left-2 rounded-sm"
                            style={{ width: `calc(${pct}% - 8px)`, backgroundColor: `${BRAND.primary}1f` }}
                            aria-hidden="true"
                          />
                        )}
                        <span className="relative">{content}</span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
