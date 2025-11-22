'use client'

import { ReactNode } from 'react'
import NotificationContainer from '@/components/NotificationContainer'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <NotificationContainer />
    </>
  )
}
