'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import KnowledgeBase from '@/components/knowledge/KnowledgeBase'

export default function KnowledgePage() {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return null
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">База знаний</h1>
          <p className="text-gray-600 mt-1">ФНП 461, ГОСТы, методические материалы</p>
        </div>
        <KnowledgeBase />
        </div>
      </div>
    </Layout>
  )
}

