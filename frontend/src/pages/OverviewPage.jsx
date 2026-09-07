import { useMemo, useState } from 'react'
import ActionPlan from '../components/ActionPlan'
import AreaChart from '../components/AreaChart'
import AskAi from '../components/AskAi'
import BarChart from '../components/BarChart'
import DashboardPageLayout from '../components/DashboardPageLayout'
import DataTable from '../components/DataTable'
import DonutChart from '../components/DonutChart'
import FilterBar from '../components/FilterBar'
import HeatMap from '../components/HeatMap'
import AttentionPanel from '../components/AttentionPanel'
import KpiStrip from '../components/KpiStrip'
import LineChart from '../components/LineChart'
import SectionHeader from '../components/SectionHeader'
import { STATUS, CHROME, CATEGORICAL } from '../theme/chartColors'
import { BRAND } from '../theme/brand'
import { useDashboardData } from '../hooks/useDashboardData'
import { useFilterOptions } from '../hooks/useFilterOptions'
import { useMultiSelectFilter } from '../hooks/useMultiSelectFilter'
import { formatNumber, formatPercent } from '../utils/format'
import { answerQuestion } from '../utils/askAnything'

const ENDPOINTS = {
  summary: '/api/overview/summary',
  byOffice: '/api/overview/by-office',
  trend: '/api/access/appointment-volume',
  demographics: '/api/overview/demographics',
  noShow: '/api/access/no-show-rate',
  volumeHeatmap: '/api/overview/volume-heatmap',
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2025-04" -> "Apr '25" for compact month-axis / heatmap-column labels. */
function formatMonth(bucket) {
  const [year, month] = bucket.split('-')
  return `${MONTH_ABBR[Number(month) - 1]} '${year.slice(2)}`
}

const HIGH_NO_SHOW = 0.15
const LOW_UTILIZATION = 65
const OVER_CAPACITY = 100
const LOW_REFERRAL_COMPLETION = 0.75

function computeAttention(offices, companyWide) {
  if (!offices?.length || !companyWide) return []
  const items = []

  for (const o of offices.filter((x) => x.utilization_pct > OVER_CAPACITY).sort((a, b) => b.utilization_pct - a.utilization_pct)) {
    items.push({
      severity: 'critical',
      title: `${o.office_name} is over estimated capacity`,
      metric: `${o.utilization_pct.toFixed(0)}%`,
      detail: 'Running over 100% estimated utilization — evaluate additional provider time or scheduling relief.',
    })
  }
  for (const o of offices.filter((x) => x.no_show_rate > HIGH_NO_SHOW).sort((a, b) => b.no_show_rate - a.no_show_rate)) {
    items.push({
      severity: 'warning',
      title: `${o.office_name} no-show rate above ${formatPercent(HIGH_NO_SHOW)}`,
      metric: formatPercent(o.no_show_rate),
      detail: 'Add appointment-reminder / confirmation outreach for this office.',
    })
  }
  for (const o of offices.filter((x) => x.utilization_pct < LOW_UTILIZATION).sort((a, b) => a.utilization_pct - b.utilization_pct)) {
    items.push({
      severity: 'info',
      title: `${o.office_name} clinic is under-used`,
      metric: `${o.utilization_pct.toFixed(0)}%`,
      detail: `Utilization is under ${LOW_UTILIZATION}% — consider redirecting demand or consolidating sessions.`,
    })
  }
  if (companyWide.avg_referral_completion < LOW_REFERRAL_COMPLETION) {
    items.push({
      severity: 'warning',
      title: 'Ancillary referral completion below target',
      metric: formatPercent(companyWide.avg_referral_completion),
      detail: `Below ${formatPercent(LOW_REFERRAL_COMPLETION)} in the current view — consider a follow-up call program for open referrals.`,
    })
  }
  if (items.length === 0) {
    items.push({ severity: 'good', title: 'No exceptions in view', detail: 'No-show, utilization, and referral completion are all within normal ranges.' })
  }
  return items
}

function computeActionPlan(offices, companyWide) {
  return computeAttention(offices, companyWide)
    .filter((i) => i.severity !== 'good')
    .map((i) => `${i.title} (${i.metric ?? ''}) — ${i.detail}`)
}

function tooltipBox(children) {
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-md" style={{ borderColor: CHROME.gridline }}>
      {children}
    </div>
  )
}

