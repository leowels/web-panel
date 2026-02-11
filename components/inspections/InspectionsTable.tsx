'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { format } from 'date-fns'
import { useAIContextStore } from '@/store/aiContextStore'
import FilterBar from '@/components/ui/FilterBar'
import Toolbar from '@/components/ui/Toolbar'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface Inspection {
  id: number
  equipment_id: number
  checklist_template_id: number
  status: string
  started_at: string | null
  completed_at: string | null
  created_at: string
  is_synced: boolean
  equipment_passport?: string | null
  equipment_type?: string | null
  checklist_name?: string | null
  violations_count?: number | null
}

interface InspectionsTableProps {
  onView: (id: number) => void
  equipmentFilterId?: number | null
}

export default function InspectionsTable({ onView, equipmentFilterId = null }: InspectionsTableProps) {
  const { token, user } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const { setFilters, setSelection } = useAIContextStore()
  const router = useRouter()
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const isAdmin = (user?.roles || []).some((role) => role.name === 'admin')

  useEffect(() => {
    fetchInspections()
  }, [statusFilter, equipmentFilterId])

  useEffect(() => {
    setFilters({ status: statusFilter, equipment_id: equipmentFilterId ?? undefined })
  }, [statusFilter, equipmentFilterId, setFilters])

  const fetchInspections = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (equipmentFilterId) params.append('equipment_id', String(equipmentFilterId))

      const response = await axios.get(`${API_URL}/api/inspections?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setInspections(response.data)
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка загрузки осмотров', 'error')
    } finally {
      setLoading(false)
    }
  }

  const getStatusTone = (status: string) => {
    switch (status) {
      case 'draft':
        return 'neutral'
      case 'in_progress':
        return 'info'
      case 'completed':
        return 'success'
      default:
        return 'warning'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'draft':
        return 'Черновик'
      case 'in_progress':
        return 'В работе'
      case 'completed':
        return 'Завершен'
      default:
        return status
    }
  }

  const handleViewInspection = (inspection: Inspection) => {
    setSelection({
      type: 'осмотр',
      id: inspection.id,
      label: inspection.status,
    })
    onView(inspection.id)
  }

  const handleDeleteInspection = async (inspection: Inspection) => {
    if (!token) {
      addNotification('Ошибка авторизации', 'error')
      return
    }
    if (!confirm(`Удалить осмотр #${inspection.id}? Действие необратимо.`)) {
      return
    }
    try {
      await axios.delete(`${API_URL}/api/inspections/${inspection.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      addNotification(`Осмотр #${inspection.id} удален`, 'success')
      fetchInspections()
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка удаления осмотра', 'error')
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
      <FilterBar className="border-0 border-b border-slate-200 rounded-none p-5">
        <Toolbar>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Все статусы</option>
            <option value="draft">Черновик</option>
            <option value="in_progress">В работе</option>
            <option value="completed">Завершен</option>
          </select>
        </Toolbar>
        {equipmentFilterId && (
          <div className="mt-3">
            <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full border bg-primary-50 text-primary-700 border-primary-200">
              Фильтр по оборудованию: #{equipmentFilterId}
            </span>
          </div>
        )}
      </FilterBar>

      {loading ? (
        <div className="p-6 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      ) : (
        <div className="w-full">
          <div className="hidden lg:block overflow-x-auto max-h-[68vh]">
            <table className="min-w-[1200px] w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Оборудование</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Чек-лист</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Нарушения</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Статус</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Начало</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Завершение</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Действия</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {inspections.map((inspection) => (
                  <tr key={inspection.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">#{inspection.id}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="font-semibold text-gray-900">
                        {inspection.equipment_passport || `ПС #${inspection.equipment_id}`}
                      </div>
                      <div className="text-xs text-gray-500">{inspection.equipment_type || 'Тип не указан'}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {inspection.checklist_name || `Чек-лист #${inspection.checklist_template_id}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => router.push(`/violations?inspection_id=${inspection.id}`)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                          (inspection.violations_count || 0) > 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {inspection.violations_count || 0}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <StatusBadge label={getStatusText(inspection.status)} tone={getStatusTone(inspection.status)} />
                        <StatusBadge label={inspection.is_synced ? 'Синхронизирован' : 'Не синхронизирован'} tone={inspection.is_synced ? 'success' : 'warning'} />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {inspection.started_at ? format(new Date(inspection.started_at), 'dd.MM.yyyy HH:mm') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {inspection.completed_at ? format(new Date(inspection.completed_at), 'dd.MM.yyyy HH:mm') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => router.push(`/equipment?equipment_id=${inspection.equipment_id}`)}
                          className="px-2.5 py-1 text-xs font-semibold rounded border border-gray-200 text-gray-700 bg-gray-50 hover:bg-gray-100"
                        >
                          ПС
                        </button>
                        <button
                          onClick={() => handleViewInspection(inspection)}
                          className="px-2.5 py-1 text-xs font-semibold rounded border border-primary-200 text-primary-700 bg-primary-50 hover:bg-primary-100"
                        >
                          Открыть
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteInspection(inspection)}
                            className="px-2.5 py-1 text-xs font-semibold rounded border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100"
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {inspections.length === 0 && (
              <EmptyState title="Осмотры не найдены" description="Попробуйте изменить фильтры или начните новый осмотр." />
            )}
          </div>

          <div className="lg:hidden divide-y divide-gray-200">
            {inspections.map((inspection) => (
              <div key={inspection.id} className="p-4 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-gray-900">Осмотр #{inspection.id}</p>
                    <p className="text-sm text-gray-500">
                      {inspection.equipment_passport || `ПС #${inspection.equipment_id}`}
                    </p>
                    <p className="text-xs text-gray-400">
                      {inspection.checklist_name || `Чек-лист #${inspection.checklist_template_id}`}
                    </p>
                  </div>
                <StatusBadge label={getStatusText(inspection.status)} tone={getStatusTone(inspection.status)} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-gray-600">
                  <div>
                    <p className="text-xs uppercase text-gray-400">Начало</p>
                    <p className="font-semibold text-gray-800">
                      {inspection.started_at ? format(new Date(inspection.started_at), 'dd.MM.yyyy HH:mm') : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-400">Завершение</p>
                    <p className="font-semibold text-gray-800">
                      {inspection.completed_at ? format(new Date(inspection.completed_at), 'dd.MM.yyyy HH:mm') : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-400">Синхронизация</p>
                    <p className={`font-semibold ${inspection.is_synced ? 'text-green-600' : 'text-yellow-600'}`}>
                      {inspection.is_synced ? 'Синхронизирован' : 'Ожидает'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-400">Нарушения</p>
                    <p className={`font-semibold ${(inspection.violations_count || 0) > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                      {inspection.violations_count || 0}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleViewInspection(inspection)}
                  className="mt-4 w-full inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-primary-700 bg-primary-50 rounded-lg"
                >
                  Открыть
                </button>
                {isAdmin && (
                  <button
                    onClick={() => handleDeleteInspection(inspection)}
                    className="mt-2 w-full inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-rose-700 bg-rose-50 rounded-lg"
                  >
                    Удалить
                  </button>
                )}
              </div>
            ))}
          </div>

          {inspections.length === 0 && (
            <div className="lg:hidden">
              <EmptyState title="Осмотры не найдены" description="Попробуйте изменить фильтры или начните новый осмотр." />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
