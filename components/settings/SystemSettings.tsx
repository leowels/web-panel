'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function SystemSettings() {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [loading, setLoading] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [testingAI, setTestingAI] = useState(false)
  const [testResult, setTestResult] = useState<{
    status: string
    message: string
    provider?: string
    test_response?: string
    configured?: boolean
    error?: string | string[]
    config_info?: any
    details?: string[]
  } | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})

  useEffect(() => {
    if (token) {
      fetchSettings()
    }
  }, [token])

  const fetchSettings = async () => {
    if (!token) return
    try {
      const response = await axios.get(`${API_URL}/api/settings/system`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      })
      setSettings(response.data)
    } catch (error: any) {
      addNotification('Ошибка загрузки настроек', 'error')
    }
  }

  const handleSaveSetting = async (key: string, value: string) => {
    if (!token) return
    setSavingKey(key)
    try {
      await axios.put(
        `${API_URL}/api/settings/system/${key}`,
        { value },
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000
        }
      )
      setSettings({ ...settings, [key]: value })
      addNotification('Настройка успешно сохранена', 'success')
      // Очищаем результат теста при изменении настроек
      setTestResult(null)
    } catch (error: any) {
      let errorMessage = 'Ошибка сохранения настройки'
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail
      }
      addNotification(errorMessage, 'error')
    } finally {
      setSavingKey(null)
    }
  }

  const handleTestAI = async () => {
    if (!token) return
    setTestingAI(true)
    setTestResult(null)
    try {
      const response = await axios.get(
        `${API_URL}/api/ai/test`,
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 30000
        }
      )
      setTestResult(response.data)
      if (response.data.status === 'success') {
        addNotification('AI успешно подключен и работает!', 'success')
      } else {
        addNotification(response.data.message || 'Ошибка подключения к AI', 'error')
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.detail || 'Ошибка при тестировании AI'
      setTestResult({
        status: 'error',
        message: errorMessage
      })
      addNotification(errorMessage, 'error')
    } finally {
      setTestingAI(false)
    }
  }

  const systemSettings = [
    { 
      key: 'ai_provider', 
      label: 'AI Провайдер', 
      type: 'select', 
      description: 'Выберите провайдера AI',
      options: [
        { value: 'openai', label: 'OpenAI' },
        { value: 'timeweb', label: 'Timeweb Cloud AI' }
      ]
    },
    { 
      key: 'ai_api_key', 
      label: 'AI API Ключ', 
      type: 'password', 
      description: 'API ключ для работы с ИИ (OpenAI или Timeweb Cloud)' 
    },
    { 
      key: 'ai_base_url', 
      label: 'AI Base URL (OpenAI URL)', 
      type: 'text', 
      description: 'URL из раздела "OpenAI URL" в настройках агента Timeweb Cloud. Обязательно для Timeweb Cloud агентов!' 
    },
    { 
      key: 'ai_agent_access_id', 
      label: 'Timeweb Agent Access ID (опционально)', 
      type: 'text', 
      description: 'Access ID агента (для справки, не используется в OpenAI-совместимом API)' 
    },
    { 
      key: 'ai_model', 
      label: 'AI Модель', 
      type: 'text', 
      description: 'Название модели для OpenAI-совместимого API (например: gpt-3.5-turbo, gpt-4). Для агентов не используется.' 
    },
    { key: 'pto_reminder_days', label: 'Напоминание о ПТО (дней)', type: 'number', description: 'За сколько дней напоминать о ПТО' },
    { key: 'cto_reminder_days', label: 'Напоминание о ЧТО (дней)', type: 'number', description: 'За сколько дней напоминать о ЧТО' },
  ]

  // Группируем настройки
  const aiSettings = systemSettings.filter(s => s.key.startsWith('ai_'))
  const otherSettings = systemSettings.filter(s => !s.key.startsWith('ai_'))

  return (
    <div className="space-y-8">
      {/* AI Конфигурация */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold text-gray-900">AI Конфигурация</h2>
          <button
            onClick={handleTestAI}
            disabled={testingAI}
            className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 disabled:opacity-50 font-semibold shadow-soft hover:shadow-medium transition-all duration-200 flex items-center space-x-2"
          >
            {testingAI ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Тестирование...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Проверить подключение</span>
              </>
            )}
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-6 font-medium">
          Настройте провайдера AI для генерации нарушений, актов и поиска в базе знаний
        </p>
        
        {/* Результат теста */}
        {testResult && (
          <div className={`mb-6 p-4 rounded-lg border-2 ${
            testResult.status === 'success' 
              ? 'bg-green-50 border-green-200' 
              : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-start space-x-3">
              {testResult.status === 'success' ? (
                <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <div className="flex-1">
                <p className={`font-semibold ${
                  testResult.status === 'success' ? 'text-green-800' : 'text-red-800'
                }`}>
                  {testResult.status === 'success' ? '✓ Подключение успешно' : '✗ Ошибка подключения'}
                </p>
                <p className={`text-sm mt-1 ${
                  testResult.status === 'success' ? 'text-green-700' : 'text-red-700'
                }`}>
                  {testResult.message}
                </p>
                {testResult.provider && (
                  <p className="text-xs mt-1 text-gray-600">
                    Провайдер: <span className="font-semibold">{testResult.provider}</span>
                  </p>
                )}
                {testResult.status === 'success' && 'test_response' in testResult && (
                  <p className="text-xs mt-2 text-gray-600 italic">
                    Тестовый ответ: "{testResult.test_response}"
                  </p>
                )}
                {testResult.status === 'error' && testResult.details && (
                  <div className="mt-3 p-3 bg-white rounded border border-gray-300">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Детали ошибки:</p>
                    <ul className="text-xs text-gray-600 space-y-1">
                      {testResult.details.map((detail, idx) => (
                        <li key={idx} className="font-mono">{detail}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {testResult.config_info && (
                  <div className="mt-3 p-3 bg-white rounded border border-gray-300">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Информация о настройках:</p>
                    <ul className="text-xs text-gray-600 space-y-1">
                      <li>API ключ: {testResult.config_info.has_api_key ? `✓ (${testResult.config_info.api_key_length} символов)` : '✗ не указан'}</li>
                      {testResult.config_info.has_agent_access_id !== undefined && (
                        <li>Agent Access ID: {testResult.config_info.has_agent_access_id ? `✓ (${testResult.config_info.agent_access_id_length} символов)` : '✗ не указан'}</li>
                      )}
                      {testResult.config_info.uses_agent_api !== undefined && (
                        <li>Режим: {testResult.config_info.uses_agent_api ? 'API агента' : 'OpenAI-совместимый API'}</li>
                      )}
                      {testResult.config_info.base_url && (
                        <li>Base URL: {testResult.config_info.base_url}</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        <div className="bg-gradient-to-r from-gray-50 to-white rounded-xl p-6 border border-gray-200 space-y-6">
          {aiSettings.map((setting) => (
            <div key={setting.key} className="border-b border-gray-200 pb-4 last:border-0">
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                {setting.label}
              </label>
              <p className="text-xs text-gray-600 mb-3 font-medium">{setting.description}</p>
              <div className="flex space-x-2">
                {setting.type === 'select' ? (
                  <select
                    value={settings[setting.key] || ''}
                    onChange={(e) => setSettings({ ...settings, [setting.key]: e.target.value })}
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium transition-all"
                  >
                    <option value="">Выберите...</option>
                    {setting.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={setting.type}
                    value={settings[setting.key] || ''}
                    onChange={(e) => setSettings({ ...settings, [setting.key]: e.target.value })}
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium transition-all"
                    placeholder={setting.description}
                  />
                )}
                <button
                  onClick={() => handleSaveSetting(setting.key, settings[setting.key] || '')}
                  disabled={savingKey === setting.key}
                  className="px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg hover:from-primary-700 hover:to-primary-800 disabled:opacity-50 font-semibold shadow-soft hover:shadow-medium transition-all duration-200 flex items-center"
                >
                  {savingKey === setting.key ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Сохранение...
                    </>
                  ) : (
                    'Сохранить'
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Другие настройки */}
      {otherSettings.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Другие настройки</h2>
          <div className="bg-white rounded-xl p-6 border border-gray-200 space-y-6">
            {otherSettings.map((setting) => (
              <div key={setting.key} className="border-b border-gray-200 pb-4 last:border-0">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  {setting.label}
                </label>
                <p className="text-xs text-gray-600 mb-3 font-medium">{setting.description}</p>
                <div className="flex space-x-2">
                  <input
                    type={setting.type}
                    value={settings[setting.key] || ''}
                    onChange={(e) => setSettings({ ...settings, [setting.key]: e.target.value })}
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium transition-all"
                    placeholder={setting.description}
                  />
                  <button
                    onClick={() => handleSaveSetting(setting.key, settings[setting.key] || '')}
                    disabled={savingKey === setting.key}
                    className="px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg hover:from-primary-700 hover:to-primary-800 disabled:opacity-50 font-semibold shadow-soft hover:shadow-medium transition-all duration-200"
                  >
                    {savingKey === setting.key ? 'Сохранение...' : 'Сохранить'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

