'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import Layout from '@/components/Layout'
import PageHeader from '@/components/ui/PageHeader'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

const API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || ''
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type AlertType = 'SLA_OVERDUE' | 'SLA_WARNING'

interface AlertItem {
  id: number
  entity_type: string
  entity_id: number
  type: AlertType
  created_at: string
  acknowledged_at: string | null
  violation_id: number | null
  violation_deadline: string | null
  equipment_id: number | null
  equipment_passport: string | null
  equipment_type: string | null
}

export default function AlertsPage() {
  const { isAuthenticated, token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [items, setItems] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [onlyUnack, setOnlyUnack] = useState(true)

  const fetchAlerts = async () => {
    if (!token) return
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (typeFilter) params.set('type', typeFilter)
      if (onlyUnack) params.set('only_unacknowledged', 'true')
      params.set('limit', '300')
      const response = await axios.get(`${API_URL}/api/alerts?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setItems(response.data || [])
    } catch (error: any) {
      const detail = error.response?.data?.error?.message || error.response?.data?.detail || error.message
      addNotification(`Ошибка загрузки alerts: ${detail}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!token) return
    fetchAlerts()
  }, [token, typeFilter, onlyUnack])

  if (!isAuthenticated) return null

  const formatDate = (date?: string | null) => {
    if (!date) return '—'
    return new Date(date).toLocaleString('ru-RU')
  }

  const typeLabel = (type: AlertType) => (type === 'SLA_OVERDUE' ? 'Просрочено' : 'До 24 часов')

  const typeTone = (type: AlertType) =>
    type === 'SLA_OVERDUE' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'

  const ackOne = async (id: number) => {
    if (!token) return
    try {
      await axios.post(`${API_URL}/api/alerts/${id}/ack`, null, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setItems((prev) => prev.filter((item) => item.id !== id))
      addNotification('Уведомление подтверждено', 'success')
    } catch (error: any) {
      const detail = error.response?.data?.error?.message || error.response?.data?.detail || error.message
      addNotification(`Не удалось подтвердить: ${detail}`, 'error')
    }
  }

  const ackAll = async () => {
    if (!token) return
    try {
      const params = new URLSearchParams()
      if (typeFilter) params.set('type', typeFilter)
      await axios.post(`${API_URL}/api/alerts/ack-all?${params.toString()}`, null, {
        headers: { Authorization: `Bearer ${token}` },
      })
      addNotification('Уведомления подтверждены', 'success')
      fetchAlerts()
    } catch (error: any) {
      const detail = error.response?.data?.error?.message || error.response?.data?.detail || error.message
      addNotification(`Не удалось подтвердить все: ${detail}`, 'error')
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="SLA-уведомления"
          subtitle="Контроль просрочек и приближающихся дедлайнов"
          actions={(
            <div className="flex flex-wrap gap-2">
              <button
                onClick={fetchAlerts}
                className="px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50"
              >
                Обновить
              </button>
              <button
                onClick={ackAll}
                className="px-4 py-2 rounded-md border border-transparent bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
              >
                Подтвердить все
              </button>
            </div>
          )}
        />

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Все типы</option>
              <option value="SLA_OVERDUE">Только просроченные</option>
              <option value="SLA_WARNING">Только до 24 часов</option>
            </select>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={onlyUnack}
                onChange={(e) => setOnlyUnack(e.target.checked)}
              />
              Только не подтвержденные
            </label>
          </div>

          {loading ? (
            <div className="py-8 text-sm text-gray-500">Загрузка...</div>
          ) : items.length === 0 ? (
            <div className="py-8 text-sm text-gray-500">Уведомлений нет</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-600">
                    <th className="py-2 pr-3">Тип</th>
                    <th className="py-2 pr-3">Оборудование</th>
                    <th className="py-2 pr-3">Срок</th>
                    <th className="py-2 pr-3">Создано</th>
                    <th className="py-2 pr-3">Нарушение</th>
                    <th className="py-2">Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="py-2 pr-3">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${typeTone(item.type)}`}>
                          {typeLabel(item.type)}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="font-medium text-gray-900">{item.equipment_passport || '—'}</div>
                        <div className="text-xs text-gray-500">{item.equipment_type || '—'}</div>
                      </td>
                      <td className="py-2 pr-3">{formatDate(item.violation_deadline)}</td>
                      <td className="py-2 pr-3">{formatDate(item.created_at)}</td>
                      <td className="py-2 pr-3">
                        {item.violation_id ? (
                          <a
                            href={`/violations`}
                            className="text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            #{item.violation_id}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => ackOne(item.id)}
                          className="px-3 py-1 rounded-md border border-gray-300 text-xs font-medium hover:bg-gray-50"
                        >
                          Подтвердить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
