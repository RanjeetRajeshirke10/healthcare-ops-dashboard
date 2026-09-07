import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts'
import { CHROME, STATUS } from '../theme/chartColors'
import { BRAND } from '../theme/brand'

/**
 * Semicircular gauge for a single bounded metric measured against a target.
 * Per the dataviz skill: the arc is ONE state-driven color, the track is a
 * recessive chrome tint, and the precise number is always printed as text —
 * the arc is the at-a-glance layer, the number is the exact one. Whether
 * you're over or under target is stated in words (a pill), never left to be
 * decoded from an angle or from color alone.
 *
 * `value`, `min`, `max`, `target` are all in the same display units (e.g.
 * pass 14 / 0 / 30 / 15 for a 14% rate on a 0-30% dial with a 15% target).
 */
export default function MeterChart({
  value,
  min = 0,
  max = 100,
  target,
  lowerIsBetter = false,
  valueLabel,
  caption,
  height = 200,
}) {
  const clamped = Math.max(min, Math.min(max, value))
  const withinTarget =
    target == null ? true : lowerIsBetter ? value <= target : value >= target
  const arcColor = target == null ? BRAND.primary : withinTarget ? STATUS.good : STATUS.critical

  return (
    <div>
      <div style={{ position: 'relative', width: '100%', height }}>
        <ResponsiveContainer>
          <RadialBarChart
            data={[{ name: 'value', value: clamped, fill: arcColor }]}
            startAngle={180}
            endAngle={0}
            innerRadius="72%"
            outerRadius="100%"
            barSize={20}
          >
            <PolarAngleAxis type="number" domain={[min, max]} angleAxisId={0} tick={false} />
            <RadialBar
              background={{ fill: CHROME.gridline }}
              dataKey="value"
              cornerRadius={10}
              angleAxisId={0}
              isAnimationActive={false}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div
          style={{ position: 'absolute', left: 0, right: 0, top: '52%', textAlign: 'center' }}
        >
          <div style={{ fontSize: 32, fontWeight: 600, lineHeight: 1, color: CHROME.textPrimary }}>
            {valueLabel ?? value}
          </div>
        </div>
      </div>

      <div
        className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs"
        style={{ color: CHROME.textSecondary }}
      >
        {target != null && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium"
            style={{
              backgroundColor: `${withinTarget ? STATUS.good : STATUS.critical}1a`,
              color: withinTarget ? STATUS.good : STATUS.critical,
            }}
          >
            {withinTarget ? '✓ on target' : lowerIsBetter ? '✕ over target' : '✕ below target'}
          </span>
        )}
        {caption && <span>{caption}</span>}
      </div>
    </div>
  )
}
