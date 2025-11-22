'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface ActFormProps {
  actId: number | null
  onClose: () => void
  onSuccess: () => void
}

export default function ActForm({ actId, onClose, onSuccess }: ActFormProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [formData, setFormData] = useState({
    organization: '',
    equipment_id: '',
    violation_ids: [] as number[],
  })
  const [act, setAct] = useState<any>(null)
  const [equipmentList, setEquipmentList] = useState<any[]>([])
  const [violationsList, setViolationsList] = useState<any[]>([])
  const [selectedViolations, setSelectedViolations] = useState<number[]>([])

  useEffect(() => {
    fetchEquipment()
    fetchViolations()
    if (actId) {
      fetchAct()
    }
  }, [actId])

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

  const fetchViolations = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/violations?status=open&limit=1000`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setViolationsList(response.data)
    } catch (error: any) {
      addNotification('Ошибка загрузки нарушений', 'error')
    }
  }

  const fetchAct = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/acts/${actId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const a = response.data
      setAct(a)
      setFormData({
        organization: a.organization,
        equipment_id: a.equipment_id ? String(a.equipment_id) : '',
        violation_ids: a.violation_ids || [],
      })
      setSelectedViolations(a.violation_ids || [])
    } catch (error: any) {
      addNotification('Ошибка загрузки акта', 'error')
    }
  }

  const handleAIGenerate = async () => {
    if (!actId) {
      addNotification('Сначала создайте акт', 'error')
      return
    }

    setGenerating(true)
    try {
      const response = await axios.post(
        `${API_URL}/api/acts/${actId}/generate`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setAct(response.data)
      addNotification('Текст акта сгенерирован через ИИ', 'success')
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка генерации', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (!actId) {
        // Создание нового акта
        const actData = {
          organization: formData.organization,
          equipment_id: formData.equipment_id ? Number(formData.equipment_id) : null,
          violation_ids: selectedViolations,
        }
        const response = await axios.post(
          `${API_URL}/api/acts`,
          actData,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        addNotification('Акт успешно создан', 'success')
        setAct(response.data)
      } else {
        // Обновление акта
        await axios.put(
          `${API_URL}/api/acts/${actId}`,
          {
            organization: formData.organization,
            act_date: act?.act_date,
            status: act?.status,
            content: act?.content,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        )
        addNotification('Акт успешно обновлен', 'success')
      }
      onSuccess()
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка сохранения', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-2xl font-semibold text-gray-900">
            {actId ? 'Редактировать акт' : 'Создать акт'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {actId && act && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <p className="font-semibold">{act.act_number}</p>
                  <p className="text-sm text-gray-600">от {new Date(act.act_date).toLocaleDateString('ru-RU')}</p>
                </div>
                <button
                  type="button"
                  onClick={handleAIGenerate}
                  disabled={generating}
                  className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                >
                  {generating ? 'Генерация...' : '🤖 Сгенерировать текст ИИ'}
                </button>
              </div>
              {act.content && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Содержание акта</label>
                  <div className="bg-white p-4 rounded border border-gray-200 whitespace-pre-wrap">
                    {act.content}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Организация *
            </label>
            <input
              type="text"
              required
              value={formData.organization}
              onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {!actId && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Оборудование
                </label>
                <select
                  value={formData.equipment_id}
                  onChange={(e) => setFormData({ ...formData, equipment_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Не выбрано</option>
                  {equipmentList.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.passport_number} - {eq.equipment_type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Нарушения
                </label>
                <div className="border border-gray-300 rounded-lg p-4 max-h-60 overflow-y-auto">
                  {violationsList.map((violation) => (
                    <label key={violation.id} className="flex items-start space-x-2 mb-2">
                      <input
                        type="checkbox"
                        checked={selectedViolations.includes(violation.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedViolations([...selectedViolations, violation.id])
                          } else {
                            setSelectedViolations(selectedViolations.filter(id => id !== violation.id))
                          }
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <p className="text-sm text-gray-900">{violation.description.substring(0, 100)}...</p>
                        <p className="text-xs text-gray-500">ПС #{violation.equipment_id}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-primary-600 text-white py-2 px-4 rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? 'Сохранение...' : actId ? 'Обновить' : 'Создать'}
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