function RegionBadge({ region }) {
  return <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-[#52514e]">{region}</span>
}

export default function OverviewPage() {
  const filterOptions = useFilterOptions()
  const regionValues = useMemo(() => filterOptions.regions, [filterOptions.regions])
  const officeValues = useMemo(() => filterOptions.offices.map((o) => o.office_id), [filterOptions.offices])
  const subspecialtyValues = useMemo(() => filterOptions.subspecialties, [filterOptions.subspecialties])

  const regionFilter = useMultiSelectFilter(regionValues)
  const officeFilter = useMultiSelectFilter(officeValues)
  const subspecialtyFilter = useMultiSelectFilter(subspecialtyValues)
  const [dateRange, setDateRange] = useState({ start_date: undefined, end_date: undefined })

  const apiFilters = useMemo(
    () => ({
      region: regionFilter.effective,
      office_id: officeFilter.effective,
      subspecialty: subspecialtyFilter.effective,
      start_date: dateRange.start_date,
      end_date: dateRange.end_date,
    }),
    [regionFilter.effective, officeFilter.effective, subspecialtyFilter.effective, dateRange],
  )

  const { data, status, error } = useDashboardData(ENDPOINTS, apiFilters)

  const hasActiveFilters =
    regionFilter.isRestricted || officeFilter.isRestricted || subspecialtyFilter.isRestricted || !!dateRange.start_date || !!dateRange.end_date

  function clearAllFilters() {
    regionFilter.setChecked(regionValues)
    officeFilter.setChecked(officeValues)
    subspecialtyFilter.setChecked(subspecialtyValues)
    setDateRange({ start_date: undefined, end_date: undefined })
  }

  const regionChartData = useMemo(
    () => data?.summary?.by_region.map((r) => ({ label: r.region, value: r.total_appointments })) ?? [],
    [data],
  )
  const activeRegion = regionFilter.isRestricted && regionFilter.checked.length === 1 ? regionFilter.checked[0] : undefined

  const referralDonutData = useMemo(() => {
    if (!data?.summary) return []
    const completed = data.summary.company_wide.avg_referral_completion
    return [
      { label: 'Completed', value: Math.round(completed * 1000) / 10 },
      { label: 'Outstanding', value: Math.round((1 - completed) * 1000) / 10 },
    ]
  }, [data])

  const genderDonutData = useMemo(
    () => data?.demographics?.by_gender.map((g) => ({ label: g.label, value: g.value })) ?? [],
    [data],
  )

  const officeNoShowVsUtilData = useMemo(
    () =>
      (data?.byOffice?.offices ?? [])
        .map((o) => ({
          label: o.office_name.replace(/ Orthopaedic Center$/, ''),
          no_show: Math.round(o.no_show_rate * 1000) / 10,
          utilization: Math.round(o.utilization_pct * 10) / 10,
        }))
        .sort((a, b) => b.utilization - a.utilization),
    [data],
  )

  const noShowTrendData = useMemo(
    () => data?.noShow?.trend.map((p) => ({ date: p.date, value: Math.round(p.value * 1000) / 10 })) ?? [],
    [data],
  )

  const heatmapCells = useMemo(
    () => data?.volumeHeatmap?.cells.map((c) => ({ row: c.row, column: c.column, value: c.value })) ?? [],
    [data],
  )

  const attention = useMemo(() => computeAttention(data?.byOffice?.offices, data?.summary?.company_wide), [data])
  const actionPlanItems = useMemo(() => computeActionPlan(data?.byOffice?.offices, data?.summary?.company_wide), [data])

  const kpiItems = data
    ? [
        {
          label: 'Total patients',
          value: formatNumber(data.summary.company_wide.total_patients),
          tooltip: 'Distinct patients with at least one appointment in the current filtered view.',
        },
        {
          label: 'Total appointments',
          value: formatNumber(data.summary.company_wide.total_appointments),
          tooltip: 'All scheduled appointments (any status) in the current filtered view.',
        },
        {
          label: 'Total surgeries',
          value: formatNumber(data.summary.company_wide.total_surgeries),
          tooltip: 'Surgical procedures performed in the current filtered view.',
        },
        {
          label: 'No-show rate',
          value: formatPercent(data.summary.company_wide.avg_no_show_rate),
          tooltip: "Share of Completed + No-Show appointments where the patient didn't arrive. Cancellations and reschedules are excluded from this rate.",
          accent: data.summary.company_wide.avg_no_show_rate > HIGH_NO_SHOW ? STATUS.critical : undefined,
        },
        {
          label: 'Referral completion',
          value: formatPercent(data.summary.company_wide.avg_referral_completion),
          tooltip: 'Share of ancillary referrals (Physical Therapy, Imaging, Orthotics, Hand Therapy) marked completed.',
          accent: data.summary.company_wide.avg_referral_completion < LOW_REFERRAL_COMPLETION ? STATUS.warning : undefined,
        },
      ]
    : []

  return (
    <DashboardPageLayout
      title="Overview"
      subtitle="A company-wide snapshot of patient volume, appointments, surgeries, and access metrics across every office and region. Click a chart bar or table row to filter the view."
      headerActions={
        <div className="flex items-center gap-2">
          <ActionPlan items={actionPlanItems} />
          <AskAi onAsk={(q) => answerQuestion(q, data)} />
        </div>
      }
      filterBar={
        <FilterBar
          region={{ options: regionValues.map((r) => ({ value: r, label: r })), checked: regionFilter.checked, onChange: regionFilter.setChecked }}
          office={{ options: filterOptions.offices.map((o) => ({ value: o.office_id, label: o.office_name })), checked: officeFilter.checked, onChange: officeFilter.setChecked }}
          subspecialty={{ options: subspecialtyValues.map((s) => ({ value: s, label: s })), checked: subspecialtyFilter.checked, onChange: subspecialtyFilter.setChecked }}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onClearAll={clearAllFilters}
          hasActiveFilters={hasActiveFilters}
        />
      }
      keyFindings={attention.length ? <AttentionPanel items={attention} /> : null}
      status={status}
      error={error}
    >
      {data && (
        <>
          <KpiStrip items={kpiItems} />

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <SectionHeader>Appointment volume by region and month</SectionHeader>
            {heatmapCells.length ? (
              <HeatMap
                rows={data.volumeHeatmap.rows}
                columns={data.volumeHeatmap.columns}
                cells={heatmapCells}
                formatValue={formatNumber}
                formatColumn={formatMonth}
                renderCellTitle={({ row, column, value }) =>
                  `${row} · ${formatMonth(column)}: ${formatNumber(value)} appointments`
                }
              />
            ) : (
              <div className="py-12 text-center text-sm" style={{ color: CHROME.muted }}>
                No appointments in the current view.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
              <SectionHeader>Appointment volume by region</SectionHeader>
              <BarChart
                data={regionChartData}
                horizontal
                seriesName="Appointments"
                yAxisLabel="Appointments"
                yAxisFormatter={formatNumber}
                activeLabel={activeRegion}
                onBarClick={(label) => regionFilter.setChecked([label])}
                renderTooltip={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const { label, value } = payload[0].payload
                  const officeCount = data.byOffice.offices.filter((o) => o.region === label).length
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{label}</div>
                      <div className="text-[#52514e]">{formatNumber(value)} appointments across {officeCount} office{officeCount !== 1 ? 's' : ''}</div>
                      <div className="mt-1 text-[#898781]">Click to filter to this region</div>
                    </>,
                  )
                }}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Referral completion split</SectionHeader>
              <DonutChart
                data={referralDonutData}
                colors={[STATUS.good, '#e1e0d9']}
                renderTooltip={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const { label, value } = payload[0].payload
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{label}</div>
                      <div className="text-[#52514e]">{value}% of ancillary referrals in the current view</div>
                    </>,
                  )
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Appointment volume trend</SectionHeader>
              <AreaChart
                data={data.trend.trend}
                seriesName="Appointments"
                xAxisLabel="Month"
                yAxisLabel="Appointments"
                xAxisFormatter={formatMonth}
                yAxisFormatter={formatNumber}
                renderTooltip={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{formatMonth(label)}</div>
                      <div className="text-[#52514e]">{formatNumber(payload[0].value)} appointments scheduled</div>
                    </>,
                  )
                }}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>No-show rate trend</SectionHeader>
              <LineChart
                data={noShowTrendData}
                seriesName="No-show rate"
                xKey="date"
                xAxisLabel="Month"
                yAxisLabel="No-show rate (%)"
                xAxisFormatter={formatMonth}
                yAxisFormatter={(v) => `${v}%`}
                renderTooltip={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{formatMonth(label)}</div>
                      <div className="text-[#52514e]">{payload[0].value}% of Completed + No-Show appointments</div>
                    </>,
                  )
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Patients by gender</SectionHeader>
              <DonutChart
                data={genderDonutData}
                colors={[CATEGORICAL[0], CATEGORICAL[4], CATEGORICAL[2]]}
                renderTooltip={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const { label, value } = payload[0].payload
                  const total = genderDonutData.reduce((s, d) => s + d.value, 0)
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{label}</div>
                      <div className="text-[#52514e]">{formatNumber(value)} patients ({total ? formatPercent(value / total) : '0%'})</div>
                    </>,
                  )
                }}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Patients by age group</SectionHeader>
              <BarChart
                data={data.demographics.by_age_band}
                seriesName="Patients"
                xAxisLabel="Age group"
                yAxisLabel="Patients"
                yAxisFormatter={formatNumber}
                renderTooltip={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">Age {label}</div>
                      <div className="text-[#52514e]">{formatNumber(payload[0].value)} patients in the current view</div>
                    </>,
                  )
                }}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Patients by insurance type</SectionHeader>
              <BarChart
                data={data.demographics.by_insurance}
                seriesName="Patients"
                xAxisLabel="Insurance type"
                yAxisLabel="Patients"
                yAxisFormatter={formatNumber}
                renderTooltip={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{label}</div>
                      <div className="text-[#52514e]">{formatNumber(payload[0].value)} patients in the current view</div>
                    </>,
                  )
                }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <SectionHeader>No-show rate vs. utilization by office</SectionHeader>
            <BarChart
              data={officeNoShowVsUtilData}
              horizontal
              height={480}
              series={[
                { key: 'utilization', name: 'Utilization %', color: BRAND.primary },
                { key: 'no_show', name: 'No-show rate %', color: STATUS.critical },
              ]}
              yAxisLabel="Percent"
              yAxisFormatter={(v) => `${v}%`}
              renderTooltip={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const row = payload[0].payload
                return tooltipBox(
                  <>
                    <div className="font-semibold text-[#0b0b0b]">{label}</div>
                    <div className="text-[#52514e]">{row.utilization.toFixed(1)}% utilization · {row.no_show}% no-show</div>
                  </>,
                )
              }}
            />
          </div>

          <div>
            <SectionHeader>By-office summary</SectionHeader>
            <DataTable
              maxHeight="420px"
              columns={[
                { key: 'office_name', label: 'Office' },
                { key: 'region', label: 'Region', format: (v) => <RegionBadge region={v} /> },
                { key: 'total_appointments', label: 'Appointments', format: formatNumber, title: 'All scheduled appointments in the current view' },
                { key: 'total_surgeries', label: 'Surgeries', format: formatNumber },
                { key: 'no_show_rate', label: 'No-show', format: (v) => formatPercent(v), title: 'Completed + No-Show appointments where the patient did not arrive' },
                { key: 'referral_completion_rate', label: 'Referral completion', format: (v) => formatPercent(v) },
                { key: 'utilization_pct', label: 'Utilization', format: (v) => `${v.toFixed(1)}%`, title: 'Completed visits vs. estimated provider capacity' },
              ]}
              rows={data.byOffice.offices}
              onRowClick={(row) => officeFilter.setChecked([row.office_id])}
              isRowActive={(row) => officeFilter.isRestricted && officeFilter.checked.length === 1 && officeFilter.checked[0] === row.office_id}
            />
          </div>
        </>
      )}
    </DashboardPageLayout>
  )
}
