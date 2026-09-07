# Healthcare Operations Analytics Dashboard

A full-stack analytics dashboard for a multi-site orthopaedic practice. It turns
six raw operational tables (offices, providers, patients, appointments,
surgeries, ancillary referrals) into five decision-oriented dashboards built from
a medical-monitor's point of view:

| Dashboard | Answers |
|---|---|
| **Overview** | Company-wide rollup — patient volume, appointments, surgeries, no-show rate, referral completion, by region and office. |
| **Patient Access** | How fast patients get seen — time to appointment, 14-day SLA attainment, short-notice capacity, slot realization, downstream referral backlog. |
| **Provider Productivity** | Clinical output — completed visits, visits per clinic day, panel size, surgical volume and mix, clinic utilization vs. capacity, new-hire ramp. |
| **Ancillary Services** | Downstream care — whether PT / imaging / orthotics referrals complete, how long they take, and how much leaks out of network when a site has no on-site service. |
| **Data Quality** | Whether the other four dashboards can be trusted — completeness, referential integrity, duplicate keys, and internal consistency, with the exact records to fix. |

Every chart and table is filterable by region, office, subspecialty, and date
range, and most are click-to-filter. Each page also has a rule-based
**"Ask Anything"** box and a **"Build Action Plan"** panel that reads the numbers
currently on screen — no LLM, no API key.

---

## Architecture

```
data/       Synthetic dataset (6 CSVs, committed) + generator/validator scripts
backend/    FastAPI app — loads the CSVs into memory once, serves aggregated KPIs as JSON
frontend/   Vite + React 19 + Recharts SPA — 5 dashboard pages, fully client-rendered
```

- **Backend** — FastAPI + pandas. All aggregation happens server-side against an
  in-memory pandas store loaded at startup, so filters are always correct across
  every dimension. Runs on **`http://localhost:8000`**; interactive API docs at
  `http://localhost:8000/docs`.
- **Frontend** — React 19, React Router, Recharts, Tailwind v4, built with Vite.
  Fetches live from the backend (`src/api/client.js`); there is no mock/offline
  mode. Runs on **`http://localhost:5173`**.
- **Data** — 100% synthetic (fixed seed = 42, no real PHI). Data window
  2025-03-01 → 2026-08-31. Committed to the repo so nothing needs regenerating.
  A small, documented set of data-quality defects is injected on purpose so the
  Data Quality dashboard has something real to report. See
  [`data/README.md`](data/README.md) for the full data dictionary.

---

## Prerequisites

- **Python 3.12+**
- **Node.js 20+** and npm
- Windows, macOS, or Linux. Commands below show Windows (PowerShell) first, with
  the macOS/Linux form underneath.

---

## Setup

Clone the repo, then set up the two halves.

### 1. Backend

From the repo root:

```powershell
# Windows (PowerShell)
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt -r backend\requirements.txt
```

```bash
# macOS / Linux
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt -r backend/requirements.txt
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env      # Windows: copy .env.example .env
```

`.env` just needs the backend URL (the default already matches a local backend):

```
VITE_API_BASE_URL=http://localhost:8000
```

---

## Running the dashboard

You need **two terminals** — one for the backend, one for the frontend.

### Terminal 1 — backend (start this first)

From the repo root:

```powershell
# Windows
.venv\Scripts\python -m uvicorn backend.main:app --port 8000
```

```bash
# macOS / Linux
.venv/bin/python -m uvicorn backend.main:app --port 8000
```

Wait for `Application startup complete`. Verify it's up:

```bash
curl http://localhost:8000/api/health      # -> {"status":"ok"}
```

> Add `--reload` for auto-restart on code changes. On Windows the file watcher
> can be unreliable — if reload hangs, run without it and restart manually.

### Terminal 2 — frontend

```bash
cd frontend
npm run dev
```

Open **http://localhost:5173**. The backend must be running or every page shows
"Could not reach the backend…".

---

## Common tasks

| Task | Command (from `frontend/`) |
|---|---|
| Dev server | `npm run dev` |
| Lint | `npm run lint` |
| Production build | `npm run build` (output in `frontend/dist/`) |
| Preview the production build | `npm run preview` |

| Task | Command (from repo root) |
|---|---|
| Regenerate the synthetic data | `.venv\Scripts\python data\generate_data.py` |
| Validate the dataset | `.venv\Scripts\python data\validate_data.py` |
| Browse the API | open `http://localhost:8000/docs` |

---

## API surface

All endpoints are under `/api`, filterable with `start_date`, `end_date`,
`region`, `office_id`, `subspecialty` (the list filters take a comma-separated
value). A few of the main ones:

```
GET /api/health
GET /api/filters/options
GET /api/overview/summary        GET /api/overview/by-office        GET /api/overview/volume-heatmap
GET /api/access/summary          GET /api/access/wait-heatmap       GET /api/access/trend
GET /api/productivity/summary    GET /api/productivity/by-provider  GET /api/productivity/workload-heatmap
GET /api/ancillary/summary       GET /api/ancillary/by-office       GET /api/ancillary/onsite-comparison
GET /api/data-quality/overview
```

See `http://localhost:8000/docs` for the complete list and response schemas.

---

## Notes

- The dataset is **synthetic** — invented names, invented towns, no real patients
  or practices.
- Data-quality defects in the dataset are **intentional** and ground-truthed in
  [`data/data_quality_injected.md`](data/data_quality_injected.md).
- `.env`, `.venv/`, `node_modules/`, and `frontend/dist/` are git-ignored; the
  CSV dataset is committed on purpose (it's the database for this project).
