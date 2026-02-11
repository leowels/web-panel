'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { format } from 'date-fns'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { useAIContextStore } from '@/store/aiContextStore'
import FilterBar from '@/components/ui/FilterBar'
import Toolbar from '@/components/ui/Toolbar'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'
import { canMutateData } from '@/utils/roles'

const API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || ''
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Act {
  id: number
  act_number: string
  act_date: string
  organization: string
  status: string
  created_at: string
  violation_ids?: number[]
}

interface ActsTableProps {
  onEdit: (id: number) => void
  onView: (id: number) => void
  refreshKey?: number
  equipmentFilterId?: number | null
}

export default function ActsTable({ onEdit, onView, refreshKey = 0, equipmentFilterId = null }: ActsTableProps) {
  const { token, user } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const { setFilters, setSelection } = useAIContextStore()
  const canMutate = canMutateData(user)
  const [acts, setActs] = useState<Act[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [closingActId, setClosingActId] = useState<number | null>(null)
  const isAdmin = (user?.roles || []).some((role) => role.name === 'admin')

  useEffect(() => {
    fetchActs()
  }, [statusFilter, refreshKey, equipmentFilterId])

  useEffect(() => {
    setFilters({ status: statusFilter, equipment_id: equipmentFilterId ?? undefined })
  }, [statusFilter, equipmentFilterId, setFilters])

  const fetchActs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (equipmentFilterId) params.append('equipment_id', String(equipmentFilterId))

      const response = await axios.get(`${API_URL}/api/acts?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setActs(response.data)
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка загрузки актов', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleExportPDF = async (actId: number) => {
    try {
      const response = await axios.post(`${API_URL}/api/acts/${actId}/export/pdf`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `act_${actId}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      addNotification('PDF успешно экспортирован', 'success')
    } catch (error: any) {
      addNotification('Ошибка экспорта PDF', 'error')
    }
  }

  const handleExportTable = async (actId: number) => {
    try {
      const response = await axios.get(`${API_URL}/api/acts/${actId}/export/table`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8;' }))
      const link = document.createElement('a')
      link.href = url

      const contentDisposition = response.headers['content-disposition']
      let filename = `predpisanie_${actId}.csv`
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/)
        if (filenameMatch) {
          filename = filenameMatch[1]
        }
      }

      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      addNotification('Таблица успешно экспортирована', 'success')
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка экспорта таблицы', 'error')
    }
  }

  const handleCloseWorkflow = async (act: Act) => {
    if (!canMutate) return
    if (!token) {
      addNotification('Ошибка авторизации', 'error')
      return
    }

    if (act.status === 'signed' || act.status === 'completed' || act.status === 'archived') {
      addNotification('Кейс уже закрыт', 'warning')
      return
    }

    setClosingActId(act.id)
    try {
      const response = await axios.post(
        `${API_URL}/api/workflow/acts/${act.id}/close`,
        {
          act_status: 'signed',
          resolve_violations: true,
          complete_tasks: true,
          complete_inspection: true,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      const data = response.data
      addNotification(
        `Кейс закрыт: нарушений ${data.resolved_violations}, задач ${data.completed_tasks}`,
        'success'
      )
      fetchActs()
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка закрытия кейса', 'error')
    } finally {
      setClosingActId(null)
    }
  }

  const handleViewAct = (act: Act) => {
    setSelection({
      type: 'акт',
      id: act.id,
      label: act.act_number,
    })
    onView(act.id)
  }

  const getStatusLabel = (status: string) => {
    if (status === 'completed') return 'Завершен'
    if (status === 'signed') return 'Подписан'
    if (status === 'archived') return 'Архив'
    return 'Черновик'
  }

  const getStatusTone = (status: string) => {
    if (status === 'completed') return 'success'
    if (status === 'signed') return 'info'
    if (status === 'archived') return 'neutral'
    return 'warning'
  }

  const canClose = (status: string) => !['signed', 'completed', 'archived'].includes(status)

  const handleDeleteAct = async (act: Act) => {
    if (!canMutate) return
    if (!token) {
      addNotification('Ошибка авторизации', 'error')
      return
    }
    if (!confirm(`Удалить акт ${act.act_number}? Действие необратимо.`)) {
      return
    }
    try {
      await axios.delete(`${API_URL}/api/acts/${act.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      addNotification(`Акт ${act.act_number} удален`, 'success')
      fetchActs()
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка удаления акта', 'error')
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
            <option value="signed">Подписан</option>
            <option value="completed">Завершен</option>
            <option value="archived">Архив</option>
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
            <table className="min-w-[1100px] w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Номер</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Организация</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Нарушений</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {acts.map((act) => (
                  <tr key={act.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {act.act_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {format(new Date(act.act_date), 'dd.MM.yyyy')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{act.organization}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {act.violation_ids?.length || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge label={getStatusLabel(act.status)} tone={getStatusTone(act.status)} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end items-center gap-2">
                        {canMutate && canClose(act.status) && (
                          <button
                            onClick={() => handleCloseWorkflow(act)}
                            disabled={closingActId === act.id}
                            className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-semibold rounded border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60"
                            title="Закрыть кейс: нарушения, задачи и осмотр"
                          >
                            {closingActId === act.id ? '...' : 'Закрыть'}
                          </button>
                        )}
                        <button
                          onClick={() => handleExportTable(act.id)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Экспорт таблицы (CSV)"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleExportPDF(act.id)}
                          className="text-green-600 hover:text-green-900"
                          title="Экспорт PDF"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </button>
                        {canMutate && isAdmin && (
                          <button
                            onClick={() => handleDeleteAct(act)}
                            className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-semibold rounded border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100"
                            title="Удалить акт"
                          >
                            Удалить
                          </button>
                        )}
                        {canMutate && (
                          <button
                            onClick={() => onEdit(act.id)}
                            className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-semibold rounded border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100"
                          >
                            Редактировать
                          </button>
                        )}
                        <button onClick={() => handleViewAct(act)} className="text-primary-600 hover:text-primary-900">
                          Открыть
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {acts.length === 0 && (
              <EmptyState title="Акты не найдены" description="Попробуйте изменить фильтр или создать новый акт." />
            )}
          </div>

          <div className="lg:hidden divide-y divide-gray-200">
            {acts.map((act) => (
              <div key={act.id} className="p-4 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-gray-900">Акт №{act.act_number}</p>
                    <p className="text-sm text-gray-500">{act.organization}</p>
                    <p className="text-xs text-gray-500 mt-1">Нарушений: {act.violation_ids?.length || 0}</p>
                  </div>
                  <StatusBadge label={getStatusLabel(act.status)} tone={getStatusTone(act.status)} />
                </div>
                <div className="mt-4 text-sm text-gray-600">
                  <p className="text-xs uppercase text-gray-400">Дата</p>
                  <p className="font-semibold text-gray-800">{format(new Date(act.act_date), 'dd.MM.yyyy')}</p>
                </div>
                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                  {canMutate && canClose(act.status) && (
                    <button
                      onClick={() => handleCloseWorkflow(act)}
                      disabled={closingActId === act.id}
                      className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 rounded-lg disabled:opacity-60"
                    >
                      {closingActId === act.id ? 'Закрытие...' : 'Закрыть кейс'}
                    </button>
                  )}
                  <button
                    onClick={() => handleExportTable(act.id)}
                    className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 rounded-lg"
                  >
                    Таблица
                  </button>
                  <button
                    onClick={() => handleExportPDF(act.id)}
                    className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-green-700 bg-green-50 rounded-lg"
                  >
                    PDF
                  </button>
                  {canMutate && (
                    <button
                      onClick={() => onEdit(act.id)}
                      className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-amber-700 bg-amber-50 rounded-lg"
                    >
                      Редактировать
                    </button>
                  )}
                  {canMutate && isAdmin && (
                    <button
                      onClick={() => handleDeleteAct(act)}
                      className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-rose-700 bg-rose-50 rounded-lg"
                    >
                      Удалить
                    </button>
                  )}
                  <button
                    onClick={() => handleViewAct(act)}
                    className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-primary-700 bg-primary-50 rounded-lg"
                  >
                    Открыть
                  </button>
                </div>
              </div>
            ))}
          </div>

          {acts.length === 0 && (
            <div className="lg:hidden">
              <EmptyState title="Акты не найдены" description="Попробуйте изменить фильтр или создать новый акт." />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
