'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import InspectionsTable from '@/components/inspections/InspectionsTable'
import InspectionWizard from '@/components/inspections/InspectionWizard'

export default function InspectionsPage() {
  const { isAuthenticated } = useAuthStore()
  const [showWizard, setShowWizard] = useState(false)
  const [selectedInspection, setSelectedInspection] = useState<number | null>(null)

  if (!isAuthenticated) {
    return null
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Осмотры</h1>
            <p className="text-gray-600 mt-1">Проведение осмотров оборудования</p>
          </div>
          <button
            onClick={() => {
              setSelectedInspection(null)
              setShowWizard(true)
            }}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Начать осмотр
          </button>
        </div>

        <InspectionsTable
          onView={(id) => {
            setSelectedInspection(id)
            setShowWizard(true)
          }}
        />

        {showWizard && (
          <InspectionWizard
            inspectionId={selectedInspection}
            onClose={() => {
              setShowWizard(false)
              setSelectedInspection(null)
            }}
            onSuccess={() => {
              setShowWizard(false)
              setSelectedInspection(null)
            }}
          />
        )}
        </div>
      </div>
    </Layout>
  )
}

