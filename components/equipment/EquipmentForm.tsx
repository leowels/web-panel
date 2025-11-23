'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface EquipmentFormProps {
  equipmentId: number | null
  onClose: () => void
  onSuccess: () => void
}

export default function EquipmentForm({ equipmentId, onClose, onSuccess }: EquipmentFormProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    equipment_type: '',
    passport_number: '',
    load_capacity: '',
    manufacturer: '',
    installation_date: '',
    pto_date: '',
    cto_date: '',
    installation_location: '',
    status: 'active',
  })

  useEffect(() => {
    if (equipmentId) {
      fetchEquipment()
    }
  }, [equipmentId])

  const fetchEquipment = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/equipment/${equipmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const eq = response.data
      setFormData({
        equipment_type: eq.equipment_type || '',
        passport_number: eq.passport_number || '',
        load_capacity: eq.load_capacity ? String(eq.load_capacity) : '',
        manufacturer: eq.manufacturer || '',
        installation_date: eq.installation_date ? eq.installation_date.split('T')[0] : '',
        pto_date: eq.pto_date ? eq.pto_date.split('T')[0] : '',
        cto_date: eq.cto_date ? eq.cto_date.split('T')[0] : '',
        installation_location: eq.installation_location || '',
        status: eq.status || 'active',
      })
    } catch (error: any) {
      addNotification('Ошибка загрузки оборудования', 'error')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!token) {
      addNotification('Ошибка: не авторизован', 'error')
      return
    }
    
    setLoading(true)

    try {
      // Преобразуем даты в ISO формат (YYYY-MM-DDTHH:mm:ss)
      const formatDate = (dateStr: string | null): string | null => {
        if (!dateStr) return null
        // Если дата уже в формате YYYY-MM-DD, добавляем время
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          return `${dateStr}T00:00:00`
        }
        return dateStr
      }

      const submitData: any = {
        equipment_type: formData.equipment_type,
        passport_number: formData.passport_number,
        load_capacity: formData.load_capacity ? parseFloat(formData.load_capacity) : null,
        manufacturer: formData.manufacturer || null,
        installation_date: formatDate(formData.installation_date),
        pto_date: formatDate(formData.pto_date),
        cto_date: formatDate(formData.cto_date),
        installation_location: formData.installation_location || null,
      }

      if (equipmentId) {
        submitData.status = formData.status
        const response = await axios.put(
          `${API_URL}/api/equipment/${equipmentId}`,
          submitData,
          { 
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000 // 10 секунд таймаут
          }
        )
        addNotification('Оборудование успешно обновлено', 'success')
        onSuccess()
      } else {
        const response = await axios.post(
          `${API_URL}/api/equipment`,
          submitData,
          { 
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000 // 10 секунд таймаут
          }
        )
        addNotification('Оборудование успешно создано', 'success')
        onSuccess()
      }
    } catch (error: any) {
      console.error('Error saving equipment:', error)
      let errorMessage = 'Ошибка сохранения'
      
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail
        // Если detail - массив ошибок валидации
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
      setLoading(false) // Сбрасываем loading при ошибке
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-strong max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200">
        <div className="p-6 border-b border-gray-300 bg-gradient-to-r from-gray-50 to-white flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {equipmentId ? 'Редактировать оборудование' : 'Добавить оборудование'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">Заполните все необходимые поля</p>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Тип ПС <span className="text-accent-600">*</span>
              </label>
              <select
                required
                value={formData.equipment_type}
                onChange={(e) => setFormData({ ...formData, equipment_type: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium transition-all"
              >
                <option value="">Выберите тип</option>
                <option value="Кран">Кран</option>
                <option value="Подъемник">Подъемник</option>
                <option value="Лифт">Лифт</option>
                <option value="Эскалатор">Эскалатор</option>
                <option value="Другое">Другое</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Номер паспорта <span className="text-accent-600">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.passport_number}
                onChange={(e) => setFormData({ ...formData, passport_number: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Грузоподъемность (т)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.load_capacity}
                onChange={(e) => setFormData({ ...formData, load_capacity: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Завод-изготовитель
              </label>
              <input
                type="text"
                value={formData.manufacturer}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Дата ввода в эксплуатацию
              </label>
              <input
                type="date"
                value={formData.installation_date}
                onChange={(e) => setFormData({ ...formData, installation_date: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Дата ПТО
              </label>
              <input
                type="date"
                value={formData.pto_date}
                onChange={(e) => setFormData({ ...formData, pto_date: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Дата ЧТО
              </label>
              <input
                type="date"
                value={formData.cto_date}
                onChange={(e) => setFormData({ ...formData, cto_date: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Статус
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium transition-all"
              >
                <option value="active">Активно</option>
                <option value="inactive">Неактивно</option>
                <option value="archived">Архив</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Место установки
            </label>
            <input
              type="text"
              value={formData.installation_location}
              onChange={(e) => setFormData({ ...formData, installation_location: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium transition-all"
              placeholder="Адрес или место установки"
            />
          </div>

          <div className="flex space-x-3 pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-gradient-to-r from-primary-600 to-primary-700 text-white py-3 px-6 rounded-lg hover:from-primary-700 hover:to-primary-800 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-soft hover:shadow-medium transition-all duration-200 flex items-center justify-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Сохранение...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Сохранить
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 font-semibold transition-all duration-200"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

