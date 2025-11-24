'use client'

import { useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { EQUIPMENT_TYPES } from '@/constants/equipmentTypes'

const API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || ''
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface EquipmentBulkFormProps {
  onClose: () => void
  onSuccess: () => void
}

type EquipmentRow = {
  equipment_type: string
  passport_number: string
  inventory_number: string
  position: string
  workshop: string
  load_capacity: string
  manufacturer: string
  installation_date: string
  pto_date: string
  cto_date: string
  installation_location: string
}

const createEmptyRow = (): EquipmentRow => ({
  equipment_type: '',
  passport_number: '',
  inventory_number: '',
  position: '',
  workshop: '',
  load_capacity: '',
  manufacturer: '',
  installation_date: '',
  pto_date: '',
  cto_date: '',
  installation_location: '',
})

export default function EquipmentBulkForm({ onClose, onSuccess }: EquipmentBulkFormProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [rows, setRows] = useState<EquipmentRow[]>([createEmptyRow(), createEmptyRow(), createEmptyRow()])
  const [loading, setLoading] = useState(false)

  const updateRow = (index: number, field: keyof EquipmentRow, value: string) => {
    const updated = [...rows]
    updated[index] = { ...updated[index], [field]: value }
    setRows(updated)
  }

  const addRow = () => {
    setRows((prev) => [...prev, createEmptyRow()])
  }

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  const hasData = (row: EquipmentRow) =>
    Object.entries(row).some(([key, value]) => key === 'load_capacity' ? value !== '' : value.trim() !== '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      addNotification('Ошибка авторизации', 'error')
      return
    }

    const prepared = rows
      .filter((row) => hasData(row))
      .map((row) => ({
        equipment_type: row.equipment_type,
        passport_number: row.passport_number,
        inventory_number: row.inventory_number || null,
        position: row.position || null,
        workshop: row.workshop || null,
        load_capacity: row.load_capacity ? parseFloat(row.load_capacity) : null,
        manufacturer: row.manufacturer || null,
        installation_location: row.installation_location || null,
        installation_date: row.installation_date ? `${row.installation_date}T00:00:00` : null,
        pto_date: row.pto_date ? `${row.pto_date}T00:00:00` : null,
        cto_date: row.cto_date ? `${row.cto_date}T00:00:00` : null,
      }))

    if (prepared.length === 0) {
      addNotification('Заполните хотя бы одну строку', 'error')
      return
    }

    const invalidRow = prepared.find(
      (row) => !row.equipment_type || !row.passport_number
    )

    if (invalidRow) {
      addNotification('Каждая строка должна содержать тип ПС и номер паспорта', 'error')
      return
    }

    setLoading(true)
    try {
      const response = await axios.post(
        `${API_URL}/api/equipment/bulk`,
        { items: prepared },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const { created, skipped, errors } = response.data
      addNotification(`Создано: ${created}, пропущено: ${skipped}`, 'success')
      if (errors?.length) {
        console.warn('Bulk equipment errors', errors)
      }
      onSuccess()
    } catch (error: any) {
      const detail = error.response?.data?.detail || error.message || 'Ошибка массового добавления'
      addNotification(detail, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-strong max-w-6xl w-full max-h-[90vh] overflow-y-auto border border-gray-200">
        <div className="p-6 border-b border-gray-300 bg-gradient-to-r from-gray-50 to-white flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Массовое добавление оборудования</h2>
            <p className="text-sm text-gray-500 mt-1">Заполните таблицу для быстрого импорта нескольких ПС</p>
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Тип ПС *</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Паспорт *</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Инв. №</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Позиция</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Цех</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Г/п (т)</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Место установки</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Завод</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Дата ввода</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">ПТО</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">ЧТО</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">-</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td className="px-4 py-2">
                      <select
                        value={row.equipment_type}
                        onChange={(e) => updateRow(index, 'equipment_type', e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 w-44"
                      >
                        <option value="">-</option>
                        {EQUIPMENT_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={row.passport_number}
                        onChange={(e) => updateRow(index, 'passport_number', e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 w-40"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={row.inventory_number}
                        onChange={(e) => updateRow(index, 'inventory_number', e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 w-36"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={row.position}
                        onChange={(e) => updateRow(index, 'position', e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 w-32"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={row.workshop}
                        onChange={(e) => updateRow(index, 'workshop', e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 w-32"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        step="0.1"
                        value={row.load_capacity}
                        onChange={(e) => updateRow(index, 'load_capacity', e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 w-24"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={row.installation_location}
                        onChange={(e) => updateRow(index, 'installation_location', e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 w-40"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={row.manufacturer}
                        onChange={(e) => updateRow(index, 'manufacturer', e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 w-40"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="date"
                        value={row.installation_date}
                        onChange={(e) => updateRow(index, 'installation_date', e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="date"
                        value={row.pto_date}
                        onChange={(e) => updateRow(index, 'pto_date', e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="date"
                        value={row.cto_date}
                        onChange={(e) => updateRow(index, 'cto_date', e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        className="text-accent-600 hover:text-accent-800 p-1"
                        disabled={rows.length === 1}
                        title="Удалить строку"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center px-4 py-2 border border-primary-200 text-primary-700 bg-primary-50 rounded-lg hover:bg-primary-100 font-semibold transition-all"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Добавить строку
            </button>
            <p className="text-xs text-gray-500">
              Поля с * обязательны для каждой строки. Пустые строки будут пропущены автоматически.
            </p>
          </div>

          <div className="flex space-x-3 pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-gradient-to-r from-primary-600 to-primary-700 text-white py-3 px-6 rounded-lg hover:from-primary-700 hover:to-primary-800 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-soft hover:shadow-medium transition-all duration-200 flex items-center justify-center"
            >
              {loading ? 'Импорт...' : 'Импортировать'}
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

