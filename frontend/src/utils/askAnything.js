import { formatNumber, formatPercent } from './format'

/**
 * Real rule-based Q&A (Phase 3 audit plan Q1 decision), pulled forward from
 * Phase 4 at the user's request — answers run entirely against whatever
 * data is already loaded on the page, no backend call needed.
 */
export function answerQuestion(question, data) {
  const q = question.toLowerCase()
  const offices = data.byOffice?.offices ?? []
  const regions = data.summary?.by_region ?? []
  const company = data.summary?.company_wide

  if (!company) return "Data isn't loaded yet — try again in a moment."

  const officeMatch = offices.find((o) => q.includes(o.office_name.toLowerCase().replace(' orthopaedic center', '')))
  if (officeMatch) {
    return `${officeMatch.office_name}: ${formatNumber(officeMatch.total_appointments)} appointments, ${formatPercent(officeMatch.no_show_rate)} no-show rate, ${formatPercent(officeMatch.referral_completion_rate)} referral completion, ${officeMatch.utilization_pct.toFixed(1)}% utilization.`
  }

  const regionMatch = regions.find((r) => q.includes(r.region.toLowerCase()))
  if (regionMatch) {
    return `${regionMatch.region}: ${formatNumber(regionMatch.total_appointments)} appointments, ${formatNumber(regionMatch.total_patients)} patients, ${formatPercent(regionMatch.avg_no_show_rate)} no-show rate, ${formatPercent(regionMatch.avg_referral_completion)} referral completion.`
  }

  if (/no.?show/.test(q)) {
    const worst = [...offices].sort((a, b) => b.no_show_rate - a.no_show_rate)[0]
    return `No-show rate is ${formatPercent(company.avg_no_show_rate)} in the current view.${worst ? ` ${worst.office_name} is highest at ${formatPercent(worst.no_show_rate)}.` : ''}`
  }
  if (/utiliz/.test(q)) {
    if (!offices.length) return 'No offices in the current view to compute utilization from.'
    const avg = offices.reduce((sum, o) => sum + o.utilization_pct, 0) / offices.length
    const most = [...offices].sort((a, b) => b.utilization_pct - a.utilization_pct)[0]
    return `Average utilization across ${offices.length} office${offices.length !== 1 ? 's' : ''} in view is ${avg.toFixed(1)}%. ${most.office_name} is highest at ${most.utilization_pct.toFixed(1)}%.`
  }
  if (/referral|completion/.test(q)) {
    const best = [...offices].sort((a, b) => b.referral_completion_rate - a.referral_completion_rate)[0]
    return `Referral completion is ${formatPercent(company.avg_referral_completion)} in the current view.${best ? ` ${best.office_name} leads at ${formatPercent(best.referral_completion_rate)}.` : ''}`
  }
  if (/surger/.test(q)) {
    return `${formatNumber(company.total_surgeries)} surgeries in the current view, across ${offices.length} office${offices.length !== 1 ? 's' : ''}.`
  }
  if (/gender/.test(q) && data.demographics?.by_gender) {
    return data.demographics.by_gender.map((g) => `${g.label}: ${formatNumber(g.value)}`).join(', ') + ' patients in the current view.'
  }
  if (/\bage\b/.test(q) && data.demographics?.by_age_band) {
    const top = [...data.demographics.by_age_band].sort((a, b) => b.value - a.value)[0]
    return `Largest age group in view: ${top.label} (${formatNumber(top.value)} patients). Full breakdown is in the age distribution chart below.`
  }
  if (/insurance|payer/.test(q) && data.demographics?.by_insurance) {
    const top = [...data.demographics.by_insurance].sort((a, b) => b.value - a.value)[0]
    return `Most common payer in view: ${top.label} (${formatNumber(top.value)} patients). Full breakdown is in the insurance mix chart below.`
  }
  if (/patient/.test(q)) {
    return `${formatNumber(company.total_patients)} distinct patients in the current view.`
  }
  if (/appointment|volume/.test(q)) {
    const trendPts = data.trend?.trend ?? []
    let trendNote = ''
    if (trendPts.length >= 2) {
      const first = trendPts[0].value
      const last = trendPts[trendPts.length - 1].value
      if (last > first) trendNote = ' Volume has trended up over the period shown.'
      else if (last < first) trendNote = ' Volume has trended down over the period shown.'
    }
    return `${formatNumber(company.total_appointments)} appointments in the current view.${trendNote}`
  }

  return "I can answer questions about no-show rate, utilization, referral completion, surgeries, patients, appointment volume, gender/age/insurance mix, or a specific office/region name — try rephrasing."
}

