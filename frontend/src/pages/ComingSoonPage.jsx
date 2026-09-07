/** Temporary stand-in for the 4 dashboards not yet built out (this session only built Overview). */
export default function ComingSoonPage({ title, subtitle }) {
  return (
    <div className="mx-auto w-full max-w-7xl flex-1 p-8">
      <header>
        <h1 className="text-2xl font-semibold text-[#0b0b0b]">{title}</h1>
        <p className="mt-1 text-sm text-[#52514e]">{subtitle}</p>
      </header>
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-[#898781]">
        This dashboard is being built next.
      </div>
    </div>
  )
}
