'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import dynamic from 'next/dynamic'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

// Динамический импорт для избежания проблем с SSR
const DragDropContext = dynamic(() => import('react-beautiful-dnd').then(mod => mod.DragDropContext), { ssr: false })
const Droppable = dynamic(() => import('react-beautiful-dnd').then(mod => mod.Droppable), { ssr: false })
const Draggable = dynamic(() => import('react-beautiful-dnd').then(mod => mod.Draggable), { ssr: false })

type DropResult = import('react-beautiful-dnd').DropResult

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface ChecklistItem {
  id?: number
  item_type: string
  label: string
  description?: string
  is_required: boolean
  order: number
  options?: any
  validation_rules?: any
}

interface ChecklistConstructorProps {
  checklistId: number | null
  onClose: () => void
  onSuccess: () => void
}

export default function ChecklistConstructor({ checklistId, onClose, onSuccess }: ChecklistConstructorProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [equipmentType, setEquipmentType] = useState('')
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [newItem, setNewItem] = useState<Partial<ChecklistItem>>({
    item_type: 'text',
    label: '',
    is_required: false,
    order: 0,
  })

  useEffect(() => {
    if (checklistId) {
      fetchChecklist()
    }
  }, [checklistId])

  const fetchChecklist = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/checklists/${checklistId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const checklist = response.data
      setName(checklist.name)
      setDescription(checklist.description || '')
      setEquipmentType(checklist.equipment_type || '')
      setItems(checklist.items || [])
    } catch (error: any) {
      addNotification('Ошибка загрузки чек-листа', 'error')
    }
  }

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return

    const newItems = Array.from(items)
    const [reorderedItem] = newItems.splice(result.source.index, 1)
    newItems.splice(result.destination.index, 0, reorderedItem)

    // Обновление порядка
    const updatedItems = newItems.map((item, index) => ({
      ...item,
      order: index,
    }))
    setItems(updatedItems)

    // Сохранение порядка на сервере
    if (checklistId) {
      try {
        const itemOrders: Record<string, number> = {}
        updatedItems.forEach((item, index) => {
          if (item.id) {
            itemOrders[item.id] = index
          }
        })
        await axios.post(
          `${API_URL}/api/checklists/${checklistId}/reorder`,
          { item_orders: itemOrders },
          { headers: { Authorization: `Bearer ${token}` } }
        )
      } catch (error: any) {
        addNotification('Ошибка сохранения порядка', 'error')
      }
    }
  }

  const addItem = () => {
    if (!newItem.label) {
      addNotification('Введите название пункта', 'error')
      return
    }

    const item: ChecklistItem = {
      item_type: newItem.item_type || 'text',
      label: newItem.label,
      description: newItem.description,
      is_required: newItem.is_required || false,
      order: items.length,
      options: newItem.options,
      validation_rules: newItem.validation_rules,
    }

    setItems([...items, item])
    setNewItem({
      item_type: 'text',
      label: '',
      is_required: false,
      order: items.length + 1,
    })
  }

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index)
    setItems(newItems.map((item, i) => ({ ...item, order: i })))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const checklistData = {
        name,
        description,
        equipment_type: equipmentType || null,
        items: items.map((item, index) => ({
          ...item,
          order: index,
        })),
      }

      if (checklistId) {
        await axios.put(
          `${API_URL}/api/checklists/${checklistId}`,
          { name, description, equipment_type: equipmentType || null },
          { headers: { Authorization: `Bearer ${token}` } }
        )
        // Сохранение элементов
        for (const item of items) {
          if (item.id) {
            await axios.put(
              `${API_URL}/api/checklists/items/${item.id}`,
              item,
              { headers: { Authorization: `Bearer ${token}` } }
            )
          } else {
            await axios.post(
              `${API_URL}/api/checklists/${checklistId}/items`,
              item,
              { headers: { Authorization: `Bearer ${token}` } }
            )
          }
        }
        addNotification('Чек-лист успешно обновлен', 'success')
      } else {
        await axios.post(
          `${API_URL}/api/checklists`,
          checklistData,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        addNotification('Чек-лист успешно создан', 'success')
      }
      onSuccess()
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка сохранения', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto my-8">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
          <h2 className="text-2xl font-semibold text-gray-900">
            {checklistId ? 'Редактировать чек-лист' : 'Создать чек-лист'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Название *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Тип ПС
              </label>
              <select
                value={equipmentType}
                onChange={(e) => setEquipmentType(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Все типы</option>
                <option value="Кран">Кран</option>
                <option value="Подъемник">Подъемник</option>
                <option value="Лифт">Лифт</option>
                <option value="Эскалатор">Эскалатор</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Описание
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Элементы чек-листа</h3>

            {/* Форма добавления нового элемента */}
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Тип</label>
                  <select
                    value={newItem.item_type}
                    onChange={(e) => setNewItem({ ...newItem, item_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="text">Текст</option>
                    <option value="bool">Да/Нет</option>
                    <option value="number">Число</option>
                    <option value="photo">Фото</option>
                    <option value="select">Выбор</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
                  <input
                    type="text"
                    value={newItem.label || ''}
                    onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="Название пункта"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={newItem.is_required || false}
                      onChange={(e) => setNewItem({ ...newItem, is_required: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Обязательный</span>
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={addItem}
                className="w-full bg-primary-600 text-white py-2 px-4 rounded-lg hover:bg-primary-700 text-sm"
              >
                Добавить пункт
              </button>
            </div>

            {/* Список элементов с drag&drop */}
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="checklist-items">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                    {items.map((item, index) => (
                      <Draggable key={index} draggableId={`item-${index}`} index={index}>
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between"
                          >
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <div {...provided.dragHandleProps} className="cursor-move">
                                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                                  </svg>
                                </div>
                                <div>
                                  <span className="text-xs bg-gray-100 px-2 py-1 rounded mr-2">
                                    {item.item_type}
                                  </span>
                                  <span className="font-medium">{item.label}</span>
                                  {item.is_required && (
                                    <span className="ml-2 text-xs text-red-600">*</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="text-red-600 hover:text-red-900 ml-4"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>

          <div className="flex space-x-3 pt-4 border-t border-gray-200">
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

