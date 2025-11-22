'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { format } from 'date-fns'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Equipment {
  id: number
  equipment_type: string
  passport_number: string
  load_capacity: number | null
  manufacturer: string | null
  installation_date: string | null
  pto_date: string | null
  cto_date: string | null
  installation_location: string | null
  status: string
  created_at: string
  updated_at: string
}

interface EquipmentTableProps {
  onEdit: (id: number) => void
  onView: (id: number) => void
  onViewHistory: (id: number) => void
}

export default function EquipmentTable({ onEdit, onView, onViewHistory }: EquipmentTableProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    fetchEquipment()
  }, [search, typeFilter, statusFilter])

  const fetchEquipment = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (typeFilter) params.append('equipment_type', typeFilter)
      if (statusFilter) params.append('status', statusFilter)
      
      const response = await axios.get(`${API_URL}/api/equipment?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setEquipment(response.data)
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка загрузки оборудования', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number, passportNumber: string) => {
    if (!confirm(`Удалить оборудование ${passportNumber}?`)) return

    try {
      await axios.delete(`${API_URL}/api/equipment/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      addNotification('Оборудование успешно удалено', 'success')
      fetchEquipment()
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка удаления', 'error')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'inactive':
        return 'bg-yellow-100 text-yellow-800'
      case 'archived':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-blue-100 text-blue-800'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Активно'
      case 'inactive':
        return 'Неактивно'
      case 'archived':
        return 'Архив'
      default:
        return status
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-soft border border-gray-200">
      <div className="p-6 border-b border-gray-300 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Поиск по паспорту, типу, месту установки..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2.5 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium transition-all"
            />
            <svg className="absolute left-3 top-3 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium transition-all"
          >
            <option value="">Все типы</option>
            <option value="Кран">Кран</option>
            <option value="Подъемник">Подъемник</option>
            <option value="Лифт">Лифт</option>
            <option value="Эскалатор">Эскалатор</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium transition-all"
          >
            <option value="">Все статусы</option>
            <option value="active">Активно</option>
            <option value="inactive">Неактивно</option>
            <option value="archived">Архив</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-200 border-t-primary-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-500 font-medium">Загрузка...</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Паспорт</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Тип ПС</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Грузоподъемность</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Место установки</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Статус</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Действия</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {equipment.map((eq) => (
                <tr key={eq.id} className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => onView(eq.id)}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-gray-900">{eq.passport_number}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{eq.equipment_type}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-600">
                    {eq.load_capacity ? `${eq.load_capacity} т` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-600">
                    {eq.installation_location || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(eq.status)}`}>
                      {getStatusText(eq.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => onViewHistory(eq.id)}
                        className="text-primary-600 hover:text-primary-800 hover:bg-primary-50 p-2 rounded-lg transition-all"
                        title="История"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onEdit(eq.id)}
                        className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded-lg transition-all"
                        title="Редактировать"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(eq.id, eq.passport_number)}
                        className="text-accent-600 hover:text-accent-800 hover:bg-accent-50 p-2 rounded-lg transition-all"
                        title="Удалить"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {equipment.length === 0 && (
            <div className="p-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p className="mt-4 text-sm font-semibold text-gray-500">Оборудование не найдено</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

