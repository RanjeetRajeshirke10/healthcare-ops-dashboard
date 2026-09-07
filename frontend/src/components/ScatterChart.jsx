import {
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart as ReScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CHROME, ENTITY_PALETTE } from '../theme/chartColors'
import { BRAND } from '../theme/brand'

/**
 * Two-continuous-variable correlation view — one dot per entity. Pass
 * `colorBy` (a field name) to colour each point by that field's value, with
 * a matching legend. The x/y-axis titles render as plain HTML (not rotated
 * SVG labels that collide with the tick numbers).
 */
export default function ScatterChart({
  data,
  xKey,
  yKey,
  colorBy,
  seriesName = 'Office',
  color = BRAND.primary,
  height = 320,
  xAxisLabel,
  yAxisLabel,
  xAxisFormatter,
  yAxisFormatter,
  renderTooltip,
}) {
  const multi = !!colorBy
  let colorFor = () => color
  let legendItems = [{ label: seriesName, color }]

  if (multi) {
    const cats = []
    for (const d of data) {
      const v = d[colorBy]
      if (!cats.includes(v)) cats.push(v)
    }
    const map = Object.fromEntries(cats.map((c, i) => [c, ENTITY_PALETTE[i % ENTITY_PALETTE.length]]))
    colorFor = (d) => map[d[colorBy]] ?? color
    legendItems = cats.map((c) => ({ label: String(c), color: map[c] }))
  }

  return (
    <div>
      {yAxisLabel && (
        <div className="mb-0.5 text-[11px] font-medium" style={{ color: CHROME.textSecondary }}>{yAxisLabel}</div>
      )}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ReScatterChart margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="0" stroke={CHROME.gridline} />
            <XAxis
              type="number"
              dataKey={xKey}
              tick={{ fontSize: 12, fill: CHROME.muted }}
              axisLine={{ stroke: CHROME.baseline }}
              tickLine={false}
              tickFormatter={xAxisFormatter}
            />
            <YAxis
              type="number"
              dataKey={yKey}
              tick={{ fontSize: 12, fill: CHROME.muted }}
              axisLine={false}
              tickLine={false}
              tickFormatter={yAxisFormatter}
              width={52}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3', stroke: CHROME.baseline }}
              content={renderTooltip}
              contentStyle={{ borderRadius: 8, border: `1px solid ${CHROME.gridline}`, fontSize: 13 }}
            />
            <Legend
              verticalAlign="bottom"
              wrapperStyle={{ paddingTop: 10 }}
              content={() => (
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px]" style={{ color: CHROME.textSecondary }}>
                  {legendItems.map((it) => (
                    <span key={it.label} className="inline-flex items-center gap-1">
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 9999, backgroundColor: it.color }} />
                      {it.label}
                    </span>
                  ))}
                </div>
              )}
            />
            <Scatter data={data} fillOpacity={0.85}>
              {data.map((d, i) => (
                <Cell key={i} fill={colorFor(d)} />
              ))}
            </Scatter>
          </ReScatterChart>
        </ResponsiveContainer>
      </div>
      {xAxisLabel && <div className="mt-1 text-center text-xs" style={{ color: CHROME.textSecondary }}>{xAxisLabel}</div>}
    </div>
  )
}
