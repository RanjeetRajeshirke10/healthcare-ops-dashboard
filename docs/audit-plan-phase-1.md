# Audit Plan — Phase 1: Data

**Status:** Decisions resolved (see Section 3) — awaiting final go-ahead to write code
**Scope:** Create the synthetic CSV dataset that acts as the "database" for Phases 2–5. No backend, no frontend, no API code in this phase.

---

## 1. What this phase will build

### Files created

| Path | Purpose |
|---|---|
| `data/generate_data.py` | Reproducible synthetic data generator (fixed seed). Writes all 6 CSVs. |
| `data/validate_data.py` | Validation script: row counts, distribution sanity checks, referential-integrity report. Prints a readable report to stdout. |
| `data/offices.csv` | 15 rows |
| `data/providers.csv` | 60 rows |
| `data/patients.csv` | 5,000 rows |
| `data/appointments.csv` | ~25,000 rows |
| `data/surgeries.csv` | ~3,000 rows |
| `data/ancillary_referrals.csv` | ~4,000 rows |
| `data/README.md` | Short data dictionary: every column, type, and allowed values. |
| `.gitignore` | Python/Node/editor ignores. **CSVs are committed** (they are the database for this project — see Assumption A7). |
| `requirements.txt` (root) | `pandas`, `numpy` for the generator. Backend deps added in Phase 2. |
| `docs/audit-plan-phase-1.md` | This living document. |

### Column specifications

**offices.csv** — 15 rows
- `office_id` — `OFF001`…`OFF015`
- `office_name` — real-sounding town names per region (e.g. "Marlton", "Willow Grove", "Bryn Mawr", "Lakeland")
- `region` — `Philadelphia Metro` (6), `South Jersey` (5), `Central Florida` (4)
- `state` — `PA`, `NJ`, `FL` (derived from region)
- `has_onsite_imaging` — bool, ~60% true
- `has_onsite_pt` — bool, ~55% true (correlated with imaging but not identical, so leakage analysis has signal)

**providers.csv** — 60 rows
- `provider_id` — `PRV001`…`PRV060`
- `provider_name` — synthetic names (`Dr. <First> <Last>`), no real people
- `subspecialty` — the 8 listed values, weighted toward Hip & Knee / Spine / Sports Medicine (the high-volume ones)
- `primary_office_id` — FK to offices; every office gets ≥2 providers
- `hire_date` — spread over ~15 years; ~8 providers hired *inside* the 18-month data window so their volume ramps (realistic, and gives the productivity dashboard something interesting)
- `is_surgeon` — bool; true for surgical subspecialties, false for Physical Medicine & Rehab and Pain Medicine

**patients.csv** — 5,000 rows
- `patient_id` — `PAT00001`…`PAT05000`
- `date_of_birth` — age distribution skewed older (orthopaedic): ~18–95, mode around 55–70
- `gender` — `F` / `M` / `Other` (~49/49/2)
- `insurance_type` — `Commercial` 52%, `Medicare` 30%, `Medicaid` 12%, `Self-Pay` 6%; Medicare share rises sharply with age
- `home_zip` — 5-digit strings drawn from a fixed pool per region (written as text so leading zeros survive — NJ zips start with 0)

**appointments.csv** — ~25,000 rows
- `appointment_id` — `APT000001`…
- `patient_id`, `provider_id`, `office_id` — FKs; office is the provider's primary office ~90% of the time, otherwise another office in the same region
- `scheduled_date`, `appointment_date` — ISO `YYYY-MM-DD`
- `appointment_type` — `New Patient` ~30%, `Follow-Up` ~70%
- `status` — `Completed`, `No-Show`, `Cancelled`, `Rescheduled`
- `lead_time_days` — computed `appointment_date - scheduled_date`

**surgeries.csv** — ~3,000 rows
- `surgery_id` — `SRG0001`…
- `patient_id` — only patients who had a completed appointment with that surgeon beforehand
- `provider_id` — surgeons only
- `surgery_date` — 14–60 days after a qualifying completed visit
- `procedure_type` — drawn from a per-subspecialty menu (e.g. Hip & Knee → Total Knee Arthroplasty, Total Hip Arthroplasty, Knee Arthroscopy; Spine → Lumbar Fusion, Microdiscectomy, Laminectomy)
- `subspecialty` — matches the operating provider
- `office_id` — site of surgery
- `is_outpatient` — bool, ~72% overall, varying by procedure (arthroscopy ~95%, fusion ~25%)

**ancillary_referrals.csv** — ~4,000 rows
- `referral_id` — `REF0001`…
- `patient_id`, `referring_provider_id`, `office_id` — FKs
- `service_type` — `Physical Therapy` 45%, `Imaging` 30%, `Orthotics` 13%, `Hand Therapy` 12%
- `referral_date` — tied to a real appointment date for that patient
- `completed` — bool
- `completion_date` — nullable; 3–45 days after referral when completed, empty otherwise

