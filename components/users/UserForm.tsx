'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface UserFormProps {
  userId: number | null
  onClose: () => void
  onSuccess: () => void
}

interface Role {
  id: number
  name: string
  description: string
}

export default function UserForm({ userId, onClose, onSuccess }: UserFormProps) {
  const { token, fetchUser: refreshUser } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [loading, setLoading] = useState(false)
  const [roles, setRoles] = useState<Role[]>([])
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    full_name: '',
    organization: '',
    signature: '',
    is_active: true,
    role_ids: [] as number[],
  })

  useEffect(() => {
    if (token) {
      fetchRoles()
      if (userId) {
        fetchUser()
      }
    } else {
      addNotification('Ошибка: не авторизован. Пожалуйста, войдите в систему.', 'error')
    }
  }, [userId, token])

  const fetchRoles = async () => {
    if (!token) return
    try {
      const response = await axios.get(`${API_URL}/api/users/roles/list`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      })
      setRoles(response.data)
    } catch (error: any) {
      if (error.response?.status === 401) {
        addNotification('Ошибка авторизации. Пожалуйста, войдите в систему заново.', 'error')
      } else {
        addNotification('Ошибка загрузки ролей', 'error')
      }
    }
  }

  const fetchUser = async () => {
    if (!token || !userId) return
    try {
      const response = await axios.get(`${API_URL}/api/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      })
      const user = response.data
      setFormData({
        username: user.username,
        email: user.email,
        password: '',
        full_name: user.full_name || '',
        organization: user.organization || '',
        signature: user.signature || '',
        is_active: user.is_active,
        role_ids: user.roles.map((r: any) => r.id),
      })
    } catch (error: any) {
      if (error.response?.status === 401) {
        addNotification('Ошибка авторизации. Пожалуйста, войдите в систему заново.', 'error')
      } else {
        addNotification('Ошибка загрузки пользователя', 'error')
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    if (!token) {
      addNotification('Ошибка: не авторизован. Пожалуйста, войдите в систему заново.', 'error')
      setLoading(false)
      return
    }

    try {
      if (userId) {
        await axios.put(
          `${API_URL}/api/users/${userId}`,
          { ...formData, password: formData.password || undefined },
          { 
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000
          }
        )
        addNotification('Пользователь успешно обновлен', 'success')
      } else {
        if (!formData.password) {
          addNotification('Пароль обязателен для нового пользователя', 'error')
          setLoading(false)
          return
        }
        const response = await axios.post(
          `${API_URL}/api/users`,
          formData,
          { 
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000
          }
        )
        addNotification('Пользователь успешно создан', 'success')
      }
      onSuccess()
    } catch (error: any) {
      console.error('Error saving user:', error)
      let errorMessage = 'Ошибка сохранения'
      
      if (error.response?.status === 401) {
        errorMessage = 'Ошибка авторизации. Пожалуйста, войдите в систему заново.'
      } else if (error.response?.data?.detail) {
        const detail = error.response.data.detail
        if (Array.isArray(detail)) {
          errorMessage = detail.map((err: any) => {
            if (typeof err === 'string') return err
            if (err.msg) return err.msg
            return JSON.stringify(err)
          }).join(', ')
        } else if (typeof detail === 'string') {
          errorMessage = detail
        } else {
          errorMessage = JSON.stringify(detail)
        }
      } else if (error.message) {
        errorMessage = error.message
      }
      
      addNotification(errorMessage, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-2xl font-semibold text-gray-900">
            {userId ? 'Редактировать пользователя' : 'Создать пользователя'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Имя пользователя *
              </label>
              <input
                type="text"
                required
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Пароль {userId ? '(оставьте пустым, чтобы не менять)' : '*'}
              </label>
              <input
                type="password"
                required={!userId}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Полное имя
              </label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Организация
              </label>
              <input
                type="text"
                value={formData.organization}
                onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Статус
              </label>
              <select
                value={String(formData.is_active)}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="true">Активен</option>
                <option value="false">Неактивен</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Подпись (для актов)
            </label>
            <textarea
              value={formData.signature}
              onChange={(e) => setFormData({ ...formData, signature: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="Подпись пользователя"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Роли
            </label>
            <div className="space-y-2">
              {roles.map((role) => (
                <label key={role.id} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.role_ids.includes(role.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, role_ids: [...formData.role_ids, role.id] })
                      } else {
                        setFormData({ ...formData, role_ids: formData.role_ids.filter(id => id !== role.id) })
                      }
                    }}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    {role.name} - {role.description}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-primary-600 text-white py-2 px-4 rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

