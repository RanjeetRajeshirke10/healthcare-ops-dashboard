import { NavLink } from 'react-router-dom'
import { BRAND } from '../theme/brand'

const LINKS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/patient-access', label: 'Patient Access' },
  { to: '/provider-productivity', label: 'Provider Productivity' },
  { to: '/ancillary-services', label: 'Ancillary Services' },
  { to: '/data-quality', label: 'Data Quality' },
]

export default function NavBar() {
  return (
    <nav className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white p-5">
      <div className="mb-8 flex items-center gap-3 px-1">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
          style={{ backgroundColor: BRAND.primary }}
        >
          HO
        </div>
        <div>
          <div className="text-2xl font-bold leading-tight text-[#0b0b0b]">Healthcare Ops</div>
          <div className="text-xs text-[#898781]">Analytics Dashboard</div>
        </div>
      </div>

      <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-[#898781]">Dashboards</div>
      <ul className="space-y-1">
        {LINKS.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `block rounded-lg border-l-[3px] px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'font-semibold' : 'border-transparent text-[#52514e] hover:bg-slate-50 hover:text-[#0b0b0b]'
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? { borderColor: BRAND.primary, backgroundColor: BRAND.primaryTint, color: BRAND.primary }
                  : undefined
              }
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
