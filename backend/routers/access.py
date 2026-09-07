from typing import Literal

import pandas as pd
from fastapi import APIRouter, Depends, Query

from ..data_loader import DataStore, get_store
from ..models.schemas import (
    AccessByOfficeResponse,
    AccessOfficeRollup,
    AccessSummaryResponse,
    AccessTrendResponse,
    AppointmentVolumeResponse,
    HeatmapCell,
    LeadTimeNoShowStat,
    NoShowByLeadTimeResponse,
    NoShowRateResponse,
    OnsiteAccessStat,
    ReferralAccessResponse,
    ReferralAccessStat,
    WaitBucketStat,
    WaitDistributionResponse,
    WaitHeatmapResponse,
    WaitTimesResponse,
)
from ..utils import (
    CommonFilters,
    common_filters,
    filtered_appointments,
    filtered_referrals,
    no_show_rate,
    office_region_mask,
    to_points,
    trend_points,
)

router = APIRouter()

# Lead time = days between the appointment being scheduled and the visit.
LEAD_TIME_BINS = [-1, 2, 7, 14, 30, 60, 10**6]
LEAD_TIME_LABELS = ["0-2d", "3-7d", "8-14d", "15-30d", "31-60d", "60d+"]
SHORT_NOTICE_MAX_DAYS = 2
ACCESS_SLA_DAYS = 14
BOOKED_STATUSES = ["Completed", "No-Show", "Cancelled", "Rescheduled"]


def _lead_bucket(series: pd.Series) -> pd.Series:
    return pd.cut(series, bins=LEAD_TIME_BINS, labels=LEAD_TIME_LABELS)


def _median(series: pd.Series) -> float:
    s = series.dropna()
    return round(float(s.median()), 1) if len(s) else 0.0


def _rate(mask: pd.Series) -> float:
    return round(float(mask.mean()), 4) if len(mask) else 0.0


# ----------------------------------------------------------------------------
# Endpoints kept from Phase 2 (Overview still consumes /no-show-rate and
# /appointment-volume; /wait-times powers the "wait by subspecialty" bar).
# ----------------------------------------------------------------------------


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


# ----------------------------------------------------------------------------
# Patient Access dashboard — timeliness, capacity leakage, downstream access.
# ----------------------------------------------------------------------------


