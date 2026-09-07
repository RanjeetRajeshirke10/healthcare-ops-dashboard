import {
  CartesianGrid,
  Legend,
  Line,
  LineChart as ReLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CHROME } from '../theme/chartColors'
import { BRAND } from '../theme/brand'

/**
 * Generic single-series trend line. 2px line per the dataviz skill's mark
 * spec, hairline recessive grid. The x-axis title renders as plain HTML
 * below the chart so it never collides with the Legend (see BarChart.jsx).
 */
export default function LineChart({
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
  return (
    <div>
      {yAxisLabel && (
        <div className="mb-0.5 text-[11px] font-medium" style={{ color: CHROME.textSecondary }}>{yAxisLabel}</div>
      )}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ReLineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
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
            <Line
              type="monotone"
              dataKey={yKey}
              name={seriesName}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: '#fcfcfb' }}
            />
          </ReLineChart>
        </ResponsiveContainer>
      </div>
      {xAxisLabel && <div className="mt-1 text-center text-xs" style={{ color: CHROME.textSecondary }}>{xAxisLabel}</div>}
    </div>
  )
}
