'use client'

import { useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface ViolationsBulkStatusProps {
  selectedIds: number[]
  onClose: () => void
  onSuccess: () => void
}

export default function ViolationsBulkStatus({ selectedIds, onClose, onSuccess }: ViolationsBulkStatusProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'open' | 'resolved'>('resolved')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      addNotification('Ошибка авторизации', 'error')
      return
    }

    setLoading(true)
    try {
      const response = await axios.put(
        `${API_URL}/api/violations/bulk/status`,
        {
          violation_ids: selectedIds,
          status: status,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      const { updated, errors } = response.data
      if (errors && errors.length > 0) {
        addNotification(`Обновлено: ${updated}, ошибок: ${errors.length}`, 'warning')
        errors.forEach((err: any) => {
          console.warn('Ошибка обновления:', err)
        })
      } else {
        addNotification(`Успешно обновлено ${updated} нарушений`, 'success')
      }
      onSuccess()
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка массового обновления статусов', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-strong max-w-lg w-full border border-gray-200">
        <div className="p-6 border-b border-gray-300 bg-gradient-to-r from-gray-50 to-white flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Массовое изменение статусов</h2>
            <p className="text-sm text-gray-500 mt-1">Выбрано нарушений: {selectedIds.length}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-2 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Внимание:</strong> Выбранный статус будет применен ко всем выбранным нарушениям.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Новый статус
            </label>
            <div className="space-y-3">
              <label className="flex items-center p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="status"
                  value="open"
                  checked={status === 'open'}
                  onChange={(e) => setStatus(e.target.value as 'open' | 'resolved')}
                  className="w-5 h-5 text-primary-600 focus:ring-primary-500"
                />
                <div className="ml-3">
                  <div className="flex items-center">
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                      Открыто
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">Нарушение требует устранения</p>
                </div>
              </label>

              <label className="flex items-center p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="status"
                  value="resolved"
                  checked={status === 'resolved'}
                  onChange={(e) => setStatus(e.target.value as 'open' | 'resolved')}
                  className="w-5 h-5 text-primary-600 focus:ring-primary-500"
                />
                <div className="ml-3">
                  <div className="flex items-center">
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                      Устранено
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">Нарушение устранено (будет проставлена дата устранения)</p>
                </div>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold transition-all"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 border border-transparent text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 rounded-lg font-semibold shadow-soft hover:shadow-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Обновление...
                </span>
              ) : (
                `Изменить статус для ${selectedIds.length} нарушений`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

