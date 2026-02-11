'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import PageHeader from '@/components/ui/PageHeader'
import ActsTable from '@/components/acts/ActsTable'
import ActForm from '@/components/acts/ActForm'
import { canMutateData } from '@/utils/roles'

function ActsPageContent() {
  const { isAuthenticated, user } = useAuthStore()
  const searchParams = useSearchParams()
  const canMutate = canMutateData(user)
  const [showForm, setShowForm] = useState(false)
  const [selectedAct, setSelectedAct] = useState<number | null>(null)
  const [prefillEquipmentId, setPrefillEquipmentId] = useState<number | null>(null)
  const [equipmentFilterId, setEquipmentFilterId] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const createMode = searchParams.get('create') === '1'
    const actIdRaw = searchParams.get('act_id')
    const actId = actIdRaw ? Number(actIdRaw) : null
    if (actId && !Number.isNaN(actId)) {
      setEquipmentFilterId(null)
      setSelectedAct(actId)
      setShowForm(true)
      return
    }

    const eqIdRaw = searchParams.get('equipment_id')
    const eqId = eqIdRaw ? Number(eqIdRaw) : null
    setEquipmentFilterId(eqId && !Number.isNaN(eqId) ? eqId : null)

    if (canMutate && createMode && eqId && !Number.isNaN(eqId)) {
      setPrefillEquipmentId(eqId)
      setSelectedAct(null)
      setShowForm(true)
      return
    }

    setPrefillEquipmentId(null)
    setShowForm(false)
    setSelectedAct(null)
  }, [searchParams, canMutate])

  if (!isAuthenticated) {
    return null
  }

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Акты и предписания"
          subtitle="Управление актами проверок"
          actions={canMutate ? (
            <button
              onClick={() => {
                setSelectedAct(null)
                setShowForm(true)
              }}
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 w-full sm:w-auto"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Создать акт
            </button>
          ) : undefined}
        />

        <ActsTable
          onEdit={(id) => {
            if (!canMutate) return
            setSelectedAct(id)
            setShowForm(true)
          }}
          onView={(id) => {
            setSelectedAct(id)
            setShowForm(true)
          }}
          refreshKey={refreshKey}
          equipmentFilterId={equipmentFilterId}
        />

        {showForm && (
          <ActForm
            actId={selectedAct}
            prefillEquipmentId={prefillEquipmentId}
            onClose={() => {
              setShowForm(false)
              setSelectedAct(null)
            }}
            onSuccess={() => {
              setShowForm(false)
              setSelectedAct(null)
              setRefreshKey((prev) => prev + 1)
            }}
          />
        )}
      </div>
    </Layout>
  )
}

export default function ActsPage() {
  return (
    <Suspense fallback={null}>
      <ActsPageContent />
    </Suspense>
  )
}
