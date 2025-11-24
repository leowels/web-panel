'use client'

import { useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface EquipmentBulkDatesProps {
  selectedIds: number[]
  onClose: () => void
  onSuccess: () => void
}

export default function EquipmentBulkDates({ selectedIds, onClose, onSuccess }: EquipmentBulkDatesProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [loading, setLoading] = useState(false)
  const [dates, setDates] = useState({
    pto_date: '',
    cto_date: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      addNotification('Ошибка авторизации', 'error')
      return
    }

    if (!dates.pto_date && !dates.cto_date) {
      addNotification('Укажите хотя бы одну дату (ПТО или ЧТО)', 'error')
      return
    }

    setLoading(true)
    try {
      const payload: any = {
        equipment_ids: selectedIds,
      }
      if (dates.pto_date) {
        payload.pto_date = new Date(dates.pto_date).toISOString()
      }
      if (dates.cto_date) {
        payload.cto_date = new Date(dates.cto_date).toISOString()
      }

      const response = await axios.put(
        `${API_URL}/api/equipment/bulk/dates`,
        payload,
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
        addNotification(`Успешно обновлено ${updated} записей`, 'success')
      }
      onSuccess()
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка массового обновления дат', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-strong max-w-lg w-full border border-gray-200">
        <div className="p-6 border-b border-gray-300 bg-gradient-to-r from-gray-50 to-white flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Массовое назначение дат</h2>
            <p className="text-sm text-gray-500 mt-1">Выбрано записей: {selectedIds.length}</p>
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
              <strong>Внимание:</strong> Укажите даты ПТО и/или ЧТО. Оставьте поле пустым, если не хотите его изменять.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Дата ПТО (Периодическое техническое обслуживание)
              </label>
              <input
                type="date"
                value={dates.pto_date}
                onChange={(e) => setDates({ ...dates, pto_date: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Дата ЧТО (Частичное техническое обслуживание)
              </label>
              <input
                type="date"
                value={dates.cto_date}
                onChange={(e) => setDates({ ...dates, cto_date: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium"
              />
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
              disabled={loading || (!dates.pto_date && !dates.cto_date)}
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
                `Назначить даты для ${selectedIds.length} записей`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

