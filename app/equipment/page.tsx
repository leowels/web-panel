'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import PageHeader from '@/components/ui/PageHeader'
import EquipmentTable from '@/components/equipment/EquipmentTable'
import EquipmentForm from '@/components/equipment/EquipmentForm'
import EquipmentCard from '@/components/equipment/EquipmentCard'
import EquipmentHistory from '@/components/equipment/EquipmentHistory'
import EquipmentBulkForm from '@/components/equipment/EquipmentBulkForm'
import EquipmentCsvUpload from '@/components/equipment/EquipmentCsvUpload'
import EquipmentOcrImport from '@/components/equipment/EquipmentOcrImport'
import EquipmentRelationsModal, { type EquipmentRelationTab } from '@/components/equipment/EquipmentRelationsModal'
import { canMutateData } from '@/utils/roles'

function EquipmentPageContent() {
  const { isAuthenticated, user } = useAuthStore()
  const searchParams = useSearchParams()
  const canMutate = canMutateData(user)
  const [showForm, setShowForm] = useState(false)
  const [showCsvUpload, setShowCsvUpload] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [showOcrImport, setShowOcrImport] = useState(false)
  const [selectedEquipment, setSelectedEquipment] = useState<number | null>(null)
  const [showHistory, setShowHistory] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [initialTaskEquipmentId, setInitialTaskEquipmentId] = useState<number | null>(null)
  const [relationsModal, setRelationsModal] = useState<{ equipmentId: number; tab: EquipmentRelationTab } | null>(null)

  useEffect(() => {
    const eqIdRaw = searchParams.get('task_equipment_id')
    const eqId = eqIdRaw ? Number(eqIdRaw) : null
    if (eqId && !Number.isNaN(eqId)) {
      setInitialTaskEquipmentId(eqId)
    }
  }, [searchParams])

  const triggerRefresh = () => setRefreshKey((prev) => prev + 1)

  if (!isAuthenticated) {
    return null
  }

  return (
    <Layout fullWidth>
      <div className="space-y-6">
        <PageHeader
          title="Справочник оборудования"
          subtitle="Управление подъемными сооружениями (ПС)"
          actions={canMutate ? (
            <>
              <button
                onClick={() => setShowCsvUpload(true)}
                className="inline-flex items-center justify-center px-4 py-2 border border-blue-200 text-sm font-semibold rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 shadow-soft transition-all duration-200 w-full sm:w-auto"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 7h18M3 12h18M3 17h18" />
                </svg>
                Импорт CSV
              </button>
              <button
                onClick={() => setShowOcrImport(true)}
                className="inline-flex items-center justify-center px-4 py-2 border border-purple-200 text-sm font-semibold rounded-lg text-purple-700 bg-purple-50 hover:bg-purple-100 shadow-soft transition-all duration-200 w-full sm:w-auto"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5h18M8 5v14m8-14v14M5 9h14M5 13h14M5 17h6" />
                </svg>
                Импорт с фото
              </button>
              <button
                onClick={() => setShowBulk(true)}
                className="inline-flex items-center justify-center px-4 py-2 border border-primary-200 text-sm font-semibold rounded-lg text-primary-700 bg-primary-50 hover:bg-primary-100 shadow-soft transition-all duration-200 w-full sm:w-auto"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 7h18M3 12h18M3 17h18" />
                </svg>
                Массовое добавление
              </button>
              <button
                onClick={() => {
                  setSelectedEquipment(null)
                  setShowForm(true)
                }}
                className="inline-flex items-center justify-center px-5 py-2.5 border border-transparent text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 shadow-soft hover:shadow-medium transition-all duration-200 w-full sm:w-auto"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Добавить оборудование
              </button>
            </>
          ) : undefined}
        />

        <div className={`grid grid-cols-1 gap-6 ${selectedEquipment ? 'lg:grid-cols-3' : ''}`}>
          <div className={selectedEquipment ? 'lg:col-span-2' : ''}>
            <EquipmentTable
              onEdit={(id) => {
                if (!canMutate) return
                setSelectedEquipment(id)
                setShowForm(true)
              }}
              onView={(id) => setSelectedEquipment(id)}
              onViewHistory={(id) => setShowHistory(id)}
              refreshKey={refreshKey}
              initialTaskEquipmentId={initialTaskEquipmentId}
            />
          </div>

          <div className={selectedEquipment ? 'lg:col-span-1 hidden lg:block' : 'hidden'}>
            {selectedEquipment && (
              <EquipmentCard
                equipmentId={selectedEquipment}
                onClose={() => setSelectedEquipment(null)}
                onEdit={() => {
                  if (!canMutate) return
                  setShowForm(true)
                }}
                onOpenRelations={(tab, equipmentId) => setRelationsModal({ tab, equipmentId })}
              />
            )}
          </div>
        </div>

        {selectedEquipment && (
          <div className="mt-6 lg:hidden">
            <EquipmentCard
              equipmentId={selectedEquipment}
              onClose={() => setSelectedEquipment(null)}
              onEdit={() => {
                if (!canMutate) return
                setShowForm(true)
              }}
              onOpenRelations={(tab, equipmentId) => setRelationsModal({ tab, equipmentId })}
            />
          </div>
        )}

        {showForm && canMutate && (
          <EquipmentForm
            equipmentId={selectedEquipment}
            onClose={() => {
              setShowForm(false)
              setSelectedEquipment(null)
            }}
            onSuccess={() => {
              setShowForm(false)
              setSelectedEquipment(null)
              triggerRefresh()
            }}
          />
        )}

        {showBulk && canMutate && (
          <EquipmentBulkForm
            onClose={() => setShowBulk(false)}
            onSuccess={() => {
              setShowBulk(false)
              triggerRefresh()
            }}
          />
        )}

        {showCsvUpload && canMutate && (
          <EquipmentCsvUpload
            onClose={() => setShowCsvUpload(false)}
            onSuccess={() => {
              setShowCsvUpload(false)
              triggerRefresh()
            }}
          />
        )}

        {showOcrImport && canMutate && (
          <EquipmentOcrImport
            onClose={() => setShowOcrImport(false)}
            onSuccess={() => {
              setShowOcrImport(false)
              triggerRefresh()
            }}
          />
        )}

        {showHistory && (
          <EquipmentHistory
            equipmentId={showHistory}
            onClose={() => setShowHistory(null)}
          />
        )}

        {relationsModal && (
          <EquipmentRelationsModal
            equipmentId={relationsModal.equipmentId}
            initialTab={relationsModal.tab}
            onClose={() => setRelationsModal(null)}
          />
        )}
      </div>
    </Layout>
  )
}

export default function EquipmentPage() {
  return (
    <Suspense fallback={null}>
      <EquipmentPageContent />
    </Suspense>
  )
}
