'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

const API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || ''
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface AIPanelProps {
  theme: 'light' | 'dark'
}

interface SuggestionItem {
  text: string
  actionLabel?: string
  actionHref?: string
  level?: 'info' | 'warning' | 'danger'
}

interface KnowledgeItem {
  id: number
  document_type: string
}

interface EquipmentItem {
  id: number
  passport_number?: string | null
  equipment_type?: string | null
  pto_date?: string | null
  cto_date?: string | null
}

interface ViolationItem {
  id: number
  equipment_id: number
  status: string
  severity: string
  violation_type?: string | null
  description?: string | null
  deadline?: string | null
}

type ActionKind = 'plan' | 'report' | 'checklist'

interface ActionResult {
  title: string
  content: string
}

export default function AIPanel({ theme }: AIPanelProps) {
  const router = useRouter()
  const { token } = useAuthStore()

  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])
  const [knowledgeStats, setKnowledgeStats] = useState({
    total: 0,
    fnp: 0,
    gost: 0,
    manual: 0,
    other: 0,
  })

  const [violationsData, setViolationsData] = useState<ViolationItem[]>([])
  const [actionLoading, setActionLoading] = useState<ActionKind | null>(null)
  const [actionError, setActionError] = useState('')
  const [actionResult, setActionResult] = useState<ActionResult | null>(null)

  const openViolations = useMemo(
    () => violationsData.filter((v) => v.status === 'open'),
    [violationsData]
  )

  const criticalOpenCount = useMemo(
    () => openViolations.filter((v) => v.severity === 'critical').length,
    [openViolations]
  )

  const fetchAISuggestions = async () => {
    if (!token) return
    setLoading(true)
    setActionError('')

    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [equipmentResponse, violationsResponse, knowledgeResponse] = await Promise.all([
        axios.get(`${API_URL}/api/equipment?limit=1000`, { headers }),
        axios.get(`${API_URL}/api/violations?limit=1000`, { headers }),
        axios.get(`${API_URL}/api/knowledge?limit=1000`, { headers }),
      ])

      const equipment = Array.isArray(equipmentResponse.data)
        ? (equipmentResponse.data as EquipmentItem[])
        : []
      const violations = Array.isArray(violationsResponse.data)
        ? (violationsResponse.data as ViolationItem[])
        : []
      const knowledge = Array.isArray(knowledgeResponse.data)
        ? (knowledgeResponse.data as KnowledgeItem[])
        : []

      setViolationsData(violations)

      const now = new Date()
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

      const criticalOpen = violations.filter((v) => v.status === 'open' && v.severity === 'critical').length
      const openTotal = violations.filter((v) => v.status === 'open').length

      const expiringChecks = equipment.filter((eq) => {
        const pto = eq.pto_date ? new Date(eq.pto_date) : null
        const cto = eq.cto_date ? new Date(eq.cto_date) : null
        const ptoWarn = pto && pto >= now && pto <= in30Days
        const ctoWarn = cto && cto >= now && cto <= in30Days
        return Boolean(ptoWarn || ctoWarn)
      }).length

      const stats = {
        total: knowledge.length,
        fnp: knowledge.filter((k) => k.document_type === 'fnp461').length,
        gost: knowledge.filter((k) => k.document_type === 'gost').length,
        manual: knowledge.filter((k) => k.document_type === 'manual').length,
        other: knowledge.filter((k) => k.document_type === 'other').length,
      }
      setKnowledgeStats(stats)

      const nextSuggestions: SuggestionItem[] = []

      if (stats.total === 0) {
        nextSuggestions.push({
          text: 'База знаний пуста. ИИ при создании нарушений работает без нормативного контекста.',
          actionLabel: 'Открыть базу знаний',
          actionHref: '/knowledge',
          level: 'danger',
        })
      } else if (stats.fnp + stats.gost === 0) {
        nextSuggestions.push({
          text: 'В базе знаний нет документов ФНП/ГОСТ. Добавьте профильные нормативы для точной генерации.',
          actionLabel: 'Добавить документы',
          actionHref: '/knowledge',
          level: 'warning',
        })
      } else {
        nextSuggestions.push({
          text: `База знаний активна: ${stats.total} док., ФНП/ГОСТ: ${stats.fnp + stats.gost}.`,
          actionLabel: 'Проверить документы',
          actionHref: '/knowledge',
          level: 'info',
        })
      }

      if (criticalOpen > 0) {
        nextSuggestions.push({
          text: `Есть ${criticalOpen} критических открытых нарушений. Нужна приоритизация закрытия.`,
          actionLabel: 'Открыть нарушения',
          actionHref: '/violations?severity=critical&status=open',
          level: 'danger',
        })
      } else if (openTotal > 0) {
        nextSuggestions.push({
          text: `Открытых нарушений: ${openTotal}. Проверьте сроки устранения и ответственных.`,
          actionLabel: 'Открыть список',
          actionHref: '/violations?status=open',
          level: 'warning',
        })
      }

      if (expiringChecks > 0) {
        nextSuggestions.push({
          text: `У ${expiringChecks} единиц оборудования ПТО/ЧТО в ближайшие 30 дней.`,
          actionLabel: 'Проверить оборудование',
          actionHref: '/equipment',
          level: 'warning',
        })
      }

      if (nextSuggestions.length === 0) {
        nextSuggestions.push({
          text: 'Критичных отклонений не найдено. Поддерживайте актуальность базы знаний и плановых проверок.',
          level: 'info',
        })
      }

      setSuggestions(nextSuggestions)
    } catch {
      setSuggestions([
        {
          text: 'Не удалось загрузить рекомендации. Проверьте доступ к API и авторизацию.',
          level: 'danger',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAISuggestions()
  }, [token])

  const levelClass = (level?: SuggestionItem['level']) => {
    if (level === 'danger') {
      return theme === 'dark' ? 'border-red-400/30 bg-red-900/20' : 'border-red-200 bg-red-50'
    }
    if (level === 'warning') {
      return theme === 'dark' ? 'border-amber-400/30 bg-amber-900/20' : 'border-amber-200 bg-amber-50'
    }
    return theme === 'dark' ? 'border-blue-400/30 bg-blue-900/20' : 'border-blue-200 bg-blue-50'
  }

  const toYMD = (date: Date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const generateViaAI = async (title: string, prompt: string, maxTokens = 1400) => {
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }
    const response = await axios.post(
      `${API_URL}/api/ai/generate`,
      {
        prompt,
        context: 'Источник: дашборд InspectorHub',
        max_tokens: maxTokens,
        temperature: 0.3,
      },
      { headers }
    )
    const content = response.data?.result || 'Ответ не получен.'
    setActionResult({ title, content })
  }

  const runAction = async (kind: ActionKind) => {
    if (!token) return
    setActionLoading(kind)
    setActionError('')

    try {
      if (kind === 'plan') {
        const topOpen = openViolations.slice(0, 8)
        const rows = topOpen
          .map((v, i) => `${i + 1}. #${v.id}, severity=${v.severity}, deadline=${v.deadline || 'нет'}, type=${v.violation_type || 'не указан'}`)
          .join('\n')

        const prompt = `Сформируй практичный план устранения нарушений для смены.
Статистика: открытых=${openViolations.length}, критических=${criticalOpenCount}.
Нарушения:
${rows || 'нет данных'}

Требования:
- Ответ на русском языке.
- Формат: 1) Приоритеты на 24 часа, 2) План на 7 дней, 3) Ответственные роли, 4) Контрольные точки, 5) Риски с мерами.
- Коротко и по делу.`

        await generateViaAI('План устранения нарушений', prompt, 1800)
      }

      if (kind === 'report') {
        const headers = { Authorization: `Bearer ${token}` }
        const dateTo = new Date()
        const dateFrom = new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000)

        const response = await axios.post(
          `${API_URL}/api/reports/ai-draft`,
          {
            type: 'violation_summary',
            date_from: toYMD(dateFrom),
            date_to: toYMD(dateTo),
            parameters: {
              source: 'dashboard_ai_assistant',
            },
          },
          { headers }
        )

        const content = response.data?.content || 'Черновик отчета не получен.'
        setActionResult({ title: 'Черновик отчета по нарушениям', content })
      }

      if (kind === 'checklist') {
        const prompt = `Сформируй список контрольных вопросов для инспектора.
Контекст: открытых нарушений=${openViolations.length}, критических=${criticalOpenCount}, документов ФНП/ГОСТ=${knowledgeStats.fnp + knowledgeStats.gost}.

Требования:
- Русский язык.
- 15 вопросов максимум.
- Разделы: Документы, Оборудование, Безопасность, Сроки устранения.
- Каждый вопрос должен быть проверяемым на месте.`

        await generateViaAI('Контрольные вопросы инспектора', prompt, 1200)
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setActionError(typeof detail === 'string' ? detail : 'Не удалось выполнить действие AI.')
    } finally {
      setActionLoading(null)
    }
  }

  const copyResult = async () => {
    if (!actionResult?.content) return
    try {
      await navigator.clipboard.writeText(actionResult.content)
    } catch {
      setActionError('Не удалось скопировать текст в буфер обмена.')
    }
  }

  return (
    <div className={`rounded-lg shadow-lg p-6 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          AI-инспектор 2.0
        </h2>
        <button
          onClick={fetchAISuggestions}
          disabled={loading}
          className={`text-sm px-3 py-1 rounded ${theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700'} hover:bg-gray-300 disabled:opacity-50`}
        >
          {loading ? '...' : 'Обновить'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
        <div className={`rounded p-2 ${theme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
          Документы: <span className="font-semibold">{knowledgeStats.total}</span>
        </div>
        <div className={`rounded p-2 ${theme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
          ФНП/ГОСТ: <span className="font-semibold">{knowledgeStats.fnp + knowledgeStats.gost}</span>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-gray-200 p-3">
        <div className={`text-sm font-semibold mb-2 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
          Действия
        </div>
        <div className="grid grid-cols-1 gap-2">
          <button
            onClick={() => runAction('plan')}
            disabled={!token || actionLoading !== null}
            className="text-left px-3 py-2 rounded-md border border-blue-200 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
          >
            Создать план устранения
          </button>
          <button
            onClick={() => runAction('report')}
            disabled={!token || actionLoading !== null}
            className="text-left px-3 py-2 rounded-md border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
          >
            Подготовить отчёт
          </button>
          <button
            onClick={() => runAction('checklist')}
            disabled={!token || actionLoading !== null}
            className="text-left px-3 py-2 rounded-md border border-amber-200 bg-amber-50 hover:bg-amber-100 disabled:opacity-50"
          >
            Сформировать список контрольных вопросов
          </button>
        </div>
        {actionLoading && (
          <div className="mt-2 text-xs text-gray-500">Выполняется AI-действие...</div>
        )}
        {actionError && (
          <div className="mt-2 text-xs text-red-600">{actionError}</div>
        )}
      </div>

      {actionResult && (
        <div className={`mb-4 rounded-lg border p-3 ${theme === 'dark' ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {actionResult.title}
            </div>
            <div className="flex gap-2">
              <button onClick={copyResult} className="text-xs underline text-blue-600">Копировать</button>
              {actionResult.title.includes('отчета') && (
                <button onClick={() => router.push('/dashboard/reports')} className="text-xs underline text-blue-600">
                  В отчеты
                </button>
              )}
            </div>
          </div>
          <pre className={`whitespace-pre-wrap text-xs ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
            {actionResult.content}
          </pre>
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="animate-pulse space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`h-16 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded`}></div>
            ))}
          </div>
        ) : (
          suggestions.map((suggestion, index) => (
            <div key={index} className={`p-3 rounded-lg border ${levelClass(suggestion.level)}`}>
              <div className={`text-sm ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>{suggestion.text}</div>
              {suggestion.actionHref && suggestion.actionLabel && (
                <button
                  onClick={() => router.push(suggestion.actionHref!)}
                  className={`mt-2 text-xs font-medium underline ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}
                >
                  {suggestion.actionLabel}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