/**
 * Patient Access page counterpart — same idea (rule-based Q&A over the data
 * already on the page), scoped to access-to-care: time to appointment,
 * short-notice availability, slot leakage, and downstream referral access.
 */
export function answerAccessQuestion(question, data) {
  const q = question.toLowerCase()
  const s = data.summary
  const offices = data.byOffice?.offices ?? []
  const waitSub = data.waitTimes?.by_subspecialty ?? []
  const leadBuckets = data.noShowByLead?.buckets ?? []
  const byService = data.referral?.by_service ?? []
  const onsite = data.referral?.onsite_vs_offsite ?? []

  if (!s) return "Data isn't loaded yet — try again in a moment."

  const officeMatch = offices.find((o) => q.includes(o.office_name.toLowerCase().replace(' orthopaedic center', '')))
  if (officeMatch) {
    return `${officeMatch.office_name}: ${officeMatch.median_new_patient_wait_days.toFixed(0)}-day median new-patient wait, ${formatPercent(officeMatch.pct_new_within_14d)} seen within 14 days, ${formatPercent(officeMatch.short_notice_rate)} booked within 2 days, ${formatPercent(officeMatch.no_show_rate)} no-show, ${formatPercent(officeMatch.referral_completion_rate)} referral completion.`
  }

  const subMatch = waitSub.find((d) => q.includes(d.label.toLowerCase()))
  if (subMatch) {
    return `${subMatch.label}: ${subMatch.value.toFixed(1)}-day average new-patient wait in the current view.`
  }

  const svcMatch = byService.find((d) => q.includes(d.service_type.toLowerCase()))
  if (svcMatch) {
    return `${svcMatch.service_type} referrals: ${formatPercent(svcMatch.completion_rate)} completed, ${svcMatch.median_turnaround_days.toFixed(0)}-day median turnaround, ${formatNumber(svcMatch.open_count)} still open.`
  }

  if (/14.?day|two week|sla|target|on time|within/.test(q)) {
    return `${formatPercent(s.pct_new_within_14d)} of new patients are seen within 14 days (${formatPercent(s.pct_new_within_30d)} within 30). Median new-patient wait is ${s.median_new_patient_wait_days.toFixed(0)} days.`
  }
  if (/same.?day|next.?day|short.?notice|urgent|walk.?in/.test(q)) {
    return `${formatPercent(s.short_notice_rate)} of appointments in view are booked within 2 days — short-notice access is limited.`
  }
  if (/wait|lead.?time|how long|time to (appointment|be seen)|access|backlog/.test(q)) {
    const worst = [...waitSub].sort((a, b) => b.value - a.value)[0]
    return `Median new-patient wait is ${s.median_new_patient_wait_days.toFixed(0)} days (mean ${s.mean_new_patient_wait_days.toFixed(1)}); follow-ups ${s.median_followup_wait_days.toFixed(0)} days.${worst ? ` ${worst.label} is the slowest service line at ${worst.value.toFixed(1)} days.` : ''}`
  }
  if (/no.?show/.test(q)) {
    const near = leadBuckets[0]
    const far = [...leadBuckets].reverse().find((b) => b.appointments > 20)
    const climb = near && far ? ` It climbs from ${formatPercent(near.no_show_rate)} for ${near.label} bookings to ${formatPercent(far.no_show_rate)} for ${far.label}.` : ''
    return `No-show rate is ${formatPercent(s.no_show_rate)} in the current view.${climb}`
  }
  if (/leak|realiz|kept|slot|no.?show.*cancel|utiliz/.test(q)) {
    return `${formatPercent(s.slot_realization_rate)} of booked slots are kept (completed). The rest leak: ${formatPercent(s.no_show_rate)} no-show, ${formatPercent(s.cancellation_rate)} cancelled, ${formatPercent(s.reschedule_rate)} rescheduled.`
  }
  if (/cancel|reschedul/.test(q)) {
    return `${formatPercent(s.cancellation_rate)} of appointments are cancelled and ${formatPercent(s.reschedule_rate)} rescheduled in the current view.`
  }
  if (/on.?site|off.?site|in.?house|building/.test(q) && onsite.length) {
    return onsite.map((o) => `${o.label}: ${formatPercent(o.completion_rate)} completed, ${o.median_turnaround_days.toFixed(0)}-day turnaround`).join('; ') + ' (PT + imaging referrals).'
  }
  if (/referral|downstream|pt\b|physical therapy|imaging|orthotic/.test(q)) {
    return `Ancillary referral completion is ${formatPercent(s.referral_completion_rate)} with a ${s.median_referral_turnaround_days.toFixed(0)}-day median turnaround. ${formatNumber(s.open_referral_count)} referrals are still open (median age ${s.median_open_referral_age_days.toFixed(0)} days).`
  }
  if (/appointment|volume|total|new patient/.test(q)) {
    return `${formatNumber(s.total_appointments)} appointments in the current view, ${formatNumber(s.new_patient_appointments)} of them new patients.`
  }

  return "I can answer questions about new-patient wait, the 14-day access target, short-notice availability, slot leakage / no-shows by lead time, downstream referral access, or a specific office, service line, or subspecialty — try rephrasing."
}

