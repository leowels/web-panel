'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import dynamic from 'next/dynamic'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Динамический импорт для избежания проблем с SSR
const DragDropContextDynamic = dynamic(() => import('react-beautiful-dnd').then(mod => mod.DragDropContext), { ssr: false })
const DroppableDynamic = dynamic(() => import('react-beautiful-dnd').then(mod => mod.Droppable), { ssr: false })
const DraggableDynamic = dynamic(() => import('react-beautiful-dnd').then(mod => mod.Draggable), { ssr: false })

type DropResult = import('react-beautiful-dnd').DropResult

interface Violation {
  id: number
  description: string
  severity: string
  status: string
  deadline: string | null
  equipment_id: number
}

interface DefectsKanbanProps {
  theme: 'light' | 'dark'
}

const columns = [
  { id: 'open', title: 'Новые', status: 'open' },
  { id: 'in_progress', title: 'В работе', status: 'in_progress' },
  { id: 'pending', title: 'Ожидают проверки', status: 'pending' },
  { id: 'resolved', title: 'Закрытые', status: 'resolved' },
]

export default function DefectsKanban({ theme }: DefectsKanbanProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [violations, setViolations] = useState<Violation[]>([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (token) {
      fetchViolations()
    }
  }, [token])

  const fetchViolations = async () => {
    if (!token) return
    try {
      const response = await axios.get(`${API_URL}/api/violations?limit=1000`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setViolations(response.data)
    } catch (error: any) {
      addNotification('Ошибка загрузки нарушений', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return

    const { draggableId, destination } = result
    const violationId = parseInt(draggableId)
    const newStatus = destination.droppableId

    // Обновление статуса на сервере
    try {
      await axios.put(
        `${API_URL}/api/violations/${violationId}`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      
      // Обновление локального состояния
      setViolations(prev => 
        prev.map(v => v.id === violationId ? { ...v, status: newStatus } : v)
      )
      
      addNotification('Статус обновлен', 'success')
    } catch (error: any) {
      addNotification('Ошибка обновления статуса', 'error')
    }
  }

  const getViolationsByStatus = (status: string) => {
    return violations.filter(v => v.status === status)
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500'
      case 'high':
        return 'bg-orange-500'
      case 'medium':
        return 'bg-yellow-500'
      case 'low':
        return 'bg-blue-500'
      default:
        return 'bg-gray-500'
    }
  }

  if (!mounted || loading) {
    return (
      <div className={`rounded-lg shadow-lg p-6 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="animate-pulse">
          <div className={`h-64 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded`}></div>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-lg shadow-lg p-6 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
      <h2 className={`text-xl font-semibold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
        Панель задач / дефектов
      </h2>
      
      <DragDropContextDynamic onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {columns.map((column) => (
            <DroppableDynamic key={column.id} droppableId={column.status}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`rounded-lg p-4 min-h-[400px] ${
                    snapshot.isDraggingOver
                      ? theme === 'dark' ? 'bg-gray-700' : 'bg-blue-50'
                      : theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'
                  }`}
                >
                  <h3 className={`font-semibold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {column.title} ({getViolationsByStatus(column.status).length})
                  </h3>
                  <div className="space-y-2">
                    {getViolationsByStatus(column.status).map((violation, index) => (
                      <DraggableDynamic
                        key={violation.id}
                        draggableId={String(violation.id)}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`p-3 rounded-lg border ${
                              theme === 'dark' 
                                ? 'bg-gray-800 border-gray-600' 
                                : 'bg-white border-gray-200'
                            } ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className={`w-2 h-2 rounded-full ${getSeverityColor(violation.severity)}`}></div>
                              <span className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                #{violation.id}
                              </span>
                            </div>
                            <div className={`text-sm mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                              {violation.description.substring(0, 60)}...
                            </div>
                            {violation.deadline && (
                              <div className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                Срок: {new Date(violation.deadline).toLocaleDateString('ru-RU')}
                              </div>
                            )}
                          </div>
                        )}
                      </DraggableDynamic>
                    ))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </DroppableDynamic>
          ))}
        </div>
      </DragDropContextDynamic>
    </div>
  )
}

