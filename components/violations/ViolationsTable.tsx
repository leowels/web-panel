'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { format } from 'date-fns'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { useAIContextStore } from '@/store/aiContextStore'
import ViolationsBulkStatus from './ViolationsBulkStatus'
import FilterBar from '@/components/ui/FilterBar'
import Toolbar from '@/components/ui/Toolbar'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'
import { canMutateData } from '@/utils/roles'

const API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || ''
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Violation {
  id: number
  inspection_id?: number | null
  equipment_id: number
  equipment?: {
    passport_number: string
    equipment_type: string
    position?: string | null
    inventory_number?: string | null
    workshop?: string | null
  }
  description: string
  fnp_clause: string | null
  gost_clause: string | null
  severity: string
  criticality_level?: string | null
  violation_type?: string | null
  violation_type_description?: string | null
  norm_reference?: string | null
  recommended_act_text?: string | null
  requirements?: string[] | null
  source?: string | null
  reported_by?: number | null
  attachment_meta?: Record<string, any> | null
  ai_classification?: {
    confidence?: number
  } | null
  ai_recommendations?: {
    quote?: string
    requirements?: string[]
    act_text?: string
    criticality?: string
  } | null
  ai_payload_raw?: Record<string, any> | null
  status: string
  deadline: string | null
  is_overdue?: boolean | null
  overdue_at?: string | null
  created_at: string
}

interface ViolationsTableProps {
  onEdit: (id: number) => void
  onView: (id: number) => void
  refreshKey?: number
  equipmentFilterId?: number | null
  inspectionFilterId?: number | null
}

type WorkflowBusyAction = 'task' | 'act' | null

