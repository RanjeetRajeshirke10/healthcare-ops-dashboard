/**
 * Validated color palette (dataviz skill, references/palette.md). Light mode
 * only for this project — no dark-mode toggle in the original spec.
 *
 * Categorical hues are assigned in this fixed order and never cycled or
 * re-ranked (anti-patterns.md: "color follows the entity, never its rank").
 * A single-series bar/line chart over nominal categories (offices,
 * subspecialties, providers) always uses CATEGORICAL[0] for every mark —
 * per-bar rainbow coloring on a one-series chart is an anti-pattern
 * ("a value-ramp / rainbow on nominal categories").
 */
export const CATEGORICAL = [
  '#2a78d6', // 1 blue   — the default single-series color
  '#eb6834', // 2 orange
  '#1baf7a', // 3 aqua
  '#eda100', // 4 yellow
  '#e87ba4', // 5 magenta
  '#008300', // 6 green
  '#4a3aa7', // 7 violet
  '#e34948', // 8 red
]

// Wider set for the (few) charts that colour every bar / point by its own
// entity name — 16 reasonably distinct hues so a 15-office chart doesn't
// repeat. The first 8 are CATEGORICAL so a chart keeps its usual look.
export const ENTITY_PALETTE = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948',
  '#6aa9e0', '#c9531f', '#0f7d57', '#b57e00',
  '#b8548a', '#5bbf5b', '#7a6fce', '#a83533',
]

/** Deterministic colour for an entity name, stable across renders. */
export function entityColor(name, i = 0) {
  if (typeof name === 'string' && name.length) {
    let h = 0
    for (let k = 0; k < name.length; k += 1) h = (h * 31 + name.charCodeAt(k)) >>> 0
    return ENTITY_PALETTE[h % ENTITY_PALETTE.length]
  }
  return ENTITY_PALETTE[i % ENTITY_PALETTE.length]
}

export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
}

// Maps the backend's health_by_file status strings directly to status color roles.
export const HEALTH_STATUS_COLOR = {
  green: STATUS.good,
  yellow: STATUS.warning,
  red: STATUS.critical,
}

export const CHROME = {
  surface: '#fcfcfb',
  gridline: '#e1e0d9',
  baseline: '#c3c2b7',
  muted: '#898781',
  textSecondary: '#52514e',
  textPrimary: '#0b0b0b',
}
