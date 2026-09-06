# Injected Data Quality Defects — Ground Truth

This file documents every deliberately injected data-quality defect in the
generated CSVs, so Phase 2's `/api/data-quality/*` endpoints can be verified
against a known baseline. Generated automatically by `generate_data.py`
(seed=42) — counts below are exact for this run.

| Defect | File | Count |
|---|---|---|
| Missing `home_zip` | patients.csv | 75 |
| Missing `insurance_type` | patients.csv | 40 |
| Missing `appointment_type` | appointments.csv | 75 |
| Missing `completion_date` where `completed=True` | ancillary_referrals.csv | 60 |
| Orphaned `provider_id` (= `PRV999`, not in providers.csv) | appointments.csv | 15 |
| Orphaned `patient_id` (= `PAT99999`, not in patients.csv) | ancillary_referrals.csv | 8 |
| Duplicate `appointment_id` (exact duplicate rows appended) | appointments.csv | 12 |
| Duplicate `referral_id` (exact duplicate rows appended) | ancillary_referrals.csv | 5 |
