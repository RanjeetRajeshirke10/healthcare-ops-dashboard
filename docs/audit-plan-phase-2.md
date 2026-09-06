# Audit Plan — Phase 2: Backend

**Status:** Built and tested — ready for your review
**Scope:** Build the FastAPI backend that reads the Phase 1 CSVs and serves aggregated KPIs as JSON. No frontend code in this phase — endpoints are tested via `/docs` (Swagger UI).

---

## 1. What this phase will build

### Structure

```
backend/
  main.py               # FastAPI app, lifespan-based CSV load, CORS, router includes, /api/health
  data_loader.py         # Loads the 6 CSVs into pandas DataFrames once at startup; cached in-memory DataStore
  routers/
    access.py            # /api/access/*
    productivity.py       # /api/productivity/*
    ancillary.py          # /api/ancillary/*
    data_quality.py       # /api/data-quality/*
    overview.py           # /api/overview/*
    filters.py            # /api/filters/options
  models/
    schemas.py            # Pydantic response models (ChartPoint, TrendPoint, and per-endpoint composites)
  requirements.txt         # Pinned fastapi/uvicorn/pydantic versions (resolved at install time, like Phase 1)
```

### Core design rules (from the original spec, restated)

- All 6 CSVs are loaded into pandas DataFrames **once at startup** via a FastAPI `lifespan` context manager (not the deprecated `@app.on_event`), cached in memory, and shared across requests via dependency injection — never re-read per request.
- Every endpoint accepts optional query params: `start_date`, `end_date`, `office_id`, `region`, `subspecialty` — the DataFrame is filtered before aggregating. Filters combine with AND logic.
- Responses are shaped for charts — lists of `{label, value}` or `{date, value}` — never a raw DataFrame dump.
- `GET /api/filters/options` returns available offices (`office_id`, `office_name`, `region`), regions, and subspecialties for the frontend's filter dropdowns.

### Endpoint contracts

**`GET /api/filters/options`**
`{ offices: [{office_id, office_name, region}], regions: [str], subspecialties: [str] }`

**Patient Access**
- `GET /api/access/no-show-rate` → `{ overall_rate, by_office: [{label, value}], by_subspecialty: [{label, value}], trend: [{date, value}] }` (trend = monthly)
- `GET /api/access/wait-times` → `{ overall_avg, by_subspecialty: [{label, value}], by_office: [{label, value}] }` — New Patient visits only, per spec
- `GET /api/access/appointment-volume` → `{ trend: [{date, value}], by_type: [{label, value}] }` — `granularity` query param (`day`/`week`/`month`, default `month`)

**Provider Productivity**
- `GET /api/productivity/visits-per-provider` → `{ providers: [{label, value, subspecialty, office_id}] }`, sorted descending by completed visits in the filtered range; optional `top_n` query param truncates server-side
- `GET /api/productivity/surgical-volume` → `{ by_provider: [{label, value}], by_subspecialty: [{label, value}], trend: [{date, value}] }` (trend = monthly)
- `GET /api/productivity/utilization` → `{ by_office: [{label, value}], detail: [{office_id, office_name, completed_visits, estimated_capacity, utilization_pct}] }`

**Ancillary Services**
- `GET /api/ancillary/referral-completion` → `{ by_service_type: [{label, value}], by_office: [{label, value}] }`
- `GET /api/ancillary/volume` → `{ trend: [{date, value}], by_service_type: [{label, value}] }` (trend = monthly)
- `GET /api/ancillary/leakage` → `{ services: [{service_type, onsite_completion_rate, offsite_completion_rate, offsite_referral_share}] }` (PT and Imaging only — those are the two services with an onsite/offsite flag)

**Data Quality**
- `GET /api/data-quality/summary` → `{ missing_fields: [{file, column, count, pct}], orphaned_fks: [{relationship, count}], health_by_file: [{file, status}] }` — `status` is `green`/`yellow`/`red` from simple thresholds (e.g. 0 issues = green, <2% affected rows = yellow, else red)
- `GET /api/data-quality/duplicates` → `{ appointment_id_duplicates, referral_id_duplicates, duplicate_appointment_ids: [str], duplicate_referral_ids: [str] }`

