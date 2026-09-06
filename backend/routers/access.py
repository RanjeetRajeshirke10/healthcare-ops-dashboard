from typing import Literal

from fastapi import APIRouter, Depends, Query

from ..data_loader import DataStore, get_store
from ..models.schemas import AppointmentVolumeResponse, NoShowRateResponse, WaitTimesResponse
from ..utils import (
    CommonFilters,
    common_filters,
    filtered_appointments,
    no_show_rate,
    to_points,
    trend_points,
)

router = APIRouter()


@router.get("/no-show-rate", response_model=NoShowRateResponse)
def get_no_show_rate(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> NoShowRateResponse:
    df = filtered_appointments(store, f)
    denom = df[df["status"].isin(["Completed", "No-Show"])]

    overall = no_show_rate(df)

    office_name_map = dict(zip(store.offices["office_id"], store.offices["office_name"]))
    by_office_series = (
        denom.assign(office_name=denom["office_id"].map(office_name_map))
        .groupby("office_name")["status"]
        .apply(lambda s: (s == "No-Show").mean())
    )

    sub_map = dict(zip(store.providers["provider_id"], store.providers["subspecialty"]))
    by_sub_series = (
        denom.assign(subspecialty=denom["provider_id"].map(sub_map))
        .groupby("subspecialty")["status"]
        .apply(lambda s: (s == "No-Show").mean())
    )

    trend = trend_points(
        denom.assign(is_no_show=(denom["status"] == "No-Show").astype(float)),
        "appointment_date", "month", agg="mean", value_col="is_no_show",
    )

    return NoShowRateResponse(
        overall_rate=round(overall, 4),
        by_office=to_points(by_office_series),
        by_subspecialty=to_points(by_sub_series),
        trend=trend,
    )


@router.get("/wait-times", response_model=WaitTimesResponse)
def get_wait_times(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> WaitTimesResponse:
    df = filtered_appointments(store, f)
    new_pts = df[df["appointment_type"] == "New Patient"]
    overall_avg = float(new_pts["lead_time_days"].mean()) if len(new_pts) else 0.0

    office_name_map = dict(zip(store.offices["office_id"], store.offices["office_name"]))
    by_office_series = (
        new_pts.assign(office_name=new_pts["office_id"].map(office_name_map))
        .groupby("office_name")["lead_time_days"].mean()
    )

    sub_map = dict(zip(store.providers["provider_id"], store.providers["subspecialty"]))
    by_sub_series = (
        new_pts.assign(subspecialty=new_pts["provider_id"].map(sub_map))
        .groupby("subspecialty")["lead_time_days"].mean()
    )

    return WaitTimesResponse(
        overall_avg=round(overall_avg, 2),
        by_subspecialty=to_points(by_sub_series, round_ndigits=2),
        by_office=to_points(by_office_series, round_ndigits=2),
    )


@router.get("/appointment-volume", response_model=AppointmentVolumeResponse)
def get_appointment_volume(
    granularity: Literal["day", "week", "month"] = Query("month"),
    f: CommonFilters = Depends(common_filters),
    store: DataStore = Depends(get_store),
) -> AppointmentVolumeResponse:
    df = filtered_appointments(store, f)
    trend = trend_points(df, "appointment_date", granularity, agg="count")
    by_type_series = df["appointment_type"].fillna("Unknown").value_counts()
    return AppointmentVolumeResponse(trend=trend, by_type=to_points(by_type_series, round_ndigits=0))
