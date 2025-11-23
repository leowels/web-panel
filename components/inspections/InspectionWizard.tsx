'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface ChecklistItem {
  id: number
  item_type: string
  label: string
  description?: string
  is_required: boolean
  order: number
}

interface InspectionAnswer {
  item_id: number
  value?: string
  file_id?: number
}

interface InspectionWizardProps {
  inspectionId: number | null
  onClose: () => void
  onSuccess: () => void
}

export default function InspectionWizard({ inspectionId, onClose, onSuccess }: InspectionWizardProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [equipmentId, setEquipmentId] = useState<number | null>(null)
  const [checklistTemplateId, setChecklistTemplateId] = useState<number | null>(null)
  const [equipmentList, setEquipmentList] = useState<any[]>([])
  const [checklistList, setChecklistList] = useState<any[]>([])
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [answers, setAnswers] = useState<Record<number, InspectionAnswer>>({})
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetchEquipment()
    fetchChecklists()
    if (inspectionId) {
      fetchInspection()
    }
  }, [inspectionId])

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

  const fetchChecklists = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/checklists?is_active=true&limit=1000`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setChecklistList(response.data)
    } catch (error: any) {
      addNotification('Ошибка загрузки чек-листов', 'error')
    }
  }

  const fetchInspection = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/inspections/${inspectionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const inspection = response.data
      setEquipmentId(inspection.equipment_id)
      setChecklistTemplateId(inspection.checklist_template_id)
      setNotes(inspection.notes || '')
      
      // Загрузка элементов чек-листа
      const checklistResponse = await axios.get(`${API_URL}/api/checklists/${inspection.checklist_template_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setChecklistItems(checklistResponse.data.items || [])
      
      // Загрузка ответов
      const answersMap: Record<number, InspectionAnswer> = {}
      inspection.answers.forEach((answer: any) => {
        answersMap[answer.item_id] = {
          item_id: answer.item_id,
          value: answer.value,
          file_id: answer.file_id,
        }
      })
      setAnswers(answersMap)
      setStep(3)
    } catch (error: any) {
      addNotification('Ошибка загрузки осмотра', 'error')
    }
  }

  const handleChecklistSelect = async (templateId: number) => {
    setChecklistTemplateId(templateId)
    try {
      const response = await axios.get(`${API_URL}/api/checklists/${templateId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setChecklistItems(response.data.items || [])
    } catch (error: any) {
      addNotification('Ошибка загрузки чек-листа', 'error')
    }
  }

  const handleAnswerChange = (itemId: number, value: string) => {
    setAnswers({
      ...answers,
      [itemId]: {
        item_id: itemId,
        value,
      },
    })
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      if (!inspectionId) {
        // Создание нового осмотра
        const inspectionData = {
          equipment_id: equipmentId,
          checklist_template_id: checklistTemplateId,
          notes,
        }
        const response = await axios.post(
          `${API_URL}/api/inspections`,
          inspectionData,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const newInspectionId = response.data.id

        // Сохранение ответов
        for (const [itemId, answer] of Object.entries(answers)) {
          await axios.post(
            `${API_URL}/api/inspections/${newInspectionId}/answers`,
            answer,
            { headers: { Authorization: `Bearer ${token}` } }
          )
        }

        // Обновление статуса
        await axios.put(
          `${API_URL}/api/inspections/${newInspectionId}`,
          { status: 'in_progress', notes },
          { headers: { Authorization: `Bearer ${token}` } }
        )

        addNotification('Осмотр успешно создан', 'success')
      } else {
        // Обновление существующего осмотра
        for (const [itemId, answer] of Object.entries(answers)) {
          await axios.post(
            `${API_URL}/api/inspections/${inspectionId}/answers`,
            answer,
            { headers: { Authorization: `Bearer ${token}` } }
          )
        }

        await axios.put(
          `${API_URL}/api/inspections/${inspectionId}`,
          { notes },
          { headers: { Authorization: `Bearer ${token}` } }
        )

        addNotification('Осмотр успешно обновлен', 'success')
      }
      onSuccess()
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка сохранения', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleComplete = async () => {
    if (!inspectionId) return

    setLoading(true)
    try {
      await axios.put(
        `${API_URL}/api/inspections/${inspectionId}`,
        { status: 'completed', notes },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      addNotification('Осмотр завершен', 'success')
      onSuccess()
    } catch (error: any) {
      addNotification('Ошибка завершения осмотра', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
          <h2 className="text-2xl font-semibold text-gray-900">
            {inspectionId ? 'Редактировать осмотр' : 'Новый осмотр'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {/* Шаги */}
          <div className="mb-6">
            <div className="flex items-center">
              <div className={`flex items-center ${step >= 1 ? 'text-primary-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}>
                  1
                </div>
                <span className="ml-2 text-sm font-medium">Выбор оборудования</span>
              </div>
              <div className={`flex-1 h-1 mx-4 ${step >= 2 ? 'bg-primary-600' : 'bg-gray-200'}`}></div>
              <div className={`flex items-center ${step >= 2 ? 'text-primary-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}>
                  2
                </div>
                <span className="ml-2 text-sm font-medium">Выбор чек-листа</span>
              </div>
              <div className={`flex-1 h-1 mx-4 ${step >= 3 ? 'bg-primary-600' : 'bg-gray-200'}`}></div>
              <div className={`flex items-center ${step >= 3 ? 'text-primary-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}>
                  3
                </div>
                <span className="ml-2 text-sm font-medium">Заполнение</span>
              </div>
            </div>
          </div>

          {/* Шаг 1: Выбор оборудования */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Выберите оборудование</h3>
              <select
                value={equipmentId || ''}
                onChange={(e) => setEquipmentId(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Выберите оборудование</option>
                {equipmentList.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.passport_number} - {eq.equipment_type}
                  </option>
                ))}
              </select>
              <div className="flex justify-end">
                <button
                  onClick={() => equipmentId && setStep(2)}
                  disabled={!equipmentId}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  Далее
                </button>
              </div>
            </div>
          )}

          {/* Шаг 2: Выбор чек-листа */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Выберите чек-лист</h3>
              <select
                value={checklistTemplateId || ''}
                onChange={(e) => handleChecklistSelect(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Выберите чек-лист</option>
                {checklistList.map((checklist) => (
                  <option key={checklist.id} value={checklist.id}>
                    {checklist.name} (v{checklist.version})
                  </option>
                ))}
              </select>
              <div className="flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Назад
                </button>
                <button
                  onClick={() => checklistTemplateId && setStep(3)}
                  disabled={!checklistTemplateId}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  Далее
                </button>
              </div>
            </div>
          )}

          {/* Шаг 3: Заполнение */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Заполните чек-лист</h3>
              <div className="space-y-4">
                {checklistItems
                  .sort((a, b) => a.order - b.order)
                  .map((item) => (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {item.label}
                        {item.is_required && <span className="text-red-600 ml-1">*</span>}
                      </label>
                      {item.description && (
                        <p className="text-sm text-gray-500 mb-2">{item.description}</p>
                      )}
                      
                      {item.item_type === 'text' && (
                        <input
                          type="text"
                          value={answers[item.id]?.value || ''}
                          onChange={(e) => handleAnswerChange(item.id, e.target.value)}
                          required={item.is_required}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                      )}
                      
                      {item.item_type === 'bool' && (
                        <select
                          value={answers[item.id]?.value || ''}
                          onChange={(e) => handleAnswerChange(item.id, e.target.value)}
                          required={item.is_required}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="">Выберите</option>
                          <option value="true">Да</option>
                          <option value="false">Нет</option>
                        </select>
                      )}
                      
                      {item.item_type === 'number' && (
                        <input
                          type="number"
                          value={answers[item.id]?.value || ''}
                          onChange={(e) => handleAnswerChange(item.id, e.target.value)}
                          required={item.is_required}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                      )}
                      
                      {item.item_type === 'photo' && (
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            // TODO: Загрузка фото
                            handleAnswerChange(item.id, 'photo_uploaded')
                          }}
                          required={item.is_required}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        />
                      )}
                    </div>
                  ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Примечания</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex justify-between pt-4 border-t border-gray-200">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Назад
                </button>
                <div className="flex space-x-3">
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    {loading ? 'Сохранение...' : 'Сохранить'}
                  </button>
                  {inspectionId && (
                    <button
                      onClick={handleComplete}
                      disabled={loading}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      Завершить
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

