'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import PageHeader from '@/components/ui/PageHeader'
import TasksTable from '@/components/tasks/TasksTable'

function TasksPageContent() {
  const { isAuthenticated } = useAuthStore()
  const searchParams = useSearchParams()
  const [equipmentFilterId, setEquipmentFilterId] = useState<number | null>(null)

  useEffect(() => {
    const eqIdRaw = searchParams.get('equipment_id')
    const eqId = eqIdRaw ? Number(eqIdRaw) : null
    setEquipmentFilterId(eqId && !Number.isNaN(eqId) ? eqId : null)
  }, [searchParams])

  if (!isAuthenticated) {
    return null
  }

  return (
    <Layout fullWidth>
      <div className="space-y-6">
        <PageHeader
          title="Задачи"
          subtitle="Контроль задач по устранению нарушений"
        />
        <TasksTable equipmentFilterId={equipmentFilterId} />
      </div>
    </Layout>
  )
}

export default function TasksPage() {
  return (
    <Suspense fallback={null}>
      <TasksPageContent />
    </Suspense>
  )
}
