import {
  Area,
  AreaChart as ReAreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CHROME } from '../theme/chartColors'
import { BRAND } from '../theme/brand'

/**
 * Trend-over-time with a filled area under the line — per the dataviz
 * skill's mark spec, the fill is the series hue at ~10% opacity (a wash,
 * never a saturated block), with the same 2px line on top. The x-axis title
 * renders as plain HTML below the chart so it never collides with the
 * Legend (see BarChart.jsx for why).
 */
export default function AreaChart({
  data,
  xKey = 'date',
  yKey = 'value',
  seriesName = 'Value',
  color = BRAND.primary,
  height = 280,
  xAxisLabel,
  yAxisLabel,
  valueFormatter,
  xAxisFormatter,
  yAxisFormatter,
  renderTooltip,
}) {
  const gradientId = `area-fill-${seriesName.replace(/\s+/g, '-')}`

  return (
    <div>
      {yAxisLabel && (
        <div className="mb-0.5 text-[11px] font-medium" style={{ color: CHROME.textSecondary }}>{yAxisLabel}</div>
      )}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ReAreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.18} />
                <stop offset="95%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="0" stroke={CHROME.gridline} vertical={false} />
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 12, fill: CHROME.muted }}
              axisLine={{ stroke: CHROME.baseline }}
              tickLine={false}
              tickFormatter={xAxisFormatter}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 12, fill: CHROME.muted }}
              axisLine={false}
              tickLine={false}
              tickFormatter={yAxisFormatter}
              width={52}
            />
            <Tooltip
              formatter={valueFormatter}
              content={renderTooltip}
              contentStyle={{ borderRadius: 8, border: `1px solid ${CHROME.gridline}`, fontSize: 13 }}
            />
            <Legend
              verticalAlign="bottom"
              wrapperStyle={{ paddingTop: 10 }}
              content={() => (
                <div className="flex items-center justify-center gap-1.5 text-xs" style={{ color: CHROME.textSecondary }}>
                  <span style={{ display: 'inline-block', width: 16, borderTop: `2px solid ${color}` }} />
                  {seriesName}
                </div>
              )}
            />
            <Area
              type="monotone"
              dataKey={yKey}
              name={seriesName}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              activeDot={{ r: 4, strokeWidth: 2, stroke: '#fcfcfb' }}
            />
          </ReAreaChart>
        </ResponsiveContainer>
      </div>
      {xAxisLabel && <div className="mt-1 text-center text-xs" style={{ color: CHROME.textSecondary }}>{xAxisLabel}</div>}
    </div>
  )
}
