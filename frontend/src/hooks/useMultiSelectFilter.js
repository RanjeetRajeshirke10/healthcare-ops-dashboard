import { useEffect, useState } from 'react'

/**
 * Manages one multi-select filter dimension (region / office / subspecialty).
 * Starts unset until `optionValues` loads, then defaults to "all checked" —
 * per the user's requirement, everything is checked by default.
 *
 * `effective` is what to actually send to the API: undefined when every
 * option (or none) is checked, since both mean "no restriction" — sending
 * literally zero values would filter the dashboard down to nothing, which
 * reads as broken rather than as a real filter state.
 */
export function useMultiSelectFilter(optionValues) {
  const [checked, setChecked] = useState(null)

  useEffect(() => {
    if (optionValues.length > 0 && checked === null) {
      setChecked(optionValues)
    }
  }, [optionValues, checked])

  const resolvedChecked = checked ?? optionValues
  const isRestricted = resolvedChecked.length > 0 && resolvedChecked.length < optionValues.length
  const effective = isRestricted ? resolvedChecked : undefined

  return { checked: resolvedChecked, setChecked, effective, isRestricted }
}
