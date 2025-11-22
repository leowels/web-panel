'use client'

import { ReactNode, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import MobileMenu from '@/components/MobileMenu'
import AIPanel from '@/components/AIPanel'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { user } = useAuthStore()
  const [showAIPanel, setShowAIPanel] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} onAIClick={() => setShowAIPanel(true)} />
      <div className="flex">
        <Sidebar />
        <main className="flex-1">
          {children}
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