### Realistic patterns to be engineered (not pure randomness)

1. **No-show rate ~12% overall**, built from a base rate modified by:
   - Insurance: Medicaid ×1.9, Self-Pay ×1.7, Medicare ×0.8, Commercial ×1.0
   - Day of week: Monday ×1.35, Friday ×1.15, mid-week ×1.0
   - Appointment type: New Patient ×1.3 (first-timers no-show more)
   - Lead time: longer waits → higher no-show (a booking made 45 days out is likelier to be forgotten)
   - Final rate clamped into the 10–15% band overall.
2. **Seasonality** — appointment volume multiplier by month: December ~0.80 (holiday dip), January ~1.20 (deductible reset + New Year spike), July–August ~0.92 (vacations), otherwise ~1.0.
3. **Weekday-only scheduling** — no Saturday/Sunday appointments or surgeries.
4. **Ancillary completion 70–85%**, by service type: Imaging ~0.86, Physical Therapy ~0.74, Hand Therapy ~0.78, Orthotics ~0.70. Referrals to an office *without* the matching onsite service get a completion penalty (×0.85) — this is what makes the leakage endpoint in Phase 2 show a real signal.
5. **New-patient wait times** averaging 10–20 days, by subspecialty: Spine ~24 days, Hip & Knee ~19, Sports Medicine ~14, Hand & Wrist ~12, Foot & Ankle ~12, Pain Medicine ~16, PM&R ~11, Oncology ~9 (urgent). Follow-ups are much shorter (~5–10 days). Waits drift upward ~8% over the 18 months (growing demand).
6. **Provider volume spread** — visits per provider follow a realistic spread rather than a flat average, so the "top N providers" chart isn't a straight line.

### Validation output (`validate_data.py`)

Prints, and exits non-zero if a hard check fails:
- Row count per file vs. target
- Referential integrity: orphaned FK counts for every relationship
- Null counts per column
- Duplicate PK counts
- No-show rate: overall, by insurance type, by weekday
- Appointments per month (shows the Dec dip / Jan spike)
- Mean `lead_time_days` for New Patient by subspecialty
- Referral completion rate by service type, and onsite vs. offsite
- Date range coverage, weekend-appointment count (must be 0)
- Sanity asserts: `lead_time_days >= 0`, `completion_date >= referral_date`, `surgery_date` after a prior completed visit, no surgeries by non-surgeons

---

## 2. Assumptions

- **A1 — Date window.** 18 months ending **2026-08-31** (last complete month before today, 2026-09-06), so the window is **2025-03-01 → 2026-08-31**. Hardcoded as a constant, not `today()`, so regenerating the data later produces identical output.
- **A2 — Fixed seed.** `SEED = 42`, single `numpy.random.default_rng(SEED)` threaded through the whole generator. Re-running overwrites the CSVs with byte-identical content.
- **A3 — Deliberate dirty data.** A small, controlled amount of imperfection is injected so the Phase 2 Data Quality dashboard has something real to report — see Open Question Q1 for the proposed amounts. Every injected defect is logged to `data/data_quality_injected.md` so we can verify the Phase 2 endpoints against a known ground truth.
- **A4 — Status mix.** `Completed` ~74%, `No-Show` ~12%, `Cancelled` ~9%, `Rescheduled` ~5%. Only `Completed` counts as a visit for productivity; no-show rate is computed as `No-Show ÷ (Completed + No-Show)` — i.e. cancellations are excluded from the denominator, which is the standard ambulatory definition. This definition will be restated in Phase 2.
- **A5 — Booleans** written as `True`/`False` (pandas default) so `read_csv` infers `bool` cleanly.
- **A6 — All data is synthetic.** No real patients, providers, or PHI. A note stating this goes in `data/README.md` and later in the root README.
- **A7 — CSVs are committed to git.** They are the project's database and a portfolio reviewer must be able to clone and run without executing the generator. Total size estimated <5 MB.
- **A8 — Patient activity spread.** Patients aren't uniform: ~20% are high-utilizers with many visits, ~35% appear once or twice. This is realistic and gives the data a natural long tail.
- **A9 — Company scale is internally consistent.** ~25,000 appointments over 15 offices × 18 months ≈ 93 appointments per office per month — deliberately a modest, believable ambulatory volume rather than a mismatched number.

---

## 3. Decisions (resolved)

**Q1 — Deliberate dirty data: RESOLVED → realistically dirty.** Using the proposed amounts:
- ~1.5% missing `home_zip`, ~0.8% missing `insurance_type` (patients)
- ~2% missing `completion_date` on rows marked `completed = True`
- ~0.3% missing `appointment_type`
- ~15 appointments referencing a `provider_id` not in providers.csv, ~8 referrals with a bad `patient_id` (orphans)
- ~12 duplicate `appointment_id` values, ~5 duplicate `referral_id` values