@router.get("/summary", response_model=AccessSummaryResponse)
def get_access_summary(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> AccessSummaryResponse:
    appts = filtered_appointments(store, f)
    new_pts = appts[appts["appointment_type"] == "New Patient"]
    followups = appts[appts["appointment_type"] == "Follow-Up"]

    status_counts = appts["status"].value_counts()
    by_status = [
        {"label": s, "value": int(status_counts.get(s, 0))}
        for s in BOOKED_STATUSES
        if int(status_counts.get(s, 0)) > 0
    ]
    n = len(appts)
    completed = int((appts["status"] == "Completed").sum())

    refs = filtered_referrals(store, f)
    done = refs["completed"].astype(bool) if len(refs) else pd.Series(dtype=bool)
    turnaround = (refs["completion_date"] - refs["referral_date"]).dt.days if len(refs) else pd.Series(dtype=float)
    open_refs = refs[~done] if len(refs) else refs
    ref_now = refs["referral_date"].max() if len(refs) else pd.NaT
    open_age = (
        (ref_now - open_refs["referral_date"]).dt.days
        if len(open_refs) and pd.notna(ref_now)
        else pd.Series(dtype=float)
    )

    return AccessSummaryResponse(
        total_appointments=n,
        new_patient_appointments=int(len(new_pts)),
        median_new_patient_wait_days=_median(new_pts["lead_time_days"]),
        mean_new_patient_wait_days=round(float(new_pts["lead_time_days"].mean()), 1) if len(new_pts) else 0.0,
        median_followup_wait_days=_median(followups["lead_time_days"]),
        pct_new_within_14d=_rate(new_pts["lead_time_days"] <= ACCESS_SLA_DAYS),
        pct_new_within_30d=_rate(new_pts["lead_time_days"] <= 30),
        short_notice_rate=_rate(appts["lead_time_days"] <= SHORT_NOTICE_MAX_DAYS),
        no_show_rate=round(no_show_rate(appts), 4),
        cancellation_rate=_rate(appts["status"] == "Cancelled"),
        reschedule_rate=_rate(appts["status"] == "Rescheduled"),
        slot_realization_rate=round(completed / n, 4) if n else 0.0,
        referral_completion_rate=_rate(done),
        median_referral_turnaround_days=_median(turnaround[done]) if len(refs) else 0.0,
        open_referral_count=int(len(open_refs)),
        median_open_referral_age_days=_median(open_age),
        by_status=by_status,
    )


@router.get("/wait-distribution", response_model=WaitDistributionResponse)
def get_wait_distribution(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> WaitDistributionResponse:
    """Histogram of lead time so the wait reads as a distribution, not a mean —
    New Patient vs. Follow-Up side by side."""
    appts = filtered_appointments(store, f).copy()
    appts["bucket"] = _lead_bucket(appts["lead_time_days"])
    new_pts = appts[appts["appointment_type"] == "New Patient"]
    followups = appts[appts["appointment_type"] == "Follow-Up"]
    npc = new_pts["bucket"].value_counts()
    fuc = followups["bucket"].value_counts()

    buckets = [
        WaitBucketStat(label=lbl, new_patient=int(npc.get(lbl, 0)), follow_up=int(fuc.get(lbl, 0)))
        for lbl in LEAD_TIME_LABELS
    ]
    return WaitDistributionResponse(
        buckets=buckets,
        new_patient_median=_median(new_pts["lead_time_days"]),
        follow_up_median=_median(followups["lead_time_days"]),
    )


@router.get("/no-show-by-leadtime", response_model=NoShowByLeadTimeResponse)
def get_no_show_by_leadtime(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> NoShowByLeadTimeResponse:
    """No-show rate per lead-time bucket — quantifies the classic access
    finding that appointments booked far out are kept far less often."""
    appts = filtered_appointments(store, f)
    denom = appts[appts["status"].isin(["Completed", "No-Show"])].copy()
    denom["bucket"] = _lead_bucket(denom["lead_time_days"])

    buckets = []
    for lbl in LEAD_TIME_LABELS:
        b = denom[denom["bucket"] == lbl]
        buckets.append(LeadTimeNoShowStat(
            label=lbl,
            no_show_rate=round(float((b["status"] == "No-Show").mean()), 4) if len(b) else 0.0,
            appointments=int(len(b)),
        ))
    return NoShowByLeadTimeResponse(buckets=buckets)


@router.get("/trend", response_model=AccessTrendResponse)
def get_access_trend(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> AccessTrendResponse:
    appts = filtered_appointments(store, f)
    if len(appts) == 0:
        return AccessTrendResponse(wait_trend=[], sla_trend=[], new_share_trend=[])

    appts = appts.assign(month=appts["appointment_date"].dt.to_period("M").astype(str))
    new_pts = appts[appts["appointment_type"] == "New Patient"]
    total_by_month = appts.groupby("month").size()
    new_by_month = new_pts.groupby("month")

    wait_trend, sla_trend, new_share_trend = [], [], []
    for m in sorted(appts["month"].unique()):
        npm = new_by_month.get_group(m) if m in new_by_month.groups else new_pts.iloc[0:0]
        wait_trend.append({"date": m, "value": _median(npm["lead_time_days"])})
        sla_trend.append({
            "date": m,
            "value": round(float((npm["lead_time_days"] <= ACCESS_SLA_DAYS).mean()), 4) if len(npm) else 0.0,
        })
        new_share_trend.append({
            "date": m,
            "value": round(len(npm) / int(total_by_month[m]), 4) if total_by_month[m] else 0.0,
        })
    return AccessTrendResponse(wait_trend=wait_trend, sla_trend=sla_trend, new_share_trend=new_share_trend)


@router.get("/referral-access", response_model=ReferralAccessResponse)
def get_referral_access(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> ReferralAccessResponse:
    """Downstream access: once a patient is referred for PT / imaging /
    orthotics, do they get the service and how fast? On-site vs. off-site
    compares offices that have the service in the building (PT / imaging)."""
    refs = filtered_referrals(store, f).copy()
    if len(refs) == 0:
        return ReferralAccessResponse(by_service=[], onsite_vs_offsite=[])

    refs["_done"] = refs["completed"].astype(bool)
    refs["_turnaround"] = (refs["completion_date"] - refs["referral_date"]).dt.days

    by_service = []
    for svc in sorted(refs["service_type"].dropna().unique()):
        s = refs[refs["service_type"] == svc]
        by_service.append(ReferralAccessStat(
            service_type=svc,
            completion_rate=round(float(s["_done"].mean()), 4),
            median_turnaround_days=_median(s.loc[s["_done"], "_turnaround"]),
            open_count=int((~s["_done"]).sum()),
        ))

    onsite_pt = dict(zip(store.offices["office_id"], store.offices["has_onsite_pt"]))
    onsite_img = dict(zip(store.offices["office_id"], store.offices["has_onsite_imaging"]))

    def _is_onsite(row):
        if row["service_type"] == "Physical Therapy":
            return bool(onsite_pt.get(row["office_id"], False))
        if row["service_type"] == "Imaging":
            return bool(onsite_img.get(row["office_id"], False))
        return None

    flagged = refs[refs["service_type"].isin(["Physical Therapy", "Imaging"])].copy()
    flagged["_onsite"] = flagged.apply(_is_onsite, axis=1)

    onsite_vs_offsite = []
    for label, want in [("On-site", True), ("Off-site", False)]:
        g = flagged[flagged["_onsite"] == want]
        if len(g) == 0:
            continue
        onsite_vs_offsite.append(OnsiteAccessStat(
            label=label,
            completion_rate=round(float(g["_done"].mean()), 4),
            median_turnaround_days=_median(g.loc[g["_done"], "_turnaround"]),
            referrals=int(len(g)),
        ))
    return ReferralAccessResponse(by_service=by_service, onsite_vs_offsite=onsite_vs_offsite)


@router.get("/by-office", response_model=AccessByOfficeResponse)
def get_access_by_office(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> AccessByOfficeResponse:
    appts = filtered_appointments(store, f)
    refs = filtered_referrals(store, f)
    offices_scope = store.offices[office_region_mask(store.offices, store.offices, f.office_id, f.region)]

    offices_out: list[AccessOfficeRollup] = []
    for _, office in offices_scope.iterrows():
        oid = office["office_id"]
        oa = appts[appts["office_id"] == oid]
        on = oa[oa["appointment_type"] == "New Patient"]
        orf = refs[refs["office_id"] == oid]
        offices_out.append(AccessOfficeRollup(
            office_id=oid,
            office_name=office["office_name"],
            region=office["region"],
            has_onsite_pt=bool(office["has_onsite_pt"]),
            has_onsite_imaging=bool(office["has_onsite_imaging"]),
            new_patient_appointments=int(len(on)),
            median_new_patient_wait_days=_median(on["lead_time_days"]),
            pct_new_within_14d=round(float((on["lead_time_days"] <= ACCESS_SLA_DAYS).mean()), 4) if len(on) else 0.0,
            short_notice_rate=round(float((oa["lead_time_days"] <= SHORT_NOTICE_MAX_DAYS).mean()), 4) if len(oa) else 0.0,
            no_show_rate=round(no_show_rate(oa), 4),
            referral_completion_rate=round(float(orf["completed"].astype(bool).mean()), 4) if len(orf) else 0.0,
        ))
    return AccessByOfficeResponse(offices=offices_out)


@router.get("/wait-heatmap", response_model=WaitHeatmapResponse)
def get_wait_heatmap(
    f: CommonFilters = Depends(common_filters), store: DataStore = Depends(get_store)
) -> WaitHeatmapResponse:
    """Median new-patient wait (days) as a subspecialty x month matrix —
    surfaces which service lines run a chronic (or seasonal) access backlog."""
    appts = filtered_appointments(store, f)
    new_pts = appts[appts["appointment_type"] == "New Patient"]
    if len(new_pts) == 0:
        return WaitHeatmapResponse(rows=[], columns=[], cells=[])

    sub_map = dict(zip(store.providers["provider_id"], store.providers["subspecialty"]))
    df = new_pts.assign(
        subspecialty=new_pts["provider_id"].map(sub_map),
        month=new_pts["appointment_date"].dt.to_period("M").astype(str),
    ).dropna(subset=["subspecialty", "month"])

    overall = df.groupby("subspecialty")["lead_time_days"].median().sort_values(ascending=False)
    rows = list(overall.index)
    columns = sorted(df["month"].unique())
    cell_med = df.groupby(["subspecialty", "month"])["lead_time_days"].median()

    cells = [
        HeatmapCell(row=sub, column=month, value=round(float(cell_med.get((sub, month), 0.0)), 1))
        for sub in rows
        for month in columns
    ]
    return WaitHeatmapResponse(rows=rows, columns=columns, cells=cells)
