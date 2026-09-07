import { BRAND } from '../theme/brand'

/**
 * Rule-based insights panel — Phase 3 audit plan Assumption A4: real logic,
 * not a placeholder. Styled after the reference design's "AI Intelligence"
 * panel: a one-line reading, then a row of finding cards each with a
 * colored left border and a highlighted stat badge.
 *
 * @param {string} reading - one-line summary sentence
 * @param {{ title: string, badge: string, description: string, color?: string }[]} findings
 */
export default function KeyFindings({ reading, findings }) {
  if (!findings || findings.length === 0) return null

  return (
    <div className="rounded-xl border p-4" style={{ backgroundColor: BRAND.primaryTint, borderColor: BRAND.primaryBorder }}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.primary }}>
        Key Finding
      </div>
      {reading && <p className="mb-3 text-sm font-medium text-[#0b0b0b]">{reading}</p>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {findings.map((f) => (
          <div
            key={f.title}
            className="rounded-lg border-l-[3px] bg-white p-3"
            style={{ borderLeftColor: f.color ?? BRAND.primary }}
          >
            <div className="text-sm font-semibold text-[#0b0b0b]">{f.title}</div>
            <span
              className="mt-1.5 inline-block rounded-md px-2 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: BRAND.primaryTint, color: BRAND.primary }}
            >
              {f.badge}
            </span>
            <p className="mt-1.5 text-xs text-[#52514e]">{f.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
