'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface ChecklistItem {
  id: number
  item_type: string
  label: string
  description?: string
  is_required: boolean
  order: number
}

interface Checklist {
  id: number
  name: string
  description: string | null
  equipment_type: string | null
  version: number
  is_active: boolean
  items: ChecklistItem[]
}

interface ChecklistFormProps {
  checklistId: number
  onClose: () => void
}

export default function ChecklistForm({ checklistId, onClose }: ChecklistFormProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchChecklist()
  }, [checklistId])

  const fetchChecklist = async () => {
    setLoading(true)
    try {
      const response = await axios.get(`${API_URL}/api/checklists/${checklistId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setChecklist(response.data)
    } catch (error: any) {
      addNotification('Ошибка загрузки чек-листа', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      </div>
    )
  }

  if (!checklist) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-2xl font-semibold text-gray-900">{checklist.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {checklist.description && (
            <div>
              <label className="text-sm font-medium text-gray-500">Описание</label>
              <p className="text-gray-900">{checklist.description}</p>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-gray-500">Тип ПС</label>
            <p className="text-gray-900">{checklist.equipment_type || 'Все типы'}</p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-500">Версия</label>
            <p className="text-gray-900">v{checklist.version}</p>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Элементы чек-листа</h3>
            <div className="space-y-3">
              {checklist.items.map((item, index) => (
                <div key={item.id} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs bg-gray-200 px-2 py-1 rounded">
                          {item.item_type}
                        </span>
                        <span className="font-medium">{item.label}</span>
                        {item.is_required && (
                          <span className="text-xs text-red-600">*</span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">#{index + 1}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

