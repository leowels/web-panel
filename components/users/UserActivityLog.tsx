'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { format } from 'date-fns'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Activity {
  id: number
  action_type: string
  entity_type: string | null
  entity_id: number | null
  description: string | null
  ip_address: string | null
  created_at: string
}

interface UserActivityLogProps {
  userId: number
  onClose: () => void
}

export default function UserActivityLog({ userId, onClose }: UserActivityLogProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState<string>('')

  useEffect(() => {
    fetchActivities()
  }, [actionFilter])

  const fetchActivities = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (actionFilter) params.append('action_type', actionFilter)
      
      const response = await axios.get(`${API_URL}/api/users/${userId}/activity?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setActivities(response.data)
    } catch (error: any) {
      addNotification('Ошибка загрузки активности', 'error')
    } finally {
      setLoading(false)
    }
  }

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'login':
        return 'bg-green-100 text-green-800'
      case 'logout':
        return 'bg-gray-100 text-gray-800'
      case 'create':
        return 'bg-blue-100 text-blue-800'
      case 'update':
        return 'bg-yellow-100 text-yellow-800'
      case 'delete':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const actionTypes = ['login', 'logout', 'create', 'update', 'delete']

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-2xl font-semibold text-gray-900">Лог активности пользователя</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 border-b border-gray-200">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Все действия</option>
            {actionTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => (
                <div key={activity.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getActionColor(activity.action_type)}`}>
                          {activity.action_type}
                        </span>
                        {activity.entity_type && (
                          <span className="text-sm text-gray-500">
                            {activity.entity_type} #{activity.entity_id}
                          </span>
                        )}
                      </div>
                      {activity.description && (
                        <p className="text-sm text-gray-700 mb-2">{activity.description}</p>
                      )}
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span>{format(new Date(activity.created_at), 'dd.MM.yyyy HH:mm:ss')}</span>
                        {activity.ip_address && <span>IP: {activity.ip_address}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {activities.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  Активность не найдена
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

