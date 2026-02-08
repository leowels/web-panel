'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

const REPORT_TYPES = [
  { value: 'shift_report', label: 'Сменный отчет' },
  { value: 'equipment_status', label: 'Статус оборудования' },
  { value: 'violation_summary', label: 'Сводка нарушений' },
  { value: 'task_summary', label: 'Сводка задач' },
]

export default function ReportsPage() {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [equipmentList, setEquipmentList] = useState<any[]>([])
  const [selectedEquipment, setSelectedEquipment] = useState<number[]>([])
  const [reportType, setReportType] = useState('shift_report')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [aiDraft, setAiDraft] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchEquipment()
  }, [])

  const fetchEquipment = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/equipment?limit=1000`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setEquipmentList(response.data)
    } catch (error: any) {
      addNotification('Ошибка загрузки оборудования', 'error')
    }
  }

  const handleGenerateDraft = async () => {
    if (reportType === 'shift_report' && (!dateFrom || !dateTo)) {
      addNotification('Для сменного отчета укажите даты', 'error')
      return
    }

    setLoading(true)
    try {
      const payload = {
        type: reportType,
        equipment_ids: selectedEquipment,
        date_from: dateFrom || null,
        date_to: dateTo || null,
      }
      const response = await axios.post(`${API_URL}/api/reports/ai-draft`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setAiDraft(response.data?.content || '')
      addNotification('Черновик отчета сгенерирован', 'success')
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка генерации черновика', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Отчеты</h1>
        <p className="text-gray-600">Генерация AI-черновиков перед сохранением</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Тип отчета</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              {REPORT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Дата с</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Дата по</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Оборудование (необязательно)</label>
          <div className="border border-gray-300 rounded-lg p-3 max-h-48 overflow-y-auto">
            {equipmentList.length === 0 && (
              <p className="text-sm text-gray-500">Нет оборудования</p>
            )}
            {equipmentList.map((eq) => (
              <label key={eq.id} className="flex items-center space-x-2 mb-2">
                <input
                  type="checkbox"
                  checked={selectedEquipment.includes(eq.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedEquipment([...selectedEquipment, eq.id])
                    } else {
                      setSelectedEquipment(selectedEquipment.filter((id) => id !== eq.id))
                    }
                  }}
                />
                <span className="text-sm text-gray-800">
                  {eq.passport_number} · {eq.equipment_type}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={handleGenerateDraft}
            disabled={loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Генерация...' : 'Сгенерировать черновик'}
          </button>
          <button
            type="button"
            onClick={() => setAiDraft('')}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Очистить
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Черновик отчета</label>
        <textarea
          value={aiDraft}
          onChange={(e) => setAiDraft(e.target.value)}
          rows={14}
          placeholder="Черновик появится здесь"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 whitespace-pre-wrap"
        />
        <p className="text-xs text-gray-500 mt-2">Проверьте текст перед сохранением или экспортом.</p>
      </div>
    </div>
  )
}
