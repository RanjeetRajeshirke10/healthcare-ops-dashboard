import pandas as pd
from fastapi import APIRouter, Depends

from ..data_loader import DataStore, get_store
from ..models.schemas import (
    AncillaryByOfficeResponse,
    AncillaryOfficeRow,
    AncillaryServiceStat,
    AncillarySummaryResponse,
    AncillaryVolumeResponse,
    CompletionHeatmapResponse,
    HeatmapCell,
    LeakageResponse,
    LeakageServiceStat,
    OnsiteComparisonResponse,
    OnsiteComparisonStat,
    ReferralCompletionResponse,
)
from ..utils import (
    CommonFilters,
    common_filters,
    filtered_referrals,
    office_region_mask,
    to_points,
    trend_points,
)

router = APIRouter()

ONSITE_SERVICES = {"Physical Therapy": "has_onsite_pt", "Imaging": "has_onsite_imaging"}
AGE_BUCKET_BINS = [-1, 30, 60, 90, 10**6]
AGE_BUCKET_LABELS = ["0-30d", "31-60d", "61-90d", "90d+"]


def _median(series: pd.Series) -> float:
    s = series.dropna()
    return round(float(s.median()), 1) if len(s) else 0.0


def _prep(refs: pd.DataFrame, store: DataStore) -> pd.DataFrame:
    """Attach done flag, turnaround days, and an on-site flag (only meaningful
    for the two services an office can host)."""
    refs = refs.copy()
    refs["_done"] = refs["completed"].astype(bool)
    refs["_turnaround"] = (refs["completion_date"] - refs["referral_date"]).dt.days
    onsite_pt = dict(zip(store.offices["office_id"], store.offices["has_onsite_pt"]))
    onsite_img = dict(zip(store.offices["office_id"], store.offices["has_onsite_imaging"]))

    def _is_onsite(row):
        if row["service_type"] == "Physical Therapy":
            return bool(onsite_pt.get(row["office_id"], False))
        if row["service_type"] == "Imaging":
            return bool(onsite_img.get(row["office_id"], False))
        return None

    refs["_onsite"] = refs.apply(_is_onsite, axis=1)
    return refs


# ----------------------------------------------------------------------------
# Endpoints kept from Phase 2.
# ----------------------------------------------------------------------------


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


# ----------------------------------------------------------------------------
# Ancillary Services dashboard — completion, turnaround, backlog, leakage.
# ----------------------------------------------------------------------------


