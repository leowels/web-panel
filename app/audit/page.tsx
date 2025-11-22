'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import AuditLogTable from '@/components/audit/AuditLogTable'

export default function AuditPage() {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return null
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Журнал аудита</h1>
          <p className="text-gray-600 mt-1">Лог всех действий в системе</p>
        </div>
        <AuditLogTable />
        </div>
      </div>
    </Layout>
  )
}

