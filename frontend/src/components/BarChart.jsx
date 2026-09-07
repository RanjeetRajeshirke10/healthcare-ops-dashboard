import {
  Bar,
  BarChart as ReBarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CHROME, STATUS, ENTITY_PALETTE } from '../theme/chartColors'
import { BRAND } from '../theme/brand'

/**
 * Generic bar chart over nominal categories (offices, subspecialties,
 * lead-time buckets). Per the dataviz skill: one series -> one color for
 * every bar (never a per-bar rainbow on nominal categories), hairline
 * recessive gridlines. Bar thickness scales with how many categories there
 * are rather than one fixed cap.
 *
 * Modes:
 *  - default: single series driven by `yKey`, with click-to-filter Cells.
 *  - `series={[{ key, name, color }]}`: grouped bars, one per series, with a
 *    multi-item legend (click-to-filter is off in this mode).
 *
 * Pass `horizontal` to lay bars out left-to-right with the category axis on
 * the left edge. Pass `referenceValue` (+ optional `referenceLabel`) to draw
 * a dashed target line on the value axis.
 *
 * The category-axis title renders as plain HTML below the chart so it never
 * collides with the Legend or tick labels. `onBarClick(label)` makes the
 * chart a click-to-filter control; `renderTooltip` is a Recharts custom
 * tooltip content function.
 */
export default function BarChart({
  data,
  xKey = 'label',
  yKey = 'value',
  series,
  seriesName = 'Value',
  color = BRAND.primary,
  activeColor = BRAND.primaryHover,
  activeLabel,
  multicolor = false,
  height = 280,
  horizontal = false,
  xAxisLabel,
  yAxisLabel,
  valueFormatter,
  yAxisFormatter,
  referenceValue,
  referenceLabel,
  renderTooltip,
  onBarClick,
}) {
  const multi = Array.isArray(series) && series.length > 0
  const crowded = data.length > 6
  const baseSize = data.length <= 3 ? 90 : data.length <= 6 ? 64 : data.length <= 10 ? 40 : 24
  const barSize = multi ? Math.min(baseSize, 34) : baseSize

  // The value-axis title rendered as an HTML caption under the chart. When
  // horizontal, the value axis is the bottom one, so fall back to yAxisLabel —
  // but skip it when it would just echo the Legend's series name.
  const rawCaption = horizontal ? yAxisLabel ?? xAxisLabel : xAxisLabel
  const captionLabel = rawCaption === seriesName ? undefined : rawCaption

  const categoryAxisWidth = Math.min(
    170,
    Math.max(70, ...data.map((d) => String(d[xKey]).length * 7 + 12)),
  )

  const legendItems = [
    ...(multi
      ? series.map((s) => ({ label: s.name, color: s.color }))
      : multicolor
        ? []
        : [{ label: seriesName, color }]),
    ...(referenceValue != null && referenceLabel ? [{ label: referenceLabel, color: STATUS.warning, dashed: true }] : []),
  ]

  return (
    <div>
      {!horizontal && yAxisLabel && (
        <div className="mb-0.5 text-[11px] font-medium" style={{ color: CHROME.textSecondary }}>{yAxisLabel}</div>
      )}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ReBarChart
            data={data}
            layout={horizontal ? 'vertical' : 'horizontal'}
            margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
          >
            <CartesianGrid
              strokeDasharray="0"
              stroke={CHROME.gridline}
              vertical={horizontal}
              horizontal={!horizontal}
            />
            {horizontal ? (
              <>
                <XAxis
                  type="number"
                  tick={{ fontSize: 12, fill: CHROME.muted }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={yAxisFormatter}
                />
                <YAxis
                  type="category"
                  dataKey={xKey}
                  tick={{ fontSize: 12, fill: CHROME.muted }}
                  axisLine={{ stroke: CHROME.baseline }}
                  tickLine={false}
                  interval={0}
                  width={categoryAxisWidth}
                />
              </>
            ) : (
              <>
                <XAxis
                  dataKey={xKey}
                  tick={{ fontSize: 12, fill: CHROME.muted }}
                  axisLine={{ stroke: CHROME.baseline }}
                  tickLine={false}
                  interval={0}
                  angle={crowded ? -30 : 0}
                  textAnchor={crowded ? 'end' : 'middle'}
                  height={crowded ? 80 : 32}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: CHROME.muted }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={yAxisFormatter}
                  width={52}
                />
              </>
            )}
            <Tooltip
              cursor={{ fill: 'rgba(11,11,11,0.04)' }}
              formatter={valueFormatter}
              content={renderTooltip}
              contentStyle={{ borderRadius: 8, border: `1px solid ${CHROME.gridline}`, fontSize: 13 }}
            />
            {legendItems.length > 0 && (
            <Legend
              verticalAlign="bottom"
              wrapperStyle={{ paddingTop: 10 }}
              content={() => (
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs" style={{ color: CHROME.textSecondary }}>
                  {legendItems.map((it) => (
                    <span key={it.label} className="inline-flex items-center gap-1.5">
                      {it.dashed ? (
                        <span style={{ display: 'inline-block', width: 16, borderTop: `2px dashed ${it.color}` }} />
                      ) : (
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: it.color }} />
                      )}
                      {it.label}
                    </span>
                  ))}
                </div>
              )}
            />
            )}

            {referenceValue != null && (
              <ReferenceLine
                {...(horizontal ? { x: referenceValue } : { y: referenceValue })}
                stroke={STATUS.warning}
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
              />
            )}

            {multi ? (
              series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  fill={s.color}
                  radius={horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}
                  maxBarSize={barSize}
                />
              ))
            ) : (
              <Bar
                dataKey={yKey}
                name={seriesName}
                radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                maxBarSize={barSize}
                cursor={onBarClick ? 'pointer' : undefined}
                onClick={onBarClick ? (entry) => onBarClick(entry?.payload?.[xKey] ?? entry?.[xKey]) : undefined}
              >
                {data.map((entry, i) => (
                  <Cell
                    key={entry[xKey]}
                    fill={
                      entry[xKey] === activeLabel
                        ? activeColor
                        : multicolor
                          ? ENTITY_PALETTE[i % ENTITY_PALETTE.length]
                          : color
                    }
                    onClick={onBarClick ? () => onBarClick(entry[xKey]) : undefined}
                    cursor={onBarClick ? 'pointer' : undefined}
                  />
                ))}
              </Bar>
            )}
          </ReBarChart>
        </ResponsiveContainer>
      </div>
      {captionLabel && <div className="mt-1 text-center text-xs" style={{ color: CHROME.textSecondary }}>{captionLabel}</div>}
    </div>
  )
}
