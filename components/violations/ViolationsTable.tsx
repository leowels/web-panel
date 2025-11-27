'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { format } from 'date-fns'
import ViolationsBulkStatus from './ViolationsBulkStatus'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface Violation {
  id: number
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
    type?: string
    severity?: string
    norm_block?: string
    confidence?: number
    gost_reference?: string
    labels?: string[]
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
  created_at: string
}

interface ViolationsTableProps {
  onEdit: (id: number) => void
  onView: (id: number) => void
  refreshKey?: number
}

export default function ViolationsTable({ onEdit, onView, refreshKey = 0 }: ViolationsTableProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [violations, setViolations] = useState<Violation[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showBulkStatus, setShowBulkStatus] = useState(false)

  useEffect(() => {
    fetchViolations()
  }, [statusFilter, severityFilter, refreshKey])

  const fetchViolations = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (severityFilter) params.append('severity', severityFilter)
      
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

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800'
      case 'high':
        return 'bg-orange-100 text-orange-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      case 'low':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getSeverityText = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'Критическое'
      case 'high':
        return 'Высокое'
      case 'medium':
        return 'Среднее'
      case 'low':
        return 'Низкое'
      default:
        return severity
    }
  }

  const renderAIInsights = (violation: Violation) => {
    const hasAIData =
      violation.violation_type ||
      violation.violation_type_description ||
      violation.norm_reference ||
      violation.recommended_act_text ||
      (violation.requirements && violation.requirements.length > 0) ||
      (violation.ai_recommendations?.requirements && violation.ai_recommendations.requirements.length > 0) ||
      typeof violation.ai_classification?.confidence === 'number'

    if (!hasAIData) {
      return null
    }

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
        {violation.violation_type_description || violation.violation_type ? (
          <div className="text-xs font-semibold text-primary-800">
            {violation.violation_type_description || violation.violation_type}
          </div>
        ) : null}
        {violation.norm_reference && (
          <div className="text-xs text-gray-600">
            Норматив: <span className="font-medium">{violation.norm_reference}</span>
          </div>
        )}
        {violation.recommended_act_text && (
          <div className="text-xs text-gray-600 italic">
            «{violation.recommended_act_text}»
          </div>
        )}
        {requirements && requirements.length > 0 && (
          <div className="text-xs text-gray-600">
            <span className="font-semibold text-gray-700">Требования:</span>
            <ul className="list-disc list-inside space-y-0.5 mt-1">
              {requirements.slice(0, 3).map((req, idx) => (
                <li key={idx}>{req}</li>
              ))}
              {requirements.length > 3 && (
                <li className="text-gray-400">
                  + ещё {requirements.length - 3}
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    )
  }

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(violations.map(v => v.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectOne = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(selectedId => selectedId !== id)
        : [...prev, id]
    )
  }

  const handleBulkSuccess = () => {
    setSelectedIds([])
    setShowBulkStatus(false)
    fetchViolations()
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 sm:p-6 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Все статусы</option>
            <option value="open">Открыто</option>
            <option value="resolved">Устранено</option>
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Все уровни</option>
            <option value="critical">Критическое</option>
            <option value="high">Высокое</option>
            <option value="medium">Среднее</option>
            <option value="low">Низкое</option>
          </select>
        </div>
        
        {/* Кнопки массовых операций */}
        {selectedIds.length > 0 && (
          <div className="mt-4 p-4 bg-gradient-to-r from-primary-50 to-blue-50 border-2 border-primary-200 rounded-xl shadow-soft">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-primary-200 shadow-sm">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-bold text-primary-700">
                  Выбрано: {selectedIds.length}
                </span>
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
      </div>

      {loading ? (
        <div className="p-6 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      ) : (
        <div className="w-full">
          <div className="hidden lg:block">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === violations.length && violations.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[25%]">Описание</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">Оборудование</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[12%]">ФНП/ГОСТ</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">Критичность</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">Статус</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">Срок</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[8%]">Действия</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {violations.map((violation) => (
                  <tr key={violation.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(violation.id)}
                        onChange={() => handleSelectOne(violation.id)}
                        className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-sm text-gray-900 break-words" style={{ 
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        maxHeight: '3em'
                      }}>{violation.description}</div>
                    {renderAIInsights(violation)}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600">
                      {violation.equipment ? (
                        <div>
                          <div className="font-semibold text-gray-900 truncate">{violation.equipment.passport_number}</div>
                          <div className="text-xs text-gray-500 truncate">{violation.equipment.equipment_type}</div>
                          {violation.equipment.position && (
                            <div className="text-xs text-gray-500 truncate">
                              Поз: {violation.equipment.position}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span>-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500 break-words">
                      <div style={{ 
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        maxHeight: '3em'
                      }}>
                        {violation.fnp_clause || violation.gost_clause || '-'}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${getSeverityColor(violation.severity)}`}>
                        {getSeverityText(violation.severity)}
                      </span>
                    {violation.criticality_level && (
                      <div className="mt-1 text-[11px] text-gray-500">
                        AI: {getSeverityText(violation.criticality_level)}
                      </div>
                    )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
                        violation.status === 'resolved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {violation.status === 'resolved' ? 'Устранено' : 'Открыто'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500">
                      {violation.deadline ? format(new Date(violation.deadline), 'dd.MM.yyyy') : '-'}
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-medium">
                      <button
                        onClick={() => onView(violation.id)}
                        className="text-primary-600 hover:text-primary-900"
                      >
                        Открыть
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Мобильная версия - карточки */}
          <div className="lg:hidden divide-y divide-gray-200">
            {violations.map((violation) => (
              <div key={violation.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start gap-3 mb-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(violation.id)}
                    onChange={() => handleSelectOne(violation.id)}
                    className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-1"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1 flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div 
                        className="text-sm font-medium text-gray-900 mb-1"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          maxHeight: '3em'
                        }}
                      >
                        {violation.description}
                      </div>
                  {renderAIInsights(violation)}
                      {violation.equipment && (
                        <div className="text-xs text-gray-600">
                          <div className="font-semibold">{violation.equipment.passport_number}</div>
                          <div>{violation.equipment.equipment_type}</div>
                          {violation.equipment.position && (
                            <div>Позиция: {violation.equipment.position}</div>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => onView(violation.id)}
                      className="ml-2 text-primary-600 hover:text-primary-900 text-sm font-medium"
                    >
                      Открыть
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3 ml-6">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSeverityColor(violation.severity)}`}>
                    {getSeverityText(violation.severity)}
                  </span>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    violation.status === 'resolved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {violation.status === 'resolved' ? 'Устранено' : 'Открыто'}
                  </span>
                  {violation.deadline && (
                    <span className="px-2 py-1 text-xs text-gray-600">
                      Срок: {format(new Date(violation.deadline), 'dd.MM.yyyy')}
                    </span>
                  )}
                  {(violation.fnp_clause || violation.gost_clause) && (
                    <span className="px-2 py-1 text-xs text-gray-600">
                      {violation.fnp_clause || violation.gost_clause}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {violations.length === 0 && (
            <div className="p-6 text-center text-gray-500">
              Нарушения не найдены
            </div>
          )}
        </div>
      )}

      {showBulkStatus && (
        <ViolationsBulkStatus
          selectedIds={selectedIds}
          onClose={() => setShowBulkStatus(false)}
          onSuccess={handleBulkSuccess}
        />
      )}
    </div>
  )
}

