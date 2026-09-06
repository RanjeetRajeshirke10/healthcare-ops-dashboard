from fastapi import APIRouter, Depends

from ..data_loader import DataStore, get_store
from ..models.schemas import OfficeRollup, OverviewByOfficeResponse, OverviewSummaryResponse, RegionStats, RollupStats
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
)

router = APIRouter()


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
