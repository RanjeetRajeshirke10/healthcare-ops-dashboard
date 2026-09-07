import { useEffect, useState } from 'react'
import { apiGet } from '../api/client'

/**
 * Fetches one or more endpoints for a page and tracks loading/error state
 * together, so every page gets the same loading/error handling contract
 * (Phase 3 spec: "Handle loading and error states for every data-dependent
 * section"). Re-fetches whenever `filters` changes.
 *
 * @param {Record<string, string>} endpoints - resultKey -> API path
 * @param {object} filters - passed as query params on real requests
 */
export function useDashboardData(endpoints, filters) {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)

  const endpointsKey = JSON.stringify(endpoints)
  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setError(null)

    const entries = Object.entries(JSON.parse(endpointsKey))
    Promise.all(entries.map(([, path]) => apiGet(path, JSON.parse(filtersKey))))
      .then((results) => {
        if (cancelled) return
        const next = {}
        entries.forEach(([key], i) => {
          next[key] = results[i]
        })
        setData(next)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err)
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [endpointsKey, filtersKey])

  return { data, status, error }
}
