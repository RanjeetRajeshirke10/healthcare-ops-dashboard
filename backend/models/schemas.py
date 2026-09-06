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
