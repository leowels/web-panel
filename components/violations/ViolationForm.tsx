'use client'

import { useEffect, useState, ChangeEvent } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface ViolationFormProps {
  violationId: number | null
  onClose: () => void
  onSuccess: () => void
}

export default function ViolationForm({ violationId, onClose, onSuccess }: ViolationFormProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const isEditing = !!violationId
  const [formData, setFormData] = useState({
    equipment_id: '',
    inspection_id: '',
    violation_type: '',  // Тип нарушения (краткое описание от пользователя)
    description: '',
    fnp_clause: '',
    gost_clause: '',
    severity: 'medium',
    location: '',
    deadline: '',
    status: 'open',
  })
  const [equipmentList, setEquipmentList] = useState<any[]>([])
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([])
  const [equipmentSearch, setEquipmentSearch] = useState('')

  const resolvePrimaryEquipmentId = () => {
    if (violationId) {
      return formData.equipment_id ? Number(formData.equipment_id) : null
    }
    if (selectedEquipmentIds.length === 0) {
      return null
    }
    return Number(selectedEquipmentIds[0])
  }

  const selectedEquipmentDetails = equipmentList.filter((eq) =>
    selectedEquipmentIds.includes(String(eq.id))
  )
  const singleSelectedEquipment = equipmentList.find((eq) => String(eq.id) === formData.equipment_id)

  // Фильтрация оборудования по поисковому запросу
  const filteredEquipmentList = equipmentList.filter((eq) => {
    if (!equipmentSearch.trim()) return true
    const searchLower = equipmentSearch.toLowerCase()
    return (
      eq.passport_number?.toLowerCase().includes(searchLower) ||
      eq.equipment_type?.toLowerCase().includes(searchLower) ||
      eq.position?.toLowerCase().includes(searchLower) ||
      eq.inventory_number?.toLowerCase().includes(searchLower) ||
      eq.workshop?.toLowerCase().includes(searchLower) ||
      eq.installation_location?.toLowerCase().includes(searchLower)
    )
  })

  // Сохраняем выбранные ID при изменении поиска (для множественного выбора)
  // Выбранные ID сохраняются независимо от фильтрации поиска

  useEffect(() => {
    fetchEquipment()
    if (violationId) {
      fetchViolation()
    }
    if (!violationId) {
      setSelectedEquipmentIds([])
    }
  }, [violationId])

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

  const fetchViolation = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/violations/${violationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const v = response.data
      setFormData({
        equipment_id: String(v.equipment_id),
        inspection_id: v.inspection_id ? String(v.inspection_id) : '',
        violation_type: '',  // При редактировании не заполняем
        description: v.description,
        fnp_clause: v.fnp_clause || '',
        gost_clause: v.gost_clause || '',
        severity: v.severity,
        location: v.location || '',
        deadline: v.deadline ? v.deadline.split('T')[0] : '',
        status: v.status,
      })
      setSelectedEquipmentIds([String(v.equipment_id)])
    } catch (error: any) {
      addNotification('Ошибка загрузки нарушения', 'error')
    }
  }

  const handleAIGenerate = async () => {
    const targetEquipmentId = resolvePrimaryEquipmentId()
    if (!targetEquipmentId) {
      addNotification('Выберите оборудование', 'error')
      return
    }

    if (!formData.violation_type || formData.violation_type.trim() === '') {
      addNotification('Введите тип нарушения для генерации', 'error')
      return
    }

    setGenerating(true)
    try {
      const response = await axios.post(
        `${API_URL}/api/violations/ai/generate`,
        {
          equipment_id: targetEquipmentId,
          inspection_id: formData.inspection_id ? Number(formData.inspection_id) : null,
          violation_type: formData.violation_type.trim(),
          context: formData.location || undefined,
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
      )
      const result = response.data
      const violation = result.violation || result  // Поддержка старого формата
      const usedDocuments = result.used_documents || []
      
      setFormData({
        ...formData,
        description: violation.description || formData.description,
        fnp_clause: violation.fnp_clause || formData.fnp_clause,
        gost_clause: violation.gost_clause || formData.gost_clause,
        severity: violation.severity || formData.severity,
        deadline: violation.deadline ? violation.deadline.split('T')[0] : formData.deadline,
      })
      
      // Показываем информацию об использованных документах
      if (usedDocuments.length > 0) {
        const docNames = usedDocuments.map((doc: any) => {
          const typeName = doc.document_type === 'fnp461' ? 'ФНП 461' : 
                          doc.document_type === 'gost' ? 'ГОСТ' : 
                          doc.document_type || 'Документ'
          return `${typeName}: ${doc.title}`
        }).join(', ')
        addNotification(`Нарушение оформлено через ИИ. Использовано документов: ${usedDocuments.length} (${docNames})`, 'success')
        console.log('Использованные документы из базы знаний:', usedDocuments)
      } else {
        addNotification('Нарушение оформлено через ИИ. ⚠️ Документы в базе знаний не найдены!', 'warning')
        console.warn('⚠️ База знаний пуста или не содержит релевантных документов')
      }
    } catch (error: any) {
      console.error('AI generation error:', error)
      const errorMsg = error.response?.data?.detail || error.message || 'Ошибка генерации'
      addNotification(errorMsg, 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleMultiSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(event.target.selectedOptions, (option) => option.value)
    setSelectedEquipmentIds(values)
    setFormData((prev) => ({ ...prev, equipment_id: values[0] || '' }))
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
      // Преобразуем дату в ISO формат (YYYY-MM-DDTHH:mm:ss)
      const formatDate = (dateStr: string | null): string | null => {
        if (!dateStr) return null
        // Если дата уже в формате YYYY-MM-DD, добавляем время
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          return `${dateStr}T00:00:00`
        }
        return dateStr
      }

      const targetEquipmentIds = isEditing
        ? formData.equipment_id
          ? [Number(formData.equipment_id)]
          : []
        : selectedEquipmentIds.map((id) => Number(id))

      if (targetEquipmentIds.length === 0) {
        addNotification('Выберите хотя бы одно оборудование', 'error')
        setLoading(false)
        return
      }

      const submitData: any = {
        description: formData.description,
        fnp_clause: formData.fnp_clause || null,
        gost_clause: formData.gost_clause || null,
        severity: formData.severity,
        location: formData.location || null,
        deadline: formatDate(formData.deadline),
      }

      if (formData.inspection_id) {
        submitData.inspection_id = Number(formData.inspection_id)
      }

      if (violationId) {
        submitData.equipment_id = targetEquipmentIds[0]
        await axios.put(
          `${API_URL}/api/violations/${violationId}`,
          { ...submitData, status: formData.status },
          { 
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000
          }
        )
        addNotification('Нарушение успешно обновлено', 'success')
      } else if (targetEquipmentIds.length === 1) {
        await axios.post(
          `${API_URL}/api/violations`,
          { ...submitData, equipment_id: targetEquipmentIds[0] },
          { 
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000
          }
        )
        addNotification('Нарушение успешно создано', 'success')
      } else {
        const response = await axios.post(
          `${API_URL}/api/violations/bulk`,
          {
            equipment_ids: targetEquipmentIds,
            ...submitData,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 15000,
          }
        )
        const { created, skipped } = response.data
        addNotification(`Создано нарушений: ${created}. Пропущено: ${skipped}`, 'success')
      }
      onSuccess()
    } catch (error: any) {
      console.error('Error saving violation:', error)
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
            {violationId ? 'Редактировать нарушение' : 'Создать нарушение'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={isEditing ? '' : 'md:col-span-2'}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Оборудование *
              </label>
              {/* Поле поиска оборудования */}
              <div className="relative mb-3">
                <input
                  type="text"
                  value={equipmentSearch}
                  onChange={(e) => setEquipmentSearch(e.target.value)}
                  placeholder="Поиск по паспорту, типу, позиции, цеху, инвентарному номеру..."
                  className="w-full px-5 py-4 pl-14 pr-12 text-lg border-2 border-primary-300 rounded-xl focus:ring-4 focus:ring-primary-200 focus:border-primary-600 bg-white text-gray-900 font-semibold shadow-md transition-all placeholder:text-gray-400 placeholder:font-normal"
                  style={{ fontSize: '16px', lineHeight: '1.5' }}
                />
                <svg className="absolute left-5 top-5 h-5 w-5 text-primary-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {equipmentSearch && (
                  <button
                    type="button"
                    onClick={() => setEquipmentSearch('')}
                    className="absolute right-4 top-4.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full p-1.5 transition-colors"
                    title="Очистить поиск"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {equipmentSearch && (
                <div className="mb-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-medium text-blue-800">
                    Найдено: <span className="font-bold">{filteredEquipmentList.length}</span> из <span className="font-bold">{equipmentList.length}</span> оборудования
                  </p>
                </div>
              )}
              {equipmentSearch && filteredEquipmentList.length === 0 && (
                <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-medium text-red-800">❌ Оборудование не найдено. Попробуйте другой поисковый запрос.</p>
                </div>
              )}
              {isEditing ? (
                <>
                  <select
                    required
                    value={formData.equipment_id}
                    onChange={(e) => setFormData({ ...formData, equipment_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Выберите оборудование</option>
                    {filteredEquipmentList.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.passport_number} - {eq.equipment_type} {eq.position ? `(${eq.position})` : ''}
                        {eq.workshop ? ` [${eq.workshop}]` : ''}
                      </option>
                    ))}
                  </select>
                  {singleSelectedEquipment && (
                    <div className="mt-2 text-xs text-gray-500 space-y-1">
                      {singleSelectedEquipment.position && <p>Позиция: {singleSelectedEquipment.position}</p>}
                      {singleSelectedEquipment.inventory_number && (
                        <p>Инв. № {singleSelectedEquipment.inventory_number}</p>
                      )}
                      {singleSelectedEquipment.workshop && (
                        <p>Цех: {singleSelectedEquipment.workshop}</p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Показываем выбранное оборудование, даже если оно не в текущем поиске */}
                  {selectedEquipmentDetails.length > 0 && (
                    <div className="mb-3 p-3 bg-primary-50 border border-primary-200 rounded-lg">
                      <p className="text-sm font-semibold text-primary-700 mb-2">
                        Выбрано оборудование ({selectedEquipmentDetails.length}):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedEquipmentDetails.map((eq) => (
                          <div
                            key={eq.id}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-primary-300 rounded-lg shadow-sm"
                          >
                            <span className="text-sm font-medium text-gray-900">
                              {eq.passport_number} • {eq.equipment_type}
                              {eq.position ? ` (${eq.position})` : ''}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedEquipmentIds(prev => prev.filter(id => id !== String(eq.id)))
                                setFormData(prev => ({ ...prev, equipment_id: '' }))
                              }}
                              className="text-red-600 hover:text-red-800 hover:bg-red-50 rounded-full p-1 transition-colors"
                              title="Удалить из выбранных"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <select
                    multiple
                    size={10}
                    required
                    value={selectedEquipmentIds}
                    onChange={handleMultiSelectChange}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white text-gray-900 font-medium"
                  >
                    {filteredEquipmentList
                      .filter(eq => !selectedEquipmentIds.includes(String(eq.id))) // Не показываем уже выбранное
                      .map((eq) => (
                        <option key={eq.id} value={eq.id}>
                          {eq.passport_number} • {eq.equipment_type}
                          {eq.position ? ` • Поз: ${eq.position}` : ''}
                          {eq.workshop ? ` • Цех: ${eq.workshop}` : ''}
                          {eq.inventory_number ? ` • Инв: ${eq.inventory_number}` : ''}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Удерживайте Ctrl / Cmd для выбора нескольких позиций. Первое выбранное оборудование используется для работы ИИ.
                  </p>
                </>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Критичность
              </label>
              <select
                value={formData.severity}
                onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="low">Низкое</option>
                <option value="medium">Среднее</option>
                <option value="high">Высокое</option>
                <option value="critical">Критическое</option>
              </select>
            </div>
          </div>

          {!violationId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Тип нарушения *
              </label>
              <div className="flex space-x-2 mb-2">
                <input
                  type="text"
                  value={formData.violation_type}
                  onChange={(e) => setFormData({ ...formData, violation_type: e.target.value })}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Например: Отсутствует маркировка, Трещина в металле, Неисправен тормоз..."
                />
                <button
                  type="button"
                  onClick={handleAIGenerate}
                  disabled={generating || !formData.equipment_id || !formData.violation_type.trim()}
                  className="px-4 py-2 text-sm bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-md transition-all"
                >
                  {generating ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Оформление...
                    </span>
                  ) : (
                    '🤖 Оформить через ИИ'
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Введите краткое описание типа нарушения. ИИ оформит его официально, подставит пункты ФНП/ГОСТ и определит срок исправления.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Описание нарушения *
            </label>
            <textarea
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={5}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder={violationId ? "Описание нарушения..." : "Описание будет сгенерировано автоматически после нажатия 'Оформить через ИИ'"}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Пункт ФНП 461
              </label>
              <input
                type="text"
                value={formData.fnp_clause}
                onChange={(e) => setFormData({ ...formData, fnp_clause: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="Например: п. 123"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Пункт ГОСТ
              </label>
              <input
                type="text"
                value={formData.gost_clause}
                onChange={(e) => setFormData({ ...formData, gost_clause: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="Например: ГОСТ 12345"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Место обнаружения
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Срок устранения
              </label>
              <input
                type="date"
                value={formData.deadline}
                onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {violationId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Статус
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="open">Открыто</option>
                <option value="resolved">Устранено</option>
              </select>
            </div>
          )}

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

