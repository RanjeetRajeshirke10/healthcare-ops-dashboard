"""
Synthetic data generator for the Healthcare Operations Analytics Dashboard.

Generates 6 CSV files that act as the "database" for the rest of the project:
offices.csv, providers.csv, patients.csv, appointments.csv, surgeries.csv,
ancillary_referrals.csv

All data is 100% synthetic (invented names, invented towns, no real patients,
providers, or PHI of any kind). A single seeded numpy Generator drives every
random draw, so re-running this script produces byte-identical output.

Run from the repo root:
    .venv\\Scripts\\python.exe data\\generate_data.py
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path

import numpy as np
import pandas as pd

# --------------------------------------------------------------------------
# CONFIG
# --------------------------------------------------------------------------

SEED = 42
RNG = np.random.default_rng(SEED)

DATA_DIR = Path(__file__).parent

WINDOW_START = dt.date(2025, 3, 1)
WINDOW_END = dt.date(2026, 8, 31)
WINDOW_DAYS = (WINDOW_END - WINDOW_START).days

N_OFFICES = 15
N_PROVIDERS = 60
N_PATIENTS = 5_000
N_APPOINTMENTS_TARGET = 25_000
N_SURGERIES_TARGET = 3_000
N_REFERRALS_TARGET = 4_000

# Regions: (region name, state, office count)
REGIONS = [
    ("Philadelphia Metro", "PA", 6),
    ("South Jersey", "NJ", 5),
    ("Central Florida", "FL", 4),
]

# Fully invented town names per region (never real Rothman-affiliated locations)
TOWN_NAMES = {
    "Philadelphia Metro": [
        "Ashford Heights", "Brookhaven", "Chester Mills",
        "Dunmore Crossing", "Elkridge", "Fairview Junction",
    ],
    "South Jersey": [
        "Grovepoint", "Harmon Falls", "Ironwood",
        "Juniper Bend", "Kingsbury",
    ],
    "Central Florida": [
        "Laurel Springs", "Mira Vista", "Northgate", "Oakhurst Bay",
    ],
}

# ZIP prefixes per region (fictional but stylistically consistent with the state)
ZIP_PREFIXES = {
    "Philadelphia Metro": ["190", "191"],
    "South Jersey": ["080", "081", "082"],
    "Central Florida": ["328", "332", "338"],
}

SUBSPECIALTIES = [
    "Hip & Knee", "Spine", "Sports Medicine", "Hand & Wrist",
    "Foot & Ankle", "Physical Medicine & Rehab", "Pain Medicine", "Oncology",
]
SUBSPECIALTY_WEIGHTS = [0.20, 0.15, 0.15, 0.12, 0.12, 0.10, 0.08, 0.08]
NON_SURGICAL_SUBSPECIALTIES = {"Physical Medicine & Rehab", "Pain Medicine"}

# Average new-patient wait time (lead_time_days) by subspecialty
NEW_PATIENT_LEAD_TIME_MEAN = {
    "Spine": 24, "Hip & Knee": 19, "Sports Medicine": 14,
    "Hand & Wrist": 12, "Foot & Ankle": 12, "Pain Medicine": 16,
    "Physical Medicine & Rehab": 11, "Oncology": 9,
}
FOLLOWUP_LEAD_TIME_MEAN = 7

PROCEDURE_MENU = {
    "Hip & Knee": ["Total Knee Arthroplasty", "Total Hip Arthroplasty", "Knee Arthroscopy", "Hip Arthroscopy"],
    "Spine": ["Lumbar Fusion", "Microdiscectomy", "Laminectomy", "Cervical Fusion"],
    "Sports Medicine": ["ACL Reconstruction", "Rotator Cuff Repair", "Meniscus Repair", "Shoulder Arthroscopy"],
    "Hand & Wrist": ["Carpal Tunnel Release", "Trigger Finger Release", "Wrist Arthroscopy", "Distal Radius ORIF"],
    "Foot & Ankle": ["Bunionectomy", "Ankle Arthroscopy", "Achilles Tendon Repair", "Ankle ORIF"],
    "Oncology": ["Bone Tumor Resection", "Limb-Sparing Reconstruction", "Soft Tissue Sarcoma Excision"],
}
OUTPATIENT_RATE_HIGH = {"Knee Arthroscopy", "Hip Arthroscopy", "Shoulder Arthroscopy", "Ankle Arthroscopy",
                         "Carpal Tunnel Release", "Trigger Finger Release", "Wrist Arthroscopy", "Bunionectomy"}
OUTPATIENT_RATE_LOW = {"Lumbar Fusion", "Cervical Fusion"}

SERVICE_TYPES = ["Physical Therapy", "Imaging", "Orthotics", "Hand Therapy"]
SERVICE_TYPE_WEIGHTS = [0.45, 0.30, 0.13, 0.12]
COMPLETION_RATE_BASE = {
    "Imaging": 0.86, "Physical Therapy": 0.83, "Hand Therapy": 0.78, "Orthotics": 0.73,
}
LEAKAGE_PENALTY = 0.85  # multiplier applied when the referring office lacks the matching onsite service

FIRST_NAMES = [
    "James", "Maria", "Robert", "Linda", "Michael", "Susan", "David", "Karen",
    "William", "Nancy", "Richard", "Betty", "Joseph", "Sandra", "Thomas", "Ashley",
    "Charles", "Emily", "Daniel", "Jessica", "Matthew", "Sarah", "Anthony", "Laura",
    "Priya", "Wei", "Fatima", "Carlos", "Elena", "Raj",
]
LAST_NAMES = [
    "Anderson", "Baker", "Carter", "Diaz", "Edwards", "Foster", "Gupta", "Hoffman",
    "Ibrahim", "Jensen", "Kaplan", "Lawson", "Martinez", "Nakamura", "O'Connell",
    "Patel", "Quinn", "Reyes", "Sullivan", "Thompson", "Ulrich", "Vasquez",
    "Whitfield", "Yoder", "Zimmerman", "Bennett", "Coleman", "Delgado",
]

# --------------------------------------------------------------------------
# DIMENSION TABLES
# --------------------------------------------------------------------------


def generate_offices() -> pd.DataFrame:
    rows = []
    office_num = 1
    for region, state, count in REGIONS:
        towns = TOWN_NAMES[region]
        for i in range(count):
            office_id = f"OFF{office_num:03d}"
            has_imaging = bool(RNG.random() < 0.60)
            # PT presence correlated with imaging but not identical
            pt_prob = 0.68 if has_imaging else 0.45
            has_pt = bool(RNG.random() < pt_prob)
            rows.append({
                "office_id": office_id,
                "office_name": f"{towns[i]} Orthopaedic Center",
                "region": region,
                "state": state,
                "has_onsite_imaging": has_imaging,
                "has_onsite_pt": has_pt,
            })
            office_num += 1
    return pd.DataFrame(rows)


def generate_providers(offices: pd.DataFrame) -> pd.DataFrame:
    n = N_PROVIDERS
    subspecialties = RNG.choice(SUBSPECIALTIES, size=n, p=SUBSPECIALTY_WEIGHTS)

    # Guarantee every office gets >= 2 providers, then distribute the remainder
    # weighted by each region's office count (bigger regions get more providers).
    office_ids = offices["office_id"].tolist()
    guaranteed = []
    for off in office_ids:
        guaranteed += [off, off]
    remaining_n = n - len(guaranteed)
    region_weight = offices["region"].map(dict((r, c) for r, _, c in REGIONS))
    office_weights = (region_weight / region_weight.sum()).to_numpy()
    remainder = RNG.choice(office_ids, size=remaining_n, p=office_weights)
    primary_office_ids = np.array(guaranteed + list(remainder))
    RNG.shuffle(primary_office_ids)

    first = RNG.choice(FIRST_NAMES, size=n)
    last = RNG.choice(LAST_NAMES, size=n)
    names = [f"Dr. {f} {l}" for f, l in zip(first, last)]

    # ~8 of 60 providers are new hires within the data window (ramping volume)
    new_hire_idx = set(RNG.choice(n, size=8, replace=False).tolist())
    hire_dates = []
    for i in range(n):
        if i in new_hire_idx:
            offset = RNG.integers(0, WINDOW_DAYS)
            hire_dates.append(WINDOW_START + dt.timedelta(days=int(offset)))
        else:
            offset = RNG.integers(365, 15 * 365)
            hire_dates.append(WINDOW_START - dt.timedelta(days=int(offset)))

    is_surgeon = [sub not in NON_SURGICAL_SUBSPECIALTIES for sub in subspecialties]

    df = pd.DataFrame({
        "provider_id": [f"PRV{i+1:03d}" for i in range(n)],
        "provider_name": names,
        "subspecialty": subspecialties,
        "primary_office_id": primary_office_ids,
        "hire_date": hire_dates,
        "is_surgeon": is_surgeon,
    })
    return df


def generate_patients() -> pd.DataFrame:
    n = N_PATIENTS
    ages = np.clip(RNG.normal(loc=58, scale=16, size=n), 18, 95).astype(int)
    as_of = WINDOW_END
    dobs = [as_of - dt.timedelta(days=int(age * 365.25) + int(RNG.integers(0, 365))) for age in ages]

    gender = RNG.choice(["F", "M", "Other"], size=n, p=[0.49, 0.49, 0.02])

    insurance = []
    for age in ages:
        if age >= 65:
            insurance.append(RNG.choice(
                ["Medicare", "Commercial", "Medicaid", "Self-Pay"],
                p=[0.80, 0.12, 0.05, 0.03],
            ))
        else:
            insurance.append(RNG.choice(
                ["Commercial", "Medicaid", "Self-Pay", "Medicare"],
                p=[0.62, 0.14, 0.07, 0.02] / np.sum([0.62, 0.14, 0.07, 0.02]),
            ))

    # Assign a home region (for zip generation only; not exported) proportional
    # to office regional distribution.
    region_names = [r for r, _, _ in REGIONS]
    region_weights = np.array([c for _, _, c in REGIONS], dtype=float)
    region_weights /= region_weights.sum()
    home_regions = RNG.choice(region_names, size=n, p=region_weights)
    zips = []
    for region in home_regions:
        prefix = RNG.choice(ZIP_PREFIXES[region])
        suffix = RNG.integers(0, 100)
        zips.append(f"{prefix}{suffix:02d}")

    df = pd.DataFrame({
        "patient_id": [f"PAT{i+1:05d}" for i in range(n)],
        "date_of_birth": dobs,
        "gender": gender,
        "insurance_type": insurance,
        "home_zip": zips,
    })
    return df


# --------------------------------------------------------------------------
# APPOINTMENTS
# --------------------------------------------------------------------------


def _weekday_date_pool() -> tuple[np.ndarray, np.ndarray]:
    """All weekdays in the window, with sampling weights reflecting seasonality."""
    dates = []
    d = WINDOW_START
    while d <= WINDOW_END:
        if d.weekday() < 5:  # Mon-Fri
            dates.append(d)
        d += dt.timedelta(days=1)
    dates = np.array(dates)

    month_factor = {12: 0.80, 1: 1.20, 7: 0.92, 8: 0.92}
    weights = np.array([month_factor.get(d.month, 1.0) for d in dates], dtype=float)
    weights /= weights.sum()
    return dates, weights


def _visit_counts_per_patient(patients: pd.DataFrame) -> np.ndarray:
    n = len(patients)
    group = RNG.random(n)
    counts = np.empty(n, dtype=int)
    high = group < 0.20
    low = (group >= 0.20) & (group < 0.55)
    mid = group >= 0.55

    counts[high] = RNG.poisson(11, size=high.sum()) + 2
    counts[low] = RNG.integers(1, 3, size=low.sum())
    counts[mid] = RNG.poisson(3, size=mid.sum()) + 1

    # Scale to hit the appointment-volume target exactly.
    total = counts.sum()
    scale = N_APPOINTMENTS_TARGET / total
    counts = np.maximum(1, np.round(counts * scale).astype(int))

    diff = N_APPOINTMENTS_TARGET - counts.sum()
    idx_pool = np.arange(n)
    while diff != 0:
        step = 1 if diff > 0 else -1
        pick = RNG.choice(idx_pool, size=min(abs(diff), n), replace=False)
        for i in pick:
            if step == -1 and counts[i] <= 1:
                continue
            counts[i] += step
            diff -= step
            if diff == 0:
                break
    return counts


def generate_appointments(patients: pd.DataFrame, providers: pd.DataFrame,
                           offices: pd.DataFrame) -> pd.DataFrame:
    date_pool, date_weights = _weekday_date_pool()
    office_region = dict(zip(offices["office_id"], offices["region"]))
    offices_by_region = {r: offices.loc[offices["region"] == r, "office_id"].tolist() for r in office_region.values()}
    provider_office = dict(zip(providers["provider_id"], providers["primary_office_id"]))
    provider_subspecialty = dict(zip(providers["provider_id"], providers["subspecialty"]))
    provider_ids = providers["provider_id"].tolist()

    visit_counts = _visit_counts_per_patient(patients)
    total_rows = int(visit_counts.sum())

    all_dates = RNG.choice(date_pool, size=total_rows, p=date_weights)

    rows = []
    date_cursor = 0
    for patient_id, n_visits in zip(patients["patient_id"], visit_counts):
        p_dates = np.sort(all_dates[date_cursor:date_cursor + n_visits])
        date_cursor += n_visits

        home_provider = RNG.choice(provider_ids)
        home_office = provider_office[home_provider]
        home_region = office_region[home_office]
        seen_providers: set[str] = set()

        for i, appt_date in enumerate(p_dates):
            if i == 0 or RNG.random() < 0.15:
                # First visit, or a ~15% chance the patient sees someone else
                # (cross-covering provider / different subspecialist referral).
                provider_id = home_provider if i == 0 else RNG.choice(provider_ids)
            else:
                provider_id = home_provider

            appt_type = "New Patient" if provider_id not in seen_providers else "Follow-Up"
            seen_providers.add(provider_id)

            if RNG.random() < 0.90:
                office_id = provider_office[provider_id]
            else:
                candidates = [o for o in offices_by_region[home_region] if o != provider_office[provider_id]]
                office_id = RNG.choice(candidates) if candidates else provider_office[provider_id]

            rows.append({
                "patient_id": patient_id,
                "provider_id": provider_id,
                "office_id": office_id,
                "appointment_date": appt_date,
                "appointment_type": appt_type,
                "subspecialty": provider_subspecialty[provider_id],
            })

    df = pd.DataFrame(rows)
    df.insert(0, "appointment_id", [f"APT{i+1:06d}" for i in range(len(df))])

    # --- lead_time_days & scheduled_date -----------------------------------
    window_position = np.array([(d - WINDOW_START).days / WINDOW_DAYS for d in df["appointment_date"]])
    drift = 0.96 + 0.08 * window_position  # waits grow ~8% over the window

    is_new = (df["appointment_type"] == "New Patient").to_numpy()
    mean_lead = np.where(
        is_new,
        df["subspecialty"].map(NEW_PATIENT_LEAD_TIME_MEAN).to_numpy(dtype=float),
        FOLLOWUP_LEAD_TIME_MEAN,
    ) * drift
    shape = 4.0
    lead_time = RNG.gamma(shape, mean_lead / shape)
    lead_time_days = np.maximum(0, np.round(lead_time)).astype(int)
    df["lead_time_days"] = lead_time_days
    df["scheduled_date"] = [d - dt.timedelta(days=int(lt)) for d, lt in zip(df["appointment_date"], lead_time_days)]

    # --- status: no-show / completed / cancelled / rescheduled --------------
    insurance = patients.set_index("patient_id")["insurance_type"]
    ins_mult_map = {"Medicaid": 1.9, "Self-Pay": 1.7, "Medicare": 0.8, "Commercial": 1.0}
    ins_mult = df["patient_id"].map(insurance).map(ins_mult_map).to_numpy(dtype=float)

    weekday = np.array([d.weekday() for d in df["appointment_date"]])
    weekday_mult = np.where(weekday == 0, 1.35, np.where(weekday == 4, 1.15, 1.0))

    type_mult = np.where(is_new, 1.3, 1.0)
    leadtime_mult = np.clip(0.8 + lead_time_days / 50, None, 1.6)

    raw_mult = ins_mult * weekday_mult * type_mult * leadtime_mult
    base_rate = 0.12 / raw_mult.mean()  # normalize so the fleet-wide average lands at ~12%
    no_show_prob = np.clip(base_rate * raw_mult, 0.02, 0.6)

    is_no_show = RNG.random(len(df)) < no_show_prob
    status = np.empty(len(df), dtype=object)
    status[is_no_show] = "No-Show"

    remaining_idx = np.where(~is_no_show)[0]
    outcome = RNG.choice(
        ["Completed", "Cancelled", "Rescheduled"],
        size=len(remaining_idx),
        p=[0.74 / 0.88, 0.09 / 0.88, 0.05 / 0.88],
    )
    status[remaining_idx] = outcome
    df["status"] = status

    df = df.drop(columns=["subspecialty"])
    df = df[["appointment_id", "patient_id", "provider_id", "office_id",
              "scheduled_date", "appointment_date", "appointment_type",
              "status", "lead_time_days"]]
    return df


# --------------------------------------------------------------------------
# SURGERIES
# --------------------------------------------------------------------------


def generate_surgeries(appointments: pd.DataFrame, providers: pd.DataFrame) -> pd.DataFrame:
    surgeon_ids = set(providers.loc[providers["is_surgeon"], "provider_id"])
    provider_subspecialty = dict(zip(providers["provider_id"], providers["subspecialty"]))
    provider_office = dict(zip(providers["provider_id"], providers["primary_office_id"]))

    pool = appointments[(appointments["status"] == "Completed") &
                         (appointments["provider_id"].isin(surgeon_ids))].reset_index(drop=True)

    replace = len(pool) < N_SURGERIES_TARGET
    idx = RNG.choice(len(pool), size=N_SURGERIES_TARGET, replace=replace)
    picked = pool.iloc[idx].reset_index(drop=True)

    rows = []
    for i, visit in picked.iterrows():
        subspecialty = provider_subspecialty[visit["provider_id"]]
        procedures = PROCEDURE_MENU.get(subspecialty, PROCEDURE_MENU["Sports Medicine"])
        procedure = RNG.choice(procedures)

        max_offset = min(60, (WINDOW_END - visit["appointment_date"]).days)
        max_offset = max(max_offset, 1)
        min_offset = min(14, max_offset)
        offset = int(RNG.integers(min_offset, max_offset + 1))
        surgery_date = visit["appointment_date"] + dt.timedelta(days=offset)

        if procedure in OUTPATIENT_RATE_HIGH:
            outpatient_p = 0.95
        elif procedure in OUTPATIENT_RATE_LOW:
            outpatient_p = 0.25
        else:
            outpatient_p = 0.72
        is_outpatient = bool(RNG.random() < outpatient_p)

        rows.append({
            "surgery_id": f"SRG{i+1:04d}",
            "patient_id": visit["patient_id"],
            "provider_id": visit["provider_id"],
            "surgery_date": surgery_date,
            "procedure_type": procedure,
            "subspecialty": subspecialty,
            "office_id": provider_office[visit["provider_id"]],
            "is_outpatient": is_outpatient,
        })
    return pd.DataFrame(rows)


# --------------------------------------------------------------------------
# ANCILLARY REFERRALS
# --------------------------------------------------------------------------


def generate_ancillary_referrals(appointments: pd.DataFrame, offices: pd.DataFrame) -> pd.DataFrame:
    office_imaging = dict(zip(offices["office_id"], offices["has_onsite_imaging"]))
    office_pt = dict(zip(offices["office_id"], offices["has_onsite_pt"]))

    idx = RNG.choice(len(appointments), size=N_REFERRALS_TARGET, replace=len(appointments) < N_REFERRALS_TARGET)
    source = appointments.iloc[idx].reset_index(drop=True)

    service_type = RNG.choice(SERVICE_TYPES, size=len(source), p=SERVICE_TYPE_WEIGHTS)

    rows = []
    for i, (_, visit) in enumerate(source.iterrows()):
        svc = service_type[i]
        base_rate = COMPLETION_RATE_BASE[svc]
        if svc == "Physical Therapy" and not office_pt.get(visit["office_id"], False):
            base_rate *= LEAKAGE_PENALTY
        elif svc == "Imaging" and not office_imaging.get(visit["office_id"], False):
            base_rate *= LEAKAGE_PENALTY

        completed = bool(RNG.random() < base_rate)
        completion_date = None
        if completed:
            offset = int(RNG.integers(3, 46))
            completion_date = visit["appointment_date"] + dt.timedelta(days=offset)

        rows.append({
            "referral_id": f"REF{i+1:04d}",
            "patient_id": visit["patient_id"],
            "referring_provider_id": visit["provider_id"],
            "service_type": svc,
            "referral_date": visit["appointment_date"],
            "completed": completed,
            "completion_date": completion_date,
            "office_id": visit["office_id"],
        })
    return pd.DataFrame(rows)


# --------------------------------------------------------------------------
# DATA QUALITY INJECTION (deliberate, documented defects)
# --------------------------------------------------------------------------


def inject_data_quality_issues(patients: pd.DataFrame, appointments: pd.DataFrame,
                                referrals: pd.DataFrame) -> dict:
    log: dict = {}

    # --- missing fields -------------------------------------------------
    zip_idx = RNG.choice(len(patients), size=round(0.015 * len(patients)), replace=False)
    patients.loc[zip_idx, "home_zip"] = np.nan
    log["missing_home_zip"] = len(zip_idx)

    ins_idx = RNG.choice(len(patients), size=round(0.008 * len(patients)), replace=False)
    patients.loc[ins_idx, "insurance_type"] = np.nan
    log["missing_insurance_type"] = len(ins_idx)

    type_idx = RNG.choice(len(appointments), size=round(0.003 * len(appointments)), replace=False)
    appointments.loc[type_idx, "appointment_type"] = np.nan
    log["missing_appointment_type"] = len(type_idx)

    completed_idx = referrals.index[referrals["completed"]].to_numpy()
    n_missing_completion = round(0.02 * len(completed_idx))
    missing_completion_idx = RNG.choice(completed_idx, size=n_missing_completion, replace=False)
    referrals.loc[missing_completion_idx, "completion_date"] = None
    log["missing_completion_date_on_completed_referrals"] = n_missing_completion

    # --- orphaned foreign keys -------------------------------------------
    orphan_appt_idx = RNG.choice(len(appointments), size=15, replace=False)
    appointments.loc[orphan_appt_idx, "provider_id"] = "PRV999"
    log["orphaned_appointment_provider_id"] = len(orphan_appt_idx)

    orphan_ref_idx = RNG.choice(len(referrals), size=8, replace=False)
    referrals.loc[orphan_ref_idx, "patient_id"] = "PAT99999"
    log["orphaned_referral_patient_id"] = len(orphan_ref_idx)

    # --- duplicate primary keys (append exact-duplicate rows) ------------
    dup_appt_idx = RNG.choice(len(appointments), size=12, replace=False)
    dup_appt_rows = appointments.iloc[dup_appt_idx].copy()
    appointments_out = pd.concat([appointments, dup_appt_rows], ignore_index=True)
    log["duplicate_appointment_id"] = len(dup_appt_idx)

    dup_ref_idx = RNG.choice(len(referrals), size=5, replace=False)
    dup_ref_rows = referrals.iloc[dup_ref_idx].copy()
    referrals_out = pd.concat([referrals, dup_ref_rows], ignore_index=True)
    log["duplicate_referral_id"] = len(dup_ref_idx)

    return {"patients": patients, "appointments": appointments_out, "referrals": referrals_out, "log": log}


def write_data_quality_log(log: dict) -> None:
    lines = [
        "# Injected Data Quality Defects — Ground Truth\n",
        "This file documents every deliberately injected data-quality defect in the",
        "generated CSVs, so Phase 2's `/api/data-quality/*` endpoints can be verified",
        "against a known baseline. Generated automatically by `generate_data.py`",
        f"(seed={SEED}) — counts below are exact for this run.\n",
        "| Defect | File | Count |",
        "|---|---|---|",
        f"| Missing `home_zip` | patients.csv | {log['missing_home_zip']} |",
        f"| Missing `insurance_type` | patients.csv | {log['missing_insurance_type']} |",
        f"| Missing `appointment_type` | appointments.csv | {log['missing_appointment_type']} |",
        f"| Missing `completion_date` where `completed=True` | ancillary_referrals.csv | {log['missing_completion_date_on_completed_referrals']} |",
        f"| Orphaned `provider_id` (= `PRV999`, not in providers.csv) | appointments.csv | {log['orphaned_appointment_provider_id']} |",
        f"| Orphaned `patient_id` (= `PAT99999`, not in patients.csv) | ancillary_referrals.csv | {log['orphaned_referral_patient_id']} |",
        f"| Duplicate `appointment_id` (exact duplicate rows appended) | appointments.csv | {log['duplicate_appointment_id']} |",
        f"| Duplicate `referral_id` (exact duplicate rows appended) | ancillary_referrals.csv | {log['duplicate_referral_id']} |",
        "",
    ]
    (DATA_DIR / "data_quality_injected.md").write_text("\n".join(lines), encoding="utf-8")


# --------------------------------------------------------------------------
# MAIN
# --------------------------------------------------------------------------


def main() -> None:
    print(f"Generating synthetic data (seed={SEED}, window={WINDOW_START} to {WINDOW_END}) ...")

    offices = generate_offices()
    providers = generate_providers(offices)
    patients = generate_patients()
    appointments = generate_appointments(patients, providers, offices)
    surgeries = generate_surgeries(appointments, providers)
    referrals = generate_ancillary_referrals(appointments, offices)

    result = inject_data_quality_issues(patients, appointments, referrals)
    patients = result["patients"]
    appointments = result["appointments"]
    referrals = result["referrals"]

    offices.to_csv(DATA_DIR / "offices.csv", index=False)
    providers.to_csv(DATA_DIR / "providers.csv", index=False)
    patients.to_csv(DATA_DIR / "patients.csv", index=False)
    appointments.to_csv(DATA_DIR / "appointments.csv", index=False)
    surgeries.to_csv(DATA_DIR / "surgeries.csv", index=False)
    referrals.to_csv(DATA_DIR / "ancillary_referrals.csv", index=False)
    write_data_quality_log(result["log"])

    print("Row counts:")
    print(f"  offices.csv              {len(offices):>6}")
    print(f"  providers.csv            {len(providers):>6}")
    print(f"  patients.csv             {len(patients):>6}")
    print(f"  appointments.csv         {len(appointments):>6}")
    print(f"  surgeries.csv            {len(surgeries):>6}")
    print(f"  ancillary_referrals.csv  {len(referrals):>6}")
    print("Done. See data/data_quality_injected.md for the injected-defect ground truth.")


if __name__ == "__main__":
    main()
