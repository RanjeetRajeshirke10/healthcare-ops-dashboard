from fastapi import APIRouter, Depends, Query

from ..data_loader import DataStore, get_store
from ..models.schemas import (
    OfficeUtilizationDetail,
    ProviderVisitCount,
    SurgicalVolumeResponse,
    UtilizationResponse,
    VisitsPerProviderResponse,
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
