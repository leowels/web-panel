'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import MobileMenu from '@/components/MobileMenu'
import AIPanel from '@/components/AIPanel'

interface LayoutProps {
  children: ReactNode
  fullWidth?: boolean
}

export default function Layout({ children, fullWidth = false }: LayoutProps) {
  const { user, isAuthenticated, fetchUser } = useAuthStore()
  const [showAIPanel, setShowAIPanel] = useState(false)
  const containerClass = fullWidth ? 'max-w-none' : 'max-w-7xl'

  useEffect(() => {
    if (isAuthenticated && !user) {
      fetchUser()
    }
  }, [isAuthenticated, user, fetchUser])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header user={user} onAIClick={() => setShowAIPanel(true)} />
      <div className="flex flex-1 flex-col lg:flex-row">
        <Sidebar />
        <main className="flex-1 w-full">
          <div className={`w-full ${containerClass} mx-auto px-4 sm:px-6 lg:px-8 py-4 pb-24 lg:py-8 lg:pb-12`}>
            {children}
          </div>
        </main>
      </div>
      <MobileMenu />
      {showAIPanel && (
        <AIPanel 
          onClose={() => setShowAIPanel(false)} 
        />
      )}
    </div>
  )
}

