"""Pydantic response models. Every endpoint returns one of these — never a raw
DataFrame dump — so the frontend always gets predictable, chart-ready JSON."""

from __future__ import annotations

from pydantic import BaseModel


class ChartPoint(BaseModel):
    label: str
    value: float


class TrendPoint(BaseModel):
    date: str
    value: float


class HeatmapCell(BaseModel):
    """One cell of a row x column matrix heatmap (see the Overview
    region x month volume map and the Patient Access no-show map)."""

    row: str
    column: str
    value: float


# --- /api/filters --------------------------------------------------------


class OfficeOption(BaseModel):
    office_id: str
    office_name: str
    region: str


class FilterOptionsResponse(BaseModel):
    offices: list[OfficeOption]
    regions: list[str]
    subspecialties: list[str]


# --- /api/access -----------------------------------------------------------


class NoShowRateResponse(BaseModel):
    overall_rate: float
    by_office: list[ChartPoint]
    by_subspecialty: list[ChartPoint]
    trend: list[TrendPoint]


class WaitTimesResponse(BaseModel):
    overall_avg: float
    by_subspecialty: list[ChartPoint]
    by_office: list[ChartPoint]


class AppointmentVolumeResponse(BaseModel):
    trend: list[TrendPoint]
    by_type: list[ChartPoint]


class AccessSummaryResponse(BaseModel):
    """The Patient Access scorecard: how fast patients get in (time to
    appointment, same-/next-day access, 14-day SLA attainment), how much
    booked capacity leaks away (no-show / cancel / reschedule vs. slot
    realization), and whether downstream ancillary referrals actually close.
    All under the shared filter contract."""

    total_appointments: int
    new_patient_appointments: int

    median_new_patient_wait_days: float
    mean_new_patient_wait_days: float
    median_followup_wait_days: float
    pct_new_within_14d: float
    pct_new_within_30d: float
    short_notice_rate: float  # booked <= 2 days out, all appointment types

    no_show_rate: float
    cancellation_rate: float  # cancelled only
    reschedule_rate: float
    slot_realization_rate: float  # completed / all booked slots

    referral_completion_rate: float
    median_referral_turnaround_days: float
    open_referral_count: int
    median_open_referral_age_days: float

    by_status: list[ChartPoint]  # Completed / No-Show / Cancelled / Rescheduled counts


class WaitBucketStat(BaseModel):
    label: str
    new_patient: int
    follow_up: int


class WaitDistributionResponse(BaseModel):
    """Histogram of lead time (scheduled -> appointment) so the wait reads as
    a distribution, not just a mean. New Patient and Follow-Up side by side."""

    buckets: list[WaitBucketStat]
    new_patient_median: float
    follow_up_median: float


class LeadTimeNoShowStat(BaseModel):
    label: str
    no_show_rate: float
    appointments: int


class NoShowByLeadTimeResponse(BaseModel):
    """No-show rate per lead-time bucket — quantifies the classic access
    finding that appointments booked far out are kept far less often."""

    buckets: list[LeadTimeNoShowStat]


class AccessTrendResponse(BaseModel):
    wait_trend: list[TrendPoint]  # monthly median new-patient wait (days)
    sla_trend: list[TrendPoint]  # monthly % of new patients seen within 14 days
    new_share_trend: list[TrendPoint]  # monthly new-patient appts as % of all


class ReferralAccessStat(BaseModel):
    service_type: str
    completion_rate: float
    median_turnaround_days: float
    open_count: int


class OnsiteAccessStat(BaseModel):
    label: str  # "On-site" | "Off-site"
    completion_rate: float
    median_turnaround_days: float
    referrals: int


class ReferralAccessResponse(BaseModel):
    """Downstream access: once a patient is referred for PT / imaging /
    orthotics, do they actually get the service, and how fast? On-site vs.
    off-site compares offices that have the service in the building."""

    by_service: list[ReferralAccessStat]
    onsite_vs_offsite: list[OnsiteAccessStat]


