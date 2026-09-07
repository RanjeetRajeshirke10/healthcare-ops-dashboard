import pandas as pd
from fastapi import APIRouter, Depends, Query

from ..data_loader import DataStore, get_store
from ..models.schemas import (
    HeatmapCell,
    OfficeUtilizationDetail,
    ProductivityByProviderResponse,
    ProductivitySummaryResponse,
    ProviderProductivityRow,
    ProviderVisitCount,
    SurgicalVolumeResponse,
    UtilizationResponse,
    VisitsPerProviderResponse,
    WorkloadHeatmapResponse,
)
from ..utils import (
    SLOTS_PER_PROVIDER_PER_WEEKDAY,
    CommonFilters,
    business_days_between,
    common_filters,
    effective_range,
    filtered_appointments,
    filtered_providers,
    filtered_surgeries,
    office_region_mask,
    to_points,
    trend_points,
)

router = APIRouter()

RAMP_WINDOW_DAYS = 183  # "recently hired" = within ~6 months of the data horizon


def _median(series: pd.Series) -> float:
    s = series.dropna()
    return round(float(s.median()), 1) if len(s) else 0.0


@router.get("/visits-per-provider", response_model=VisitsPerProviderResponse)
def get_visits_per_provider(
    top_n: int | None = Query(None, ge=1, description="Omit to return all providers in scope"),
    f: CommonFilters = Depends(common_filters),
    store: DataStore = Depends(get_store),
) -> VisitsPerProviderResponse:
    appts = filtered_appointments(store, f)
    completed = appts[appts["status"] == "Completed"]
    counts = completed.groupby("provider_id").size()

    providers_in_scope = filtered_providers(store, f)

    records = []
    for _, provider in providers_in_scope.iterrows():
        count = int(counts.get(provider["provider_id"], 0))
        records.append(ProviderVisitCount(
            label=provider["provider_name"],
            value=float(count),
            subspecialty=provider["subspecialty"],
            office_id=provider["primary_office_id"],
        ))
    records.sort(key=lambda r: r.value, reverse=True)
    if top_n:
        records = records[:top_n]
    return VisitsPerProviderResponse(providers=records)


