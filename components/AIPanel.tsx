'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { useAIContextStore } from '@/store/aiContextStore'

interface AIPanelProps {
  onClose: () => void
  onPaste?: (text: string) => void
}

interface AIActionProposal {
  id: string
  title: string
  description?: string | null
  action_type: string
  endpoint: string
  method?: string
  payload: Record<string, any>
  warnings?: string[] | null
  meta?: Record<string, any> | null
}

const API_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_URL || '')
    : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

export default function AIPanel({ onClose }: AIPanelProps) {
  const { token, user } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { page, filters, selection, setPage } = useAIContextStore()
  const [prompt, setPrompt] = useState('')
  const [context, setContext] = useState('')
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [webFallback, setWebFallback] = useState<{ required: boolean; query?: string | null }>({
    required: false,
    query: null,
  })
  const [quickPrompts, setQuickPrompts] = useState<string[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsMeta, setSuggestionsMeta] = useState<string | null>(null)
  const [responseMode, setResponseMode] = useState<'brief' | 'detailed' | 'conclusions'>('brief')
  const [actionProposals, setActionProposals] = useState<AIActionProposal[]>([])
  const [actionsLoading, setActionsLoading] = useState(false)
  const [actionsError, setActionsError] = useState('')
  const [applyingActionId, setApplyingActionId] = useState<string | null>(null)

  const templates = [
    {
      label: 'Сформировать предписание',
      prompt: 'Сформируй предписание по выбранному объекту. Формат: основание, нарушения, требования, срок устранения.',
    },
    {
      label: 'Сводка по рискам',
      prompt: 'Сделай краткую сводку по рискам и проблемам по текущим данным.',
    },
  ]

  const isAllowed = useMemo(() => {
    const roles = user?.roles?.map((r) => r.name) || []
    return roles.includes('admin') || roles.includes('inspector')
  }, [user])

  useEffect(() => {
    const queryObj: Record<string, string> = {}
    searchParams?.forEach((value, key) => {
      queryObj[key] = value
    })
    setPage(pathname || '', queryObj)
  }, [pathname, searchParams, setPage])

  const contextText = useMemo(() => {
    const lines: string[] = []
    if (page?.path) {
      lines.push(`Текущая страница: ${page.path}`)
    }
    const queryEntries = Object.entries(page?.query || {}).filter(([, v]) => v !== undefined && v !== '')
    if (queryEntries.length) {
      lines.push(`Параметры: ${queryEntries.map(([k, v]) => `${k}=${v}`).join(', ')}`)
    }
    if (selection) {
      const label = selection.label ? ` (${selection.label})` : ''
      lines.push(`Выбранный объект: ${selection.type} #${selection.id}${label}`)
    }
    const filterEntries = Object.entries(filters || {}).filter(([, v]) => v !== undefined && v !== '' && v !== null)
    if (filterEntries.length) {
      lines.push(`Фильтры: ${filterEntries.map(([k, v]) => `${k}=${v}`).join(', ')}`)
    }
    return lines.join('\n')
  }, [page, filters, selection])

  const loadActionProposals = async () => {
    if (!isAllowed || !token) return
    setActionsLoading(true)
    setActionsError('')
    try {
      const response = await axios.post(
        `${API_URL}/api/ai/actions/suggest`,
        {
          selection,
          page: page?.path || null,
          filters,
          context: [contextText, context].filter(Boolean).join('\n'),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setActionProposals(response.data?.proposals || [])
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Ошибка загрузки предложений'
      setActionsError(errorMsg)
      setActionProposals([])
    } finally {
      setActionsLoading(false)
    }
  }

  const applyProposal = async (proposal: AIActionProposal) => {
    if (!isAllowed || !token) return
    setApplyingActionId(proposal.id)
    try {
      const response = await axios({
        method: proposal.method || 'post',
        url: `${API_URL}${proposal.endpoint}`,
        data: proposal.payload,
        headers: { Authorization: `Bearer ${token}` },
      })
      let message = 'Действие выполнено'
      let level: 'success' | 'warning' = 'success'
      if (proposal.action_type === 'create_task_from_violation') {
        if (response.data?.created) {
          message = `Задача #${response.data.task_id} создана`
          level = 'success'
        } else {
          message = `Использована существующая задача #${response.data.task_id}`
          level = 'warning'
        }
      }
      if (proposal.action_type === 'create_act_from_violation') {
        if (response.data?.created) {
          message = `Акт ${response.data.act_number} создан`
          level = 'success'
        } else {
          message = `Использован существующий акт ${response.data.act_number}`
          level = 'warning'
        }
      }
      addNotification(message, level)
      setActionProposals((prev) => prev.filter((item) => item.id !== proposal.id))
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Ошибка выполнения действия'
      addNotification(errorMsg, 'error')
    } finally {
      setApplyingActionId(null)
    }
  }

  const dismissProposal = (proposalId: string) => {
    setActionProposals((prev) => prev.filter((item) => item.id !== proposalId))
  }

  const handleSend = async () => {
    if (!prompt.trim() || !isAllowed) return

    const current = prompt.trim()
    setPrompt('')
    setLoading(true)
    setError('')
    setWebFallback({ required: false, query: null })
    setMessages((prev) => [...prev, { role: 'user', content: current }])

    try {
      const response = await axios.post(
        `${API_URL}/api/ai/chat`,
        {
          message: current,
          context: [contextText, context].filter(Boolean).join('\n'),
          history: messages.slice(-8),
          response_mode: responseMode,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const answer = response.data.answer || ''
      setMessages((prev) => [...prev, { role: 'assistant', content: answer }])
      if (response.data.web_fallback) {
        setWebFallback({ required: true, query: response.data.web_query || null })
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Ошибка чата'
      setError(errorMsg)
      addNotification(errorMsg, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAllowed || !token) return
    let active = true
    const loadSuggestions = async () => {
      setSuggestionsLoading(true)
      try {
        const response = await axios.get(`${API_URL}/api/ai/suggestions`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!active) return
        const suggestions = response.data?.suggestions || []
        setQuickPrompts(suggestions)
        if (response.data?.generated_at) {
          const ts = new Date(response.data.generated_at)
          setSuggestionsMeta(Number.isNaN(ts.getTime()) ? null : ts.toLocaleString('ru-RU'))
        }
      } catch {
        if (!active) return
        setQuickPrompts([
          'Сделай краткую сводку по текущим нарушениям',
          'Сводка по задачам в работе',
          'ПТО/ЧТО в ближайшие 30 дней',
          'Какие краны требуют внимания в первую очередь',
        ])
        setSuggestionsMeta(null)
      } finally {
        if (active) setSuggestionsLoading(false)
      }
    }
    loadSuggestions()
    return () => {
      active = false
    }
  }, [isAllowed, token])

  useEffect(() => {
    if (!isAllowed || !token) return
    loadActionProposals()
  }, [isAllowed, token])

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-2xl font-semibold text-gray-900">ИИ помощник</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          {!isAllowed && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded">
              Доступ к ИИ только для ролей `admin` и `inspector`.
            </div>
          )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Контекст (опционально)</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Добавьте контекст для более точного ответа..."
            />
          </div>
          {contextText && (
            <div className="text-xs text-gray-500 whitespace-pre-wrap border border-gray-200 rounded-lg p-2 bg-white">
              {contextText}
            </div>
          )}

          <div className="border border-gray-200 rounded-lg p-3 max-h-80 overflow-y-auto bg-gray-50 space-y-3">
            {messages.length === 0 && (
              <div className="text-sm text-gray-500">Задайте вопрос по актам, отчетам или базе знаний.</div>
            )}
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg ${m.role === 'user' ? 'bg-white border border-gray-200' : 'bg-blue-50 border border-blue-100'}`}
              >
                <div className="text-xs text-gray-500 mb-1">{m.role === 'user' ? 'Вы' : 'ИИ'}</div>
                <div className="text-sm whitespace-pre-wrap">{m.content}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-sm font-medium text-gray-700">Актуальные запросы по данным проекта</p>
              {suggestionsMeta && (
                <p className="text-xs text-gray-500">Обновлено: {suggestionsMeta}</p>
              )}
            </div>
            {suggestionsLoading ? (
              <div className="text-sm text-gray-500">Подбираем запросы по данным проекта...</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {quickPrompts.map((quickPrompt, index) => (
                  <button
                    key={index}
                    onClick={() => setPrompt(quickPrompt)}
                    className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    {quickPrompt}
                  </button>
                ))}
                {quickPrompts.length === 0 && (
                  <div className="text-sm text-gray-500">Нет актуальных предложений.</div>
                )}
              </div>
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-sm font-medium text-gray-700">Черновики действий</p>
              <button
                type="button"
                onClick={loadActionProposals}
                disabled={!isAllowed || actionsLoading}
                className="px-3 py-1 text-xs font-semibold rounded-lg border border-primary-200 text-primary-700 bg-primary-50 hover:bg-primary-100 disabled:opacity-50"
              >
                {actionsLoading ? 'Обновление...' : 'Подобрать'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              ИИ предлагает действия, но ничего не выполняется без подтверждения.
            </p>
            {actionsError && (
              <div className="mb-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">
                {actionsError}
              </div>
            )}
            {actionsLoading ? (
              <div className="text-sm text-gray-500">Формируем предложения по текущим данным...</div>
            ) : (
              <div className="space-y-2">
                {actionProposals.map((proposal) => (
                  <div key={proposal.id} className="border border-gray-200 rounded-lg p-3 bg-white">
                    <div className="text-sm font-semibold text-gray-900">{proposal.title}</div>
                    {proposal.description && (
                      <div className="text-xs text-gray-600 mt-1">{proposal.description}</div>
                    )}
                    {proposal.warnings && proposal.warnings.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {proposal.warnings.map((warning, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 text-[11px] rounded-full bg-amber-50 text-amber-700 border border-amber-200"
                          >
                            {warning}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => applyProposal(proposal)}
                        disabled={applyingActionId === proposal.id || !isAllowed}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        {applyingActionId === proposal.id ? 'Выполнение...' : 'Применить'}
                      </button>
                      <button
                        type="button"
                        onClick={() => dismissProposal(proposal.id)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        Скрыть
                      </button>
                    </div>
                  </div>
                ))}
                {actionProposals.length === 0 && (
                  <div className="text-sm text-gray-500">Нет предложений для текущего контекста.</div>
                )}
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Шаблоны</p>
            <div className="flex flex-wrap gap-2">
              {templates.map((tpl) => (
                <button
                  key={tpl.label}
                  onClick={() => setPrompt(tpl.prompt)}
                  className="px-3 py-1 text-sm bg-primary-50 text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {webFallback.required && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded">
              Внешний поиск недоступен или не дал результатов. Запрос: {webFallback.query || 'не указан'}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Запрос</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Опишите, что нужно..."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'brief', label: 'Кратко' },
              { id: 'detailed', label: 'С деталями' },
              { id: 'conclusions', label: 'Только выводы' },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setResponseMode(mode.id as 'brief' | 'detailed' | 'conclusions')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                  responseMode === mode.id
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleSend}
              disabled={loading || !prompt.trim() || !isAllowed}
              className="flex-1 bg-primary-600 text-white py-2 px-4 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Отправка...
                </span>
              ) : (
                'Отправить'
              )}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
