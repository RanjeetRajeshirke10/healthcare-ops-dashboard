"""
Validation script for the synthetic dataset. Reads the 6 CSVs back with pandas
and reports row counts, referential integrity, null counts, duplicate counts,
and the realistic-pattern checks called out in the Phase 1 audit plan
(no-show rate, seasonality, wait times, referral completion / leakage).

Exits non-zero if a HARD check fails (data that would break Phase 2 logic).
Soft stats (rates, means) are printed for review regardless — they're
supposed to land in a target *range*, not hit an exact number.

Run from the repo root:
    .venv\\Scripts\\python.exe data\\validate_data.py
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).parent

TARGETS = {
    "offices": 15, "providers": 60, "patients": 5_000,
    "appointments": 25_000, "surgeries": 3_000, "ancillary_referrals": 4_000,
}

hard_failures: list[str] = []


def section(title: str) -> None:
    print(f"\n=== {title} ===")


def load() -> dict[str, pd.DataFrame]:
    dfs = {}
    for name in TARGETS:
        df = pd.read_csv(DATA_DIR / f"{name}.csv", dtype={"home_zip": "string"})
        for col in df.columns:
            if col.endswith("_date"):
                df[col] = pd.to_datetime(df[col], errors="coerce")
        dfs[name] = df
    return dfs


def check_row_counts(dfs: dict[str, pd.DataFrame]) -> None:
    section("Row counts (target is approximate — includes injected duplicates)")
    for name, target in TARGETS.items():
        n = len(dfs[name])
        pct = (n - target) / target * 100
        print(f"  {name:<22} {n:>7}   (target {target:>6}, {pct:+.1f}%)")


def check_referential_integrity(dfs: dict[str, pd.DataFrame]) -> None:
    section("Referential integrity (orphaned foreign keys)")
    off_ids = set(dfs["offices"]["office_id"])
    prov_ids = set(dfs["providers"]["provider_id"])
    pat_ids = set(dfs["patients"]["patient_id"])

    checks = [
        ("appointments.provider_id -> providers", dfs["appointments"]["provider_id"], prov_ids),
        ("appointments.patient_id -> patients", dfs["appointments"]["patient_id"], pat_ids),
        ("appointments.office_id -> offices", dfs["appointments"]["office_id"], off_ids),
        ("surgeries.provider_id -> providers", dfs["surgeries"]["provider_id"], prov_ids),
        ("surgeries.patient_id -> patients", dfs["surgeries"]["patient_id"], pat_ids),
        ("surgeries.office_id -> offices", dfs["surgeries"]["office_id"], off_ids),
        ("ancillary_referrals.patient_id -> patients", dfs["ancillary_referrals"]["patient_id"], pat_ids),
        ("ancillary_referrals.referring_provider_id -> providers", dfs["ancillary_referrals"]["referring_provider_id"], prov_ids),
        ("ancillary_referrals.office_id -> offices", dfs["ancillary_referrals"]["office_id"], off_ids),
        ("providers.primary_office_id -> offices", dfs["providers"]["primary_office_id"], off_ids),
    ]
    for label, series, valid_ids in checks:
        orphans = (~series.isin(valid_ids)).sum()
        print(f"  {label:<55} orphans: {orphans}")


def check_nulls(dfs: dict[str, pd.DataFrame]) -> None:
    section("Null counts per column (non-zero only)")
    for name, df in dfs.items():
        nulls = df.isna().sum()
        nulls = nulls[nulls > 0]
        if len(nulls):
            print(f"  {name}.csv:")
            for col, n in nulls.items():
                print(f"    {col:<20} {n}")


def check_duplicates(dfs: dict[str, pd.DataFrame]) -> None:
    section("Duplicate primary keys")
    pk_map = {
        "offices": "office_id", "providers": "provider_id", "patients": "patient_id",
        "appointments": "appointment_id", "surgeries": "surgery_id",
        "ancillary_referrals": "referral_id",
    }
    for name, pk in pk_map.items():
        dup_count = dfs[name][pk].duplicated().sum()
        print(f"  {name}.csv [{pk}]  duplicates: {dup_count}")


def check_no_show_rate(dfs: dict[str, pd.DataFrame]) -> None:
    section("No-show rate (denominator = Completed + No-Show, cancellations excluded)")
    appts = dfs["appointments"]
    denom_mask = appts["status"].isin(["Completed", "No-Show"])
    denom = appts[denom_mask]
    overall = (denom["status"] == "No-Show").mean()
    print(f"  Overall: {overall:.1%}  (target band 10-15%)")
    if not (0.08 <= overall <= 0.17):
        hard_failures.append(f"Overall no-show rate {overall:.1%} is well outside the 10-15% target band")

    merged = denom.merge(dfs["patients"][["patient_id", "insurance_type"]], on="patient_id", how="left")
    print("  By insurance type:")
    for ins, grp in merged.groupby("insurance_type", dropna=False):
        print(f"    {str(ins):<12} {(grp['status'] == 'No-Show').mean():.1%}")

    denom = denom.copy()
    denom["weekday"] = denom["appointment_date"].dt.day_name()
    print("  By weekday:")
    for wd, grp in denom.groupby("weekday"):
        print(f"    {wd:<10} {(grp['status'] == 'No-Show').mean():.1%}")


def check_seasonality(dfs: dict[str, pd.DataFrame]) -> None:
    section("Appointment volume by month (expect Dec dip, Jan spike)")
    appts = dfs["appointments"].copy()
    appts["month"] = appts["appointment_date"].dt.to_period("M")
    counts = appts.groupby("month").size()
    for month, n in counts.items():
        print(f"    {month}  {n}")

    weekend_count = appts["appointment_date"].dt.weekday.isin([5, 6]).sum()
    print(f"  Weekend appointments (should be 0): {weekend_count}")
    if weekend_count > 0:
        hard_failures.append(f"{weekend_count} appointments fall on a weekend")


def check_wait_times(dfs: dict[str, pd.DataFrame]) -> None:
    section("Mean lead_time_days, New Patient, by subspecialty")
    appts = dfs["appointments"]
    providers = dfs["providers"][["provider_id", "subspecialty"]]
    merged = appts.merge(providers, on="provider_id", how="inner")
    new_pts = merged[merged["appointment_type"] == "New Patient"]
    means = new_pts.groupby("subspecialty")["lead_time_days"].mean().sort_values(ascending=False)
    for sub, mean in means.items():
        print(f"    {sub:<28} {mean:.1f} days")


def check_referral_completion(dfs: dict[str, pd.DataFrame]) -> None:
    section("Ancillary referral completion rate (target band 70-85%)")
    refs = dfs["ancillary_referrals"]
    by_type = refs.groupby("service_type")["completed"].mean()
    for svc, rate in by_type.items():
        print(f"    {svc:<20} {rate:.1%}")

    offices = dfs["offices"][["office_id", "has_onsite_imaging", "has_onsite_pt"]]
    merged = refs.merge(offices, on="office_id", how="left")

    pt = merged[merged["service_type"] == "Physical Therapy"]
    print("  Physical Therapy — onsite vs offsite (leakage effect):")
    for onsite, grp in pt.groupby("has_onsite_pt"):
        print(f"    onsite_pt={onsite}   completion={grp['completed'].mean():.1%}")

    img = merged[merged["service_type"] == "Imaging"]
    print("  Imaging — onsite vs offsite (leakage effect):")
    for onsite, grp in img.groupby("has_onsite_imaging"):
        print(f"    onsite_imaging={onsite}   completion={grp['completed'].mean():.1%}")


def check_sanity_asserts(dfs: dict[str, pd.DataFrame]) -> None:
    section("Sanity asserts")
    appts = dfs["appointments"]
    neg_lead = (appts["lead_time_days"] < 0).sum()
    print(f"  Negative lead_time_days: {neg_lead}")
    if neg_lead:
        hard_failures.append(f"{neg_lead} appointments have negative lead_time_days")

    refs = dfs["ancillary_referrals"]
    bad_completion = refs.dropna(subset=["completion_date"])
    bad_completion = bad_completion[bad_completion["completion_date"] < bad_completion["referral_date"]]
    print(f"  completion_date before referral_date: {len(bad_completion)}")
    if len(bad_completion):
        hard_failures.append(f"{len(bad_completion)} referrals have completion_date before referral_date")

    surgeons = set(dfs["providers"].loc[dfs["providers"]["is_surgeon"], "provider_id"])
    non_surgeon_surgeries = (~dfs["surgeries"]["provider_id"].isin(surgeons)).sum()
    print(f"  Surgeries performed by a non-surgeon: {non_surgeon_surgeries}")
    if non_surgeon_surgeries:
        hard_failures.append(f"{non_surgeon_surgeries} surgeries are attributed to a non-surgeon provider")

    date_min, date_max = appts["appointment_date"].min(), appts["appointment_date"].max()
    print(f"  appointment_date range: {date_min.date()} to {date_max.date()}")


def main() -> None:
    dfs = load()
    check_row_counts(dfs)
    check_referential_integrity(dfs)
    check_nulls(dfs)
    check_duplicates(dfs)
    check_no_show_rate(dfs)
    check_seasonality(dfs)
    check_wait_times(dfs)
    check_referral_completion(dfs)
    check_sanity_asserts(dfs)

    print("\n" + "=" * 60)
    if hard_failures:
        print(f"FAILED — {len(hard_failures)} hard check(s) failed:")
        for f in hard_failures:
            print(f"  - {f}")
        raise SystemExit(1)
    print("All hard checks passed. Review the soft stats above against target ranges.")


if __name__ == "__main__":
    main()
