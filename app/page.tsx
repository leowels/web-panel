'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useAuthHydrated } from '@/store/useAuthHydrated'

export default function Home() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const hydrated = useAuthHydrated()

  useEffect(() => {
    if (!hydrated) return
    if (isAuthenticated) {
      router.push('/dashboard')
    } else {
      router.push('/login')
    }
  }, [hydrated, isAuthenticated, router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>
  )
}

