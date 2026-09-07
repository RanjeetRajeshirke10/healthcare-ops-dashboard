import { Cell, Pie, PieChart as RePieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { CHROME } from '../theme/chartColors'
import { BRAND } from '../theme/brand'

/**
 * Part-to-whole donut for a small (<=6 segment) breakdown — per the dataviz
 * skill, pie/donut is only for at-a-glance part-to-whole reads, never for
 * comparing close values (that stays a bar chart). A legend always
 * accompanies it since it has >= 2 series.
 */
export default function DonutChart({ data, height = 220, colors, renderTooltip }) {
  const palette = colors ?? [BRAND.primary, '#e1e0d9', '#c3c2b7']

  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <RePieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="90%" paddingAngle={2} stroke="none">
              {data.map((entry, i) => (
                <Cell key={entry.label} fill={palette[i % palette.length]} />
              ))}
            </Pie>
            <Tooltip
              content={renderTooltip}
              contentStyle={{ borderRadius: 8, border: `1px solid ${CHROME.gridline}`, fontSize: 13 }}
            />
          </RePieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {data.map((entry, i) => (
          <span key={entry.label} className="flex items-center gap-1.5 text-xs text-[#52514e]">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette[i % palette.length] }} />
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  )
}
