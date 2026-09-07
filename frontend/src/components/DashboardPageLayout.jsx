import LoadingState from './LoadingState'
import ErrorState from './ErrorState'

/**
 * Enforces the standard dashboard page structure on every page, identically:
 * Header (+ header actions, e.g. Ask AI) -> Subheader -> Global Filters ->
 * Key Finding -> [KPI Strip -> Charts/tables -> Build Action Plan].
 * (Order updated 2026-09-06 at the user's request: Key Finding now sits
 * between Filters and the KPI Strip, and Ask AI moved into the header.)
 * The bracketed section is replaced by a loading/error state while data
 * isn't ready.
 */
export default function DashboardPageLayout({
  title,
  subtitle,
  headerActions,
  filterBar,
  keyFindings,
  status,
  error,
  children,
}) {
  return (
    <div className="mx-auto w-full max-w-[1920px] flex-1 px-6 py-8 xl:px-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-[#0b0b0b]">{title}</h1>
          <p className="mt-1.5 text-sm text-[#52514e]">{subtitle}</p>
        </div>
        {headerActions && <div className="shrink-0">{headerActions}</div>}
      </header>

      <div className="mt-6">{filterBar}</div>

      {status === 'ready' && keyFindings && <div className="mt-6">{keyFindings}</div>}

      <div className="mt-6 space-y-6">
        {status === 'loading' && <LoadingState />}
        {status === 'error' && <ErrorState message={error?.message} />}
        {status === 'ready' && children}
      </div>
    </div>
  )
}
