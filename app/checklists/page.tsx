'use client'

import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import ChecklistsTable from '@/components/checklists/ChecklistsTable'
import ChecklistForm from '@/components/checklists/ChecklistForm'
import ChecklistConstructor from '@/components/checklists/ChecklistConstructor'

export default function ChecklistsPage() {
  const { isAuthenticated } = useAuthStore()
  const [showForm, setShowForm] = useState(false)
  const [showConstructor, setShowConstructor] = useState(false)
  const [selectedChecklist, setSelectedChecklist] = useState<number | null>(null)

  if (!isAuthenticated) {
    return null
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Чек-листы</h1>
              <p className="text-gray-600 mt-1">Конструктор шаблонов чек-листов</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <button
                onClick={() => {
                  setSelectedChecklist(null)
                  setShowConstructor(true)
                }}
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 w-full sm:w-auto"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Создать шаблон
              </button>
            </div>
          </div>

        <ChecklistsTable
          onEdit={(id) => {
            setSelectedChecklist(id)
            setShowConstructor(true)
          }}
          onView={(id) => {
            setSelectedChecklist(id)
            setShowForm(true)
          }}
        />

        {showConstructor && (
          <ChecklistConstructor
            checklistId={selectedChecklist}
            onClose={() => {
              setShowConstructor(false)
              setSelectedChecklist(null)
            }}
            onSuccess={() => {
              setShowConstructor(false)
              setSelectedChecklist(null)
            }}
          />
        )}

        {showForm && selectedChecklist && (
          <ChecklistForm
            checklistId={selectedChecklist}
            onClose={() => {
              setShowForm(false)
              setSelectedChecklist(null)
            }}
          />
        )}
        </div>
      </div>
    </Layout>
  )
}

