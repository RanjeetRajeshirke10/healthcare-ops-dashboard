/**
 * Fetch wrapper for the Healthcare Ops backend. Toggles between the real
 * FastAPI backend and the captured mock fixtures in ./mockData via
 * VITE_USE_MOCK (see .env.example).
 *
 * As of the interactive-filtering pass (2026-09-06), Overview runs against
 * the LIVE backend (VITE_USE_MOCK=false) rather than a static snapshot —
 * the backend already filters correctly (tested extensively in Phase 2), so
 * wiring to it directly is what makes "click a region / check a box and see
 * the numbers actually change" genuinely true, rather than faked client-side
 * aggregation that would only work for one dimension. The mock fixtures stay
 * available as a fallback (e.g. for offline demoing) — flip VITE_USE_MOCK
 * back to true to use them.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

const MOCK_FIXTURES = {
  '/api/filters/options': () => import('./mockData/filtersOptions.json'),
  '/api/overview/summary': () => import('./mockData/overviewSummary.json'),
  '/api/overview/by-office': () => import('./mockData/overviewByOffice.json'),
  '/api/access/no-show-rate': () => import('./mockData/accessNoShowRate.json'),
  '/api/access/wait-times': () => import('./mockData/accessWaitTimes.json'),
  '/api/access/appointment-volume': () => import('./mockData/accessAppointmentVolume.json'),
  '/api/productivity/visits-per-provider': () => import('./mockData/productivityVisitsPerProvider.json'),
  '/api/productivity/surgical-volume': () => import('./mockData/productivitySurgicalVolume.json'),
  '/api/productivity/utilization': () => import('./mockData/productivityUtilization.json'),
  '/api/ancillary/referral-completion': () => import('./mockData/ancillaryReferralCompletion.json'),
  '/api/ancillary/volume': () => import('./mockData/ancillaryVolume.json'),
  '/api/ancillary/leakage': () => import('./mockData/ancillaryLeakage.json'),
  '/api/data-quality/summary': () => import('./mockData/dataQualitySummary.json'),
  '/api/data-quality/duplicates': () => import('./mockData/dataQualityDuplicates.json'),
}

/**
 * @param {string} path - e.g. '/api/overview/summary'
 * @param {Record<string, string | string[] | undefined>} [params] - query
 *   params; an array value is joined as a comma-separated list (the
 *   backend's multi-select filter format).
 */
export async function apiGet(path, params = {}) {
  if (USE_MOCK) {
    const loader = MOCK_FIXTURES[path]
    if (!loader) {
      throw new Error(`No mock fixture registered for ${path}`)
    }
    const module = await loader()
    return module.default
  }

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    const serialized = Array.isArray(value) ? value.join(',') : value
    if (serialized !== '') query.set(key, serialized)
  }
  const qs = query.toString()
  const res = await fetch(`${API_BASE_URL}${path}${qs ? `?${qs}` : ''}`)
  if (!res.ok) {
    throw new Error(`Request to ${path} failed: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

export const isMockMode = USE_MOCK
