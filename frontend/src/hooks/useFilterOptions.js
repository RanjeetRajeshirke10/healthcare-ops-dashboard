import { useEffect, useState } from 'react'
import { apiGet } from '../api/client'

const EMPTY = { offices: [], regions: [], subspecialties: [] }

/** Populates the FilterBar's dropdowns from /api/filters/options. */
export function useFilterOptions() {
  const [options, setOptions] = useState(EMPTY)

  useEffect(() => {
    let cancelled = false
    apiGet('/api/filters/options').then((result) => {
      if (!cancelled) setOptions(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return options
}
