/**
 * Group divider between major sections of a dashboard page — an uppercase
 * label with an optional one-line hint, underlined edge to edge.
 */
export default function SectionBand({ title, hint }) {
  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-200 pb-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#52514e]">{title}</h2>
      {hint && <span className="text-xs text-[#898781]">{hint}</span>}
    </div>
  )
}
