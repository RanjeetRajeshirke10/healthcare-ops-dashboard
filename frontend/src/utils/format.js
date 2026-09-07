export function formatNumber(n) {
  return new Intl.NumberFormat('en-US').format(Math.round(n))
}

export function formatPercent(fraction, digits = 1) {
  return `${(fraction * 100).toFixed(digits)}%`
}

export function formatDays(n, digits = 1) {
  return `${n.toFixed(digits)} days`
}

/** Plain number array from a [{date, value}] trend, dropping an obviously
 * partial trailing bucket (last value < 40% of the one before it). */
export function trendValues(trend, key = 'value') {
  const v = (trend ?? []).map((p) => Number(p[key])).filter(Number.isFinite)
  if (v.length >= 4 && v[v.length - 1] < 0.4 * v[v.length - 2]) v.pop()
  return v
}

/** Recent vs. prior window average of a trend, for a period-over-period delta.
 * Falls back to last-point-vs-previous when the series is short. */
export function trendDelta(trend, key = 'value', window = 3) {
  const v = trendValues(trend, key)
  if (v.length < 2) return { current: null, previous: null }
  if (v.length < window * 2) return { current: v[v.length - 1], previous: v[v.length - 2] }
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length
  return { current: avg(v.slice(-window)), previous: avg(v.slice(-window * 2, -window)) }
}
