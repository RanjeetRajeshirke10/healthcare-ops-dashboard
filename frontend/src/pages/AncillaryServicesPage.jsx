import { useMemo, useState } from 'react'
import ActionPlan from '../components/ActionPlan'
import AreaChart from '../components/AreaChart'
import AskAi from '../components/AskAi'
import AttentionPanel from '../components/AttentionPanel'
import BarChart from '../components/BarChart'
import DashboardPageLayout from '../components/DashboardPageLayout'
import DataTable from '../components/DataTable'
import DonutChart from '../components/DonutChart'
import FilterBar from '../components/FilterBar'
import HeatMap from '../components/HeatMap'
import KpiStrip from '../components/KpiStrip'
import LineChart from '../components/LineChart'
import MeterChart from '../components/MeterChart'
import ScatterChart from '../components/ScatterChart'
import SectionHeader from '../components/SectionHeader'
import { STATUS, CHROME, CATEGORICAL } from '../theme/chartColors'
import { useDashboardData } from '../hooks/useDashboardData'
import { useFilterOptions } from '../hooks/useFilterOptions'
import { useMultiSelectFilter } from '../hooks/useMultiSelectFilter'
import { formatNumber, formatPercent, formatDays, trendDelta, trendValues } from '../utils/format'
import { answerAncillaryQuestion } from '../utils/askAnything'

