import { useMemo } from 'react'
import ActionPlan from '../components/ActionPlan'
import AskAi from '../components/AskAi'
import AttentionPanel from '../components/AttentionPanel'
import DashboardPageLayout from '../components/DashboardPageLayout'
import DataTable from '../components/DataTable'
import HealthIndicator from '../components/HealthIndicator'
import KpiStrip from '../components/KpiStrip'
import SectionBand from '../components/SectionBand'
import SectionHeader from '../components/SectionHeader'
import { STATUS, CHROME, CATEGORICAL } from '../theme/chartColors'
import { useDashboardData } from '../hooks/useDashboardData'
import { formatNumber, formatPercent } from '../utils/format'

const ENDPOINTS = {
  overview: '/api/data-quality/overview',
  summary: '/api/data-quality/summary',
  duplicates: '/api/data-quality/duplicates',
}

function computeAttention(data) {
  const o = data.overview
  if (!o) return []
  const items = []

  for (const f of o.by_file.filter((f) => f.status === 'red').sort((a, b) => b.issue_pct - a.issue_pct)) {
    items.push({
      severity: 'critical',
      title: `${f.file} exceeds the defect threshold`,
      metric: formatPercent(f.issue_pct / 100),
      detail: `${formatNumber(f.issue_rows)} of ${formatNumber(f.rows)} rows carry a defect. Hold metrics that depend on this file until reviewed.`,
    })
  }
  if (o.orphaned_fk_total > 0) {
    const worst = o.orphans_by_relationship[0]
    items.push({
      severity: 'critical',
      title: 'Orphaned foreign keys',
      metric: formatNumber(o.orphaned_fk_total),
      detail: `Rows reference a provider, office, or patient that doesn't exist${worst ? ` (worst: ${worst.label}, ${formatNumber(worst.value)})` : ''}. Repair or drop before any join or aggregates silently under-count.`,
    })
  }
  if (o.duplicate_id_total > 0) {
    items.push({
      severity: 'warning',
      title: 'Duplicate primary keys',
      metric: formatNumber(o.duplicate_id_total),
      detail: `${data.duplicates.appointment_id_duplicates} appointment and ${data.duplicates.referral_id_duplicates} referral IDs repeat — de-duplicate at ingestion to stop double-counting.`,
    })
  }
  if (o.inconsistent_completions > 0) {
    items.push({
      severity: 'warning',
      title: 'Completed referrals with no completion date',
      metric: formatNumber(o.inconsistent_completions),
      detail: 'Breaks turnaround calculations — backfill the date or clear the flag.',
    })
  }
  if (o.missing_cells > 0) {
    items.push({
      severity: 'info',
      title: 'Empty required fields',
      metric: formatNumber(o.missing_cells),
      detail: `Mostly ${o.missing_by_column[0]?.label ?? 'a few columns'}. Add ingestion validation to reject or quarantine incomplete records.`,
    })
  }
  if (items.length === 0) {
    items.push({ severity: 'good', title: 'The dataset is clean', detail: 'No missing required fields, orphaned references, duplicates, or inconsistent records.' })
  }
  return items
}

function computeActionPlan(data) {
  return computeAttention(data)
    .filter((i) => i.severity !== 'good')
    .map((i) => `${i.title} (${i.metric ?? ''}) — ${i.detail}`)
}

function answerDq(question, data) {
  const q = question.toLowerCase()
  const o = data.overview
  if (!o) return "Data isn't loaded yet — try again in a moment."
  const fileM = o.by_file.find((f) => q.includes(f.file.replace('.csv', '')))
  if (fileM) return `${fileM.file}: ${formatNumber(fileM.rows)} rows, ${formatNumber(fileM.issue_rows)} with a defect (${formatPercent(fileM.issue_pct / 100)}) — status ${fileM.status}.`
  if (/orphan|foreign key|fk|reference|integrity/.test(q)) {
    const worst = o.orphans_by_relationship[0]
    return `${formatNumber(o.orphaned_fk_total)} orphaned foreign-key rows.${worst ? ` Worst: ${worst.label} (${formatNumber(worst.value)}).` : ''}`
  }
  if (/duplicate|dedup|double/.test(q)) return `${data.duplicates.appointment_id_duplicates} duplicate appointment IDs and ${data.duplicates.referral_id_duplicates} duplicate referral IDs.`
  if (/missing|null|empty|complete/.test(q)) {
    const top = o.missing_by_column[0]
    return `${formatNumber(o.missing_cells)} required cells are empty.${top ? ` Most in ${top.label} (${formatNumber(top.value)}).` : ''}`
  }
  if (/inconsist|completion date|flag/.test(q)) return `${formatNumber(o.inconsistent_completions)} referrals are flagged completed but have no completion date.`
  if (/health|score|trust|overall|quality/.test(q)) return `${formatPercent(1 - o.issue_row_pct / 100)} of rows are clean. ${o.files_green} files green, ${o.files_yellow} yellow, ${o.files_red} red.`
  return 'I can answer questions about overall data health, missing fields, orphaned references, duplicate IDs, inconsistent records, or a specific file — try rephrasing.'
}