/**
 * Provider Productivity page Q&A — clinic throughput, surgical output,
 * panel size, utilization, and a specific provider / subspecialty.
 */
export function answerProductivityQuestion(question, data) {
  const q = question.toLowerCase()
  const s = data.summary
  const providers = data.byProvider?.providers ?? []
  const utilByOffice = data.utilization?.by_office ?? []
  const surgBySub = data.surgical?.by_subspecialty ?? []
  if (!s) return "Data isn't loaded yet — try again in a moment."

  const pm = providers.find((p) => p.provider_name.toLowerCase().replace('dr. ', '').split(' ').some((t) => t.length > 2 && q.includes(t)))
  if (pm) {
    return `${pm.provider_name} (${pm.subspecialty}, ${pm.office_name}): ${formatNumber(pm.completed_visits)} completed visits, ${formatNumber(pm.panel_patients)} patients on panel, ${pm.visits_per_active_day.toFixed(2)}/clinic day, ${formatPercent(pm.no_show_rate)} no-show${pm.is_surgeon ? `, ${formatNumber(pm.surgeries)} surgeries` : ''}.`
  }
  const om = utilByOffice.find((d) => q.includes(d.label.toLowerCase().replace(' orthopaedic center', '')))
  if (om) return `${om.label} is running at ${om.value.toFixed(1)}% estimated clinic utilization.`
  const subM = surgBySub.find((d) => q.includes(d.label.toLowerCase()))
  if (subM) return `${subM.label}: ${formatNumber(subM.value)} surgical cases in the current view.`

  if (/utiliz|capacity|booked/.test(q)) {
    const most = [...utilByOffice].sort((a, b) => b.value - a.value)[0]
    return `Network clinic utilization is ${s.network_utilization_pct.toFixed(1)}%.${most ? ` ${most.label} is highest at ${most.value.toFixed(1)}%.` : ''}`
  }
  if (/panel|continuity/.test(q)) return `Median panel size is ${formatNumber(s.median_panel_patients)} distinct patients per provider.`
  if (/surg|case|operat|or\b/.test(q)) return `${formatNumber(s.total_surgeries)} surgical cases, median ${formatNumber(s.median_surgeries_per_surgeon)} per surgeon, ${formatPercent(s.outpatient_share)} outpatient.`
  if (/ramp|new hire|hired|onboard/.test(q)) return `${s.ramping_providers} provider(s) were hired within the last ~6 months of the window and are still building volume.`
  if (/visit|throughput|productiv|volume|see/.test(q)) {
    const top = providers[0]
    return `Median provider does ${formatNumber(s.median_visits_per_provider)} completed visits (${s.median_visits_per_active_day.toFixed(2)}/clinic day).${top ? ` ${top.provider_name} leads with ${formatNumber(top.completed_visits)}.` : ''}`
  }
  if (/provider|doctor|staff|fte/.test(q)) return `${s.active_providers} providers in view, ${s.surgeon_count} of them surgeons.`
  return "I can answer questions about clinic throughput, utilization, panel size, surgical output, provider ramp, or a specific provider, office, or subspecialty — try rephrasing."
}