All amounts logged to `data/data_quality_injected.md` as ground truth for Phase 2 verification.

**Q2 — Date window: RESOLVED → approved as proposed.** 18 months, hardcoded 2025-03-01 → 2026-08-31.

**Q3 — Region/office naming: RESOLVED → fully invented town names.** No real Rothman-affiliated location names will be used.

**Q4 — GitHub remote: RESOLVED.**
- `gh` CLI and Node.js installed via winget; `gh auth login --web` completed — authenticated as **RanjeetRajeshirke10**.
- Git identity: `ranjeetrajeshirke04@gmail.com` / "Ranjeet Irke".
- Repo created: **public**, https://github.com/RanjeetRajeshirke10/healthcare-ops-dashboard, remote `origin` set, local repo initialized on branch `main`.

**Q5 — Node.js: RESOLVED.** Installed, v24.19.0 (satisfies Node 18+ requirement for Phase 3).

**Environment note:** A Python venv (`.venv/`, gitignored) was created with `pandas 3.0.5` / `numpy 2.5.3` — newer majors than initially available on base Python, since no version was pinned during setup. `requirements.txt` for this phase will pin these exact versions, and the generator will be verified against them (no expected API breakage for the operations used, but flagging since pandas 3.x changed some defaults from 2.x).

---

## 4. Task checklist

- [x] Q1–Q5 answered and this plan approved
- [x] Create folder structure (`data/`, `docs/`)
- [x] `.gitignore` and root `requirements.txt` (pinned `pandas==3.0.5`, `numpy==2.5.3`)
- [x] `generate_data.py`: config block (seed, window, volumes, all rate constants at the top)
- [x] Generate offices → providers → patients (independent dimensions)
- [x] Generate appointments with seasonality, weekday effects, lead-time and no-show logic
- [x] Generate surgeries from qualifying completed visits
- [x] Generate ancillary referrals with onsite/offsite completion effect
- [x] Inject documented data-quality defects
- [x] Write all 6 CSVs
- [x] `validate_data.py` with the full check list above
- [x] Run generator + validator; review output against every target pattern
- [x] `data/README.md` data dictionary
- [x] Log any mid-phase deviations into Section 5 below
- [ ] Your confirmation → commit → push → confirm push succeeded → close phase

---

## 5. Change log / addenda

*(Every deviation from the plan above, and every mid-phase change you request, gets appended here with a date.)*

- 2026-09-06 — Plan drafted. Awaiting approval.
- 2026-09-06 — Q1–Q5 resolved; environment set up (Node.js, gh CLI, venv, GitHub repo).
- 2026-09-06 — Built `generate_data.py` and `validate_data.py`. First run: Physical Therapy and Orthotics referral completion landed slightly below the 70–85% target band (66.9% and 67.3% respectively), because referral volume skewed toward offices lacking the matching onsite service more than assumed. **Deviation:** tuned `COMPLETION_RATE_BASE` for Physical Therapy (0.74 → 0.83) and Orthotics (0.70 → 0.73). Re-ran — all soft-stat targets now land centrally within their bands (see Section 6 results). No other deviations from the plan.

---

## 6. Final validation results (this run, seed=42)

- Row counts: offices 15, providers 60, patients 5,000, appointments 25,012 (25,000 + 12 injected dup), surgeries 3,000, ancillary_referrals 4,005 (4,000 + 5 injected dup) — all on target.
- Referential integrity: 0 unintended orphans; the only orphans present are the 15 + 8 deliberately injected ones (see `data_quality_injected.md`).
- No hard-check failures (no negative lead times, no completion-before-referral dates, no non-surgeon surgeries, zero weekend appointments).
- No-show: 14.0% overall (target 10–15%); Medicaid 23.0%, Self-Pay 20.9% > Commercial 12.6% > Medicare 10.4%; Monday highest at 17.1%.
- Seasonality: December lowest month (1,207), January highest (1,702) — dip/spike both present.
- New-patient wait times by subspecialty track the configured means closely (Spine 24.3, Hip & Knee 18.9, Pain Medicine 15.6, Sports Medicine 13.4, Hand & Wrist 12.0, Foot & Ankle 11.9, PM&R 11.2, Oncology 8.0).
- Ancillary referral completion, all within 70–85%: Imaging 76.0%, Hand Therapy 75.9%, Physical Therapy 74.8%, Orthotics 74.7%. Leakage effect confirmed: PT onsite 82.4% vs offsite 69.5%; Imaging onsite 82.9% vs offsite 69.7%.
- Injected data-quality defects present exactly as logged in `data/data_quality_injected.md`.

**Status: build complete, ready for your review.**
