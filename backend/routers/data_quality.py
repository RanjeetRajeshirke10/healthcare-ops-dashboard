"""
Data Quality router — the one place raw (non-deduped) data is inspected, since
its whole job is to *measure* the Phase 1 injected defects rather than hide
them. No start_date/office/region/subspecialty filters here: this is a
dataset-health check, not a dashboard KPI.
"""

from fastapi import APIRouter, Depends

from ..data_loader import DataStore, get_store
from ..models.schemas import (
    DataQualitySummaryResponse,
    DuplicatesResponse,
    FileHealth,
    MissingFieldStat,
    OrphanedFkStat,
)

router = APIRouter()

YELLOW_THRESHOLD_PCT = 2.0


@router.get("/summary", response_model=DataQualitySummaryResponse)
def get_summary(store: DataStore = Depends(get_store)) -> DataQualitySummaryResponse:
    files = {
        "offices.csv": store.offices,
        "providers.csv": store.providers,
        "patients.csv": store.patients,
        "appointments.csv": store.raw_appointments,
        "surgeries.csv": store.surgeries,
        "ancillary_referrals.csv": store.raw_referrals,
    }

    missing_fields: list[MissingFieldStat] = []
    for file_name, df in files.items():
        nulls = df.isna().sum()
        for col, count in nulls.items():
            if count > 0:
                missing_fields.append(MissingFieldStat(
                    file=file_name, column=col, count=int(count),
                    pct=round(float(count) / len(df) * 100, 2),
                ))

    off_ids = set(store.offices["office_id"])
    prov_ids = set(store.providers["provider_id"])
    pat_ids = set(store.patients["patient_id"])

    relationships = [
        ("appointments.provider_id -> providers", store.raw_appointments["provider_id"], prov_ids),
        ("appointments.patient_id -> patients", store.raw_appointments["patient_id"], pat_ids),
        ("appointments.office_id -> offices", store.raw_appointments["office_id"], off_ids),
        ("surgeries.provider_id -> providers", store.surgeries["provider_id"], prov_ids),
        ("surgeries.patient_id -> patients", store.surgeries["patient_id"], pat_ids),
        ("surgeries.office_id -> offices", store.surgeries["office_id"], off_ids),
        ("ancillary_referrals.patient_id -> patients", store.raw_referrals["patient_id"], pat_ids),
        ("ancillary_referrals.referring_provider_id -> providers", store.raw_referrals["referring_provider_id"], prov_ids),
        ("ancillary_referrals.office_id -> offices", store.raw_referrals["office_id"], off_ids),
        ("providers.primary_office_id -> offices", store.providers["primary_office_id"], off_ids),
    ]
    orphaned_fks = [
        OrphanedFkStat(relationship=label, count=int((~series.isin(valid)).sum()))
        for label, series, valid in relationships
    ]
    orphan_by_relationship = {o.relationship: o.count for o in orphaned_fks}

    # Health scoring uses semantically real defects, not raw null counts —
    # e.g. `completion_date` is nullable by design (an incomplete referral has
    # no completion date yet), so that alone isn't a data-quality issue. The
    # actual injected defect is completed=True with a missing completion_date.
    inconsistent_completions = int(
        (store.raw_referrals["completed"] & store.raw_referrals["completion_date"].isna()).sum()
    )
    issue_counts = {
        "offices.csv": 0,
        "providers.csv": orphan_by_relationship["providers.primary_office_id -> offices"],
        "patients.csv": int(store.patients[["home_zip", "insurance_type"]].isna().sum().sum()),
        "appointments.csv": (
            int(store.raw_appointments["appointment_type"].isna().sum())
            + orphan_by_relationship["appointments.provider_id -> providers"]
            + int(store.raw_appointments["appointment_id"].duplicated().sum())
        ),
        "surgeries.csv": 0,
        "ancillary_referrals.csv": (
            inconsistent_completions
            + orphan_by_relationship["ancillary_referrals.patient_id -> patients"]
            + int(store.raw_referrals["referral_id"].duplicated().sum())
        ),
    }

    health_by_file = []
    for file_name, df in files.items():
        issues = issue_counts[file_name]
        pct = issues / len(df) * 100 if len(df) else 0.0
        status = "green" if issues == 0 else ("yellow" if pct < YELLOW_THRESHOLD_PCT else "red")
        health_by_file.append(FileHealth(file=file_name, status=status))

    return DataQualitySummaryResponse(
        missing_fields=missing_fields, orphaned_fks=orphaned_fks, health_by_file=health_by_file,
    )


@router.get("/duplicates", response_model=DuplicatesResponse)
def get_duplicates(store: DataStore = Depends(get_store)) -> DuplicatesResponse:
    appt_dup_mask = store.raw_appointments["appointment_id"].duplicated(keep=False)
    appt_dup_ids = sorted(store.raw_appointments.loc[appt_dup_mask, "appointment_id"].unique().tolist())

    ref_dup_mask = store.raw_referrals["referral_id"].duplicated(keep=False)
    ref_dup_ids = sorted(store.raw_referrals.loc[ref_dup_mask, "referral_id"].unique().tolist())

    return DuplicatesResponse(
        appointment_id_duplicates=int(store.raw_appointments["appointment_id"].duplicated().sum()),
        referral_id_duplicates=int(store.raw_referrals["referral_id"].duplicated().sum()),
        duplicate_appointment_ids=appt_dup_ids,
        duplicate_referral_ids=ref_dup_ids,
    )