@router.get("/surgical-volume", response_model=SurgicalVolumeResponse)
def get_surgical_volume(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> SurgicalVolumeResponse:
    surgeries = filtered_surgeries(store, f)

    provider_name_map = dict(zip(store.providers["provider_id"], store.providers["provider_name"]))
    by_provider_series = (
        surgeries.assign(provider_name=surgeries["provider_id"].map(provider_name_map))
        .groupby("provider_name").size()
    )
    by_subspecialty_series = surgeries.groupby("subspecialty").size()
    trend = trend_points(surgeries, "surgery_date", "month", agg="count")

    return SurgicalVolumeResponse(
        by_provider=to_points(by_provider_series, round_ndigits=0),
        by_subspecialty=to_points(by_subspecialty_series, round_ndigits=0),
        trend=trend,
    )


@router.get("/utilization", response_model=UtilizationResponse)
def get_utilization(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> UtilizationResponse:
    appts = filtered_appointments(store, f)
    completed = appts[appts["status"] == "Completed"]
    visits_by_office = completed.groupby("office_id").size()

    lo, hi = effective_range(store.appointments, "appointment_date", f.start_date, f.end_date)
    providers_in_scope = filtered_providers(store, f)
    offices_scope = store.offices[office_region_mask(store.offices, store.offices, f.office_id, f.region)]

    detail: list[OfficeUtilizationDetail] = []
    for _, office in offices_scope.iterrows():
        office_id = office["office_id"]
        office_providers = providers_in_scope[providers_in_scope["primary_office_id"] == office_id]

        capacity = 0.0
        for _, prov in office_providers.iterrows():
            active_start = max(prov["hire_date"].date(), lo)
            capacity += SLOTS_PER_PROVIDER_PER_WEEKDAY * business_days_between(active_start, hi)

        completed_visits = int(visits_by_office.get(office_id, 0))
        utilization_pct = round(completed_visits / capacity * 100, 2) if capacity > 0 else 0.0

        detail.append(OfficeUtilizationDetail(
            office_id=office_id,
            office_name=office["office_name"],
            completed_visits=completed_visits,
            estimated_capacity=round(capacity, 1),
            utilization_pct=utilization_pct,
        ))

    by_office = [{"label": d.office_name, "value": d.utilization_pct} for d in detail]
    return UtilizationResponse(by_office=by_office, detail=detail)


# ----------------------------------------------------------------------------
# Provider Productivity dashboard — throughput, surgical output, panel size,
# work distribution and the ramp drag from newly hired providers.
# ----------------------------------------------------------------------------


def _provider_rows(store: DataStore, f: CommonFilters):
    """Shared builder for the by-provider table and the summary rollup."""
    appts = filtered_appointments(store, f)
    surgeries = filtered_surgeries(store, f)
    providers = filtered_providers(store, f)
    lo, hi = effective_range(store.appointments, "appointment_date", f.start_date, f.end_date)

    completed = appts[appts["status"] == "Completed"]
    visits_by_prov = completed.groupby("provider_id").size()
    panel_by_prov = completed.groupby("provider_id")["patient_id"].nunique()
    new_by_prov = completed[completed["appointment_type"] == "New Patient"].groupby("provider_id").size()
    surg_by_prov = surgeries.groupby("provider_id").size()
    # No-show rate per provider in one pass (Completed + No-Show denominator).
    ns = appts[appts["status"].isin(["Completed", "No-Show"])]
    ns_rate_by_prov = (ns["status"] == "No-Show").groupby(ns["provider_id"]).mean()
    office_name_map = dict(zip(store.offices["office_id"], store.offices["office_name"]))

    rows: list[ProviderProductivityRow] = []
    for _, prov in providers.iterrows():
        pid = prov["provider_id"]
        cv = int(visits_by_prov.get(pid, 0))
        active_start = max(prov["hire_date"].date(), lo)
        active_days = business_days_between(active_start, hi)
        tenure_months = max(0, (hi.year - prov["hire_date"].date().year) * 12 + (hi.month - prov["hire_date"].date().month))
        rows.append(ProviderProductivityRow(
            provider_id=pid,
            provider_name=prov["provider_name"],
            subspecialty=prov["subspecialty"],
            office_name=office_name_map.get(prov["primary_office_id"], "-"),
            is_surgeon=bool(prov["is_surgeon"]),
            tenure_months=int(tenure_months),
            completed_visits=cv,
            panel_patients=int(panel_by_prov.get(pid, 0)),
            new_patient_share=round(int(new_by_prov.get(pid, 0)) / cv, 4) if cv else 0.0,
            no_show_rate=round(float(ns_rate_by_prov.get(pid, 0.0)), 4),
            visits_per_active_day=round(cv / active_days, 2) if active_days else 0.0,
            surgeries=int(surg_by_prov.get(pid, 0)),
        ))
    rows.sort(key=lambda r: r.completed_visits, reverse=True)
    return rows, lo, hi


@router.get("/summary", response_model=ProductivitySummaryResponse)
def get_productivity_summary(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> ProductivitySummaryResponse:
    rows, lo, hi = _provider_rows(store, f)
    appts = filtered_appointments(store, f)
    surgeries = filtered_surgeries(store, f)
    completed = appts[appts["status"] == "Completed"]

    surgeon_rows = [r for r in rows if r.is_surgeon]
    visits = pd.Series([r.completed_visits for r in rows], dtype=float)
    per_day = pd.Series([r.visits_per_active_day for r in rows if r.completed_visits > 0], dtype=float)
    panels = pd.Series([r.panel_patients for r in rows], dtype=float)
    surg_counts = pd.Series([r.surgeries for r in surgeon_rows], dtype=float)

    # Network utilization: completed visits vs. flat-capacity estimate, same
    # calibration the Overview / utilization endpoint uses.
    providers = filtered_providers(store, f)
    capacity = 0.0
    for _, prov in providers.iterrows():
        active_start = max(prov["hire_date"].date(), lo)
        capacity += SLOTS_PER_PROVIDER_PER_WEEKDAY * business_days_between(active_start, hi)
    network_util = round(len(completed) / capacity * 100, 2) if capacity > 0 else 0.0

    ramp_cutoff = pd.Timestamp(hi) - pd.Timedelta(days=RAMP_WINDOW_DAYS)
    ramping = int((providers["hire_date"] >= ramp_cutoff).sum())

    outpatient = int(surgeries["is_outpatient"].astype(bool).sum()) if len(surgeries) else 0
    inpatient = int(len(surgeries) - outpatient)

    return ProductivitySummaryResponse(
        active_providers=len(rows),
        surgeon_count=len(surgeon_rows),
        total_completed_visits=int(len(completed)),
        total_surgeries=int(len(surgeries)),
        median_visits_per_provider=_median(visits),
        median_visits_per_active_day=_median(per_day),
        median_panel_patients=_median(panels),
        median_surgeries_per_surgeon=_median(surg_counts),
        network_utilization_pct=network_util,
        outpatient_share=round(outpatient / len(surgeries), 4) if len(surgeries) else 0.0,
        ramping_providers=ramping,
        by_case_setting=[
            {"label": "Outpatient", "value": outpatient},
            {"label": "Inpatient", "value": inpatient},
        ],
        visit_trend=trend_points(completed, "appointment_date", "month", agg="count"),
        surgery_trend=trend_points(surgeries, "surgery_date", "month", agg="count"),
    )


@router.get("/by-provider", response_model=ProductivityByProviderResponse)
def get_productivity_by_provider(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> ProductivityByProviderResponse:
    rows, _lo, _hi = _provider_rows(store, f)
    return ProductivityByProviderResponse(providers=rows)


@router.get("/workload-heatmap", response_model=WorkloadHeatmapResponse)
def get_workload_heatmap(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> WorkloadHeatmapResponse:
    """Completed clinic visits as a subspecialty x month matrix."""
    appts = filtered_appointments(store, f)
    completed = appts[appts["status"] == "Completed"]
    if len(completed) == 0:
        return WorkloadHeatmapResponse(rows=[], columns=[], cells=[])

    sub_map = dict(zip(store.providers["provider_id"], store.providers["subspecialty"]))
    df = completed.assign(
        subspecialty=completed["provider_id"].map(sub_map),
        month=completed["appointment_date"].dt.to_period("M").astype(str),
    ).dropna(subset=["subspecialty", "month"])

    totals = df.groupby("subspecialty").size().sort_values(ascending=False)
    rows = list(totals.index)
    columns = sorted(df["month"].unique())
    counts = df.groupby(["subspecialty", "month"]).size()

    cells = [
        HeatmapCell(row=sub, column=month, value=int(counts.get((sub, month), 0)))
        for sub in rows
        for month in columns
    ]
    return WorkloadHeatmapResponse(rows=rows, columns=columns, cells=cells)
