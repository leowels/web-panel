'use client'

import { useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

interface AIPanelProps {
  onClose: () => void
  onPaste?: (text: string) => void
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function AIPanel({ onClose, onPaste }: AIPanelProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [prompt, setPrompt] = useState('')
  const [context, setContext] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleGenerate = async () => {
    if (!prompt.trim()) return

    setLoading(true)
    setError('')
    setResult('')

    try {
      const response = await axios.post(
        `${API_URL}/api/ai/generate`,
        { prompt, context: context || undefined },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      setResult(response.data.result)
      addNotification('Текст успешно сгенерирован', 'success')
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Ошибка генерации'
      setError(errorMsg)
      addNotification(errorMsg, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result)
      addNotification('Текст скопирован в буфер обмена', 'success')
    }
  }

  const handlePasteToEditor = () => {
    if (result && onPaste) {
      onPaste(result)
      addNotification('Текст вставлен в редактор', 'success')
    }
  }

  const quickPrompts = [
    'Создать шаблон отчета',
    'Проверить документ на соответствие требованиям',
    'Сгенерировать техническое описание',
    'Составить протокол совещания',
  ]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-2xl font-semibold text-gray-900">ИИ Помощник</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Контекст (опционально)
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Добавьте контекст для более точного ответа..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Запрос
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Опишите, что вам нужно..."
            />
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Быстрые запросы:</p>
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
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {result && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Результат:
                </label>
                <div className="flex space-x-2">
                  <button
                    onClick={handleCopy}
                    className="text-sm text-primary-600 hover:text-primary-700 flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Копировать
                  </button>
                  {onPaste && (
                    <button
                      onClick={handlePasteToEditor}
                      className="text-sm text-primary-600 hover:text-primary-700 flex items-center"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      Вставить
                    </button>
                  )}
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 whitespace-pre-wrap max-h-96 overflow-y-auto">
                {result}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex space-x-3">
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="flex-1 bg-primary-600 text-white py-2 px-4 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Генерация...
              </span>
            ) : (
              'Сгенерировать'
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
  )
}

