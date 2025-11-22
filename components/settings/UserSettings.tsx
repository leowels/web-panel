'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function UserSettings() {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [loading, setLoading] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [settings, setSettings] = useState({
    full_name: '',
    organization: '',
    signature: '',
  })
  const [password, setPassword] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  })

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/settings/user`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setSettings({
        full_name: response.data.full_name || '',
        organization: response.data.organization || '',
        signature: response.data.signature || '',
      })
    } catch (error: any) {
      addNotification('Ошибка загрузки настроек', 'error')
    }
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await axios.put(
        `${API_URL}/api/settings/user`,
        settings,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      addNotification('Настройки успешно сохранены', 'success')
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка сохранения', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (password.new_password !== password.confirm_password) {
      addNotification('Пароли не совпадают', 'error')
      return
    }

    setPasswordLoading(true)
    try {
      await axios.post(
        `${API_URL}/api/settings/user/change-password`,
        {
          old_password: password.old_password,
          new_password: password.new_password,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      addNotification('Пароль успешно изменен', 'success')
      setPassword({
        old_password: '',
        new_password: '',
        confirm_password: '',
      })
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка смены пароля', 'error')
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Личные данные</h2>
        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ФИО
            </label>
            <input
              type="text"
              value={settings.full_name}
              onChange={(e) => setSettings({ ...settings, full_name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Организация
            </label>
            <input
              type="text"
              value={settings.organization}
              onChange={(e) => setSettings({ ...settings, organization: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Подпись
            </label>
            <textarea
              value={settings.signature}
              onChange={(e) => setSettings({ ...settings, signature: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="Текст подписи для документов"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Сохранение...' : 'Сохранить'}
          </button>
        </form>
      </div>

      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Смена пароля</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Текущий пароль
            </label>
            <input
              type="password"
              required
              value={password.old_password}
              onChange={(e) => setPassword({ ...password, old_password: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Новый пароль
            </label>
            <input
              type="password"
              required
              value={password.new_password}
              onChange={(e) => setPassword({ ...password, new_password: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Подтверждение пароля
            </label>
            <input
              type="password"
              required
              value={password.confirm_password}
              onChange={(e) => setPassword({ ...password, confirm_password: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <button
            type="submit"
            disabled={passwordLoading}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {passwordLoading ? 'Изменение...' : 'Изменить пароль'}
          </button>
        </form>
      </div>
    </div>
  )
}

