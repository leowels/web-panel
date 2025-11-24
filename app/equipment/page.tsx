'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import EquipmentTable from '@/components/equipment/EquipmentTable'
import EquipmentForm from '@/components/equipment/EquipmentForm'
import EquipmentCard from '@/components/equipment/EquipmentCard'
import EquipmentHistory from '@/components/equipment/EquipmentHistory'
import EquipmentBulkForm from '@/components/equipment/EquipmentBulkForm'
import EquipmentCsvUpload from '@/components/equipment/EquipmentCsvUpload'

export default function EquipmentPage() {
  const { isAuthenticated } = useAuthStore()
  const [showForm, setShowForm] = useState(false)
  const [showCsvUpload, setShowCsvUpload] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [selectedEquipment, setSelectedEquipment] = useState<number | null>(null)
  const [showHistory, setShowHistory] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const triggerRefresh = () => setRefreshKey((prev) => prev + 1)

  if (!isAuthenticated) {
    return null
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Справочник оборудования</h1>
            <p className="text-gray-600 mt-2 font-medium">Управление подъемными сооружениями (ПС)</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowCsvUpload(true)}
              className="inline-flex items-center px-4 py-2 border border-blue-200 text-sm font-semibold rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 shadow-soft transition-all duration-200"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 7h18M3 12h18M3 17h18" />
              </svg>
              Импорт CSV
            </button>
            <button
              onClick={() => setShowBulk(true)}
              className="inline-flex items-center px-4 py-2 border border-primary-200 text-sm font-semibold rounded-lg text-primary-700 bg-primary-50 hover:bg-primary-100 shadow-soft transition-all duration-200"
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
              className="inline-flex items-center px-5 py-2.5 border border-transparent text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 shadow-soft hover:shadow-medium transition-all duration-200"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Добавить оборудование
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`${selectedEquipment ? 'hidden lg:block' : ''} lg:col-span-2`}>
            <EquipmentTable
              onEdit={(id) => {
                setSelectedEquipment(id)
                setShowForm(true)
              }}
              onView={(id) => setSelectedEquipment(id)}
              onViewHistory={(id) => setShowHistory(id)}
              refreshKey={refreshKey}
            />
          </div>

          <div className={`${selectedEquipment ? 'lg:col-span-1' : 'hidden'} lg:col-span-1`}>
            {selectedEquipment && (
              <EquipmentCard
                equipmentId={selectedEquipment}
                onClose={() => setSelectedEquipment(null)}
                onEdit={() => {
                  setShowForm(true)
                }}
              />
            )}
          </div>
        </div>

        {showForm && (
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

        {showBulk && (
          <EquipmentBulkForm
            onClose={() => setShowBulk(false)}
            onSuccess={() => {
              setShowBulk(false)
              triggerRefresh()
            }}
          />
        )}

        {showCsvUpload && (
          <EquipmentCsvUpload
            onClose={() => setShowCsvUpload(false)}
            onSuccess={() => {
              setShowCsvUpload(false)
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
        </div>
      </div>
    </Layout>
  )
}