class AccessOfficeRollup(BaseModel):
    office_id: str
    office_name: str
    region: str
    has_onsite_pt: bool
    has_onsite_imaging: bool
    new_patient_appointments: int
    median_new_patient_wait_days: float
    pct_new_within_14d: float
    short_notice_rate: float
    no_show_rate: float
    referral_completion_rate: float


class AccessByOfficeResponse(BaseModel):
    offices: list[AccessOfficeRollup]


class WaitHeatmapResponse(BaseModel):
    """Median new-patient wait (days) as a subspecialty x month matrix.
    Rows are ordered slowest-first."""

    rows: list[str]
    columns: list[str]
    cells: list[HeatmapCell]


# --- /api/productivity -------------------------------------------------


class ProviderVisitCount(BaseModel):
    label: str
    value: float
    subspecialty: str
    office_id: str


class VisitsPerProviderResponse(BaseModel):
    providers: list[ProviderVisitCount]


class SurgicalVolumeResponse(BaseModel):
    by_provider: list[ChartPoint]
    by_subspecialty: list[ChartPoint]
    trend: list[TrendPoint]


class OfficeUtilizationDetail(BaseModel):
    office_id: str
    office_name: str
    completed_visits: int
    estimated_capacity: float
    utilization_pct: float


class UtilizationResponse(BaseModel):
    by_office: list[ChartPoint]
    detail: list[OfficeUtilizationDetail]


class ProductivitySummaryResponse(BaseModel):
    """Provider Productivity scorecard: clinic throughput (visits per
    provider and per active clinic day), surgical output, panel size, and
    how evenly work is distributed — plus the ramp drag from newly hired
    providers. All under the shared filter contract."""

    active_providers: int
    surgeon_count: int
    total_completed_visits: int
    total_surgeries: int
    median_visits_per_provider: float
    median_visits_per_active_day: float
    median_panel_patients: float
    median_surgeries_per_surgeon: float
    network_utilization_pct: float
    outpatient_share: float
    ramping_providers: int  # hired within the last ~6 months of the data window
    by_case_setting: list[ChartPoint]  # Outpatient / Inpatient counts
    visit_trend: list[TrendPoint]  # completed visits per month
    surgery_trend: list[TrendPoint]


class ProviderProductivityRow(BaseModel):
    provider_id: str
    provider_name: str
    subspecialty: str
    office_name: str
    is_surgeon: bool
    tenure_months: int
    completed_visits: int
    panel_patients: int
    new_patient_share: float
    no_show_rate: float
    visits_per_active_day: float
    surgeries: int


class ProductivityByProviderResponse(BaseModel):
    providers: list[ProviderProductivityRow]


class WorkloadHeatmapResponse(BaseModel):
    """Completed clinic visits as a subspecialty x month matrix — where the
    clinical workload actually lands. Rows ordered busiest-first."""

    rows: list[str]
    columns: list[str]
    cells: list[HeatmapCell]


# --- /api/ancillary ----------------------------------------------------


class ReferralCompletionResponse(BaseModel):
    by_service_type: list[ChartPoint]
    by_office: list[ChartPoint]


class AncillaryVolumeResponse(BaseModel):
    trend: list[TrendPoint]
    by_service_type: list[ChartPoint]


class LeakageServiceStat(BaseModel):
    service_type: str
    onsite_completion_rate: float
    offsite_completion_rate: float
    offsite_referral_share: float


class LeakageResponse(BaseModel):
    services: list[LeakageServiceStat]


class AncillaryServiceStat(BaseModel):
    service_type: str
    referrals: int
    completion_rate: float
    median_turnaround_days: float
    open_count: int


class AncillarySummaryResponse(BaseModel):
    """Ancillary Services scorecard: do referred patients actually get their
    PT / imaging / orthotics, how fast, and how much leaks out of network
    when the service isn't in the building."""

    total_referrals: int
    completed_referrals: int
    completion_rate: float
    median_turnaround_days: float
    open_referral_count: int
    median_open_referral_age_days: float
    onsite_completion_rate: float
    offsite_completion_rate: float
    onsite_referral_share: float  # PT + imaging booked into an office that has it
    by_service: list[AncillaryServiceStat]
    by_age_bucket: list[ChartPoint]  # open referrals by age bucket
    completion_trend: list[TrendPoint]
    volume_trend: list[TrendPoint]


