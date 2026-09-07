import pandas as pd
from fastapi import APIRouter, Depends

from ..data_loader import DataStore, get_store
from ..models.schemas import (
    DemographicsResponse,
    HeatmapCell,
    OfficeRollup,
    OverviewByOfficeResponse,
    OverviewSummaryResponse,
    RegionStats,
    RollupStats,
    VolumeHeatmapResponse,
)
from ..utils import (
    SLOTS_PER_PROVIDER_PER_WEEKDAY,
    CommonFilters,
    business_days_between,
    common_filters,
    effective_range,
    filtered_appointments,
    filtered_providers,
    filtered_referrals,
    filtered_surgeries,
    no_show_rate,
    office_region_mask,
    to_points,
)

router = APIRouter()

AGE_BAND_EDGES = [0, 18, 35, 50, 65, 80, 200]
AGE_BAND_LABELS = ["<18", "18-34", "35-49", "50-64", "65-79", "80+"]


def _rollup(appts, surgeries, refs) -> dict:
    return {
        "total_patients": int(appts["patient_id"].nunique()),
        "total_appointments": int(len(appts)),
        "total_surgeries": int(len(surgeries)),
        "avg_no_show_rate": round(no_show_rate(appts), 4),
        "avg_referral_completion": round(float(refs["completed"].mean()), 4) if len(refs) else 0.0,
    }


@router.get("/summary", response_model=OverviewSummaryResponse)
def get_overview_summary(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> OverviewSummaryResponse:
    appts = filtered_appointments(store, f)
    surgeries = filtered_surgeries(store, f)
    refs = filtered_referrals(store, f)

    company_wide = RollupStats(**_rollup(appts, surgeries, refs))

    office_region_map = dict(zip(store.offices["office_id"], store.offices["region"]))
    by_region = []
    for region in sorted(store.offices["region"].unique()):
        r_appts = appts[appts["office_id"].map(office_region_map) == region]
        r_surgeries = surgeries[surgeries["office_id"].map(office_region_map) == region]
        r_refs = refs[refs["office_id"].map(office_region_map) == region]
        by_region.append(RegionStats(region=region, **_rollup(r_appts, r_surgeries, r_refs)))

    return OverviewSummaryResponse(company_wide=company_wide, by_region=by_region)


@router.get("/by-office", response_model=OverviewByOfficeResponse)
def get_overview_by_office(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> OverviewByOfficeResponse:
    appts = filtered_appointments(store, f)
    surgeries = filtered_surgeries(store, f)
    refs = filtered_referrals(store, f)

    lo, hi = effective_range(store.appointments, "appointment_date", f.start_date, f.end_date)
    providers_in_scope = filtered_providers(store, f)
    offices_scope = store.offices[office_region_mask(store.offices, store.offices, f.office_id, f.region)]

    offices_out: list[OfficeRollup] = []
    for _, office in offices_scope.iterrows():
        office_id = office["office_id"]
        o_appts = appts[appts["office_id"] == office_id]
        o_surgeries = surgeries[surgeries["office_id"] == office_id]
        o_refs = refs[refs["office_id"] == office_id]

        office_providers = providers_in_scope[providers_in_scope["primary_office_id"] == office_id]
        capacity = 0.0
        for _, prov in office_providers.iterrows():
            active_start = max(prov["hire_date"].date(), lo)
            capacity += SLOTS_PER_PROVIDER_PER_WEEKDAY * business_days_between(active_start, hi)
        completed_visits = int((o_appts["status"] == "Completed").sum())
        utilization_pct = round(completed_visits / capacity * 100, 2) if capacity > 0 else 0.0

        offices_out.append(OfficeRollup(
            office_id=office_id,
            office_name=office["office_name"],
            region=office["region"],
            total_appointments=int(len(o_appts)),
            total_surgeries=int(len(o_surgeries)),
            no_show_rate=round(no_show_rate(o_appts), 4),
            referral_completion_rate=round(float(o_refs["completed"].mean()), 4) if len(o_refs) else 0.0,
            utilization_pct=utilization_pct,
        ))

    return OverviewByOfficeResponse(offices=offices_out)


@router.get("/demographics", response_model=DemographicsResponse)
def get_demographics(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> DemographicsResponse:
    """Not in the original Phase 2 spec — added at the user's request. Scoped
    the same way total_patients is in /summary: the set of distinct patients
    who have an appointment matching the current filters."""
    appts = filtered_appointments(store, f)
    patient_ids = appts["patient_id"].unique()
    patients_in_scope = store.patients[store.patients["patient_id"].isin(patient_ids)]

    by_gender_series = patients_in_scope["gender"].fillna("Unknown").value_counts()
    by_insurance_series = patients_in_scope["insurance_type"].fillna("Unknown").value_counts()

    ref_date = store.appointments["appointment_date"].max()
    ages = (ref_date - patients_in_scope["date_of_birth"]).dt.days // 365
    age_band = pd.cut(ages, bins=AGE_BAND_EDGES, labels=AGE_BAND_LABELS, right=False)
    by_age_series = age_band.value_counts().reindex(AGE_BAND_LABELS, fill_value=0)

    return DemographicsResponse(
        by_gender=to_points(by_gender_series, round_ndigits=0),
        by_age_band=to_points(by_age_series, round_ndigits=0),
        by_insurance=to_points(by_insurance_series, round_ndigits=0),
    )


@router.get("/volume-heatmap", response_model=VolumeHeatmapResponse)
def get_volume_heatmap(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> VolumeHeatmapResponse:
    """Appointment counts as a region x month matrix — surfaces regional load
    and seasonality that the single-line volume trend flattens together.
    Filtered identically to every other Overview endpoint."""
    appts = filtered_appointments(store, f)
    if len(appts) == 0:
        return VolumeHeatmapResponse(rows=[], columns=[], cells=[])

    office_region_map = dict(zip(store.offices["office_id"], store.offices["region"]))
    df = appts.assign(
        region=appts["office_id"].map(office_region_map),
        month=appts["appointment_date"].dt.to_period("M").astype(str),
    ).dropna(subset=["region", "month"])

    rows = sorted(df["region"].unique())
    columns = sorted(df["month"].unique())
    counts = df.groupby(["region", "month"]).size()

    cells = [
        HeatmapCell(row=region, column=month, value=int(counts.get((region, month), 0)))
        for region in rows
        for month in columns
    ]
    return VolumeHeatmapResponse(rows=rows, columns=columns, cells=cells)
