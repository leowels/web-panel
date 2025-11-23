'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { format } from 'date-fns'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface HistoryItem {
  id: number
  field_name: string
  old_value: string | null
  new_value: string | null
  changed_by: number | null
  created_at: string
}

interface EquipmentHistoryProps {
  equipmentId: number
  onClose: () => void
}

export default function EquipmentHistory({ equipmentId, onClose }: EquipmentHistoryProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchHistory()
  }, [equipmentId])

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const response = await axios.get(`${API_URL}/api/equipment/${equipmentId}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setHistory(response.data)
    } catch (error: any) {
      addNotification('Ошибка загрузки истории', 'error')
    } finally {
      setLoading(false)
    }
  }

  const getFieldName = (fieldName: string) => {
    const names: Record<string, string> = {
      equipment_type: 'Тип ПС',
      passport_number: 'Номер паспорта',
      load_capacity: 'Грузоподъемность',
      manufacturer: 'Завод-изготовитель',
      installation_date: 'Дата ввода',
      pto_date: 'Дата ПТО',
      cto_date: 'Дата ЧТО',
      installation_location: 'Место установки',
      status: 'Статус',
    }
    return names[fieldName] || fieldName
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-2xl font-semibold text-gray-900">История изменений</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((item) => (
                <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="text-sm font-medium text-gray-900">
                          {getFieldName(item.field_name)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Было:</span>
                          <p className="text-gray-900">{item.old_value || '-'}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Стало:</span>
                          <p className="text-gray-900">{item.new_value || '-'}</p>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        {format(new Date(item.created_at), 'dd.MM.yyyy HH:mm:ss')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {history.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  История изменений отсутствует
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