/**
 * Ancillary Services page Q&A — referral completion, turnaround, backlog,
 * and the on-site vs. off-site gap.
 */
export function answerAncillaryQuestion(question, data) {
  const q = question.toLowerCase()
  const s = data.summary
  const byOffice = data.byOffice?.offices ?? []
  const onsite = data.onsite?.services ?? []
  if (!s) return "Data isn't loaded yet — try again in a moment."

  const svc = s.by_service.find((d) => q.includes(d.service_type.toLowerCase()))
  if (svc) {
    return `${svc.service_type}: ${formatNumber(svc.referrals)} referrals, ${formatPercent(svc.completion_rate)} completed, ${svc.median_turnaround_days.toFixed(0)}-day median turnaround, ${formatNumber(svc.open_count)} still open.`
  }
  const om = byOffice.find((o) => q.includes(o.office_name.toLowerCase().replace(' orthopaedic center', '')))
  if (om) {
    return `${om.office_name}: ${formatNumber(om.referrals)} referrals, ${formatPercent(om.completion_rate)} completed, ${om.median_turnaround_days.toFixed(0)}-day turnaround, ${formatNumber(om.open_count)} open. On-site PT ${om.has_onsite_pt ? 'yes' : 'no'}, imaging ${om.has_onsite_imaging ? 'yes' : 'no'}.`
  }
  if (/on.?site|off.?site|in.?house|building|leak/.test(q)) {
    const lift = s.onsite_completion_rate - s.offsite_completion_rate
    const detail = onsite.map((o) => `${o.service_type} ${formatPercent(o.onsite_completion_rate)} vs ${formatPercent(o.offsite_completion_rate)}`).join('; ')
    return `PT + imaging referrals complete ${formatPercent(s.onsite_completion_rate)} on-site vs ${formatPercent(s.offsite_completion_rate)} off-site — a ${formatPercent(lift)} gap. ${detail}.`
  }
  if (/turnaround|how long|days|fast|timely/.test(q)) return `Median referral-to-completion turnaround is ${s.median_turnaround_days.toFixed(0)} days.`
  if (/backlog|open|aging|stale|pending/.test(q)) return `${formatNumber(s.open_referral_count)} referrals are open, median age ${s.median_open_referral_age_days.toFixed(0)} days.`
  if (/complet|close|finish/.test(q)) {
    const worst = [...s.by_service].sort((a, b) => a.completion_rate - b.completion_rate)[0]
    return `Referral completion is ${formatPercent(s.completion_rate)}.${worst ? ` ${worst.service_type} is lowest at ${formatPercent(worst.completion_rate)}.` : ''}`
  }
  if (/volume|referral|total|count/.test(q)) return `${formatNumber(s.total_referrals)} ancillary referrals in the current view, ${formatNumber(s.completed_referrals)} completed.`
  return "I can answer questions about referral completion, turnaround, the open backlog, the on-site vs off-site gap, or a specific service line or office — try rephrasing."
}
