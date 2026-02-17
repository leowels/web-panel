'use client'

import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

const API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || ''
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface ErrorCodeCount {
  code: string
  count: number
}

interface ErrorSummary {
  total: number
  unresolved: number
  resolved: number
  retryable: number
  last_24h: number
  top_codes: ErrorCodeCount[]
}

interface ErrorEventItem {
  id: number
  code: string
  message: string
  trace_id: string
  path: string | null
  method: string | null
  status_code: number
  retryable: boolean
  details: unknown
  created_at: string
  resolved_at: string | null
  resolved_by: number | null
  resolved_by_username: string | null
}

type RetryableFilter = 'all' | 'true' | 'false'

const defaultSummary: ErrorSummary = {
  total: 0,
  unresolved: 0,
  resolved: 0,
  retryable: 0,
  last_24h: 0,
  top_codes: [],
}

export default function ErrorMonitoringTable() {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()

  const [summary, setSummary] = useState<ErrorSummary>(defaultSummary)
  const [items, setItems] = useState<ErrorEventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [codeFilter, setCodeFilter] = useState('')
  const [traceFilter, setTraceFilter] = useState('')
  const [pathFilter, setPathFilter] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [retryableFilter, setRetryableFilter] = useState<RetryableFilter>('all')
  const [onlyUnresolved, setOnlyUnresolved] = useState(true)

  const fetchSummary = async () => {
    if (!token) return
    const response = await axios.get(`${API_URL}/api/audit/errors/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    setSummary(response.data || defaultSummary)
  }

  const fetchItems = async () => {
    if (!token) return

    const params = new URLSearchParams()
    params.set('limit', '200')

    if (codeFilter.trim()) params.set('code', codeFilter.trim())
    if (traceFilter.trim()) params.set('trace_id', traceFilter.trim())
    if (pathFilter.trim()) params.set('path', pathFilter.trim())
    if (methodFilter.trim()) params.set('method', methodFilter.trim().toUpperCase())
    if (statusFilter) params.set('status_code', statusFilter)
    if (retryableFilter !== 'all') params.set('retryable', retryableFilter)
    if (onlyUnresolved) params.set('unresolved_only', 'true')

    const response = await axios.get(`${API_URL}/api/audit/errors?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    setItems(response.data || [])
  }

  const fetchAll = async (showSpinner: boolean) => {
    if (!token) return
    if (showSpinner) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    try {
      await Promise.all([fetchSummary(), fetchItems()])
    } catch (error: any) {
      const detail = error?.response?.data?.error?.message || error?.response?.data?.detail || error?.message
      addNotification(`Не удалось загрузить мониторинг ошибок: ${detail}`, 'error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (!token) return
    fetchAll(true)
  }, [token, codeFilter, traceFilter, pathFilter, methodFilter, statusFilter, retryableFilter, onlyUnresolved])

  const resolveError = async (errorId: number) => {
    if (!token) return
    try {
      await axios.post(`${API_URL}/api/audit/errors/${errorId}/resolve`, null, {
        headers: { Authorization: `Bearer ${token}` },
      })
      addNotification('Событие помечено как обработанное', 'success')
      await fetchAll(false)
    } catch (error: any) {
      const detail = error?.response?.data?.error?.message || error?.response?.data?.detail || error?.message
      addNotification(`Не удалось закрыть событие: ${detail}`, 'error')
    }
  }

  const topCodesLabel = useMemo(() => {
    if (!summary.top_codes?.length) return 'Нет данных'
    return summary.top_codes.map((item) => `${item.code}: ${item.count}`).join(' • ')
  }, [summary.top_codes])

  const formatDate = (value?: string | null) => {
    if (!value) return '—'
    return new Date(value).toLocaleString('ru-RU')
  }

  const statusTone = (statusCode: number) => {
    if (statusCode >= 500) return 'bg-rose-100 text-rose-700'
    if (statusCode >= 400) return 'bg-amber-100 text-amber-700'
    return 'bg-slate-100 text-slate-700'
  }

  const retryTone = (retryable: boolean) =>
    retryable ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-700'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <SummaryCard label="Всего" value={summary.total} />
        <SummaryCard label="Не обработано" value={summary.unresolved} tone="text-rose-600" />
        <SummaryCard label="Обработано" value={summary.resolved} tone="text-emerald-600" />
        <SummaryCard label="Retryable" value={summary.retryable} tone="text-sky-600" />
        <SummaryCard label="За 24 часа" value={summary.last_24h} tone="text-indigo-600" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
        <div className="text-sm text-gray-600">Топ-коды: <span className="font-medium text-gray-800">{topCodesLabel}</span></div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <input
            value={codeFilter}
            onChange={(e) => setCodeFilter(e.target.value)}
            placeholder="Код ошибки"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <input
            value={traceFilter}
            onChange={(e) => setTraceFilter(e.target.value)}
            placeholder="Trace ID"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <input
            value={pathFilter}
            onChange={(e) => setPathFilter(e.target.value)}
            placeholder="Путь /api/..."
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <input
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            placeholder="Метод (GET/POST)"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="">Все статусы</option>
            <option value="500">500</option>
            <option value="503">503</option>
            <option value="502">502</option>
            <option value="504">504</option>
            <option value="401">401</option>
            <option value="403">403</option>
          </select>

          <select
            value={retryableFilter}
            onChange={(e) => setRetryableFilter(e.target.value as RetryableFilter)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="all">Retryable: все</option>
            <option value="true">Только retryable</option>
            <option value="false">Только non-retryable</option>
          </select>

          <label className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700">
            <input
              type="checkbox"
              checked={onlyUnresolved}
              onChange={(e) => setOnlyUnresolved(e.target.checked)}
            />
            Только не обработанные
          </label>

          <button
            onClick={() => fetchAll(false)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50"
            disabled={refreshing}
          >
            {refreshing ? 'Обновление...' : 'Обновить'}
          </button>
        </div>

        {loading ? (
          <div className="py-6 text-sm text-gray-500">Загрузка...</div>
        ) : items.length === 0 ? (
          <div className="py-6 text-sm text-gray-500">Событий не найдено</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="py-2 pr-3">Время</th>
                  <th className="py-2 pr-3">Код</th>
                  <th className="py-2 pr-3">Сообщение</th>
                  <th className="py-2 pr-3">Контекст</th>
                  <th className="py-2 pr-3">Статус</th>
                  <th className="py-2 pr-3">Trace</th>
                  <th className="py-2 pr-3">Состояние</th>
                  <th className="py-2">Действие</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isResolved = Boolean(item.resolved_at)
                  return (
                    <tr key={item.id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">{formatDate(item.created_at)}</td>
                      <td className="py-2 pr-3 font-semibold text-gray-900">{item.code}</td>
                      <td className="py-2 pr-3 text-gray-700 max-w-xl">
                        <div>{item.message}</div>
                        {item.details ? (
                          <details className="mt-1 text-xs text-gray-500">
                            <summary className="cursor-pointer">Детали</summary>
                            <pre className="mt-1 whitespace-pre-wrap break-words">
                              {JSON.stringify(item.details, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 text-gray-600">
                        <div>{item.method || '—'} {item.path || ''}</div>
                        <div className="mt-1">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${retryTone(item.retryable)}`}>
                            {item.retryable ? 'retryable' : 'no-retry'}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusTone(item.status_code)}`}>
                          {item.status_code}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-gray-600">{item.trace_id}</td>
                      <td className="py-2 pr-3 text-xs text-gray-600">
                        {isResolved ? (
                          <>
                            <div className="text-emerald-700 font-medium">Обработано</div>
                            <div>{formatDate(item.resolved_at)}</div>
                            <div>{item.resolved_by_username || (item.resolved_by ? `user#${item.resolved_by}` : '—')}</div>
                          </>
                        ) : (
                          <span className="text-rose-700 font-medium">Открыто</span>
                        )}
                      </td>
                      <td className="py-2">
                        <button
                          disabled={isResolved}
                          onClick={() => resolveError(item.id)}
                          className="px-3 py-1 rounded-md border border-gray-300 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isResolved ? 'Обработано' : 'Закрыть'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone = 'text-gray-900',
}: {
  label: string
  value: number
  tone?: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  )
}