class OnsiteComparisonStat(BaseModel):
    service_type: str
    onsite_completion_rate: float
    offsite_completion_rate: float
    onsite_turnaround_days: float
    offsite_turnaround_days: float
    onsite_referrals: int
    offsite_referrals: int


class OnsiteComparisonResponse(BaseModel):
    services: list[OnsiteComparisonStat]


class AncillaryOfficeRow(BaseModel):
    office_id: str
    office_name: str
    region: str
    has_onsite_pt: bool
    has_onsite_imaging: bool
    referrals: int
    completion_rate: float
    median_turnaround_days: float
    open_count: int


class AncillaryByOfficeResponse(BaseModel):
    offices: list[AncillaryOfficeRow]


class CompletionHeatmapResponse(BaseModel):
    """Referral completion rate as a service x month matrix.
    Rows ordered worst-first."""

    rows: list[str]
    columns: list[str]
    cells: list[HeatmapCell]


# --- /api/data-quality ---------------------------------------------------


class MissingFieldStat(BaseModel):
    file: str
    column: str
    count: int
    pct: float


class OrphanedFkStat(BaseModel):
    relationship: str
    count: int


class FileHealth(BaseModel):
    file: str
    status: str  # "green" | "yellow" | "red"


class DataQualitySummaryResponse(BaseModel):
    missing_fields: list[MissingFieldStat]
    orphaned_fks: list[OrphanedFkStat]
    health_by_file: list[FileHealth]


class DuplicatesResponse(BaseModel):
    appointment_id_duplicates: int
    referral_id_duplicates: int
    duplicate_appointment_ids: list[str]
    duplicate_referral_ids: list[str]


class FileQualityRow(BaseModel):
    file: str
    rows: int
    issue_rows: int
    issue_pct: float
    status: str  # "green" | "yellow" | "red"


class DataQualityOverviewResponse(BaseModel):
    """One trust scorecard for the whole dataset — what share of rows carry a
    real defect, split into the four defect classes, plus a per-file
    breakdown and the concrete records-affected counts a reviewer needs."""

    files_green: int
    files_yellow: int
    files_red: int
    total_rows: int
    total_issue_rows: int
    issue_row_pct: float
    missing_cells: int
    orphaned_fk_total: int
    duplicate_id_total: int
    inconsistent_completions: int
    by_file: list[FileQualityRow]
    issues_by_type: list[ChartPoint]  # Missing fields / Orphaned refs / Duplicate IDs / Inconsistent
    missing_by_column: list[ChartPoint]  # "<file>.<column>" -> count
    orphans_by_relationship: list[ChartPoint]


# --- /api/overview -------------------------------------------------------


class RollupStats(BaseModel):
    total_patients: int
    total_appointments: int
    total_surgeries: int
    avg_no_show_rate: float
    avg_referral_completion: float


class RegionStats(RollupStats):
    region: str


class OverviewSummaryResponse(BaseModel):
    company_wide: RollupStats
    by_region: list[RegionStats]


class OfficeRollup(BaseModel):
    office_id: str
    office_name: str
    region: str
    total_appointments: int
    total_surgeries: int
    no_show_rate: float
    referral_completion_rate: float
    utilization_pct: float


class OverviewByOfficeResponse(BaseModel):
    offices: list[OfficeRollup]


class DemographicsResponse(BaseModel):
    """Not in the original Phase 2 spec — added at the user's request during
    Phase 3 (age/gender/insurance breakdowns for the Overview dashboard)."""

    by_gender: list[ChartPoint]
    by_age_band: list[ChartPoint]
    by_insurance: list[ChartPoint]


class VolumeHeatmapResponse(BaseModel):
    """A region x month matrix of appointment counts for the Overview
    heatmap — added Phase 3 alongside demographics."""

    rows: list[str]
    columns: list[str]
    cells: list[HeatmapCell]
