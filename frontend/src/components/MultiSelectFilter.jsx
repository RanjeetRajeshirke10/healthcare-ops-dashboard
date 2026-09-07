import { useEffect, useRef, useState } from 'react'
import { BRAND } from '../theme/brand'

/**
 * Checkbox dropdown filter — all options checked by default (= "no filter").
 * `options`: [{ value, label }]. `checked`: array of currently-checked
 * values. Applies instantly on toggle (no separate Apply step).
 */
export default function MultiSelectFilter({ label, options, checked, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const allChecked = options.length > 0 && checked.length === options.length
  const noneChecked = checked.length === 0

  function toggle(value) {
    onChange(checked.includes(value) ? checked.filter((v) => v !== value) : [...checked, value])
  }

  let summary = `${label}: All`
  if (noneChecked) {
    summary = `${label}: None`
  } else if (!allChecked) {
    summary =
      checked.length === 1
        ? `${label}: ${options.find((o) => o.value === checked[0])?.label ?? checked[0]}`
        : `${label}: ${checked.length} selected`
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`Filter by ${label.toLowerCase()} — click to choose which ${label.toLowerCase()}s to include`}
        className="rounded-full border bg-white px-3.5 py-1.5 text-sm font-medium text-[#0b0b0b]"
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = BRAND.primary)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = allChecked ? '#cbd5e1' : BRAND.primary)}
        style={{ borderColor: allChecked ? '#cbd5e1' : BRAND.primary }}
      >
        {summary} <span className="ml-1 text-[#898781]">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between text-xs font-medium">
            <button type="button" onClick={() => onChange(options.map((o) => o.value))} className="text-[#52514e] hover:text-[#0b0b0b]">
              Select all
            </button>
            <button type="button" onClick={() => onChange([])} className="text-red-500 hover:text-red-600">
              Clear
            </button>
          </div>
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {options.map((opt) => (
              <label key={opt.value} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={checked.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="h-4 w-4 rounded border-slate-300"
                  style={{ accentColor: BRAND.primary }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