export default function DataQualityPage() {
  const { data, status, error } = useDashboardData(ENDPOINTS, {})

  const attention = useMemo(() => (data ? computeAttention(data) : []), [data])
  const actionPlanItems = useMemo(() => (data ? computeActionPlan(data) : []), [data])

  // Referential-integrity + uniqueness + consistency defects in one worklist.
  const integrityRows = useMemo(() => {
    if (!data) return []
    const rows = (data.overview.orphans_by_relationship ?? []).map((o) => ({
      issue: `Orphaned: ${o.label}`,
      count: o.value,
      note: 'References a record that does not exist — drop or repair before joining.',
    }))
    if (data.duplicates.appointment_id_duplicates > 0) {
      rows.push({ issue: 'Duplicate appointment IDs', count: data.duplicates.appointment_id_duplicates, note: 'Inflates any count that joins on appointment_id.' })
    }
    if (data.duplicates.referral_id_duplicates > 0) {
      rows.push({ issue: 'Duplicate referral IDs', count: data.duplicates.referral_id_duplicates, note: 'Inflates any count that joins on referral_id.' })
    }
    if (data.overview.inconsistent_completions > 0) {
      rows.push({ issue: 'Completed referral, no completion date', count: data.overview.inconsistent_completions, note: 'Turnaround metrics skip these rows — backfill the date or clear the flag.' })
    }
    return rows.sort((a, b) => b.count - a.count)
  }, [data])

  const kpiItems = data
    ? [
        {
          label: 'Row integrity',
          value: formatPercent(1 - data.overview.issue_row_pct / 100),
          subtext: `${formatNumber(data.overview.total_issue_rows)} of ${formatNumber(data.overview.total_rows)} rows flagged`,
          tooltip: 'Share of rows across all six files with no missing required field, orphaned reference, duplicate key, or inconsistency.',
        },
        {
          label: 'Completeness',
          value: formatNumber(data.overview.missing_cells),
          subtext: 'empty required cells',
          tooltip: 'Empty cells in columns that should always be populated (expected-null columns are excluded).',
          accent: data.overview.missing_cells > 0 ? CATEGORICAL[3] : undefined,
        },
        {
          label: 'Referential integrity',
          value: formatNumber(data.overview.orphaned_fk_total),
          subtext: 'rows pointing to missing records',
          tooltip: 'Rows whose provider / office / patient foreign key has no matching record.',
          accent: data.overview.orphaned_fk_total > 0 ? STATUS.critical : undefined,
        },
        {
          label: 'Uniqueness',
          value: formatNumber(data.overview.duplicate_id_total),
          subtext: `${data.duplicates.appointment_id_duplicates} appt · ${data.duplicates.referral_id_duplicates} referral`,
          tooltip: 'Repeated primary keys in appointments and referrals — a double-counting risk on any join.',
          accent: data.overview.duplicate_id_total > 0 ? STATUS.critical : undefined,
        },
        {
          label: 'Consistency',
          value: formatNumber(data.overview.inconsistent_completions),
          subtext: 'completed, no date',
          tooltip: 'Referrals flagged completed that have no completion date — breaks turnaround calculations.',
          accent: data.overview.inconsistent_completions > 0 ? STATUS.warning : undefined,
        },
      ]
    : []

  return (
    <DashboardPageLayout
      title="Data Quality"
      subtitle="Can you trust the numbers on the other four dashboards? A dataset-wide integrity check — completeness, referential integrity, duplicate keys, and internal consistency, with the records affected by each defect."
      headerActions={
        <div className="flex items-center gap-2">
          <ActionPlan items={actionPlanItems} />
          <AskAi onAsk={(q) => answerDq(q, data)} />
        </div>
      }
      filterBar={
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-sm" style={{ color: CHROME.muted }}>
          This is a dataset-wide health check and is <span className="font-medium text-[#52514e]">not affected by the dashboard filters</span>. It inspects the raw
          (non-deduplicated) files so defects are measured, not hidden.
        </div>
      }
      keyFindings={attention.length ? <AttentionPanel items={attention} title="Remediation queue" /> : null}
      status={status}
      error={error}
    >
      {data && (
        <>
          <KpiStrip items={kpiItems} />

          <SectionBand title="File-level health" hint="Green ≤ 0 defects · yellow < 2% of rows · red ≥ 2%" />

          <DataTable
            columns={[
              { key: 'file', label: 'File' },
              { key: 'status', label: 'Status', format: (v) => <HealthIndicator status={v} label={v === 'green' ? 'Clean' : v === 'yellow' ? 'Watch' : 'At risk'} /> },
              { key: 'rows', label: 'Rows', align: 'right', format: formatNumber },
              { key: 'issue_rows', label: 'Flagged rows', align: 'right', dataBar: true, format: formatNumber },
              { key: 'issue_pct', label: '% flagged', align: 'right', format: (v) => `${v.toFixed(2)}%` },
            ]}
            rows={data.overview.by_file}
          />

          <SectionBand title="Affected records" hint="The specific rows to repair or quarantine before trusting a dependent metric" />

          <div>
            <SectionHeader>Missing required fields</SectionHeader>
            <DataTable
              maxHeight="320px"
              columns={[
                { key: 'file', label: 'File' },
                { key: 'column', label: 'Column' },
                { key: 'count', label: 'Missing rows', align: 'right', dataBar: true, format: formatNumber },
                { key: 'pct', label: '% of file', align: 'right', format: (v) => `${v.toFixed(2)}%` },
              ]}
              rows={data.summary.missing_fields}
            />
          </div>

          <div>
            <SectionHeader>Broken references &amp; duplicate keys</SectionHeader>
            {integrityRows.length ? (
              <DataTable
                columns={[
                  { key: 'issue', label: 'Integrity check' },
                  { key: 'count', label: 'Rows affected', align: 'right', dataBar: true, format: formatNumber },
                  { key: 'note', label: 'Impact' },
                ]}
                rows={integrityRows}
              />
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm" style={{ color: CHROME.muted }}>
                Every foreign key resolves and every primary key is unique.
              </div>
            )}
          </div>
        </>
      )}
    </DashboardPageLayout>
  )
}
