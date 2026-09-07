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
import SectionBand from '../components/SectionBand'
import SectionHeader from '../components/SectionHeader'
import { STATUS, CHROME, CATEGORICAL } from '../theme/chartColors'
import { useDashboardData } from '../hooks/useDashboardData'
import { useFilterOptions } from '../hooks/useFilterOptions'
import { useMultiSelectFilter } from '../hooks/useMultiSelectFilter'
import { formatNumber, formatPercent, trendDelta, trendValues } from '../utils/format'
import { answerProductivityQuestion } from '../utils/askAnything'

const ENDPOINTS = {
  summary: '/api/productivity/summary',
  byProvider: '/api/productivity/by-provider',
  surgical: '/api/productivity/surgical-volume',
  utilization: '/api/productivity/utilization',
  workloadHeatmap: '/api/productivity/workload-heatmap',
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function formatMonth(bucket) {
  const [year, month] = bucket.split('-')
  return `${MONTH_ABBR[Number(month) - 1]} '${year.slice(2)}`
}

const TARGET_UTILIZATION = 85
const LOW_VISITS_PER_DAY = 0.6
const OVER_CAPACITY = 100
const LOW_OFFICE_UTIL = 65
const ESTABLISHED_TENURE_MONTHS = 9

function shortName(name) {
  return name.replace('Dr. ', '')
}
function shortOffice(name) {
  return name.replace(/ Orthopaedic Center$/, '')
}

function computeAttention(data) {
  const s = data.summary
  const providers = data.byProvider?.providers ?? []
  const util = data.utilization?.detail ?? []
  if (!s) return []
  const items = []

  const over = [...util].filter((o) => o.utilization_pct > OVER_CAPACITY).sort((a, b) => b.utilization_pct - a.utilization_pct)
  for (const o of over) {
    items.push({
      severity: 'critical',
      title: `${o.office_name} is over clinic capacity`,
      metric: `${o.utilization_pct.toFixed(0)}%`,
      detail: `${formatNumber(o.completed_visits)} completed visits against an estimated capacity of ${formatNumber(o.estimated_capacity)}. Add provider time or scheduling relief.`,
    })
  }
  const underbooked = providers
    .filter((p) => p.tenure_months >= ESTABLISHED_TENURE_MONTHS && p.completed_visits > 0 && p.visits_per_active_day < LOW_VISITS_PER_DAY)
    .sort((a, b) => a.visits_per_active_day - b.visits_per_active_day)
  for (const p of underbooked.slice(0, 4)) {
    items.push({
      severity: 'warning',
      title: `${p.provider_name} is underbooked`,
      metric: `${p.visits_per_active_day.toFixed(2)}/day`,
      detail: `${p.subspecialty} at ${p.office_name} — well below the ${s.median_visits_per_active_day.toFixed(2)} network median. Review template and slot fill.`,
    })
  }
  const under = [...util].filter((o) => o.utilization_pct < LOW_OFFICE_UTIL).sort((a, b) => a.utilization_pct - b.utilization_pct)
  for (const o of under.slice(0, 3)) {
    items.push({
      severity: 'info',
      title: `${o.office_name} clinic is under-used`,
      metric: `${o.utilization_pct.toFixed(0)}%`,
      detail: `Consider redirecting demand here or consolidating sessions.`,
    })
  }
  if (s.ramping_providers > 0) {
    items.push({
      severity: 'info',
      title: `${s.ramping_providers} provider${s.ramping_providers > 1 ? 's' : ''} still ramping`,
      metric: `~6 mo`,
      detail: `Hired within the last half-year of the window — clinic volume from these providers should keep rising.`,
    })
  }
  if (items.length === 0) {
    items.push({ severity: 'good', title: 'No productivity exceptions in view', detail: 'Throughput, utilization, and case volume are all within normal ranges.' })
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

export default function ProviderProductivityPage() {
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

  const providers = useMemo(() => data?.byProvider?.providers ?? [], [data])

  // The 10 busiest and 5 lightest providers by completed clinic volume.
  const visitsByProviderData = useMemo(() => {
    if (providers.length <= 16) return providers.map((p) => ({ label: shortName(p.provider_name), value: p.completed_visits }))
    return [...providers.slice(0, 10), ...providers.slice(-5)].map((p) => ({ label: shortName(p.provider_name), value: p.completed_visits }))
  }, [providers])

  const utilByOfficeData = useMemo(
    () => (data?.utilization?.by_office ?? []).map((d) => ({ label: shortOffice(d.label), value: d.value })).sort((a, b) => b.value - a.value),
    [data],
  )
  const surgeryBySubData = useMemo(
    () => (data?.surgical?.by_subspecialty ?? []).map((d) => ({ label: d.label, value: d.value })).sort((a, b) => b.value - a.value),
    [data],
  )
  const surgeryBySurgeonData = useMemo(
    () => (data?.surgical?.by_provider ?? []).map((d) => ({ label: shortName(d.label), value: d.value })).sort((a, b) => b.value - a.value).slice(0, 12),
    [data],
  )
  const caseSettingData = useMemo(() => data?.summary?.by_case_setting ?? [], [data])
  const throughputVsPanelData = useMemo(
    () => providers.map((p) => ({ provider_name: p.provider_name, subspecialty: p.subspecialty, panel_patients: p.panel_patients, completed_visits: p.completed_visits })),
    [providers],
  )
  const heatmapCells = useMemo(
    () => (data?.workloadHeatmap?.cells ?? []).map((c) => ({ row: c.row, column: c.column, value: c.value })),
    [data],
  )

  const attention = useMemo(() => (data ? computeAttention(data) : []), [data])
  const actionPlanItems = useMemo(() => (data ? computeActionPlan(data) : []), [data])
  const medianVisits = data?.summary?.median_visits_per_provider ?? 0

  const kpiItems = data
    ? [
        {
          label: 'Clinic utilization',
          value: formatPercent(data.summary.network_utilization_pct / 100),
          subtext: `network · target ${TARGET_UTILIZATION}%`,
          tooltip: 'Completed visits vs. a flat-capacity estimate across every provider active in the window.',
          trend: trendValues(data.summary.visit_trend),
          accent: data.summary.network_utilization_pct < TARGET_UTILIZATION ? STATUS.warning : undefined,
        },
        {
          label: 'Completed visits',
          value: formatNumber(data.summary.total_completed_visits),
          subtext: `median ${formatNumber(data.summary.median_visits_per_provider)}/provider`,
          tooltip: 'All completed clinic visits in the current filtered view.',
          trend: trendValues(data.summary.visit_trend),
          change: { ...trendDelta(data.summary.visit_trend), goodWhen: 'up' },
        },
        {
          label: 'Surgical cases',
          value: formatNumber(data.summary.total_surgeries),
          subtext: `median ${formatNumber(data.summary.median_surgeries_per_surgeon)}/surgeon · ${formatPercent(data.summary.outpatient_share)} outpatient`,
          tooltip: 'Surgical procedures performed in the current filtered view.',
          trend: trendValues(data.summary.surgery_trend),
          change: { ...trendDelta(data.summary.surgery_trend), goodWhen: 'up' },
        },
        {
          label: 'Visits / clinic day',
          value: data.summary.median_visits_per_active_day.toFixed(2),
          subtext: 'median provider',
          tooltip: 'Median completed visits per Mon–Fri clinic day a provider was active in the window.',
        },
        {
          label: 'Active providers',
          value: formatNumber(data.summary.active_providers),
          subtext: `${data.summary.surgeon_count} surgeons · ${data.summary.ramping_providers} ramping`,
          tooltip: 'Providers with any activity in the current filtered view.',
        },
      ]
    : []

  return (
    <DashboardPageLayout
      title="Provider Productivity"
      subtitle="Clinical output across the network — clinic throughput, surgical volume, how full the schedule runs by location, and the ramp drag from newly hired providers. Click a chart bar or table row to filter the view."
      headerActions={
        <div className="flex items-center gap-2">
          <ActionPlan items={actionPlanItems} />
          <AskAi onAsk={(q) => answerProductivityQuestion(q, data)} />
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

          <SectionBand title="Clinic throughput" hint="Completed visits, how full the day runs, and who carries the load" />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
              <SectionHeader>Completed visits by provider — busiest &amp; lightest</SectionHeader>
              <BarChart
                data={visitsByProviderData}
                horizontal
                height={380}
                seriesName="Completed visits"
                yAxisLabel="Completed visits"
                yAxisFormatter={formatNumber}
                referenceValue={medianVisits}
                referenceLabel="network median"
                renderTooltip={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const { label, value } = payload[0].payload
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{label}</div>
                      <div className="text-[#52514e]">{formatNumber(value)} completed visits in the current view</div>
                    </>,
                  )
                }}
              />
            </div>

            <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Clinic utilization vs. target</SectionHeader>
              <div className="flex flex-1 items-center justify-center">
                <div className="w-full max-w-xs">
                  <MeterChart
                    value={data.summary.network_utilization_pct}
                    min={0}
                    max={120}
                    target={TARGET_UTILIZATION}
                    valueLabel={formatPercent(data.summary.network_utilization_pct / 100)}
                    caption={`Target ≥ ${TARGET_UTILIZATION}% · completed visits vs. estimated capacity`}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Clinic visit volume trend</SectionHeader>
              <AreaChart
                data={data.summary.visit_trend}
                seriesName="Completed visits"
                xAxisLabel="Month"
                yAxisLabel="Completed visits"
                xAxisFormatter={formatMonth}
                yAxisFormatter={formatNumber}
                renderTooltip={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{formatMonth(label)}</div>
                      <div className="text-[#52514e]">{formatNumber(payload[0].value)} completed visits</div>
                    </>,
                  )
                }}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Throughput vs. panel size by provider</SectionHeader>
              <ScatterChart
                data={throughputVsPanelData}
                xKey="panel_patients"
                yKey="completed_visits"
                colorBy="subspecialty"
                xAxisLabel="Distinct patients (panel)"
                yAxisLabel="Completed visits"
                xAxisFormatter={formatNumber}
                yAxisFormatter={formatNumber}
                renderTooltip={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0].payload
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{p.provider_name}</div>
                      <div className="text-[#52514e]">{formatNumber(p.completed_visits)} visits across {formatNumber(p.panel_patients)} patients</div>
                    </>,
                  )
                }}
              />
            </div>
          </div>

          <SectionBand title="Surgical volume" hint="Case throughput, mix, and where it concentrates" />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
              <SectionHeader>Surgical volume trend</SectionHeader>
              <LineChart
                data={data.summary.surgery_trend}
                seriesName="Surgical cases"
                xKey="date"
                xAxisLabel="Month"
                xAxisFormatter={formatMonth}
                yAxisLabel="Cases"
                yAxisFormatter={formatNumber}
                renderTooltip={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{formatMonth(label)}</div>
                      <div className="text-[#52514e]">{formatNumber(payload[0].value)} surgical cases</div>
                    </>,
                  )
                }}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Case setting</SectionHeader>
              <DonutChart
                data={caseSettingData}
                colors={[CATEGORICAL[0], CATEGORICAL[4]]}
                renderTooltip={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const { label, value } = payload[0].payload
                  const total = caseSettingData.reduce((sum, d) => sum + d.value, 0)
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{label}</div>
                      <div className="text-[#52514e]">{formatNumber(value)} cases ({total ? formatPercent(value / total) : '0%'})</div>
                    </>,
                  )
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Surgical cases by subspecialty</SectionHeader>
              <BarChart
                data={surgeryBySubData}
                horizontal
                seriesName="Surgical cases"
                yAxisLabel="Cases"
                yAxisFormatter={formatNumber}
                activeLabel={activeSubspecialty}
                onBarClick={(label) => subspecialtyFilter.setChecked([label])}
                renderTooltip={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const { label, value } = payload[0].payload
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{label}</div>
                      <div className="text-[#52514e]">{formatNumber(value)} surgical cases</div>
                      <div className="mt-1 text-[#898781]">Click to filter to this subspecialty</div>
                    </>,
                  )
                }}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHeader>Highest-volume surgeons</SectionHeader>
              <BarChart
                data={surgeryBySurgeonData}
                horizontal
                seriesName="Surgical cases"
                yAxisLabel="Cases"
                yAxisFormatter={formatNumber}
                renderTooltip={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const { label, value } = payload[0].payload
                  return tooltipBox(
                    <>
                      <div className="font-semibold text-[#0b0b0b]">{label}</div>
                      <div className="text-[#52514e]">{formatNumber(value)} surgical cases in the current view</div>
                    </>,
                  )
                }}
              />
            </div>
          </div>

          <SectionBand title="Capacity by location" hint="Which sites are stretched and which have room" />

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <SectionHeader>Clinic utilization by office</SectionHeader>
            <BarChart
              data={utilByOfficeData}
              horizontal
              height={340}
              seriesName="Utilization"
              yAxisLabel="Utilization %"
              yAxisFormatter={(v) => `${v}%`}
              referenceValue={TARGET_UTILIZATION}
              referenceLabel={`${TARGET_UTILIZATION}% target`}
              onBarClick={(label) => {
                const office = filterOptions.offices.find((o) => shortOffice(o.office_name) === label)
                if (office) officeFilter.setChecked([office.office_id])
              }}
              renderTooltip={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const { label, value } = payload[0].payload
                return tooltipBox(
                  <>
                    <div className="font-semibold text-[#0b0b0b]">{label}</div>
                    <div className="text-[#52514e]">{value.toFixed(1)}% estimated clinic utilization</div>
                    <div className="mt-1 text-[#898781]">Click to filter to this office</div>
                  </>,
                )
              }}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <SectionHeader>Clinic visits by subspecialty and month</SectionHeader>
            {heatmapCells.length ? (
              <HeatMap
                rows={data.workloadHeatmap.rows}
                columns={data.workloadHeatmap.columns}
                cells={heatmapCells}
                rowLabelWidth={168}
                formatValue={formatNumber}
                formatColumn={formatMonth}
                renderCellTitle={({ row, column, value }) => `${row} · ${formatMonth(column)}: ${formatNumber(value)} completed visits`}
              />
            ) : (
              <div className="py-12 text-center text-sm" style={{ color: CHROME.muted }}>
                No completed visits in the current view.
              </div>
            )}
          </div>

          <SectionBand title="Provider detail" hint="Sorted by clinic volume — click a row to filter to that subspecialty" />

          <DataTable
            maxHeight="480px"
            rowClickHint="Click to filter to this subspecialty"
            columns={[
              { key: 'provider_name', label: 'Provider' },
              { key: 'subspecialty', label: 'Subspecialty', format: (v) => <Pill text={v} /> },
              { key: 'office_name', label: 'Office' },
              { key: 'is_surgeon', label: 'Role', format: (v) => (v ? 'Surgeon' : 'Clinic') },
              { key: 'tenure_months', label: 'Tenure', align: 'right', format: (v) => `${(v / 12).toFixed(1)} yr` },
              { key: 'completed_visits', label: 'Visits', align: 'right', dataBar: true, format: formatNumber },
              { key: 'visits_per_active_day', label: '/ day', align: 'right', dataBar: true, format: (v) => v.toFixed(2) },
              { key: 'panel_patients', label: 'Panel', align: 'right', dataBar: true, format: formatNumber },
              { key: 'new_patient_share', label: 'New-pt %', align: 'right', format: (v) => formatPercent(v) },
              { key: 'no_show_rate', label: 'No-show', align: 'right', format: (v) => formatPercent(v) },
              { key: 'surgeries', label: 'Surgeries', align: 'right', dataBar: true, format: formatNumber },
            ]}
            rows={providers}
            onRowClick={(row) => subspecialtyFilter.setChecked([row.subspecialty])}
            isRowActive={(row) => activeSubspecialty === row.subspecialty}
          />
        </>
      )}
    </DashboardPageLayout>
  )
}
