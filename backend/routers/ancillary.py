from fastapi import APIRouter, Depends

from ..data_loader import DataStore, get_store
from ..models.schemas import (
    AncillaryVolumeResponse,
    LeakageResponse,
    LeakageServiceStat,
    ReferralCompletionResponse,
)
from ..utils import CommonFilters, common_filters, filtered_referrals, to_points, trend_points

router = APIRouter()


@router.get("/referral-completion", response_model=ReferralCompletionResponse)
def get_referral_completion(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> ReferralCompletionResponse:
    refs = filtered_referrals(store, f)
    by_service_series = refs.groupby("service_type")["completed"].mean()

    office_name_map = dict(zip(store.offices["office_id"], store.offices["office_name"]))
    by_office_series = (
        refs.assign(office_name=refs["office_id"].map(office_name_map))
        .groupby("office_name")["completed"].mean()
    )

    return ReferralCompletionResponse(
        by_service_type=to_points(by_service_series),
        by_office=to_points(by_office_series),
    )


@router.get("/volume", response_model=AncillaryVolumeResponse)
def get_ancillary_volume(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> AncillaryVolumeResponse:
    refs = filtered_referrals(store, f)
    trend = trend_points(refs, "referral_date", "month", agg="count")
    by_service_series = refs["service_type"].value_counts()
    return AncillaryVolumeResponse(trend=trend, by_service_type=to_points(by_service_series, round_ndigits=0))


@router.get("/leakage", response_model=LeakageResponse)
def get_leakage(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> LeakageResponse:
    refs = filtered_referrals(store, f)
    office_pt = dict(zip(store.offices["office_id"], store.offices["has_onsite_pt"]))
    office_imaging = dict(zip(store.offices["office_id"], store.offices["has_onsite_imaging"]))

    services: list[LeakageServiceStat] = []
    for svc, onsite_map in [("Physical Therapy", office_pt), ("Imaging", office_imaging)]:
        subset = refs[refs["service_type"] == svc]
        if len(subset) == 0:
            services.append(LeakageServiceStat(
                service_type=svc, onsite_completion_rate=0.0,
                offsite_completion_rate=0.0, offsite_referral_share=0.0,
            ))
            continue

        onsite_flag = subset["office_id"].map(onsite_map).fillna(False)
        onsite = subset[onsite_flag]
        offsite = subset[~onsite_flag]

        services.append(LeakageServiceStat(
            service_type=svc,
            onsite_completion_rate=round(float(onsite["completed"].mean()), 4) if len(onsite) else 0.0,
            offsite_completion_rate=round(float(offsite["completed"].mean()), 4) if len(offsite) else 0.0,
            offsite_referral_share=round(len(offsite) / len(subset), 4),
        ))

    return LeakageResponse(services=services)
