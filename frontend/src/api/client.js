/**
 * Fetch wrapper for the Healthcare Ops backend.
 *
 * Every page runs against the live FastAPI backend: it already filters
 * correctly across every dimension (tested in Phase 2), which is what makes
 * "click a region / check a box and see the numbers actually change"
 * genuinely true rather than faked client-side aggregation. The backend
 * base URL comes from VITE_API_BASE_URL (see .env.example).
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

// If the backend is down, a refused localhost connection can hang for ~10s
// before the OS gives up, leaving the page stuck on its loading state. Cap
// each request so the UI falls through to its error state promptly instead.
const REQUEST_TIMEOUT_MS = 8000

/**
 * @param {string} path - e.g. '/api/overview/summary'
 * @param {Record<string, string | string[] | undefined>} [params] - query
 *   params; an array value is joined as a comma-separated list (the
 *   backend's multi-select filter format).
 */
export async function apiGet(path, params = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    const serialized = Array.isArray(value) ? value.join(',') : value
    if (serialized !== '') query.set(key, serialized)
  }
  const qs = query.toString()
  const url = `${API_BASE_URL}${path}${qs ? `?${qs}` : ''}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res
  try {
    res = await fetch(url, { signal: controller.signal })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request to ${path} timed out after ${REQUEST_TIMEOUT_MS / 1000}s — is the backend running?`)
    }
    throw new Error(`Could not reach the backend at ${API_BASE_URL} — is it running?`)
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    throw new Error(`Request to ${path} failed: ${res.status} ${res.statusText}`)
  }
  return res.json()
}
