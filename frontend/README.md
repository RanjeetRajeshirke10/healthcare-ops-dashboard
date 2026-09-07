# Frontend — Healthcare Operations Analytics Dashboard

Vite + React 19 + React Router + Recharts + Tailwind v4. Single-page app with the
five dashboard pages. All data is fetched live from the FastAPI backend — there
is no mock/offline mode.

See the [root README](../README.md) for full setup and the two-terminal run
instructions. Quick version:

```bash
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm run dev                    # http://localhost:5173 (backend must be on :8000)
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run lint` | oxlint |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |

## Layout

```
src/
  api/client.js         fetch wrapper (live backend only, 8s timeout)
  hooks/                useDashboardData (multi-endpoint fetch + loading/error),
                        useFilterOptions, useMultiSelectFilter
  components/           charts (Bar/Line/Area/Scatter/Donut/Heat/Meter),
                        DataTable, FilterBar, KpiStrip, AttentionPanel, layout
  pages/                OverviewPage, PatientAccessPage, ProviderProductivityPage,
                        AncillaryServicesPage, DataQualityPage
  theme/                brand.js (UI accent) + chartColors.js (CVD-safe data palette)
  utils/                formatting + rule-based "Ask Anything" logic
```

## Config

`.env` (git-ignored) — only one variable:

```
VITE_API_BASE_URL=http://localhost:8000
```
