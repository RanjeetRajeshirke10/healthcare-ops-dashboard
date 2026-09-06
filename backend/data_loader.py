"""
Loads the Phase 1 CSVs into pandas DataFrames once, at app startup, and caches
them in memory for the lifetime of the process (see main.py's lifespan
handler). No router ever re-reads a CSV per-request.

Two views of appointments/referrals are kept:
  - `raw_*`     — exactly what's in the CSV, duplicates and orphaned FKs intact.
                  Used only by the Data Quality router, which needs to *measure*
                  those defects.
  - the "clean" dedup'd frame (`appointments`, `referrals`) — exact-duplicate
    primary keys collapsed to one row, so every other router never
    double-counts. Orphaned-FK rows are NOT removed here; they're dropped only
    by whichever computation actually needs the join that key would feed
    (see backend/utils.py). This matches Phase 2 audit plan Assumption A4.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd
from fastapi import Request

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

DATE_COLUMNS = {
    "providers": ["hire_date"],
    "patients": ["date_of_birth"],
    "appointments": ["scheduled_date", "appointment_date"],
    "surgeries": ["surgery_date"],
    "ancillary_referrals": ["referral_date", "completion_date"],
}


@dataclass
class DataStore:
    offices: pd.DataFrame
    providers: pd.DataFrame
    patients: pd.DataFrame
    raw_appointments: pd.DataFrame
    appointments: pd.DataFrame
    surgeries: pd.DataFrame
    raw_referrals: pd.DataFrame
    referrals: pd.DataFrame


def _read_csv(name: str) -> pd.DataFrame:
    df = pd.read_csv(DATA_DIR / f"{name}.csv", dtype={"home_zip": "string"})
    for col in DATE_COLUMNS.get(name, []):
        df[col] = pd.to_datetime(df[col], errors="coerce")
    return df


def load_data() -> DataStore:
    offices = _read_csv("offices")
    providers = _read_csv("providers")
    patients = _read_csv("patients")
    raw_appointments = _read_csv("appointments")
    surgeries = _read_csv("surgeries")
    raw_referrals = _read_csv("ancillary_referrals")

    appointments = raw_appointments.drop_duplicates(subset="appointment_id", keep="first").reset_index(drop=True)
    referrals = raw_referrals.drop_duplicates(subset="referral_id", keep="first").reset_index(drop=True)

    return DataStore(
        offices=offices,
        providers=providers,
        patients=patients,
        raw_appointments=raw_appointments,
        appointments=appointments,
        surgeries=surgeries,
        raw_referrals=raw_referrals,
        referrals=referrals,
    )


def get_store(request: Request) -> DataStore:
    """FastAPI dependency — returns the DataStore cached on app.state at startup."""
    return request.app.state.data_store