export default function ViolationsTable({
  onEdit,
  onView,
  refreshKey = 0,
  equipmentFilterId = null,
  inspectionFilterId = null,
}: ViolationsTableProps) {
  const router = useRouter()
  const { token, user } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const { setFilters, setSelection } = useAIContextStore()
  const [violations, setViolations] = useState<Violation[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [overdueFilter, setOverdueFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showBulkStatus, setShowBulkStatus] = useState(false)
  const [workflowBusy, setWorkflowBusy] = useState<{ action: WorkflowBusyAction; id: number | null }>({
    action: null,
    id: null,
  })
  const [expandedAI, setExpandedAI] = useState<Record<number, boolean>>({})
  const canMutate = canMutateData(user)
  const isAdmin = (user?.roles || []).some((role) => role.name === 'admin')

  useEffect(() => {
    fetchViolations()
  }, [statusFilter, severityFilter, overdueFilter, refreshKey, equipmentFilterId, inspectionFilterId])

  useEffect(() => {
    setFilters({
      status: statusFilter,
      severity: severityFilter,
      overdue: overdueFilter,
      equipment_id: equipmentFilterId ?? undefined,
      inspection_id: inspectionFilterId ?? undefined,
    })
  }, [statusFilter, severityFilter, overdueFilter, equipmentFilterId, inspectionFilterId, setFilters])

  const fetchViolations = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (severityFilter) params.append('severity', severityFilter)
      if (overdueFilter) params.append('overdue', overdueFilter)
      if (equipmentFilterId) params.append('equipment_id', String(equipmentFilterId))
      if (inspectionFilterId) params.append('inspection_id', String(inspectionFilterId))

      const response = await axios.get(`${API_URL}/api/violations?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setViolations(response.data)
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка загрузки нарушений', 'error')
    } finally {
      setLoading(false)
    }
  }

  const getSeverityTone = (severity: string) => {
    if (severity === 'critical') return 'danger'
    if (severity === 'high') return 'warning'
    if (severity === 'medium') return 'info'
    if (severity === 'low') return 'neutral'
    return 'neutral'
  }

  const getSeverityText = (severity: string) => {
    if (severity === 'critical') return 'Критическое'
    if (severity === 'high') return 'Высокое'
    if (severity === 'medium') return 'Среднее'
    if (severity === 'low') return 'Низкое'
    return severity
  }

  const getStatusTone = (status: string) => (status === 'resolved' ? 'success' : 'warning')

  const handleViewViolation = (violation: Violation) => {
    setSelection({
      type: 'нарушение',
      id: violation.id,
      label: violation.violation_type || violation.violation_type_description || violation.description?.slice(0, 80),
    })
    onView(violation.id)
  }

  const hasAIInsights = (violation: Violation) => {
    return Boolean(
      violation.violation_type ||
      violation.violation_type_description ||
      violation.norm_reference ||
      violation.recommended_act_text ||
      (violation.requirements && violation.requirements.length > 0) ||
      (violation.ai_recommendations?.requirements && violation.ai_recommendations.requirements.length > 0) ||
      typeof violation.ai_classification?.confidence === 'number'
    )
  }

  const renderAIInsights = (violation: Violation) => {
    if (!hasAIInsights(violation)) return null

    const requirements =
      violation.requirements && violation.requirements.length > 0
        ? violation.requirements
        : violation.ai_recommendations?.requirements || []
    const confidence =
      typeof violation.ai_classification?.confidence === 'number'
        ? `${Math.round(violation.ai_classification.confidence * 100)}%`
        : null

    return (
      <div className="mt-2 space-y-1 rounded-lg bg-gray-50 border border-gray-200 p-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-gray-500">
          {violation.source && (
            <span className="px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full">
              Источник: {violation.source}
            </span>
          )}
          {confidence && (
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">
              AI уверенность: {confidence}
            </span>
          )}
        </div>
        {(violation.violation_type_description || violation.violation_type) && (
          <div className="text-xs font-semibold text-primary-800">
            {violation.violation_type_description || violation.violation_type}
          </div>
        )}
        {violation.norm_reference && (
          <div className="text-xs text-gray-600">
            Норматив: <span className="font-medium">{violation.norm_reference}</span>
          </div>
        )}
        {violation.recommended_act_text && (
          <div className="text-xs text-gray-600 italic">«{violation.recommended_act_text}»</div>
        )}
        {requirements.length > 0 && (
          <div className="text-xs text-gray-600">
            <span className="font-semibold text-gray-700">Требования:</span>
            <ul className="list-disc list-inside space-y-0.5 mt-1">
              {requirements.slice(0, 3).map((req, idx) => (
                <li key={idx}>{req}</li>
              ))}
              {requirements.length > 3 && <li className="text-gray-400">+ еще {requirements.length - 3}</li>}
            </ul>
          </div>
        )}
      </div>
    )
  }

  const toggleAIInsights = (violationId: number) => {
    setExpandedAI((prev) => ({
      ...prev,
      [violationId]: !prev[violationId],
    }))
  }

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canMutate) return
    if (e.target.checked) {
      setSelectedIds(violations.map((v) => v.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectOne = (id: number) => {
    if (!canMutate) return
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const handleBulkSuccess = () => {
    setSelectedIds([])
    setShowBulkStatus(false)
    fetchViolations()
  }

  const clearFilters = () => {
    setStatusFilter('')
    setSeverityFilter('')
    setOverdueFilter('')
  }

  const handleCreateTaskFromViolation = async (violation: Violation) => {
    if (!canMutate) return
    if (!token) {
      addNotification('Ошибка авторизации', 'error')
      return
    }

    setWorkflowBusy({ action: 'task', id: violation.id })
    try {
      const response = await axios.post(
        `${API_URL}/api/workflow/violations/${violation.id}/task`,
        {
          title: violation.violation_type
            ? `Устранить нарушение: ${violation.violation_type}`
            : `Устранить нарушение #${violation.id}`,
          description: violation.description,
          due_date: violation.deadline ? `${violation.deadline.split('T')[0]}T00:00:00` : null,
          force_create: false,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      if (response.data?.created) {
        addNotification(`Задача #${response.data.task_id} создана`, 'success')
      } else {
        addNotification(`Использована существующая задача #${response.data.task_id}`, 'warning')
      }
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка создания задачи', 'error')
    } finally {
      setWorkflowBusy({ action: null, id: null })
    }
  }

  const handleCreateActFromViolation = async (violation: Violation) => {
    if (!canMutate) return
    if (!token) {
      addNotification('Ошибка авторизации', 'error')
      return
    }

    setWorkflowBusy({ action: 'act', id: violation.id })
    try {
      const response = await axios.post(
        `${API_URL}/api/workflow/violations/${violation.id}/act`,
        {
          organization: user?.organization || undefined,
          force_create: false,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      const actId = response.data?.act_id
      if (response.data?.created) {
        addNotification(`Акт ${response.data.act_number} создан`, 'success')
      } else {
        addNotification(`Использован существующий акт ${response.data.act_number}`, 'warning')
      }

      if (actId) {
        router.push(`/acts?act_id=${actId}`)
      }
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка создания акта', 'error')
    } finally {
      setWorkflowBusy({ action: null, id: null })
    }
  }

  const handleDeleteViolation = async (violation: Violation) => {
    if (!canMutate) return
    if (!token) {
      addNotification('Ошибка авторизации', 'error')
      return
    }

    if (!confirm(`Удалить нарушение #${violation.id}? Действие необратимо.`)) {
      return
    }

    try {
      await axios.delete(`${API_URL}/api/violations/${violation.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      addNotification(`Нарушение #${violation.id} удалено`, 'success')
      fetchViolations()
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка удаления нарушения', 'error')
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
      <FilterBar className="border-0 border-b border-slate-200 rounded-none p-5">
        <Toolbar className="gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Все статусы</option>
            <option value="open">Открыто</option>
            <option value="resolved">Устранено</option>
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Все уровни</option>
            <option value="critical">Критическое</option>
            <option value="high">Высокое</option>
            <option value="medium">Среднее</option>
            <option value="low">Низкое</option>
          </select>
          <select
            value={overdueFilter}
            onChange={(e) => setOverdueFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Все сроки</option>
            <option value="true">Просроченные</option>
            <option value="false">Не просроченные</option>
          </select>
          <button
            type="button"
            onClick={clearFilters}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
          >
            Сбросить
          </button>
        </Toolbar>

        {(equipmentFilterId || inspectionFilterId) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {equipmentFilterId && (
              <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full border bg-primary-50 text-primary-700 border-primary-200">
                Фильтр по оборудованию: #{equipmentFilterId}
              </span>
            )}
            {inspectionFilterId && (
              <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full border bg-slate-50 text-slate-700 border-slate-200">
                Фильтр по осмотру: #{inspectionFilterId}
              </span>
            )}
          </div>
        )}

        {canMutate && selectedIds.length > 0 && (
          <div className="mt-4 p-4 bg-gradient-to-r from-primary-50 to-blue-50 border-2 border-primary-200 rounded-xl shadow-soft">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-primary-200 shadow-sm">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-bold text-primary-700">Выбрано: {selectedIds.length}</span>
              </div>
              <button
                onClick={() => setShowBulkStatus(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Изменить статус
              </button>
              <button
                onClick={() => setSelectedIds([])}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 hover:border-gray-400 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Снять выделение
              </button>
            </div>
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
            <table className="min-w-[1500px] w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-12">
                    {canMutate ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.length === violations.length && violations.length > 0}
                        onChange={handleSelectAll}
                        className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                    ) : null}
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[340px]">Описание</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[220px]">Оборудование</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[160px]">ФНП/ГОСТ</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[140px]">Критичность</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[180px]">Статус</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[120px]">Срок</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[320px]">Действия</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {violations.map((violation) => (
                  <tr key={violation.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      {canMutate ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(violation.id)}
                          onChange={() => handleSelectOne(violation.id)}
                          className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <div
                        className="text-sm text-gray-900 break-words"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          maxHeight: '3em',
                        }}
                      >
                        {violation.description}
                      </div>
                      {hasAIInsights(violation) && (
                        <button
                          type="button"
                          onClick={() => toggleAIInsights(violation.id)}
                          className="mt-2 text-xs font-semibold text-primary-700 hover:text-primary-900"
                        >
                          {expandedAI[violation.id] ? 'Скрыть AI-данные' : 'Показать AI-данные'}
                        </button>
                      )}
                      {expandedAI[violation.id] && renderAIInsights(violation)}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600">
                      {violation.equipment ? (
                        <div>
                          <div className="font-semibold text-gray-900 truncate">{violation.equipment.passport_number}</div>
                          <div className="text-xs text-gray-500 truncate">{violation.equipment.equipment_type}</div>
                          {violation.equipment.position && (
                            <div className="text-xs text-gray-500 truncate">Поз: {violation.equipment.position}</div>
                          )}
                        </div>
                      ) : (
                        <span>-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500 break-words">
                      <div
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          maxHeight: '3em',
                        }}
                      >
                        {violation.fnp_clause || violation.gost_clause || '-'}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge label={getSeverityText(violation.severity)} tone={getSeverityTone(violation.severity)} />
                      {violation.criticality_level && (
                        <div className="mt-1 text-[11px] text-gray-500">AI: {getSeverityText(violation.criticality_level)}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <StatusBadge label={violation.status === 'resolved' ? 'Устранено' : 'В работе'} tone={getStatusTone(violation.status)} />
                        {violation.is_overdue && violation.status !== 'resolved' && (
                          <StatusBadge label="Просрочено" tone="danger" />
                        )}
                        {!violation.deadline && violation.status !== 'resolved' && (
                          <StatusBadge label="Без срока" tone="warning" />
                        )}
                      </div>
                    </td>
                    <td
                      className={`px-3 py-3 text-sm ${
                        violation.is_overdue && violation.status !== 'resolved'
                          ? 'text-red-700 font-semibold'
                          : 'text-gray-500'
                      }`}
                    >
                      {violation.deadline ? format(new Date(violation.deadline), 'dd.MM.yyyy') : '-'}
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-medium">
                      <div className="inline-flex items-center gap-2">
                        {canMutate && (
                          <button
                            onClick={() => handleCreateTaskFromViolation(violation)}
                            disabled={workflowBusy.action === 'task' && workflowBusy.id === violation.id}
                            className="px-2.5 py-1 text-xs font-semibold rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-60"
                          >
                            {workflowBusy.action === 'task' && workflowBusy.id === violation.id ? '...' : 'Задача'}
                          </button>
                        )}
                        {violation.inspection_id && (
                          <button
                            onClick={() => router.push(`/inspections?inspection_id=${violation.inspection_id}`)}
                            className="px-2.5 py-1 text-xs font-semibold rounded border border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100"
                          >
                            Осмотр
                          </button>
                        )}
                        {canMutate && (
                          <button
                            onClick={() => onEdit(violation.id)}
                            className="px-2.5 py-1 text-xs font-semibold rounded border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100"
                          >
                            Редактировать
                          </button>
                        )}
                        {canMutate && isAdmin && (
                          <button
                            onClick={() => handleDeleteViolation(violation)}
                            className="px-2.5 py-1 text-xs font-semibold rounded border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100"
                          >
                            Удалить
                          </button>
                        )}
                        <button onClick={() => handleViewViolation(violation)} className="text-primary-600 hover:text-primary-900">
                          Открыть
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden divide-y divide-gray-200">
            {violations.map((violation) => (
              <div key={violation.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start gap-3 mb-2">
                  {canMutate ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(violation.id)}
                      onChange={() => handleSelectOne(violation.id)}
                      className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-1"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : null}
                  <div className="flex-1">
                    <div
                      className="text-sm font-medium text-gray-900 mb-1"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        maxHeight: '3em',
                      }}
                    >
                    {violation.description}
                  </div>
                    {hasAIInsights(violation) && (
                      <button
                        type="button"
                        onClick={() => toggleAIInsights(violation.id)}
                        className="mt-2 text-xs font-semibold text-primary-700 hover:text-primary-900"
                      >
                        {expandedAI[violation.id] ? 'Скрыть AI-данные' : 'Показать AI-данные'}
                      </button>
                    )}
                    {expandedAI[violation.id] && renderAIInsights(violation)}
                    {violation.equipment && (
                      <div className="text-xs text-gray-600 mt-2">
                        <div className="font-semibold">{violation.equipment.passport_number}</div>
                        <div>{violation.equipment.equipment_type}</div>
                        {violation.equipment.position && <div>Позиция: {violation.equipment.position}</div>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-3 ml-6">
                  <StatusBadge label={getSeverityText(violation.severity)} tone={getSeverityTone(violation.severity)} />
                  <StatusBadge label={violation.status === 'resolved' ? 'Устранено' : 'В работе'} tone={getStatusTone(violation.status)} />
                  {violation.is_overdue && violation.status !== 'resolved' && (
                    <StatusBadge label="Просрочено" tone="danger" />
                  )}
                  {!violation.deadline && violation.status !== 'resolved' && (
                    <StatusBadge label="Без срока" tone="warning" />
                  )}
                  {violation.deadline && (
                    <span className="px-2 py-1 text-xs text-gray-600">
                      Срок: {format(new Date(violation.deadline), 'dd.MM.yyyy')}
                    </span>
                  )}
                  {(violation.fnp_clause || violation.gost_clause) && (
                    <span className="px-2 py-1 text-xs text-gray-600">{violation.fnp_clause || violation.gost_clause}</span>
                  )}
                </div>

                <div className="mt-4 ml-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {canMutate && (
                    <button
                      onClick={() => handleCreateTaskFromViolation(violation)}
                      disabled={workflowBusy.action === 'task' && workflowBusy.id === violation.id}
                      className="inline-flex items-center justify-center px-3 py-2 text-sm font-semibold rounded-lg border border-blue-200 text-blue-700 bg-blue-50 disabled:opacity-60"
                    >
                      {workflowBusy.action === 'task' && workflowBusy.id === violation.id ? 'Создание...' : 'Создать задачу'}
                    </button>
                  )}
                  {violation.inspection_id && (
                    <button
                      onClick={() => router.push(`/inspections?inspection_id=${violation.inspection_id}`)}
                      className="inline-flex items-center justify-center px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 text-slate-700 bg-slate-50"
                    >
                      Осмотр
                    </button>
                  )}
                  {canMutate && (
                    <button
                      onClick={() => onEdit(violation.id)}
                      className="inline-flex items-center justify-center px-3 py-2 text-sm font-semibold rounded-lg border border-amber-200 text-amber-700 bg-amber-50"
                    >
                      Редактировать
                    </button>
                  )}
                  {canMutate && isAdmin && (
                    <button
                      onClick={() => handleDeleteViolation(violation)}
                      className="inline-flex items-center justify-center px-3 py-2 text-sm font-semibold rounded-lg border border-rose-200 text-rose-700 bg-rose-50"
                    >
                      Удалить
                    </button>
                  )}
                  <button
                    onClick={() => handleViewViolation(violation)}
                    className="inline-flex items-center justify-center px-3 py-2 text-sm font-semibold rounded-lg border border-primary-200 text-primary-700 bg-primary-50"
                  >
                    Открыть
                  </button>
                </div>
              </div>
            ))}
          </div>

          {violations.length === 0 && (
            <EmptyState title="Нарушения не найдены" description="Попробуйте изменить фильтры или добавить запись." />
          )}
        </div>
      )}

      {canMutate && showBulkStatus && (
        <ViolationsBulkStatus
          selectedIds={selectedIds}
          onClose={() => setShowBulkStatus(false)}
          onSuccess={handleBulkSuccess}
        />
      )}
    </div>
  )
}