@router.get("/summary", response_model=AncillarySummaryResponse)
def get_ancillary_summary(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> AncillarySummaryResponse:
    refs = _prep(filtered_referrals(store, f), store)
    if len(refs) == 0:
        return AncillarySummaryResponse(
            total_referrals=0, completed_referrals=0, completion_rate=0.0,
            median_turnaround_days=0.0, open_referral_count=0, median_open_referral_age_days=0.0,
            onsite_completion_rate=0.0, offsite_completion_rate=0.0, onsite_referral_share=0.0,
            by_service=[], by_age_bucket=[], completion_trend=[], volume_trend=[],
        )

    done = refs[refs["_done"]]
    open_refs = refs[~refs["_done"]]
    ref_now = refs["referral_date"].max()
    open_age = (ref_now - open_refs["referral_date"]).dt.days if len(open_refs) else pd.Series(dtype=float)
    age_bucket = pd.cut(open_age, bins=AGE_BUCKET_BINS, labels=AGE_BUCKET_LABELS)
    age_counts = age_bucket.value_counts()

    flagged = refs[refs["service_type"].isin(ONSITE_SERVICES)]
    onsite = flagged[flagged["_onsite"] == True]  # noqa: E712
    offsite = flagged[flagged["_onsite"] == False]  # noqa: E712

    by_service = []
    for svc in sorted(refs["service_type"].dropna().unique()):
        s = refs[refs["service_type"] == svc]
        by_service.append(AncillaryServiceStat(
            service_type=svc,
            referrals=int(len(s)),
            completion_rate=round(float(s["_done"].mean()), 4),
            median_turnaround_days=_median(s.loc[s["_done"], "_turnaround"]),
            open_count=int((~s["_done"]).sum()),
        ))

    completion_trend = trend_points(
        refs.assign(_c=refs["_done"].astype(float)),
        "referral_date", "month", agg="mean", value_col="_c",
    )

    return AncillarySummaryResponse(
        total_referrals=int(len(refs)),
        completed_referrals=int(len(done)),
        completion_rate=round(float(refs["_done"].mean()), 4),
        median_turnaround_days=_median(done["_turnaround"]),
        open_referral_count=int(len(open_refs)),
        median_open_referral_age_days=_median(open_age),
        onsite_completion_rate=round(float(onsite["_done"].mean()), 4) if len(onsite) else 0.0,
        offsite_completion_rate=round(float(offsite["_done"].mean()), 4) if len(offsite) else 0.0,
        onsite_referral_share=round(len(onsite) / len(flagged), 4) if len(flagged) else 0.0,
        by_service=by_service,
        by_age_bucket=[{"label": lbl, "value": int(age_counts.get(lbl, 0))} for lbl in AGE_BUCKET_LABELS],
        completion_trend=completion_trend,
        volume_trend=trend_points(refs, "referral_date", "month", agg="count"),
    )


@router.get("/onsite-comparison", response_model=OnsiteComparisonResponse)
def get_onsite_comparison(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> OnsiteComparisonResponse:
    """For PT and imaging — the two services an office can host — how completion
    and turnaround differ when the service is in the building vs. referred out."""
    refs = _prep(filtered_referrals(store, f), store)
    services = []
    for svc in ONSITE_SERVICES:
        s = refs[refs["service_type"] == svc]
        on = s[s["_onsite"] == True]  # noqa: E712
        off = s[s["_onsite"] == False]  # noqa: E712
        services.append(OnsiteComparisonStat(
            service_type=svc,
            onsite_completion_rate=round(float(on["_done"].mean()), 4) if len(on) else 0.0,
            offsite_completion_rate=round(float(off["_done"].mean()), 4) if len(off) else 0.0,
            onsite_turnaround_days=_median(on.loc[on["_done"], "_turnaround"]),
            offsite_turnaround_days=_median(off.loc[off["_done"], "_turnaround"]),
            onsite_referrals=int(len(on)),
            offsite_referrals=int(len(off)),
        ))
    return OnsiteComparisonResponse(services=services)


@router.get("/by-office", response_model=AncillaryByOfficeResponse)
def get_ancillary_by_office(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> AncillaryByOfficeResponse:
    refs = _prep(filtered_referrals(store, f), store)
    offices_scope = store.offices[office_region_mask(store.offices, store.offices, f.office_id, f.region)]

    out: list[AncillaryOfficeRow] = []
    for _, office in offices_scope.iterrows():
        oid = office["office_id"]
        o = refs[refs["office_id"] == oid]
        out.append(AncillaryOfficeRow(
            office_id=oid,
            office_name=office["office_name"],
            region=office["region"],
            has_onsite_pt=bool(office["has_onsite_pt"]),
            has_onsite_imaging=bool(office["has_onsite_imaging"]),
            referrals=int(len(o)),
            completion_rate=round(float(o["_done"].mean()), 4) if len(o) else 0.0,
            median_turnaround_days=_median(o.loc[o["_done"], "_turnaround"]) if len(o) else 0.0,
            open_count=int((~o["_done"]).sum()) if len(o) else 0,
        ))
    return AncillaryByOfficeResponse(offices=out)


@router.get("/completion-heatmap", response_model=CompletionHeatmapResponse)
def get_completion_heatmap(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> CompletionHeatmapResponse:
    """Referral completion rate as a service x month matrix (by referral month)."""
    refs = _prep(filtered_referrals(store, f), store)
    if len(refs) == 0:
        return CompletionHeatmapResponse(rows=[], columns=[], cells=[])

    df = refs.assign(month=refs["referral_date"].dt.to_period("M").astype(str))
    totals = df.groupby("service_type")["_done"].mean().sort_values()
    rows = list(totals.index)
    columns = sorted(df["month"].unique())
    cell_rate = df.groupby(["service_type", "month"])["_done"].mean()

    cells = [
        HeatmapCell(row=svc, column=month, value=round(float(cell_rate.get((svc, month), 0.0)), 4))
        for svc in rows
        for month in columns
    ]
    return CompletionHeatmapResponse(rows=rows, columns=columns, cells=cells)
