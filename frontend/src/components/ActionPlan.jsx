import { useEffect, useRef, useState } from 'react'
import { BRAND } from '../theme/brand'

/**
 * "Build Action Plan" — moved to the header (top-right, next to Ask
 * Anything) at the user's request. `items` is a real, templated list
 * computed by the page from threshold rules against whatever data is
 * currently loaded (Phase 3 audit plan Assumption A4) — not a placeholder.
 */
export default function ActionPlan({ items }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!items || items.length === 0) return null

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Generate a recommended action plan from the current view"
        className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm"
        style={{ backgroundColor: BRAND.primary }}
      >
        Build Action Plan
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-96 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <h3 className="mb-2 text-sm font-semibold text-[#0b0b0b]">Recommended next steps</h3>
          <ul className="space-y-2">
            {items.map((item, i) => (
              <li key={i} className="rounded-lg bg-slate-50 p-3 text-sm text-[#0b0b0b]">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
