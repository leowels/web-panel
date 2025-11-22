'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import UsersTable from '@/components/users/UsersTable'
import UserForm from '@/components/users/UserForm'
import UserActivityLog from '@/components/users/UserActivityLog'

export default function UsersPage() {
  const { isAuthenticated } = useAuthStore()
  const [showForm, setShowForm] = useState(false)
  const [selectedUser, setSelectedUser] = useState<number | null>(null)
  const [showActivity, setShowActivity] = useState<number | null>(null)

  if (!isAuthenticated) {
    return null
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Управление пользователями</h1>
            <p className="text-gray-600 mt-1">CRUD пользователей, роли, активность</p>
          </div>
          <button
            onClick={() => {
              setSelectedUser(null)
              setShowForm(true)
            }}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Создать пользователя
          </button>
        </div>

        <UsersTable
          onEdit={(userId) => {
            setSelectedUser(userId)
            setShowForm(true)
          }}
          onViewActivity={(userId) => setShowActivity(userId)}
        />

        {showForm && (
          <UserForm
            userId={selectedUser}
            onClose={() => {
              setShowForm(false)
              setSelectedUser(null)
            }}
            onSuccess={() => {
              setShowForm(false)
              setSelectedUser(null)
            }}
          />
        )}

        {showActivity && (
          <UserActivityLog
            userId={showActivity}
            onClose={() => setShowActivity(null)}
          />
        )}
        </div>
      </div>
    </Layout>
  )
}