**Multi-Site Overview**
- `GET /api/overview/summary` → `{ company_wide: {total_patients, total_appointments, total_surgeries, avg_no_show_rate, avg_referral_completion}, by_region: [{region, total_patients, total_appointments, total_surgeries, avg_no_show_rate, avg_referral_completion}] }`
- `GET /api/overview/by-office` → `{ offices: [{office_id, office_name, region, total_appointments, total_surgeries, no_show_rate, referral_completion_rate, utilization_pct}] }`

**`GET /api/health`** — not in the original spec; trivial liveness check added for Phase 4/5 error-state testing (see Assumption A8).

---

## 2. Assumptions

- **A1 — Utilization capacity.** Estimated capacity = **20 patient slots per provider per weekday**, counted only over the days a provider is actually active (from `hire_date` onward, so a mid-window new hire has proportionally less capacity — consistent with Phase 1's ramping-volume design). Surgeons' reduced clinic availability on OR days is **not** modeled separately in Phase 2 — flagged as Open Question Q1 since it directly drives a visible KPI.
- **A2 — Single-value filters.** `office_id`, `region`, `subspecialty` each accept one value or are omitted (no multi-select) — matches a single-select dropdown per the Phase 3 FilterBar description.
- **A3 — Default trend granularity is month.** A `granularity` param (`week`/`month`) is added only where the original spec explicitly says "per week/month" (`visits-per-provider`, `appointment-volume`); everywhere else, monthly trending is fixed.
- **A4 — Dirty-data handling in business endpoints** (the Data Quality router is the only place raw defects are reported):
  - Exact-duplicate primary-key rows (the 12 injected duplicate `appointment_id`s, 5 duplicate `referral_id`s) are de-duplicated by ID before any KPI aggregation, so they're never double-counted.
  - Rows with an orphaned foreign key (15 appointments → `PRV999`, 8 referrals → `PAT99999`) are silently dropped **only** from computations that require the join those keys would feed (e.g. a per-subspecialty breakdown needs `providers.csv`); computations that don't need that join keep the row.
- **A5 — "Avg" rates in `/api/overview/summary` are pooled/weighted**, not an unweighted mean of each office's rate (e.g. avg no-show rate = total no-shows ÷ total qualifying appointments company-wide) — avoids small offices skewing the company-wide number.
- **A6 — Missing categorical values** (e.g. null `insurance_type`) are grouped into an explicit `"Unknown"` bucket in breakdowns rather than silently dropped.
- **A7 — Invalid filter values** (e.g. a nonexistent `office_id`) return an empty result set with HTTP 200, not an error. Malformed dates are rejected by FastAPI's automatic query-param validation (422).
- **A8 — `GET /api/health`** added for later phases' error-handling tests (not in the original spec; trivial, flagging for visibility).
- **A9 — CORS** allows `http://localhost:5173` and `http://127.0.0.1:5173` only (Vite defaults).
- **A10 — Backend `requirements.txt`** will pin the exact FastAPI/uvicorn/pydantic versions resolved when installed into the existing `.venv` (same approach as Phase 1's pandas/numpy pinning).

---

## 3. Decisions (resolved)

**Q1 — Utilization capacity: RESOLVED → flat slots/provider/weekday** (see Section 5 for a critical recalibration discovered during testing).

**Q2 — Ask AI / Build Action Plan: RESOLVED → entirely out of scope for Phase 2.** Only the 12 analytical endpoints + `/api/filters/options` (+ the added `/api/health`) were built.

**Q3 — `top_n` default: RESOLVED → return all 60 providers** sorted descending by default; `top_n` truncates server-side only when passed.

---

## 4. Task checklist

- [x] Q1–Q3 answered and this plan approved
- [x] `backend/` folder structure, `backend/requirements.txt` (pinned `fastapi==0.141.1`, `uvicorn==0.52.4`, `pydantic==2.13.5`)
- [x] Install fastapi/uvicorn/pydantic into `.venv`, pin resolved versions
- [x] `data_loader.py`: lifespan-based CSV load, DataStore, dependency-injection accessor
- [x] `models/schemas.py`: `ChartPoint`, `TrendPoint`, and per-endpoint composite response models
- [x] `routers/filters.py` — `/api/filters/options`
- [x] `routers/access.py` — no-show-rate, wait-times, appointment-volume
- [x] `routers/productivity.py` — visits-per-provider, surgical-volume, utilization
- [x] `routers/ancillary.py` — referral-completion, volume, leakage
- [x] `routers/data_quality.py` — summary, duplicates
- [x] `routers/overview.py` — summary, by-office
- [x] `main.py`: app wiring, CORS, router includes, `/api/health`
- [x] `utils.py` (addition, not in original structure): shared filter/aggregation helpers used by every router, so the filter contract is implemented identically everywhere instead of copy-pasted
- [x] Verified all 15 endpoints (13 spec'd + `/api/filters/options` + `/api/health`) by running the server and exercising every one with curl, including filter combinations, granularity switching, `top_n`, and edge cases
- [x] Log any mid-phase deviations into Section 5 below
- [ ] Your confirmation → commit → push → confirm push succeeded → close phase

---

## 5. Change log / addenda

- 2026-09-06 — Plan drafted. Awaiting approval.
- 2026-09-06 — Q1–Q3 resolved. Added `backend/utils.py` (not in the original file structure) to centralize the five-filter query contract and per-table filtering logic shared by every router — a straightforward implementation detail, not a change to any public endpoint contract.
- 2026-09-06 — **Deviation, discovered during endpoint testing:** with a literal flat 20 slots/provider/weekday (the Q1 answer), company-wide utilization computed to **~4.3%**, and every single office landed in a 3.5–6% band. This isn't a bug — Phase 1's target volume (~25,000 appointments / 60 providers / 18 months) works out to only ~1.1 completed visits per provider per weekday on average, so a 20-slot capacity was ~18x too high for the data density Phase 1 actually generated. A uniformly ~4% utilization KPI would read as broken on every dashboard page. **Fix:** recalibrated `SLOTS_PER_PROVIDER_PER_WEEKDAY` from 20 to **1.1**, documented in-code with the full rationale (`backend/utils.py`). Re-tested: company-wide utilization now **77.4%**, with a believable office-level spread of **65%–113%** (one office genuinely over capacity) — the metric now does its actual analytical job (surfacing which offices are under/over-utilized *relative to each other*) instead of reading as a uniform, meaningless single-digit number. Flagging clearly since this is a bigger swing than a normal tuning pass — happy to revisit if you'd rather keep a literal real-world slot count and accept the low reading.

---

## 6. Final verification results

- All 15 endpoints (13 spec'd + `/api/filters/options` + `/api/health`) return 200 with schema-valid, chart-ready JSON.
- Filters verified: `region`, `office_id`, `subspecialty`, `start_date`/`end_date` all narrow results correctly and combine with AND logic; a nonexistent `office_id` returns an empty list with HTTP 200 (Assumption A7); a malformed date returns HTTP 422 automatically.
- `granularity=week` on `appointment-volume` produces 79 weekly buckets across the 18-month window; `top_n` truncates `visits-per-provider` correctly.
- Business endpoints correctly exclude the Phase 1 injected duplicates from counts (`overview/summary` shows exactly 25,000 appointments and pooled 75.22% referral completion, matching the deduped counts, not the raw 25,012/4,005) — confirms the dedup rule (Assumption A4) works as designed.
- `data-quality/summary` and `data-quality/duplicates` correctly surface the raw defects from `data_quality_injected.md` (15 orphaned `provider_id`, 8 orphaned `patient_id`, 12 duplicate `appointment_id`, 5 duplicate `referral_id`, plus the missing-field counts) — `patients.csv` and `appointments.csv`/`ancillary_referrals.csv` show non-green health status as expected.
- Utilization: see the Section 5 recalibration — now centers at 77.4% company-wide with a realistic 65–113% office-level spread.

**Status: build complete, ready for your review.**
