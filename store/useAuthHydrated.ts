'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from './authStore'

export function useAuthHydrated() {
  const [hydrated, setHydrated] = useState<boolean>(() => {
    const persistApi = (useAuthStore as any).persist
    return persistApi?.hasHydrated?.() ?? true
  })

  useEffect(() => {
    const persistApi = (useAuthStore as any).persist
    if (!persistApi) {
      setHydrated(true)
      return
    }

    if (persistApi.hasHydrated()) {
      setHydrated(true)
      return
    }

    const unsubHydrate = persistApi.onHydrate?.(() => setHydrated(false))
    const unsubFinish = persistApi.onFinishHydration?.(() => setHydrated(true))

    return () => {
      if (typeof unsubHydrate === 'function') unsubHydrate()
      if (typeof unsubFinish === 'function') unsubFinish()
    }
  }, [])

  return hydrated
}

