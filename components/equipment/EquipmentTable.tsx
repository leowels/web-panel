'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { EQUIPMENT_TYPES } from '@/constants/equipmentTypes'
import EquipmentBulkEdit from './EquipmentBulkEdit'
import EquipmentBulkDates from './EquipmentBulkDates'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface Equipment {
  id: number
  equipment_type: string
  passport_number: string
  inventory_number: string | null
  position: string | null
  workshop: string | null
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
  refreshKey?: number
}

export default function EquipmentTable({ onEdit, onView, onViewHistory, refreshKey = 0 }: EquipmentTableProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [workshopFilter, setWorkshopFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [showBulkDates, setShowBulkDates] = useState(false)

  useEffect(() => {
    fetchEquipment()
  }, [search, typeFilter, statusFilter, workshopFilter, refreshKey])

  const fetchEquipment = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (typeFilter) params.append('equipment_type', typeFilter)
      if (statusFilter) params.append('status', statusFilter)
      if (workshopFilter) params.append('workshop', workshopFilter)
      
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

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(equipment.map(eq => eq.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectOne = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(selectedId => selectedId !== id)
        : [...prev, id]
    )
  }

  const handleBulkSuccess = () => {
    setSelectedIds([])
    setShowBulkEdit(false)
    setShowBulkDates(false)
    fetchEquipment()
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
      {/* Поиск вынесен наверх для лучшей видимости */}
      <div className="p-6 border-b border-gray-300 bg-gradient-to-r from-primary-50 to-white">
        <div className="relative mb-4">
          <input
            type="text"
            placeholder="🔍 Поиск по паспорту, типу, месту установки, цеху, позиции..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-5 py-4 pl-14 pr-12 text-lg border-2 border-primary-300 rounded-xl focus:ring-4 focus:ring-primary-200 focus:border-primary-600 bg-white text-gray-900 font-semibold shadow-md transition-all placeholder:text-gray-400 placeholder:font-normal"
            style={{ fontSize: '16px', lineHeight: '1.5' }}
          />
          <svg className="absolute left-5 top-5 h-5 w-5 text-primary-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-4 top-4.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full p-1.5 transition-colors"
              title="Очистить поиск"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium transition-all"
          >
            <option value="">Все типы</option>
            {EQUIPMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
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
          <input
            type="text"
            value={workshopFilter}
            onChange={(e) => setWorkshopFilter(e.target.value)}
            placeholder="Фильтр по цеху"
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium transition-all"
          />
        </div>
        
        {/* Кнопки массовых операций */}
        {selectedIds.length > 0 && (
          <div className="mt-4 p-4 bg-gradient-to-r from-primary-50 to-blue-50 border-2 border-primary-200 rounded-xl shadow-soft">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-primary-200 shadow-sm">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-bold text-primary-700">
                  Выбрано: {selectedIds.length}
                </span>
              </div>
              <button
                onClick={() => setShowBulkEdit(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Массовое редактирование
              </button>
              <button
                onClick={() => setShowBulkDates(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Назначить даты ПТО/ЧТО
              </button>
              <button
                onClick={() => setSelectedIds([])}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 hover:border-gray-400 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Снять выделение
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-12 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-200 border-t-primary-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-500 font-medium">Загрузка...</p>
        </div>
      ) : (
        <div className="w-full">
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-12">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === equipment.length && equipment.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Паспорт</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Тип ПС</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Инвентарный №</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Позиция</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Грузоподъемность</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Место установки</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Цех</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Статус</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Действия</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {equipment.map((eq) => (
                  <tr key={eq.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(eq.id)}
                        onChange={() => handleSelectOne(eq.id)}
                        className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap cursor-pointer" onClick={() => onView(eq.id)}>
                      <div className="text-sm font-semibold text-gray-900">{eq.passport_number}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{eq.equipment_type}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-600">
                      {eq.inventory_number || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-600">
                      {eq.position || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-600">
                      {eq.load_capacity ? `${eq.load_capacity} т` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-600">
                      {eq.installation_location || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-600">
                      {eq.workshop || '-'}
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

          {/* Мобильная версия */}
          <div className="lg:hidden divide-y divide-gray-200">
            {equipment.map((eq) => (
              <div key={eq.id} className="p-4 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(eq.id)}
                      onChange={() => handleSelectOne(eq.id)}
                      className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-1"
                    />
                    <div>
                      <button
                        onClick={() => onView(eq.id)}
                        className="text-base font-semibold text-left text-gray-900"
                      >
                        {eq.passport_number}
                      </button>
                      <p className="text-sm text-gray-500">{eq.equipment_type}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${getStatusColor(eq.status)}`}>
                    {getStatusText(eq.status)}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4 text-sm text-gray-600">
                  <div>
                    <p className="text-xs uppercase text-gray-400">Инв. номер</p>
                    <p className="font-semibold text-gray-800">{eq.inventory_number || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-400">Позиция</p>
                    <p className="font-semibold text-gray-800">{eq.position || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-400">Цех</p>
                    <p className="font-semibold text-gray-800">{eq.workshop || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-400">Место установки</p>
                    <p className="font-semibold text-gray-800">{eq.installation_location || '-'}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  {eq.load_capacity && (
                    <span className="px-2 py-1 text-xs font-semibold bg-primary-50 text-primary-700 rounded-full">
                      Г/п: {eq.load_capacity} т
                    </span>
                  )}
                  {eq.pto_date && (
                    <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full">
                      ПТО: {new Date(eq.pto_date).toLocaleDateString('ru-RU')}
                    </span>
                  )}
                  {eq.cto_date && (
                    <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full">
                      ЧТО: {new Date(eq.cto_date).toLocaleDateString('ru-RU')}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => onView(eq.id)}
                    className="flex-1 min-w-[120px] inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-primary-700 bg-primary-50 rounded-lg"
                  >
                    Просмотр
                  </button>
                  <button
                    onClick={() => onEdit(eq.id)}
                    className="flex-1 min-w-[120px] inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 rounded-lg"
                  >
                    Редактировать
                  </button>
                  <button
                    onClick={() => onViewHistory(eq.id)}
                    className="flex-1 min-w-[120px] inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg"
                  >
                    История
                  </button>
                  <button
                    onClick={() => handleDelete(eq.id, eq.passport_number)}
                    className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-accent-700 bg-accent-50 rounded-lg"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>

          {equipment.length === 0 && (
            <div className="lg:hidden p-8 text-center text-gray-500 font-semibold">
              Оборудование не найдено
            </div>
          )}
        </div>
      )}

      {showBulkEdit && (
        <EquipmentBulkEdit
          selectedIds={selectedIds}
          onClose={() => setShowBulkEdit(false)}
          onSuccess={handleBulkSuccess}
        />
      )}

      {showBulkDates && (
        <EquipmentBulkDates
          selectedIds={selectedIds}
          onClose={() => setShowBulkDates(false)}
          onSuccess={handleBulkSuccess}
        />
      )}
    </div>
  )
}

