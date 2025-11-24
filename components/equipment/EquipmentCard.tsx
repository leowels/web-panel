'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { format } from 'date-fns'

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

interface EquipmentCardProps {
  equipmentId: number
  onClose: () => void
  onEdit: () => void
}

export default function EquipmentCard({ equipmentId, onClose, onEdit }: EquipmentCardProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [equipment, setEquipment] = useState<Equipment | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchEquipment()
  }, [equipmentId])

  const fetchEquipment = async () => {
    setLoading(true)
    try {
      const response = await axios.get(`${API_URL}/api/equipment/${equipmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setEquipment(response.data)
    } catch (error: any) {
      addNotification('Ошибка загрузки оборудования', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!equipment) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500">Оборудование не найдено</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Карточка оборудования</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-500">Номер паспорта</label>
          <p className="text-lg font-semibold text-gray-900">{equipment.passport_number}</p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-500">Тип ПС</label>
          <p className="text-gray-900">{equipment.equipment_type}</p>
        </div>

        {equipment.inventory_number && (
          <div>
            <label className="text-sm font-medium text-gray-500">Инвентарный номер</label>
            <p className="text-gray-900">{equipment.inventory_number}</p>
          </div>
        )}

        {equipment.position && (
          <div>
            <label className="text-sm font-medium text-gray-500">Позиция</label>
            <p className="text-gray-900">{equipment.position}</p>
          </div>
        )}

        {equipment.workshop && (
          <div>
            <label className="text-sm font-medium text-gray-500">Цех / подразделение</label>
            <p className="text-gray-900">{equipment.workshop}</p>
          </div>
        )}

        {equipment.load_capacity && (
          <div>
            <label className="text-sm font-medium text-gray-500">Грузоподъемность</label>
            <p className="text-gray-900">{equipment.load_capacity} т</p>
          </div>
        )}

        {equipment.manufacturer && (
          <div>
            <label className="text-sm font-medium text-gray-500">Завод-изготовитель</label>
            <p className="text-gray-900">{equipment.manufacturer}</p>
          </div>
        )}

        {equipment.installation_location && (
          <div>
            <label className="text-sm font-medium text-gray-500">Место установки</label>
            <p className="text-gray-900">{equipment.installation_location}</p>
          </div>
        )}

        {equipment.installation_date && (
          <div>
            <label className="text-sm font-medium text-gray-500">Дата ввода в эксплуатацию</label>
            <p className="text-gray-900">{format(new Date(equipment.installation_date), 'dd.MM.yyyy')}</p>
          </div>
        )}

        {equipment.pto_date && (
          <div>
            <label className="text-sm font-medium text-gray-500">Дата ПТО</label>
            <p className="text-gray-900">{format(new Date(equipment.pto_date), 'dd.MM.yyyy')}</p>
          </div>
        )}

        {equipment.cto_date && (
          <div>
            <label className="text-sm font-medium text-gray-500">Дата ЧТО</label>
            <p className="text-gray-900">{format(new Date(equipment.cto_date), 'dd.MM.yyyy')}</p>
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-gray-500">Статус</label>
          <p className="text-gray-900">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              equipment.status === 'active' ? 'bg-green-100 text-green-800' :
              equipment.status === 'inactive' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {equipment.status === 'active' ? 'Активно' :
               equipment.status === 'inactive' ? 'Неактивно' : 'Архив'}
            </span>
          </p>
        </div>

        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={onEdit}
            className="w-full bg-primary-600 text-white py-2 px-4 rounded-lg hover:bg-primary-700"
          >
            Редактировать
          </button>
        </div>
      </div>
    </div>
  )
}

