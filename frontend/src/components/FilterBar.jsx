import MultiSelectFilter from './MultiSelectFilter'
import { BRAND } from '../theme/brand'

const dateClass = 'rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-[#0b0b0b] focus:outline-none'

/**
 * Global filters for one dashboard page: office, region, subspecialty
 * (each a multi-select checkbox dropdown, all checked by default = no
 * restriction) and a date range. Every change re-fetches the live backend
 * immediately — see hooks/useDashboardData.js.
 *
 * `region`/`office`/`subspecialty` props: { options: [{value,label}],
 * checked: string[], onChange(next) }.
 */
export default function FilterBar({ region, office, subspecialty, dateRange, onDateRangeChange, onClearAll, hasActiveFilters }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-[#898781]">Filter</span>

      <MultiSelectFilter label="Region" options={region.options} checked={region.checked} onChange={region.onChange} />
      <MultiSelectFilter label="Office" options={office.options} checked={office.checked} onChange={office.onChange} />
      <MultiSelectFilter label="Subspecialty" options={subspecialty.options} checked={subspecialty.checked} onChange={subspecialty.onChange} />

      <input
        type="date"
        title="Start date (inclusive)"
        className={dateClass}
        value={dateRange.start_date ?? ''}
        onChange={(e) => onDateRangeChange({ ...dateRange, start_date: e.target.value || undefined })}
        onFocus={(e) => (e.target.style.borderColor = BRAND.primary)}
        onBlur={(e) => (e.target.style.borderColor = '')}
      />
      <span className="text-sm text-[#898781]">–</span>
      <input
        type="date"
        title="End date (inclusive)"
        className={dateClass}
        value={dateRange.end_date ?? ''}
        onChange={(e) => onDateRangeChange({ ...dateRange, end_date: e.target.value || undefined })}
        onFocus={(e) => (e.target.style.borderColor = BRAND.primary)}
        onBlur={(e) => (e.target.style.borderColor = '')}
      />

      {hasActiveFilters && (
        <button type="button" onClick={onClearAll} className="rounded-full px-3 py-1.5 text-sm font-medium text-[#52514e] hover:text-[#0b0b0b]">
          Clear all
        </button>
      )}
    </div>
  )
}
