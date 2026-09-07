import { BRAND } from '../theme/brand'

/** Small colored dot + bold title, used for every chart/table card header — matches the reference design's section-title pattern. */
export default function SectionHeader({ children, dotColor = BRAND.primary }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#0b0b0b]">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
      {children}
    </h2>
  )
}
