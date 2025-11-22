'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import ViolationsTable from '@/components/violations/ViolationsTable'
import ViolationForm from '@/components/violations/ViolationForm'

export default function ViolationsPage() {
  const { isAuthenticated } = useAuthStore()
  const [showForm, setShowForm] = useState(false)
  const [selectedViolation, setSelectedViolation] = useState<number | null>(null)

  if (!isAuthenticated) {
    return null
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Нарушения</h1>
            <p className="text-gray-600 mt-1">Управление нарушениями</p>
          </div>
          <button
            onClick={() => {
              setSelectedViolation(null)
              setShowForm(true)
            }}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Создать нарушение
          </button>
        </div>

        <ViolationsTable
          onEdit={(id) => {
            setSelectedViolation(id)
            setShowForm(true)
          }}
          onView={(id) => {
            setSelectedViolation(id)
            setShowForm(true)
          }}
        />

        {showForm && (
          <ViolationForm
            violationId={selectedViolation}
            onClose={() => {
              setShowForm(false)
              setSelectedViolation(null)
            }}
            onSuccess={() => {
              setShowForm(false)
              setSelectedViolation(null)
            }}
          />
        )}
        </div>
      </div>
    </Layout>
  )
}