const ENDPOINTS = {
  summary: '/api/ancillary/summary',
  onsite: '/api/ancillary/onsite-comparison',
  byOffice: '/api/ancillary/by-office',
  completionHeatmap: '/api/ancillary/completion-heatmap',
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function formatMonth(bucket) {
  const [year, month] = bucket.split('-')
  return `${MONTH_ABBR[Number(month) - 1]} '${year.slice(2)}`
}
function pct1(fraction) {
  return Math.round(fraction * 1000) / 10
}

const TARGET_COMPLETION = 0.8
const LOW_SERVICE_COMPLETION = 0.75
const STALE_BACKLOG_DAYS = 90
const ONSITE_LIFT_TRIGGER = 0.05
const SLOW_TURNAROUND_DAYS = 21

function computeAttention(data) {
  const s = data.summary
  const byOffice = data.byOffice?.offices ?? []
  if (!s || !s.by_service.length) return []
  const items = []

  const stale = s.by_age_bucket.find((b) => b.label === '90d+')
  if (stale && stale.value > 0) {
    items.push({
      severity: 'critical',
      title: 'Aged referral backlog',
      metric: formatNumber(stale.value),
      detail: `Open referrals older than 90 days — ${s.open_referral_count ? formatPercent(stale.value / s.open_referral_count) : '0%'} of everything still open. Triage: reschedule, redirect, or formally close out.`,
    })
  }
  for (const svc of [...s.by_service].sort((a, b) => a.completion_rate - b.completion_rate).filter((d) => d.completion_rate < LOW_SERVICE_COMPLETION)) {
    items.push({
      severity: 'warning',
      title: `${svc.service_type} referrals under-complete`,
      metric: formatPercent(svc.completion_rate),
      detail: `${formatNumber(svc.open_count)} open of ${formatNumber(svc.referrals)}. Stand up a follow-up / callback program.`,
    })
  }
  for (const o of byOffice.filter((o) => o.referrals >= 20 && o.completion_rate < 0.7).sort((a, b) => a.completion_rate - b.completion_rate).slice(0, 3)) {
    items.push({
      severity: 'warning',
      title: `${o.office_name} referral completion is low`,
      metric: formatPercent(o.completion_rate),
      detail: `${formatNumber(o.open_count)} open referrals from this office.`,
    })
  }
  const lift = s.onsite_completion_rate - s.offsite_completion_rate
  if (lift > ONSITE_LIFT_TRIGGER) {
    items.push({
      severity: 'info',
      title: 'On-site services close far more referrals',
      metric: `+${formatPercent(lift)}`,
      detail: `Only ${formatPercent(s.onsite_referral_share)} of PT + imaging referrals land in an office that hosts the service. Expand on-site capacity or add a warm hand-off.`,
    })
  }
  if (s.median_turnaround_days > SLOW_TURNAROUND_DAYS) {
    items.push({
      severity: 'info',
      title: 'Slow referral-to-service turnaround',
      metric: formatDays(s.median_turnaround_days),
      detail: 'Review scheduling capacity at the receiving PT / imaging sites.',
    })
  }
  if (items.length === 0) {
    items.push({ severity: 'good', title: 'No ancillary exceptions in view', detail: 'Completion, turnaround, and backlog age are all within normal ranges.' })
  }
  return items
}

function computeActionPlan(data) {
  return computeAttention(data)
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
function Pill({ text }) {
  return <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-[#52514e]">{text}</span>
}
function OnsiteFlag({ on }) {
  return on ? <span className="font-semibold" style={{ color: STATUS.good }}>✓</span> : <span style={{ color: CHROME.muted }}>—</span>
}

export default function AncillaryServicesPage() {
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

  const completionByServiceData = useMemo(
    () =>
      (data?.summary?.by_service ?? [])
        .map((d) => ({ label: d.service_type, value: pct1(d.completion_rate), turnaround: d.median_turnaround_days, open: d.open_count }))
        .sort((a, b) => a.value - b.value),
    [data],
  )
  const turnaroundByServiceData = useMemo(
    () => (data?.summary?.by_service ?? []).map((d) => ({ label: d.service_type, value: d.median_turnaround_days })).sort((a, b) => b.value - a.value),
    [data],
  )
  const serviceMixData = useMemo(() => (data?.summary?.by_service ?? []).map((d) => ({ label: d.service_type, value: d.referrals })), [data])
  const onsiteCompareData = useMemo(
    () => (data?.onsite?.services ?? []).map((d) => ({ label: d.service_type, onsite: pct1(d.onsite_completion_rate), offsite: pct1(d.offsite_completion_rate) })),
    [data],
  )
  const backlogAgeData = useMemo(() => data?.summary?.by_age_bucket ?? [], [data])
  const heatmapCells = useMemo(
    () => (data?.completionHeatmap?.cells ?? []).map((c) => ({ row: c.row, column: c.column, value: c.value })),
    [data],
  )
  const volumeVsCompletionData = useMemo(
    () =>
      (data?.byOffice?.offices ?? []).map((o) => ({
        office_name: o.office_name,
        office: o.office_name.replace(/ Orthopaedic Center$/, ''),
        referrals: o.referrals,
        completion_rate: pct1(o.completion_rate),
      })),
    [data],
  )
  const completionTrendData = useMemo(
    () => (data?.summary?.completion_trend ?? []).map((p) => ({ date: p.date, value: pct1(p.value) })),
    [data],
  )
  const routingData = useMemo(() => {
    const s = data?.summary
    if (!s) return []
    return [
      { label: 'Booked on-site', value: pct1(s.onsite_referral_share) },
      { label: 'Referred out', value: pct1(1 - s.onsite_referral_share) },
    ]
  }, [data])

  const attention = useMemo(() => (data ? computeAttention(data) : []), [data])
  const actionPlanItems = useMemo(() => (data ? computeActionPlan(data) : []), [data])

  const kpiItems = data
    ? [
        {
          label: 'Completion rate',
          value: formatPercent(data.summary.completion_rate),
          subtext: `target ≥ ${formatPercent(TARGET_COMPLETION)}`,
          tooltip: 'Share of ancillary referrals marked completed.',
          trend: trendValues(data.summary.completion_trend),
          change: { ...trendDelta(data.summary.completion_trend), goodWhen: 'up' },
          accent: data.summary.completion_rate < TARGET_COMPLETION ? STATUS.warning : undefined,
        },
        {
          label: 'Open backlog',
          value: formatNumber(data.summary.open_referral_count),
          subtext: `median age ${formatDays(data.summary.median_open_referral_age_days)}`,
          tooltip: 'Referrals not yet completed, and how old the typical open referral is.',
          accent: data.summary.median_open_referral_age_days > STALE_BACKLOG_DAYS ? STATUS.critical : undefined,
        },
        {
          label: 'Turnaround',
          value: formatDays(data.summary.median_turnaround_days),
          subtext: 'referral → service (median)',
          tooltip: 'Median days from the referral date to the completion date, for completed referrals.',
        },
        {
          label: 'Referral volume',
          value: formatNumber(data.summary.total_referrals),
          subtext: `${formatNumber(data.summary.completed_referrals)} completed`,
          tooltip: 'Ancillary referrals (PT, imaging, orthotics, hand therapy) placed in the current view.',
          trend: trendValues(data.summary.volume_trend),
        },
        {
          label: 'On-site lift',
          value: `+${formatPercent(data.summary.onsite_completion_rate - data.summary.offsite_completion_rate)}`,
          subtext: `on-site ${formatPercent(data.summary.onsite_completion_rate)} vs off-site ${formatPercent(data.summary.offsite_completion_rate)}`,
          tooltip: 'Completion-rate difference for PT + imaging referrals when the service is in the office vs. referred out.',
        },
      ]
    : []

  return (
    <DashboardPageLayout
      title="Ancillary Services"
      subtitle="Downstream care across the network — whether referred patients complete their physical therapy, imaging, and orthotics, how long it takes, and how much leaks out of network when the service isn't in the building. Click a chart bar or table row to filter the view."
      headerActions={
        <div className="flex items-center gap-2">
          <ActionPlan items={actionPlanItems} />
          <AskAi onAsk={(q) => answerAncillaryQuestion(q, data)} />
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

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
              <SectionHeader>On-site vs. off-site completion</SectionHeader>
              <BarChart
                data={onsiteCompareData}
                series={[
                  { key: 'onsite', name: 'On-site', color: STATUS.good },
                  { key: 'offsite', name: 'Off-site', color: STATUS.warning },
                ]}
                xAxisLabel="Service"
                yAxisLabel="Completion rate"
                yAxisFormatter={(v) => `${v}%`}
                renderTooltip={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{label}</div>
                      <div className="text-[#52514e]">On-site {row.onsite}% · off-site {row.offsite}%</div>
                    </>,
                  )
                }}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Referral mix by service</SectionHeader>
              <DonutChart
                data={serviceMixData}
                colors={[CATEGORICAL[0], CATEGORICAL[1], CATEGORICAL[2], CATEGORICAL[4]]}
                renderTooltip={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const { label, value } = payload[0].payload
                  const total = serviceMixData.reduce((sum, d) => sum + d.value, 0)
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{label}</div>
                      <div className="text-[#52514e]">{formatNumber(value)} referrals ({total ? formatPercent(value / total) : '0%'})</div>
                    </>,
                  )
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Referral volume vs. completion by office</SectionHeader>
              <ScatterChart
                data={volumeVsCompletionData}
                xKey="referrals"
                yKey="completion_rate"
                colorBy="office"
                height={360}
                xAxisLabel="Referrals placed"
                yAxisLabel="Completion rate (%)"
                xAxisFormatter={formatNumber}
                yAxisFormatter={(v) => `${v}%`}
                renderTooltip={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0].payload
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{p.office_name}</div>
                      <div className="text-[#52514e]">{formatNumber(p.referrals)} referrals, {p.completion_rate}% completed</div>
                    </>,
                  )
                }}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Where PT &amp; imaging referrals go</SectionHeader>
              <DonutChart
                data={routingData}
                colors={[STATUS.good, STATUS.warning]}
                renderTooltip={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const { label, value } = payload[0].payload
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{label}</div>
                      <div className="text-[#52514e]">{value}% of PT + imaging referrals</div>
                    </>,
                  )
                }}
              />
              <div className="mt-2 text-center text-xs" style={{ color: CHROME.textSecondary }}>
                On-site referrals complete{' '}
                <span className="font-semibold" style={{ color: STATUS.good }}>{formatPercent(data.summary.onsite_completion_rate)}</span> vs{' '}
                <span className="font-semibold" style={{ color: STATUS.warning }}>{formatPercent(data.summary.offsite_completion_rate)}</span> off-site.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
              <SectionHeader>Referral completion by service line</SectionHeader>
              <BarChart
                data={completionByServiceData}
                horizontal
                seriesName="Completion rate"
                yAxisLabel="% of referrals completed"
                yAxisFormatter={(v) => `${v}%`}
                referenceValue={TARGET_COMPLETION * 100}
                referenceLabel={`${formatPercent(TARGET_COMPLETION)} target`}
                renderTooltip={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{row.label}</div>
                      <div className="text-[#52514e]">{row.value}% completed · {row.turnaround.toFixed(0)}-day turnaround</div>
                      <div className="mt-1 text-[#898781]">{formatNumber(row.open)} still open</div>
                    </>,
                  )
                }}
              />
            </div>

            <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Network completion vs. target</SectionHeader>
              <div className="flex flex-1 items-center justify-center">
                <div className="w-full max-w-xs">
                  <MeterChart
                    value={data.summary.completion_rate * 100}
                    min={0}
                    max={100}
                    target={TARGET_COMPLETION * 100}
                    valueLabel={formatPercent(data.summary.completion_rate)}
                    caption={`Target ≥ ${formatPercent(TARGET_COMPLETION)} · ${formatNumber(data.summary.open_referral_count)} open`}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Completion rate trend</SectionHeader>
              <LineChart
                data={completionTrendData}
                seriesName="Completion rate"
                xKey="date"
                xAxisFormatter={formatMonth}
                xAxisLabel="Referral month"
                yAxisLabel="Completion rate (%)"
                yAxisFormatter={(v) => `${v}%`}
                renderTooltip={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{formatMonth(label)}</div>
                      <div className="text-[#52514e]">{payload[0].value}% of referrals placed that month completed</div>
                    </>,
                  )
                }}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Turnaround by service line</SectionHeader>
              <BarChart
                data={turnaroundByServiceData}
                horizontal
                seriesName="Median turnaround"
                yAxisLabel="Days"
                yAxisFormatter={(v) => `${v}d`}
                renderTooltip={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const { label, value } = payload[0].payload
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{label}</div>
                      <div className="text-[#52514e]">{formatDays(value)} median referral-to-service turnaround</div>
                    </>,
                  )
                }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <SectionHeader>Referral completion by service and month</SectionHeader>
            {heatmapCells.length ? (
              <HeatMap
                rows={data.completionHeatmap.rows}
                columns={data.completionHeatmap.columns}
                cells={heatmapCells}
                rowLabelWidth={150}
                formatValue={(v) => `${pct1(v)}%`}
                formatColumn={formatMonth}
                renderCellTitle={({ row, column, value }) => `${row} · ${formatMonth(column)}: ${formatPercent(value)} completed`}
              />
            ) : (
              <div className="py-12 text-center text-sm" style={{ color: CHROME.muted }}>
                No referrals in the current view.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Open referrals by days</SectionHeader>
              <BarChart
                data={backlogAgeData}
                seriesName="Open referrals by days"
                xAxisLabel="Days since referral"
                yAxisLabel="Open referrals"
                yAxisFormatter={formatNumber}
                color={STATUS.serious}
                renderTooltip={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">Open {label}</div>
                      <div className="text-[#52514e]">{formatNumber(payload[0].value)} referrals not yet completed</div>
                    </>,
                  )
                }}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Referral volume trend</SectionHeader>
              <AreaChart
                data={data.summary.volume_trend}
                seriesName="Referrals"
                xAxisLabel="Month"
                yAxisLabel="Referrals"
                xAxisFormatter={formatMonth}
                yAxisFormatter={formatNumber}
                renderTooltip={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{formatMonth(label)}</div>
                      <div className="text-[#52514e]">{formatNumber(payload[0].value)} referrals placed</div>
                    </>,
                  )
                }}
              />
            </div>
          </div>

          <div>
            <SectionHeader>By-office referral summary</SectionHeader>
            <DataTable
              maxHeight="440px"
              rowClickHint="Click to filter to this office"
              columns={[
                { key: 'office_name', label: 'Office' },
                { key: 'region', label: 'Region', format: (v) => <Pill text={v} /> },
                { key: 'has_onsite_pt', label: 'On-site PT', align: 'right', format: (v) => <OnsiteFlag on={v} /> },
                { key: 'has_onsite_imaging', label: 'On-site imaging', align: 'right', format: (v) => <OnsiteFlag on={v} /> },
                { key: 'referrals', label: 'Referrals', align: 'right', dataBar: true, format: formatNumber },
                { key: 'completion_rate', label: 'Completion', align: 'right', format: (v) => formatPercent(v) },
                { key: 'median_turnaround_days', label: 'Turnaround', align: 'right', format: (v) => formatDays(v) },
                { key: 'open_count', label: 'Open', align: 'right', dataBar: true, format: formatNumber },
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
