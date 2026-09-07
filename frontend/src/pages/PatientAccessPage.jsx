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
import MeterChart from '../components/MeterChart'
import ScatterChart from '../components/ScatterChart'
import SectionHeader from '../components/SectionHeader'
import { STATUS, CHROME, CATEGORICAL } from '../theme/chartColors'
import { useDashboardData } from '../hooks/useDashboardData'
import { useFilterOptions } from '../hooks/useFilterOptions'
import { useMultiSelectFilter } from '../hooks/useMultiSelectFilter'
import { formatNumber, formatPercent, formatDays } from '../utils/format'
import { answerAccessQuestion } from '../utils/askAnything'

const ENDPOINTS = {
  summary: '/api/access/summary',
  waitTimes: '/api/access/wait-times',
  waitDist: '/api/access/wait-distribution',
  noShowByLead: '/api/access/no-show-by-leadtime',
  trend: '/api/access/trend',
  referral: '/api/access/referral-access',
  byOffice: '/api/access/by-office',
  waitHeatmap: '/api/access/wait-heatmap',
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2025-04" -> "Apr '25" for compact month-axis / heatmap-column labels. */
function formatMonth(bucket) {
  const [year, month] = bucket.split('-')
  return `${MONTH_ABBR[Number(month) - 1]} '${year.slice(2)}`
}

function pct1(fraction) {
  return Math.round(fraction * 1000) / 10
}

const SLA_DAYS = 14
const SLA_TARGET = 0.75 // share of new patients that should be seen within 14 days
const LONG_WAIT_DAYS = 21 // action-plan trigger for a service line
const LOW_REALIZATION = 0.75
const HIGH_LEADTIME_NO_SHOW = 0.2
const LOW_SHORT_NOTICE = 0.08
const LOW_REFERRAL_COMPLETION = 0.8

function computeAttention(data) {
  const s = data.summary
  const waitSub = data.waitTimes?.by_subspecialty ?? []
  const offices = data.byOffice?.offices ?? []
  const leadBuckets = data.noShowByLead?.buckets ?? []
  if (!s || !waitSub.length) return []
  const items = []

  const near = leadBuckets.find((b) => b.label === '3-7d')
  const far = leadBuckets.find((b) => b.label === '15-30d')
  if (near && far && far.no_show_rate > HIGH_LEADTIME_NO_SHOW) {
    const ratio = near.no_show_rate > 0 ? (far.no_show_rate / near.no_show_rate).toFixed(1) : null
    items.push({
      severity: 'critical',
      title: 'Long waits are leaking appointments',
      metric: formatPercent(far.no_show_rate),
      detail: `Appointments booked 15–30 days out no-show ${ratio ? `${ratio}×` : 'far'} as often as those booked within a week (${formatPercent(near.no_show_rate)}). Add staged re-confirmation for long-lead bookings, or shorten the horizon.`,
    })
  }
  if (s.pct_new_within_14d < SLA_TARGET) {
    items.push({
      severity: 'warning',
      title: `Only ${formatPercent(s.pct_new_within_14d)} of new patients seen within ${SLA_DAYS} days`,
      metric: formatPercent(s.pct_new_within_14d),
      detail: `Below the ${formatPercent(SLA_TARGET)} target — add protected new-patient blocks, starting with the slowest service lines.`,
    })
  }
  for (const d of waitSub.filter((x) => x.value > LONG_WAIT_DAYS).sort((a, b) => b.value - a.value)) {
    items.push({
      severity: 'warning',
      title: `${d.label} new-patient wait exceeds 3 weeks`,
      metric: formatDays(d.value),
      detail: 'Review scheduling templates and provider capacity for this service line.',
    })
  }
  if (s.short_notice_rate < LOW_SHORT_NOTICE) {
    items.push({
      severity: 'info',
      title: 'Little short-notice capacity',
      metric: formatPercent(s.short_notice_rate),
      detail: `Only ${formatPercent(s.short_notice_rate)} of visits are booked within 2 days — hold a share of daily slots as open-access capacity for urgent referrals.`,
    })
  }
  if (s.referral_completion_rate < LOW_REFERRAL_COMPLETION) {
    items.push({
      severity: 'info',
      title: 'Downstream referral backlog',
      metric: formatNumber(s.open_referral_count),
      detail: `Open ancillary referrals, median age ${formatDays(s.median_open_referral_age_days)} — downstream completion is ${formatPercent(s.referral_completion_rate)}. Stand up referral tracking and patient callbacks.`,
    })
  }
  const lowSlaOffices = offices.filter((o) => o.new_patient_appointments >= 25 && o.pct_new_within_14d < 0.5)
  if (lowSlaOffices.length) {
    items.push({
      severity: 'warning',
      title: `Under half of new patients seen within ${SLA_DAYS} days at ${lowSlaOffices.map((o) => o.office_name).join(', ')}`,
      metric: formatPercent(Math.min(...lowSlaOffices.map((o) => o.pct_new_within_14d))),
      detail: 'These offices are dragging the network SLA down.',
    })
  }
  if (items.length === 0) {
    items.push({ severity: 'good', title: 'No access exceptions in view', detail: 'Time to appointment, slot realization, and referral completion are all within normal ranges.' })
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

function RegionBadge({ region }) {
  return <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-[#52514e]">{region}</span>
}

function OnsiteFlag({ on }) {
  return on ? (
    <span className="font-semibold" style={{ color: STATUS.good }}>✓</span>
  ) : (
    <span style={{ color: CHROME.muted }}>—</span>
  )
}

const STATUS_COLORS = {
  Completed: STATUS.good,
  'No-Show': STATUS.critical,
  Cancelled: STATUS.warning,
  Rescheduled: CHROME.baseline,
}

export default function PatientAccessPage() {
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

  const activeSubspecialty =
    subspecialtyFilter.isRestricted && subspecialtyFilter.checked.length === 1 ? subspecialtyFilter.checked[0] : undefined

  const waitBySubData = useMemo(
    () =>
      (data?.waitTimes?.by_subspecialty ?? [])
        .map((d) => ({ label: d.label, value: Math.round(d.value * 10) / 10 }))
        .sort((a, b) => b.value - a.value),
    [data],
  )
  const noShowByLeadData = useMemo(
    () => (data?.noShowByLead?.buckets ?? []).map((b) => ({ label: b.label, value: pct1(b.no_show_rate), appointments: b.appointments })),
    [data],
  )
  const statusMixData = useMemo(() => data?.summary?.by_status ?? [], [data])
  const waitDistData = useMemo(() => data?.waitDist?.buckets ?? [], [data])
  const waitTrendData = useMemo(
    () => (data?.trend?.wait_trend ?? []).map((p) => ({ date: p.date, value: Math.round(p.value * 10) / 10 })),
    [data],
  )
  const slaTrendData = useMemo(
    () => (data?.trend?.sla_trend ?? []).map((p) => ({ date: p.date, value: pct1(p.value) })),
    [data],
  )
  const newShareTrendData = useMemo(
    () => (data?.trend?.new_share_trend ?? []).map((p) => ({ date: p.date, value: pct1(p.value) })),
    [data],
  )
  const referralByServiceData = useMemo(
    () =>
      (data?.referral?.by_service ?? [])
        .map((d) => ({
          label: d.service_type,
          value: pct1(d.completion_rate),
          turnaround: d.median_turnaround_days,
          open: d.open_count,
        }))
        .sort((a, b) => a.value - b.value),
    [data],
  )
  const heatmapCells = useMemo(
    () => (data?.waitHeatmap?.cells ?? []).map((c) => ({ row: c.row, column: c.column, value: c.value })),
    [data],
  )
  const waitVsNoShowData = useMemo(
    () =>
      (data?.byOffice?.offices ?? []).map((o) => ({
        office_name: o.office_name,
        office: o.office_name.replace(/ Orthopaedic Center$/, ''),
        wait_days: o.median_new_patient_wait_days,
        no_show_rate: pct1(o.no_show_rate),
      })),
    [data],
  )

  const attention = useMemo(() => (data ? computeAttention(data) : []), [data])
  const actionPlanItems = useMemo(() => (data ? computeActionPlan(data) : []), [data])

  const onsite = data?.referral?.onsite_vs_offsite ?? []

  const kpiItems = data
    ? [
        {
          label: 'New-patient wait',
          value: formatDays(data.summary.median_new_patient_wait_days),
          subtext: `Median · mean ${data.summary.mean_new_patient_wait_days.toFixed(1)}d · follow-ups ${data.summary.median_followup_wait_days.toFixed(0)}d`,
          tooltip: 'Median lead time (scheduled date to appointment date) for New Patient appointments in the current view.',
          accent: data.summary.median_new_patient_wait_days > SLA_DAYS ? STATUS.warning : undefined,
        },
        {
          label: `Seen within ${SLA_DAYS} days`,
          value: formatPercent(data.summary.pct_new_within_14d),
          subtext: `of new patients · target ≥ ${formatPercent(SLA_TARGET)}`,
          tooltip: `Share of New Patient appointments booked ${SLA_DAYS} days or less ahead — the access service level.`,
          accent: data.summary.pct_new_within_14d < SLA_TARGET ? STATUS.warning : undefined,
        },
        {
          label: 'Short-notice access',
          value: formatPercent(data.summary.short_notice_rate),
          subtext: 'booked within 2 days',
          tooltip: 'Share of all appointments in view scheduled 2 days or less ahead — a proxy for same-/next-day availability.',
        },
        {
          label: 'Slot realization',
          value: formatPercent(data.summary.slot_realization_rate),
          subtext: 'of booked slots kept',
          tooltip: 'Completed visits as a share of every booked slot (Completed + No-Show + Cancelled + Rescheduled). The inverse is access lost to leakage.',
          accent: data.summary.slot_realization_rate < LOW_REALIZATION ? STATUS.critical : undefined,
        },
        {
          label: 'Referral completion',
          value: formatPercent(data.summary.referral_completion_rate),
          subtext: `${formatNumber(data.summary.open_referral_count)} open · ${data.summary.median_referral_turnaround_days.toFixed(0)}d turnaround`,
          tooltip: 'Share of ancillary referrals (PT, imaging, orthotics, hand therapy) marked completed, with the median days from referral to completion.',
          accent: data.summary.referral_completion_rate < LOW_REFERRAL_COMPLETION ? STATUS.warning : undefined,
        },
      ]
    : []

  return (
    <DashboardPageLayout
      title="Patient Access"
      subtitle="Access to care across the network — how quickly patients get an appointment, how much booked capacity is lost to no-shows and cancellations, and whether downstream referrals actually close. Click a chart bar or table row to filter the view."
      headerActions={
        <div className="flex items-center gap-2">
          <ActionPlan items={actionPlanItems} />
          <AskAi onAsk={(q) => answerAccessQuestion(q, data)} />
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
              <SectionHeader>Time to appointment — new vs. follow-up</SectionHeader>
              <BarChart
                data={waitDistData}
                series={[
                  { key: 'new_patient', name: 'New patient', color: CATEGORICAL[0] },
                  { key: 'follow_up', name: 'Follow-up', color: CATEGORICAL[2] },
                ]}
                xAxisLabel="Lead time (scheduled → visit)"
                yAxisLabel="Appointments"
                yAxisFormatter={formatNumber}
                renderTooltip={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">Booked {label} ahead</div>
                      <div className="text-[#52514e]">{formatNumber(row.new_patient)} new-patient · {formatNumber(row.follow_up)} follow-up</div>
                    </>,
                  )
                }}
              />
            </div>

            <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>New patients seen within {SLA_DAYS} days</SectionHeader>
              <div className="flex flex-1 items-center justify-center">
                <div className="w-full max-w-xs">
                  <MeterChart
                    value={data.summary.pct_new_within_14d * 100}
                    min={0}
                    max={100}
                    target={SLA_TARGET * 100}
                    valueLabel={formatPercent(data.summary.pct_new_within_14d)}
                    caption={`Target ≥ ${formatPercent(SLA_TARGET)} · median wait ${formatDays(data.summary.median_new_patient_wait_days)}`}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
              <SectionHeader>New-patient wait by subspecialty</SectionHeader>
              <BarChart
                data={waitBySubData}
                horizontal
                seriesName="Avg wait (days)"
                yAxisLabel="Days"
                yAxisFormatter={(v) => `${v}d`}
                referenceValue={SLA_DAYS}
                referenceLabel={`${SLA_DAYS}-day target`}
                activeLabel={activeSubspecialty}
                onBarClick={(label) => subspecialtyFilter.setChecked([label])}
                renderTooltip={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const { label, value } = payload[0].payload
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{label}</div>
                      <div className="text-[#52514e]">{formatDays(value)} average new-patient lead time</div>
                      <div className="mt-1 text-[#898781]">Click to filter to this subspecialty</div>
                    </>,
                  )
                }}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Booked slot outcomes</SectionHeader>
              <DonutChart
                data={statusMixData}
                colors={statusMixData.map((d) => STATUS_COLORS[d.label] ?? CHROME.baseline)}
                renderTooltip={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const { label, value } = payload[0].payload
                  const total = statusMixData.reduce((sum, d) => sum + d.value, 0)
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{label}</div>
                      <div className="text-[#52514e]">{formatNumber(value)} slots ({total ? formatPercent(value / total) : '0%'})</div>
                    </>,
                  )
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Access target attainment trend</SectionHeader>
              <AreaChart
                data={slaTrendData}
                seriesName={`% within ${SLA_DAYS} days`}
                xKey="date"
                xAxisFormatter={formatMonth}
                xAxisLabel="Month"
                yAxisLabel={`% within ${SLA_DAYS}d`}
                yAxisFormatter={(v) => `${v}%`}
                renderTooltip={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{formatMonth(label)}</div>
                      <div className="text-[#52514e]">{payload[0].value}% of new patients seen within {SLA_DAYS} days</div>
                    </>,
                  )
                }}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>New-patient share of visits</SectionHeader>
              <LineChart
                data={newShareTrendData}
                seriesName="New-patient share"
                xKey="date"
                xAxisFormatter={formatMonth}
                xAxisLabel="Month"
                yAxisLabel="% of appointments"
                yAxisFormatter={(v) => `${v}%`}
                renderTooltip={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{formatMonth(label)}</div>
                      <div className="text-[#52514e]">{payload[0].value}% of visits were new patients</div>
                      <div className="mt-1 text-[#898781]">A falling share means follow-ups are crowding out new-patient access</div>
                    </>,
                  )
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>No-show rate by appointment lead time</SectionHeader>
              <BarChart
                data={noShowByLeadData}
                seriesName="No-show rate"
                xAxisLabel="Lead time (scheduled → visit)"
                yAxisLabel="No-show rate (%)"
                yAxisFormatter={(v) => `${v}%`}
                referenceValue={15}
                referenceLabel="15% target"
                renderTooltip={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">Booked {label} ahead</div>
                      <div className="text-[#52514e]">{row.value}% no-show across {formatNumber(row.appointments)} kept-or-missed appts</div>
                    </>,
                  )
                }}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>New-patient wait trend</SectionHeader>
              <LineChart
                data={waitTrendData}
                seriesName="Median wait"
                xKey="date"
                xAxisFormatter={formatMonth}
                xAxisLabel="Month"
                yAxisLabel="Median days"
                yAxisFormatter={(v) => `${v}d`}
                renderTooltip={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{formatMonth(label)}</div>
                      <div className="text-[#52514e]">{formatDays(payload[0].value)} median new-patient wait</div>
                    </>,
                  )
                }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <SectionHeader>New-patient wait by subspecialty and month</SectionHeader>
            {heatmapCells.length ? (
              <HeatMap
                rows={data.waitHeatmap.rows}
                columns={data.waitHeatmap.columns}
                cells={heatmapCells}
                rowLabelWidth={168}
                formatValue={(v) => `${Math.round(v)}d`}
                formatColumn={formatMonth}
                renderCellTitle={({ row, column, value }) =>
                  `${row} · ${formatMonth(column)}: ${formatDays(value)} median new-patient wait`
                }
              />
            ) : (
              <div className="py-12 text-center text-sm" style={{ color: CHROME.muted }}>
                No New Patient appointments in the current view.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>New-patient wait vs. no-show rate by office</SectionHeader>
              <ScatterChart
                data={waitVsNoShowData}
                xKey="wait_days"
                yKey="no_show_rate"
                colorBy="office"
                height={360}
                xAxisLabel="Median new-patient wait (days)"
                yAxisLabel="No-show rate (%)"
                xAxisFormatter={(v) => `${v}d`}
                yAxisFormatter={(v) => `${v}%`}
                renderTooltip={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const point = payload[0].payload
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{point.office_name}</div>
                      <div className="text-[#52514e]">{formatDays(point.wait_days)} median wait, {point.no_show_rate}% no-show</div>
                    </>,
                  )
                }}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Downstream referral access by service line</SectionHeader>
              <BarChart
                data={referralByServiceData}
                horizontal
                seriesName="Completion rate"
                yAxisLabel="% of referrals completed"
                yAxisFormatter={(v) => `${v}%`}
                renderTooltip={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{row.label}</div>
                      <div className="text-[#52514e]">{row.value}% completed · {row.turnaround.toFixed(0)}-day median turnaround</div>
                      <div className="mt-1 text-[#898781]">{formatNumber(row.open)} referrals still open</div>
                    </>,
                  )
                }}
              />
              {onsite.length === 2 && (
                <div className="mt-2 text-center text-xs" style={{ color: CHROME.textSecondary }}>
                  PT + imaging referrals close{' '}
                  <span className="font-semibold" style={{ color: STATUS.good }}>{formatPercent(onsite[0].completion_rate)}</span>{' '}
                  of the time when the service is <strong>on-site</strong>, vs{' '}
                  <span className="font-semibold" style={{ color: STATUS.warning }}>{formatPercent(onsite[1].completion_rate)}</span> off-site.
                </div>
              )}
            </div>
          </div>

          <div>
            <SectionHeader>By-office access summary</SectionHeader>
            <DataTable
              maxHeight="440px"
              columns={[
                { key: 'office_name', label: 'Office' },
                { key: 'region', label: 'Region', format: (v) => <RegionBadge region={v} /> },
                { key: 'has_onsite_pt', label: 'On-site PT', format: (v) => <OnsiteFlag on={v} />, title: 'Physical therapy available in this office' },
                { key: 'has_onsite_imaging', label: 'On-site imaging', format: (v) => <OnsiteFlag on={v} />, title: 'Imaging available in this office' },
                { key: 'median_new_patient_wait_days', label: 'New-pt wait', format: (v) => formatDays(v), title: 'Median scheduled-to-visit lead time for New Patient appointments' },
                { key: 'pct_new_within_14d', label: `≤ ${SLA_DAYS} days`, format: (v) => formatPercent(v), title: `Share of new patients seen within ${SLA_DAYS} days` },
                { key: 'short_notice_rate', label: 'Short-notice', format: (v) => formatPercent(v), title: 'Share of appointments booked within 2 days' },
                { key: 'no_show_rate', label: 'No-show', format: (v) => formatPercent(v) },
                { key: 'referral_completion_rate', label: 'Referral completion', format: (v) => formatPercent(v) },
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
