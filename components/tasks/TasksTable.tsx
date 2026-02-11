'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { format } from 'date-fns'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import FilterBar from '@/components/ui/FilterBar'
import Toolbar from '@/components/ui/Toolbar'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'

const API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || ''
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Task {
  id: number
  title: string
  description?: string | null
  equipment_id?: number | null
  violation_id?: number | null
  assignee_id?: number | null
  created_by: number
  status: string
  priority: string
  due_date?: string | null
  started_at?: string | null
  completed_at?: string | null
  updated_at: string
  equipment?: {
    id: number
    passport_number: string
    equipment_type: string
    position?: string | null
  } | null
  violation?: {
    id: number
    description: string
    severity: string
    status: string
  } | null
  assignee?: {
    id: number
    username: string
    full_name?: string | null
  } | null
}

interface TasksTableProps {
  equipmentFilterId?: number | null
  refreshKey?: number
}

export default function TasksTable({ equipmentFilterId = null, refreshKey = 0 }: TasksTableProps) {
  const { token, user } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const router = useRouter()

  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')

  const isAdmin = (user?.roles || []).some((role) => role.name === 'admin')

  useEffect(() => {
    fetchTasks()
  }, [statusFilter, priorityFilter, equipmentFilterId, refreshKey])

  const fetchTasks = async () => {
    if (!token) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (priorityFilter) params.append('priority', priorityFilter)
      if (equipmentFilterId) params.append('equipment_id', String(equipmentFilterId))

      const response = await axios.get(`${API_URL}/api/tasks?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setTasks(response.data || [])
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка загрузки задач', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteTask = async (task: Task) => {
    if (!token) {
      addNotification('Ошибка авторизации', 'error')
      return
    }
    if (!confirm(`Удалить задачу #${task.id}? Действие необратимо.`)) {
      return
    }
    try {
      await axios.delete(`${API_URL}/api/tasks/${task.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      addNotification(`Задача #${task.id} удалена`, 'success')
      fetchTasks()
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка удаления задачи', 'error')
    }
  }

  const getStatusTone = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success'
      case 'in_work':
        return 'info'
      case 'cancelled':
        return 'neutral'
      default:
        return 'warning'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Завершена'
      case 'in_work':
        return 'В работе'
      case 'cancelled':
        return 'Отменена'
      case 'open':
        return 'Открыта'
      default:
        return status
    }
  }

  const getPriorityTone = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'danger'
      case 'high':
        return 'warning'
      case 'medium':
        return 'info'
      default:
        return 'neutral'
    }
  }

  const getPriorityText = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'Срочный'
      case 'high':
        return 'Высокий'
      case 'medium':
        return 'Средний'
      case 'low':
        return 'Низкий'
      default:
        return priority
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
      <FilterBar className="border-0 border-b border-slate-200 rounded-none p-5">
        <Toolbar className="gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Все статусы</option>
            <option value="open">Открыта</option>
            <option value="in_work">В работе</option>
            <option value="completed">Завершена</option>
            <option value="cancelled">Отменена</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Все приоритеты</option>
            <option value="urgent">Срочный</option>
            <option value="high">Высокий</option>
            <option value="medium">Средний</option>
            <option value="low">Низкий</option>
          </select>

          <button
            type="button"
            onClick={() => {
              setStatusFilter('')
              setPriorityFilter('')
            }}
            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
          >
            Сбросить
          </button>
        </Toolbar>

        {equipmentFilterId && (
          <div className="mt-3">
            <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full border bg-primary-50 text-primary-700 border-primary-200">
              Фильтр по оборудованию: #{equipmentFilterId}
            </span>
          </div>
        )}
      </FilterBar>

      {loading ? (
        <div className="p-6 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
        </div>
      ) : (
        <div className="w-full">
          <div className="hidden lg:block overflow-x-auto max-h-[68vh]">
            <table className="min-w-[1300px] w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[280px]">Задача</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[210px]">Оборудование</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[180px]">Нарушение</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[140px]">Исполнитель</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[120px]">Приоритет</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[120px]">Статус</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[130px]">Срок</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[180px]">Действия</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {tasks.map((task) => (
                  <tr key={task.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-slate-900">{task.title}</div>
                      <div className="text-xs text-slate-500 mt-1">#{task.id} • {format(new Date(task.updated_at), 'dd.MM.yyyy')}</div>
                      {task.description && (
                        <div
                          className="text-xs text-slate-600 mt-1"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {task.description}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm text-slate-700">
                      {task.equipment ? (
                        <div>
                          <div className="font-semibold text-slate-900">{task.equipment.passport_number}</div>
                          <div className="text-xs text-slate-500">{task.equipment.equipment_type}</div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm text-slate-700">
                      {task.violation ? (
                        <button
                          type="button"
                          onClick={() => router.push('/violations')}
                          className="text-primary-700 hover:text-primary-900"
                        >
                          Нарушение #{task.violation.id}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm text-slate-700">
                      {task.assignee?.full_name || task.assignee?.username || '—'}
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge label={getPriorityText(task.priority)} tone={getPriorityTone(task.priority)} />
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge label={getStatusText(task.status)} tone={getStatusTone(task.status)} />
                    </td>

                    <td className="px-4 py-3 text-sm text-slate-600">
                      {task.due_date ? format(new Date(task.due_date), 'dd.MM.yyyy') : '—'}
                    </td>

                    <td className="px-4 py-3 text-right text-sm font-medium">
                      <div className="inline-flex items-center gap-2">
                        {task.equipment_id && (
                          <button
                            onClick={() => router.push(`/equipment?equipment_id=${task.equipment_id}`)}
                            className="px-2.5 py-1 text-xs font-semibold rounded border border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100"
                          >
                            ПС
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteTask(task)}
                            className="px-2.5 py-1 text-xs font-semibold rounded border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100"
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden divide-y divide-slate-200">
            {tasks.map((task) => (
              <div key={task.id} className="p-4 bg-white">
                <p className="text-base font-semibold text-slate-900">{task.title}</p>
                <p className="text-xs text-slate-500 mt-1">Задача #{task.id}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusBadge label={getPriorityText(task.priority)} tone={getPriorityTone(task.priority)} />
                  <StatusBadge label={getStatusText(task.status)} tone={getStatusTone(task.status)} />
                </div>

                {task.equipment && (
                  <p className="text-sm text-slate-600 mt-3">
                    ПС: <span className="font-semibold">{task.equipment.passport_number}</span>
                  </p>
                )}

                <div className="mt-3 text-sm text-slate-600">
                  Срок: {task.due_date ? format(new Date(task.due_date), 'dd.MM.yyyy') : '—'}
                </div>

                {isAdmin && (
                  <button
                    onClick={() => handleDeleteTask(task)}
                    className="mt-3 w-full inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-rose-700 bg-rose-50 rounded-lg"
                  >
                    Удалить
                  </button>
                )}
              </div>
            ))}
          </div>

          {tasks.length === 0 && (
            <EmptyState title="Задачи не найдены" description="Попробуйте изменить фильтры." />
          )}
        </div>
      )}
    </div>
  )
}
