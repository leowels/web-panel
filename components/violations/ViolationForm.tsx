'use client'

import { useEffect, useState, ChangeEvent, useRef } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface ViolationFormProps {
  violationId: number | null
  onClose: () => void
  onSuccess: () => void
  initialEquipmentId?: number | null
}

export default function ViolationForm({ violationId, onClose, onSuccess, initialEquipmentId }: ViolationFormProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [loading, setLoading] = useState(false)
  const submitLockRef = useRef(false)
  const [generating, setGenerating] = useState(false)
  const isEditing = !!violationId
  const [violationDetails, setViolationDetails] = useState<any | null>(null)
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
  const [showEquipmentDropdown, setShowEquipmentDropdown] = useState(false)
  const equipmentDropdownRef = useRef<HTMLDivElement>(null)

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
  const activeRequirements = violationDetails?.requirements?.length
    ? violationDetails.requirements
    : violationDetails?.ai_recommendations?.requirements || []
  const aiConfidence =
    typeof violationDetails?.ai_classification?.confidence === 'number'
      ? `${Math.round(violationDetails.ai_classification.confidence * 100)}%`
      : null

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

  // Закрытие выпадающего списка при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (equipmentDropdownRef.current && !equipmentDropdownRef.current.contains(event.target as Node)) {
        setShowEquipmentDropdown(false)
      }
    }

    if (showEquipmentDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showEquipmentDropdown])

  useEffect(() => {
    fetchEquipment()
    if (violationId) {
      fetchViolation()
    }
    if (!violationId) {
      setViolationDetails(null)
      setSelectedEquipmentIds([])
    }
  }, [violationId])

  useEffect(() => {
    if (!violationId && initialEquipmentId) {
      setFormData((prev) => ({ ...prev, equipment_id: String(initialEquipmentId) }))
      setSelectedEquipmentIds([String(initialEquipmentId)])
    }
  }, [violationId, initialEquipmentId])

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
      setViolationDetails(v)
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
        { headers: { Authorization: `Bearer ${token}` }, timeout: 70000 }
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

  const handleEquipmentToggle = (equipmentId: string) => {
    setSelectedEquipmentIds(prev => {
      if (prev.includes(equipmentId)) {
        const newIds = prev.filter(id => id !== equipmentId)
        setFormData((prevForm) => ({ ...prevForm, equipment_id: newIds[0] || '' }))
        return newIds
      } else {
        const newIds = [...prev, equipmentId]
        setFormData((prevForm) => ({ ...prevForm, equipment_id: newIds[0] || '' }))
        return newIds
      }
    })
  }

  const handleMultiSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(event.target.selectedOptions, (option) => option.value)
    setSelectedEquipmentIds(values)
    setFormData((prev) => ({ ...prev, equipment_id: values[0] || '' }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitLockRef.current || loading) {
      return
    }
    submitLockRef.current = true
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
      submitLockRef.current = false
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

        {violationId && violationDetails && (
          <div className="mx-6 mt-6 mb-0 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-purple-50 p-5 shadow-inner">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-3">
              <span className="px-2 py-1 bg-white border border-indigo-100 rounded-full">
                AI анализ
              </span>
              {violationDetails.source && (
                <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full">
                  Источник: {violationDetails.source}
                </span>
              )}
              {aiConfidence && (
                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full">
                  Уверенность: {aiConfidence}
                </span>
              )}
              {violationDetails.criticality_level && (
                <span className="px-2 py-1 bg-rose-100 text-rose-700 rounded-full">
                  Критичность: {violationDetails.criticality_level}
                </span>
              )}
            </div>
            <div className="space-y-3 text-sm text-gray-700">
              {(violationDetails.violation_type_description || violationDetails.violation_type) && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Тип нарушения</p>
                  <p className="text-base font-semibold text-gray-900">
                    {violationDetails.violation_type_description || violationDetails.violation_type}
                  </p>
                </div>
              )}
              {violationDetails.norm_reference && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Норматив</p>
                  <p className="font-medium text-gray-900">{violationDetails.norm_reference}</p>
                </div>
              )}
              {violationDetails.recommended_act_text && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Формулировка акта</p>
                  <p className="italic text-gray-800">«{violationDetails.recommended_act_text}»</p>
                </div>
              )}
              {activeRequirements && activeRequirements.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Рекомендации</p>
                  <ul className="mt-1 space-y-1 text-gray-800 list-disc list-inside">
                    {activeRequirements.map((req: string, idx: number) => (
                      <li key={idx}>{req}</li>
                    ))}
                  </ul>
                </div>
              )}
              {violationDetails.ai_recommendations?.quote && (
                <div className="border-l-4 border-indigo-200 pl-3 italic text-gray-600">
                  {violationDetails.ai_recommendations.quote}
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={isEditing ? '' : 'md:col-span-2'}>
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                Оборудование <span className="text-red-500">*</span>
              </label>
              
              {/* Поле поиска оборудования - всегда видимо для удобства */}
              <div className="relative mb-3">
                <input
                  type="text"
                  value={equipmentSearch}
                  onChange={(e) => {
                    setEquipmentSearch(e.target.value)
                    if (!showEquipmentDropdown && e.target.value.trim()) {
                      setShowEquipmentDropdown(true)
                    }
                  }}
                  onFocus={() => {
                    if (equipmentSearch.trim() || equipmentList.length > 0) {
                      setShowEquipmentDropdown(true)
                    }
                  }}
                  placeholder="🔍 Начните вводить для поиска оборудования..."
                  className="w-full px-5 py-4 pl-14 pr-12 text-base border-2 border-primary-300 rounded-xl focus:ring-4 focus:ring-primary-200 focus:border-primary-600 bg-white text-gray-900 font-medium shadow-md transition-all placeholder:text-gray-400"
                />
                <svg className="absolute left-5 top-5 h-5 w-5 text-primary-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {equipmentSearch && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEquipmentSearch('')
                    }}
                    className="absolute right-4 top-4.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full p-1.5 transition-colors"
                    title="Очистить поиск"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Информация о результатах поиска */}
              {equipmentSearch && (
                <div className="mb-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-medium text-blue-800">
                    {filteredEquipmentList.length > 0 ? (
                      <>Найдено: <span className="font-bold">{filteredEquipmentList.length}</span> из <span className="font-bold">{equipmentList.length}</span> оборудования</>
                    ) : (
                      <span className="text-red-700">❌ Оборудование не найдено. Попробуйте другой запрос.</span>
                    )}
                  </p>
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
                  {/* Показываем выбранное оборудование */}
                  {selectedEquipmentDetails.length > 0 && (
                    <div className="mb-3 p-4 bg-gradient-to-r from-primary-50 to-blue-50 border-2 border-primary-200 rounded-xl shadow-soft">
                      <div className="flex items-center gap-2 mb-3">
                        <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm font-bold text-primary-700">
                          Выбрано: {selectedEquipmentDetails.length}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedEquipmentDetails.map((eq) => (
                          <div
                            key={eq.id}
                            className="group inline-flex items-center gap-2 px-3 py-2 bg-white border-2 border-primary-300 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
                          >
                            <span className="text-sm font-semibold text-gray-900">
                              {eq.passport_number} • {eq.equipment_type}
                              {eq.position && <span className="text-primary-600"> ({eq.position})</span>}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedEquipmentIds(prev => prev.filter(id => id !== String(eq.id)))
                                setFormData(prev => ({ ...prev, equipment_id: '' }))
                              }}
                              className="text-red-600 hover:text-white hover:bg-red-600 rounded-full p-1 transition-all duration-200"
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

                  {/* Выпадающий список с чекбоксами */}
                  <div className="relative" ref={equipmentDropdownRef}>
                    <div
                      className="w-full px-4 py-3.5 text-base border-2 border-gray-300 rounded-xl focus-within:ring-4 focus-within:ring-primary-200 focus-within:border-primary-600 bg-white text-gray-900 font-medium cursor-pointer transition-all shadow-md hover:shadow-lg hover:border-primary-400"
                      onClick={() => {
                        if (equipmentList.length > 0) {
                          setShowEquipmentDropdown(!showEquipmentDropdown)
                        } else {
                          addNotification('Загрузка оборудования...', 'info')
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className={selectedEquipmentIds.length > 0 ? 'text-gray-900 font-semibold' : 'text-gray-400'}>
                          {selectedEquipmentIds.length > 0
                            ? `✓ Выбрано: ${selectedEquipmentIds.length} ${selectedEquipmentIds.length === 1 ? 'оборудование' : 'оборудования'}`
                            : equipmentList.length > 0
                            ? 'Нажмите для выбора оборудования'
                            : 'Загрузка оборудования...'}
                        </span>
                        <svg
                          className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${showEquipmentDropdown ? 'transform rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Выпадающий список */}
                    {showEquipmentDropdown && equipmentList.length > 0 && (
                      <div className="absolute z-50 w-full mt-2 bg-white border-2 border-primary-300 rounded-xl shadow-2xl max-h-96 overflow-hidden">
                        {/* Заголовок выпадающего списка */}
                        <div className="p-4 bg-gradient-to-r from-primary-50 to-blue-50 border-b-2 border-primary-200 sticky top-0 z-10">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <p className="text-sm font-bold text-primary-700">
                                {equipmentSearch
                                  ? filteredEquipmentList.length > 0
                                    ? `Найдено: ${filteredEquipmentList.length} из ${equipmentList.length}`
                                    : 'Оборудование не найдено'
                                  : `Всего: ${equipmentList.length} оборудования`}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowEquipmentDropdown(false)
                              }}
                              className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full p-1.5 transition-colors"
                              title="Закрыть"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          {selectedEquipmentIds.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedEquipmentIds([])
                                setFormData(prev => ({ ...prev, equipment_id: '' }))
                              }}
                              className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1 hover:bg-red-50 rounded transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              Очистить все ({selectedEquipmentIds.length})
                            </button>
                          )}
                        </div>

                        {/* Список оборудования с чекбоксами */}
                        <div className="max-h-80 overflow-y-auto">
                          {filteredEquipmentList.length > 0 ? (
                            <div className="divide-y divide-gray-100">
                              {filteredEquipmentList.map((eq) => {
                                const isSelected = selectedEquipmentIds.includes(String(eq.id))
                                return (
                                  <label
                                    key={eq.id}
                                    className={`flex items-start gap-3 p-4 cursor-pointer transition-all duration-150 ${
                                      isSelected
                                        ? 'bg-primary-50 hover:bg-primary-100 border-l-4 border-primary-500'
                                        : 'hover:bg-gray-50'
                                    }`}
                                  >
                                    <div className="flex-shrink-0 mt-0.5">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(e) => {
                                          e.stopPropagation()
                                          handleEquipmentToggle(String(eq.id))
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-5 h-5 text-primary-600 border-2 border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 cursor-pointer transition-all"
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-bold text-gray-900">
                                              {eq.passport_number}
                                            </span>
                                            <span className="text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full font-semibold">
                                              {eq.equipment_type}
                                            </span>
                                          </div>
                                          <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                                            {eq.position && (
                                              <span className="flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                                {eq.position}
                                              </span>
                                            )}
                                            {eq.workshop && (
                                              <span className="flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                </svg>
                                                {eq.workshop}
                                              </span>
                                            )}
                                            {eq.inventory_number && (
                                              <span className="flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                                                </svg>
                                                {eq.inventory_number}
                                              </span>
                                            )}
                                          </div>
                                          {eq.installation_location && (
                                            <p className="text-xs text-gray-500 mt-1 truncate">
                                              {eq.installation_location}
                                            </p>
                                          )}
                                        </div>
                                        {isSelected && (
                                          <div className="flex-shrink-0">
                                            <div className="w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center">
                                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                              </svg>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </label>
                                )
                              })}
                            </div>
                          ) : equipmentSearch ? (
                            <div className="p-8 text-center">
                              <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <p className="text-sm font-semibold text-gray-600 mb-1">Оборудование не найдено</p>
                              <p className="text-xs text-gray-500">Попробуйте изменить поисковый запрос или очистить фильтр</p>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEquipmentSearch('')
                                }}
                                className="mt-3 px-4 py-2 text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
                              >
                                Очистить поиск
                              </button>
                            </div>
                          ) : (
                            <div className="p-8 text-center">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-3"></div>
                              <p className="text-sm font-semibold text-gray-500">Загрузка оборудования...</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 mt-2">
                    💡 Выберите одно или несколько оборудований. Первое выбранное используется для работы ИИ.
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
