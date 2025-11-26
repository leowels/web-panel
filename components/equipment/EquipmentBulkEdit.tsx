'use client'

import { useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { EQUIPMENT_TYPES } from '@/constants/equipmentTypes'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface EquipmentBulkEditProps {
  selectedIds: number[]
  onClose: () => void
  onSuccess: () => void
}

export default function EquipmentBulkEdit({ selectedIds, onClose, onSuccess }: EquipmentBulkEditProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [loading, setLoading] = useState(false)
  const [updateData, setUpdateData] = useState({
    equipment_type: '',
    workshop: '',
    status: '',
    manufacturer: '',
    installation_location: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      addNotification('Ошибка авторизации', 'error')
      return
    }

    // Фильтруем только заполненные поля
    const dataToUpdate: any = {}
    if (updateData.equipment_type) dataToUpdate.equipment_type = updateData.equipment_type
    if (updateData.workshop) dataToUpdate.workshop = updateData.workshop
    if (updateData.status) dataToUpdate.status = updateData.status
    if (updateData.manufacturer) dataToUpdate.manufacturer = updateData.manufacturer
    if (updateData.installation_location) dataToUpdate.installation_location = updateData.installation_location

    if (Object.keys(dataToUpdate).length === 0) {
      addNotification('Выберите хотя бы одно поле для обновления', 'error')
      return
    }

    setLoading(true)
    try {
      const response = await axios.put(
        `${API_URL}/api/equipment/bulk/update`,
        {
          equipment_ids: selectedIds,
          update_data: dataToUpdate,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      const { updated, errors } = response.data
      if (errors && errors.length > 0) {
        addNotification(`Обновлено: ${updated}, ошибок: ${errors.length}`, 'warning')
        errors.forEach((err: any) => {
          console.warn('Ошибка обновления:', err)
        })
      } else {
        addNotification(`Успешно обновлено ${updated} записей`, 'success')
      }
      onSuccess()
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка массового обновления', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-strong max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200">
        <div className="p-6 border-b border-gray-300 bg-gradient-to-r from-gray-50 to-white flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Массовое редактирование</h2>
            <p className="text-sm text-gray-500 mt-1">Выбрано записей: {selectedIds.length}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-2 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Внимание:</strong> Заполните только те поля, которые хотите обновить. Пустые поля останутся без изменений.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Тип ПС
              </label>
              <select
                value={updateData.equipment_type}
                onChange={(e) => setUpdateData({ ...updateData, equipment_type: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium"
              >
                <option value="">Не изменять</option>
                {EQUIPMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Статус
              </label>
              <select
                value={updateData.status}
                onChange={(e) => setUpdateData({ ...updateData, status: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium"
              >
                <option value="">Не изменять</option>
                <option value="active">Активно</option>
                <option value="inactive">Неактивно</option>
                <option value="archived">Архив</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Цех
              </label>
              <input
                type="text"
                value={updateData.workshop}
                onChange={(e) => setUpdateData({ ...updateData, workshop: e.target.value })}
                placeholder="Оставьте пустым, чтобы не изменять"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Завод-изготовитель
              </label>
              <input
                type="text"
                value={updateData.manufacturer}
                onChange={(e) => setUpdateData({ ...updateData, manufacturer: e.target.value })}
                placeholder="Оставьте пустым, чтобы не изменять"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Место установки
              </label>
              <input
                type="text"
                value={updateData.installation_location}
                onChange={(e) => setUpdateData({ ...updateData, installation_location: e.target.value })}
                placeholder="Оставьте пустым, чтобы не изменять"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold transition-all"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 border border-transparent text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 rounded-lg font-semibold shadow-soft hover:shadow-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Обновление...
                </span>
              ) : (
                `Обновить ${selectedIds.length} записей`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


