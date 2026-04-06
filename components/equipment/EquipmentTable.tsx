'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { EQUIPMENT_TYPES } from '@/constants/equipmentTypes'
import EquipmentBulkEdit from './EquipmentBulkEdit'
import EquipmentBulkDates from './EquipmentBulkDates'
import { useAIContextStore } from '@/store/aiContextStore'
import FilterBar from '@/components/ui/FilterBar'
import Toolbar from '@/components/ui/Toolbar'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'
import { canMutateData } from '@/utils/roles'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface Equipment {
  id: number
  equipment_type: string
  passport_number: string
  registration_number?: string | null
  factory_number?: string | null
  inventory_number: string | null
  position: string | null
  workshop: string | null
  rostekhnadzor_registered?: boolean | null
  load_capacity: number | null
  manufacturer: string | null
  installation_date: string | null
  pto_date: string | null
  cto_date: string | null
  installation_location: string | null
  status: string
  created_at: string
  updated_at: string
  violations_open?: number | null
  violations_total?: number | null
}

interface EquipmentTableProps {
  onEdit: (id: number) => void
  onView: (id: number) => void
  onViewHistory: (id: number) => void
  refreshKey?: number
  initialTaskEquipmentId?: number | null
}

export default function EquipmentTable({ onEdit, onView, onViewHistory, refreshKey = 0, initialTaskEquipmentId }: EquipmentTableProps) {
  const { token, user } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const { setFilters, setSelection } = useAIContextStore()
  const router = useRouter()
  const canMutate = canMutateData(user)
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [workshopFilter, setWorkshopFilter] = useState('')
  const [maintenanceFilter, setMaintenanceFilter] = useState('')
  const [maintenanceScope, setMaintenanceScope] = useState<'any' | 'pto' | 'cto'>('any')
  const [sortBy, setSortBy] = useState<'updated_at' | 'passport_number' | 'equipment_type' | 'status' | 'pto_date' | 'cto_date' | 'installation_date'>('updated_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [total, setTotal] = useState(0)
  const [equipmentTypes, setEquipmentTypes] = useState<string[]>([])
  const [actionsOpenId, setActionsOpenId] = useState<number | null>(null)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [taskEquipmentId, setTaskEquipmentId] = useState<number | null>(null)
  const [taskSaving, setTaskSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
    due_date: '',
  })
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [showBulkDates, setShowBulkDates] = useState(false)

  useEffect(() => {
    fetchEquipmentTypes()
  }, [token])

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, 350)
    return () => clearTimeout(handler)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, typeFilter, statusFilter, workshopFilter, maintenanceFilter, maintenanceScope, sortBy, sortDir, pageSize])

  useEffect(() => {
    setFilters({
      search: debouncedSearch,
      type: typeFilter,
      status: statusFilter,
      workshop: workshopFilter,
      maintenance: maintenanceFilter,
      maintenanceScope,
      sortBy,
      sortDir,
      pageSize,
    })
  }, [debouncedSearch, typeFilter, statusFilter, workshopFilter, maintenanceFilter, maintenanceScope, sortBy, sortDir, pageSize, setFilters])

  useEffect(() => {
    fetchEquipment()
  }, [debouncedSearch, typeFilter, statusFilter, workshopFilter, maintenanceFilter, maintenanceScope, sortBy, sortDir, page, pageSize, refreshKey])

  useEffect(() => {
    if (actionsOpenId === null) return
    const handleClose = () => setActionsOpenId(null)
    window.addEventListener('click', handleClose)
    return () => window.removeEventListener('click', handleClose)
  }, [actionsOpenId])

  useEffect(() => {
    if (initialTaskEquipmentId) {
      openTaskModalFor(initialTaskEquipmentId)
    }
  }, [initialTaskEquipmentId, canMutate])

  useEffect(() => {
    if (canMutate) return
    setSelectedIds([])
    setShowBulkEdit(false)
    setShowBulkDates(false)
    setShowTaskModal(false)
    setActionsOpenId(null)
  }, [canMutate])

  const fetchEquipmentTypes = async () => {
    try {
      if (!token) {
        setEquipmentTypes(EQUIPMENT_TYPES as unknown as string[])
        return
      }
      const response = await axios.get(`${API_URL}/api/equipment/types`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (Array.isArray(response.data) && response.data.length > 0) {
        setEquipmentTypes(response.data)
      } else {
        setEquipmentTypes(EQUIPMENT_TYPES as unknown as string[])
      }
    } catch {
      setEquipmentTypes(EQUIPMENT_TYPES as unknown as string[])
    }
  }

  const fetchEquipment = async () => {
    setLoading(true)
    try {
      const params: any = buildFilterParams()
      params.with_total = true
      params.page = page
      params.page_size = pageSize

      const response = await axios.get(`${API_URL}/api/equipment`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      })
      if (Array.isArray(response.data)) {
        setEquipment(response.data)
        setTotal(response.data.length)
      } else {
        setEquipment(response.data.items || [])
        setTotal(response.data.total || 0)
      }
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка загрузки оборудования', 'error')
    } finally {
      setLoading(false)
    }
  }

  const buildFilterParams = () => {
    const params: any = {
      sort_by: sortBy,
      sort_dir: sortDir,
    }
    if (debouncedSearch) params.search = debouncedSearch
    if (typeFilter) params.equipment_type = typeFilter
    if (statusFilter) params.status = statusFilter
    if (workshopFilter) params.workshop = workshopFilter
    if (maintenanceFilter) params.maintenance = maintenanceFilter
    if (maintenanceScope) params.maintenance_scope = maintenanceScope
    return params
  }

  const clearFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setTypeFilter('')
    setStatusFilter('')
    setWorkshopFilter('')
    setMaintenanceFilter('')
    setMaintenanceScope('any')
    setSortBy('updated_at')
    setSortDir('desc')
    setPage(1)
    setSelectedIds([])
  }

  const handleExport = async () => {
    if (!token) {
      addNotification('Ошибка авторизации', 'error')
      return
    }
    try {
      setExporting(true)
      const response = await axios.get(`${API_URL}/api/equipment/export`, {
        params: {
          ...buildFilterParams(),
          format: 'xlsx',
        },
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(
        new Blob([response.data], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
      )
      const link = document.createElement('a')
      link.href = url
      link.download = `equipment_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      addNotification('Excel-экспорт оборудования готов', 'success')
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка экспорта', 'error')
    } finally {
      setExporting(false)
    }
  }

  const handleDelete = async (id: number, passportNumber: string) => {
    if (!canMutate) return
    if (!confirm(`Удалить оборудование ${passportNumber}?`)) return

    try {
      await axios.delete(`${API_URL}/api/equipment/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      addNotification('Оборудование успешно удалено', 'success')
      fetchEquipment()
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка удаления', 'error')
    }
  }

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canMutate) return
    if (e.target.checked) {
      setSelectedIds(equipment.map(eq => eq.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectOne = (id: number) => {
    if (!canMutate) return
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(selectedId => selectedId !== id)
        : [...prev, id]
    )
  }

  const handleBulkSuccess = () => {
    setSelectedIds([])
    setShowBulkEdit(false)
    setShowBulkDates(false)
    fetchEquipment()
  }

  const pushWithEquipment = (path: string, equipmentId: number) => {
    const params = new URLSearchParams()
    params.set('equipment_id', String(equipmentId))
    router.push(`${path}?${params.toString()}`)
  }

  const pushCreateWithEquipment = (path: string, equipmentId: number) => {
    const params = new URLSearchParams()
    params.set('equipment_id', String(equipmentId))
    params.set('create', '1')
    router.push(`${path}?${params.toString()}`)
  }

  const goToMap = (eq: Equipment) => {
    const params = new URLSearchParams()
    if (eq.workshop) {
      params.set('workshop', eq.workshop)
    }
    params.set('equipment_id', String(eq.id))
    router.push(`/workshop-map?${params.toString()}`)
  }

  const openTaskModalFor = (equipmentId: number) => {
    if (!canMutate) return
    setTaskEquipmentId(equipmentId)
    setTaskForm({
      title: '',
      description: '',
      priority: 'medium',
      due_date: '',
    })
    setShowTaskModal(true)
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canMutate) return
    if (!token) {
      addNotification('Ошибка авторизации', 'error')
      return
    }
    if (!taskEquipmentId) {
      addNotification('Не выбрано оборудование', 'error')
      return
    }
    if (!taskForm.title.trim()) {
      addNotification('Введите название задачи', 'error')
      return
    }
    setTaskSaving(true)
    try {
      const payload: any = {
        title: taskForm.title.trim(),
        description: taskForm.description?.trim() || null,
        equipment_id: taskEquipmentId,
        priority: taskForm.priority,
      }
      if (taskForm.due_date) {
        payload.due_date = `${taskForm.due_date}T00:00:00`
      }
      await axios.post(`${API_URL}/api/tasks`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      })
      addNotification('Задача создана', 'success')
      setShowTaskModal(false)
      setTaskEquipmentId(null)
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка создания задачи', 'error')
    } finally {
      setTaskSaving(false)
    }
  }

  const getStatusTone = (status: string) => {
    switch (status) {
      case 'active':
        return 'success'
      case 'inactive':
        return 'warning'
      case 'archived':
        return 'neutral'
      default:
        return 'info'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Активно'
      case 'inactive':
        return 'Неактивно'
      case 'archived':
        return 'Архив'
      default:
        return status
    }
  }

  const formatDate = (value?: string | null) => {
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('ru-RU')
  }

  const getDueInfo = (value?: string | null) => {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    const now = new Date()
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86400000)
    if (diffDays < 0) {
      return { label: 'Просрочено', className: 'bg-red-100 text-red-800' }
    }
    if (diffDays <= 7) {
      return { label: 'До 7 дней', className: 'bg-red-50 text-red-700' }
    }
    if (diffDays <= 30) {
      return { label: 'До 30 дней', className: 'bg-amber-50 text-amber-700' }
    }
    if (diffDays <= 60) {
      return { label: 'До 60 дней', className: 'bg-yellow-50 text-yellow-700' }
    }
    return { label: `Через ${diffDays} дн`, className: 'bg-emerald-50 text-emerald-700' }
  }

  const formatCapacity = (value?: number | null) => {
    if (value === null || value === undefined) return '—'
    return `${value} т`
  }

  const getRegistrationBadge = (registered?: boolean | null) => {
    if (registered) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          Да
        </span>
      )
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        Нет
      </span>
    )
  }

  const handleViewEquipment = (eq: Equipment) => {
    setSelection({
      type: 'оборудование',
      id: eq.id,
      label: eq.passport_number,
    })
    onView(eq.id)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const typeOptions = equipmentTypes.length ? equipmentTypes : (EQUIPMENT_TYPES as unknown as string[])
  const canPrev = page > 1
  const canNext = page < totalPages
  const hasActiveFilters =
    Boolean(search || typeFilter || statusFilter || workshopFilter || maintenanceFilter) ||
    maintenanceScope !== 'any' ||
    sortBy !== 'updated_at' ||
    sortDir !== 'desc'
  const activeFiltersCount = [
    search,
    typeFilter,
    statusFilter,
    workshopFilter,
    maintenanceFilter,
    maintenanceScope !== 'any' ? maintenanceScope : '',
    sortBy !== 'updated_at' ? sortBy : '',
    sortDir !== 'desc' ? sortDir : '',
  ].filter(Boolean).length
  const visibleStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const visibleEnd = total === 0 ? 0 : Math.min(total, (page - 1) * pageSize + equipment.length)
  const pageStats = equipment.reduce(
    (acc, item) => {
      if (item.status === 'active') acc.active += 1
      else if (item.status === 'inactive') acc.inactive += 1
      else if (item.status === 'archived') acc.archived += 1
      return acc
    },
    { active: 0, inactive: 0, archived: 0 }
  )

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
      <FilterBar className="border-0 border-b border-slate-200 rounded-none p-6 bg-gradient-to-r from-slate-50 to-white">
        <div className="relative mb-5">
          <input
            type="text"
            placeholder="Поиск по паспорту, типу, месту установки, цеху, позиции..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-5 py-4 pl-14 pr-12 text-base border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-primary-100 focus:border-primary-500 bg-white text-slate-900 font-semibold shadow-sm transition-all placeholder:text-slate-400 placeholder:font-normal"
            style={{ fontSize: '16px', lineHeight: '1.5' }}
          />
          <svg className="absolute left-5 top-5 h-5 w-5 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-4 top-4.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full p-1.5 transition-colors"
              title="Очистить поиск"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6 gap-3">
          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-600">Тип оборудования</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-slate-900 text-sm font-medium transition-all"
            >
              <option value="">Все типы</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-600">Статус</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-slate-900 text-sm font-medium transition-all"
            >
              <option value="">Все статусы</option>
              <option value="active">Активно</option>
              <option value="inactive">Неактивно</option>
              <option value="archived">Архив</option>
            </select>
          </div>
          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-600">Цех</label>
            <input
              type="text"
              value={workshopFilter}
              onChange={(e) => setWorkshopFilter(e.target.value)}
              placeholder="Например: Цех 2"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-slate-900 text-sm font-medium transition-all"
            />
          </div>
          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-600">Срок ТО</label>
            <select
              value={maintenanceFilter}
              onChange={(e) => setMaintenanceFilter(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-slate-900 text-sm font-medium transition-all"
            >
              <option value="">Все сроки ТО</option>
              <option value="overdue">Просрочено</option>
              <option value="due_30">Скоро (30 дней)</option>
              <option value="due_60">Скоро (60 дней)</option>
            </select>
          </div>
          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-600">Область ТО</label>
            <select
              value={maintenanceScope}
              onChange={(e) => setMaintenanceScope(e.target.value as 'any' | 'pto' | 'cto')}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-slate-900 text-sm font-medium transition-all"
            >
              <option value="any">ПТО и ЧТО</option>
              <option value="pto">Только ПТО</option>
              <option value="cto">Только ЧТО</option>
            </select>
          </div>
          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-600">Сортировка</label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-slate-900 text-sm font-medium transition-all"
              >
                <option value="updated_at">По обновлению</option>
                <option value="passport_number">По паспорту</option>
                <option value="equipment_type">По типу</option>
                <option value="status">По статусу</option>
                <option value="pto_date">По ПТО</option>
                <option value="cto_date">По ЧТО</option>
                <option value="installation_date">По дате ввода</option>
              </select>
              <button
                type="button"
                onClick={() => setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                className="px-3 py-2.5 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                {sortDir === 'asc' ? 'A-Z' : 'Z-A'}
              </button>
            </div>
          </div>
        </div>
        <Toolbar className="mt-3">
          <div className="inline-flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2.5 bg-white">
            <span className="text-sm text-slate-600">На странице</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="px-2 py-1 border border-slate-300 rounded-md text-sm bg-white"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2.5 border border-blue-200 rounded-lg text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? 'Экспорт...' : 'Экспорт Excel'}
          </button>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Сбросить фильтры
          </button>
        </Toolbar>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700">
            Найдено: {total}
          </span>
          <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700">
            Показано: {visibleStart}-{visibleEnd}
          </span>
          <span className="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700">
            Активно: {pageStats.active}
          </span>
          <span className="px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700">
            Неактивно: {pageStats.inactive}
          </span>
          <span className="px-2.5 py-1 rounded-md bg-gray-100 border border-gray-300 text-gray-700">
            Архив: {pageStats.archived}
          </span>
          {hasActiveFilters && (
            <span className="px-2.5 py-1 rounded-md bg-primary-50 border border-primary-200 text-primary-700">
              Активных фильтров: {activeFiltersCount}
            </span>
          )}
        </div>
        {canMutate && selectedIds.length > 0 && (
          <div className="mt-4 p-4 bg-gradient-to-r from-primary-50 to-blue-50 border-2 border-primary-200 rounded-xl shadow-soft">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-primary-200 shadow-sm">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-bold text-primary-700">
                  Выбрано: {selectedIds.length}
                </span>
              </div>
              <button
                onClick={() => setShowBulkEdit(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Массовое редактирование
              </button>
              <button
                onClick={() => setShowBulkDates(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Назначить даты ПТО/ЧТО
              </button>
              <button
                onClick={() => setSelectedIds([])}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 hover:border-gray-400 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Снять выделение
              </button>
            </div>
          </div>
        )}
      </FilterBar>

      {loading ? (
        <div className="p-12 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-200 border-t-primary-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-500 font-medium">Загрузка...</p>
        </div>
      ) : (
        <div className="w-full">
          <div className="hidden lg:block overflow-x-auto max-h-[68vh]">
            <table className="min-w-[1820px] w-full divide-y divide-slate-200">
              <thead className="bg-slate-100/90 sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 tracking-wide w-12">
                    {canMutate ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.length === equipment.length && equipment.length > 0}
                        onChange={handleSelectAll}
                        className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                    ) : null}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 tracking-wide min-w-[170px]">Паспорт</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 tracking-wide min-w-[260px]">Тип ПС</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 tracking-wide min-w-[150px]">Цех</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 tracking-wide min-w-[140px]">Позиция</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 tracking-wide min-w-[140px]">Статус</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 tracking-wide min-w-[160px]">Ростехнадзор</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 tracking-wide min-w-[150px]">ПТО</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 tracking-wide min-w-[150px]">ЧТО</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 tracking-wide min-w-[130px]">Нарушения</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 tracking-wide min-w-[220px]">Действия</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {equipment.map((eq) => {
                  const ptoInfo = getDueInfo(eq.pto_date)
                  const ctoInfo = getDueInfo(eq.cto_date)
                  return (
                  <tr key={eq.id} className="hover:bg-primary-50/60 even:bg-slate-50/40 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {canMutate ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(eq.id)}
                          onChange={() => handleSelectOne(eq.id)}
                          className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                      ) : null}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap cursor-pointer" onClick={() => handleViewEquipment(eq)}>
                      <div className="text-sm font-semibold text-slate-900 hover:text-primary-700">{eq.passport_number}</div>
                      {eq.registration_number && (
                        <div className="text-[11px] text-slate-500 mt-0.5">Рег: {eq.registration_number}</div>
                      )}
                      {eq.factory_number && (
                        <div className="text-[11px] text-slate-500 mt-0.5">Зав: {eq.factory_number}</div>
                      )}
                      {eq.inventory_number && (
                        <div className="text-[11px] text-slate-500 mt-0.5">Инв: {eq.inventory_number}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-slate-800 truncate" title={eq.equipment_type}>
                        {eq.equipment_type}
                      </div>
                      {eq.load_capacity && (
                        <div className="text-[11px] text-slate-500 mt-0.5">Г/п: {formatCapacity(eq.load_capacity)}</div>
                      )}
                      {eq.installation_location && (
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate" title={eq.installation_location}>
                          {eq.installation_location}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-600">
                      <span title={eq.workshop || '-'}>{eq.workshop || '-'}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-600">
                      {eq.position || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge label={getStatusText(eq.status)} tone={getStatusTone(eq.status)} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getRegistrationBadge(eq.rostekhnadzor_registered)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-600">
                      <div className="text-xs text-slate-700">{formatDate(eq.pto_date)}</div>
                      {ptoInfo && (
                        <span className={`inline-flex mt-1 px-2 py-0.5 text-[11px] font-semibold rounded ${ptoInfo.className}`}>
                          {ptoInfo.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-600">
                      <div className="text-xs text-slate-700">{formatDate(eq.cto_date)}</div>
                      {ctoInfo && (
                        <span className={`inline-flex mt-1 px-2 py-0.5 text-[11px] font-semibold rounded ${ctoInfo.className}`}>
                          {ctoInfo.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          pushWithEquipment('/violations', eq.id)
                        }}
                        className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full ${
                          (eq.violations_open || 0) > 0 ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'
                        }`}
                        title="Открыть нарушения"
                      >
                        {(eq.violations_open || 0)}/{(eq.violations_total ?? eq.violations_open) || 0}
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end space-x-1">
                        <button
                          onClick={() => onViewHistory(eq.id)}
                          className="inline-flex items-center justify-center h-8 w-8 text-primary-600 hover:text-primary-800 hover:bg-primary-100 rounded-lg transition-all"
                          title="История"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                        {canMutate && (
                          <button
                            onClick={() => onEdit(eq.id)}
                            className="inline-flex items-center justify-center h-8 w-8 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-all"
                            title="Редактировать"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                        {canMutate && (
                          <button
                            onClick={() => handleDelete(eq.id, eq.passport_number)}
                            className="inline-flex items-center justify-center h-8 w-8 text-accent-600 hover:text-accent-800 hover:bg-accent-100 rounded-lg transition-all"
                            title="Удалить"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setActionsOpenId(actionsOpenId === eq.id ? null : eq.id)
                            }}
                            className="inline-flex items-center justify-center h-8 w-8 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-all"
                            title="Быстрые действия"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v.01M12 12v.01M12 18v.01" />
                            </svg>
                          </button>
                          {actionsOpenId === eq.id && (
                            <div
                              className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  goToMap(eq)
                                  setActionsOpenId(null)
                                }}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                              >
                                Показать на карте
                              </button>
                              {canMutate ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      pushCreateWithEquipment('/inspections', eq.id)
                                      setActionsOpenId(null)
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                                  >
                                    Создать осмотр
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      pushCreateWithEquipment('/acts', eq.id)
                                      setActionsOpenId(null)
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                                  >
                                    Создать акт
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      pushCreateWithEquipment('/violations', eq.id)
                                      setActionsOpenId(null)
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                                  >
                                    Создать нарушение
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      openTaskModalFor(eq.id)
                                      setActionsOpenId(null)
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                                  >
                                    Создать задачу
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      pushWithEquipment('/inspections', eq.id)
                                      setActionsOpenId(null)
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                                  >
                                    Осмотры
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      pushWithEquipment('/acts', eq.id)
                                      setActionsOpenId(null)
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                                  >
                                    Акты
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      pushWithEquipment('/violations', eq.id)
                                      setActionsOpenId(null)
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                                  >
                                    Нарушения
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      pushWithEquipment('/tasks', eq.id)
                                      setActionsOpenId(null)
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                                  >
                                    Задачи
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
            {equipment.length === 0 && (
              <EmptyState
                title="Оборудование не найдено"
                description="Измените фильтры или добавьте новую запись."
                icon={(
                  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                )}
              />
            )}
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
            <div className="text-sm text-slate-600 font-medium">
              Показано записей: {visibleStart}-{visibleEnd} из {total}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!canPrev}
                onClick={() => setPage(1)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white"
              >
                Первая
              </button>
              <button
                type="button"
                disabled={!canPrev}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white"
              >
                Назад
              </button>
              <span className="text-sm text-slate-700">
                Страница {page} из {totalPages}
              </span>
              <button
                type="button"
                disabled={!canNext}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white"
              >
                Вперед
              </button>
              <button
                type="button"
                disabled={!canNext}
                onClick={() => setPage(totalPages)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white"
              >
                Последняя
              </button>
            </div>
          </div>

          {/* Мобильная версия */}
          <div className="lg:hidden divide-y divide-gray-200">
            {equipment.map((eq) => {
              const ptoInfo = getDueInfo(eq.pto_date)
              const ctoInfo = getDueInfo(eq.cto_date)
              return (
              <div key={eq.id} className="p-4 bg-white border-b border-gray-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {canMutate ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(eq.id)}
                        onChange={() => handleSelectOne(eq.id)}
                        className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-1"
                      />
                    ) : null}
                    <div>
                      <button
                        onClick={() => handleViewEquipment(eq)}
                        className="text-base font-semibold text-left text-gray-900"
                      >
                        {eq.passport_number}
                      </button>
                      <p className="text-sm text-gray-500">{eq.equipment_type}</p>
                      {eq.registration_number && <p className="text-xs text-gray-500">Рег: {eq.registration_number}</p>}
                      {eq.factory_number && <p className="text-xs text-gray-500">Зав: {eq.factory_number}</p>}
                    </div>
                  </div>
                  <StatusBadge label={getStatusText(eq.status)} tone={getStatusTone(eq.status)} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4 text-sm text-gray-600">
                  <div>
                    <p className="text-xs uppercase text-gray-400">Инв. номер</p>
                    <p className="font-semibold text-gray-800">{eq.inventory_number || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-400">Позиция</p>
                    <p className="font-semibold text-gray-800">{eq.position || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-400">Цех</p>
                    <p className="font-semibold text-gray-800">{eq.workshop || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-400">Место установки</p>
                    <p className="font-semibold text-gray-800">{eq.installation_location || '-'}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {eq.load_capacity && (
                    <span className="px-2 py-1 text-xs font-semibold bg-primary-50 text-primary-700 rounded-full">
                      Г/п: {formatCapacity(eq.load_capacity)}
                    </span>
                  )}
                  <span className="px-2 py-1 text-xs font-semibold bg-slate-100 text-slate-700 rounded-full">
                    Ростехнадзор: {eq.rostekhnadzor_registered ? 'да' : 'нет'}
                  </span>
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      (eq.violations_open || 0) > 0 ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    Нарушения: {(eq.violations_open || 0)}/{(eq.violations_total ?? eq.violations_open) || 0}
                  </span>
                  {eq.pto_date && (
                    <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full">
                      ПТО: {formatDate(eq.pto_date)}
                    </span>
                  )}
                  {ptoInfo && (
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${ptoInfo.className}`}>
                      {ptoInfo.label}
                    </span>
                  )}
                  {eq.cto_date && (
                    <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full">
                      ЧТО: {formatDate(eq.cto_date)}
                    </span>
                  )}
                  {ctoInfo && (
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${ctoInfo.className}`}>
                      {ctoInfo.label}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => onView(eq.id)}
                    className="flex-1 min-w-[120px] inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-primary-700 bg-primary-50 border border-primary-200 rounded-lg"
                  >
                    Просмотр
                  </button>
                  {canMutate && (
                    <button
                      onClick={() => onEdit(eq.id)}
                      className="flex-1 min-w-[120px] inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg"
                    >
                      Редактировать
                    </button>
                  )}
                  <button
                    onClick={() => onViewHistory(eq.id)}
                    className="flex-1 min-w-[120px] inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 border border-gray-200 rounded-lg"
                  >
                    История
                  </button>
                  {canMutate && (
                    <button
                      onClick={() => handleDelete(eq.id, eq.passport_number)}
                      className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-accent-700 bg-accent-50 border border-accent-200 rounded-lg"
                    >
                      Удалить
                    </button>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <button
                    onClick={() => goToMap(eq)}
                    className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    На карте
                  </button>
                  {canMutate ? (
                    <>
                      <button
                        onClick={() => pushCreateWithEquipment('/inspections', eq.id)}
                        className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Осмотр
                      </button>
                      <button
                        onClick={() => pushCreateWithEquipment('/acts', eq.id)}
                        className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Акт
                      </button>
                      <button
                        onClick={() => pushCreateWithEquipment('/violations', eq.id)}
                        className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Нарушение
                      </button>
                      <button
                        onClick={() => openTaskModalFor(eq.id)}
                        className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Задача
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => pushWithEquipment('/inspections', eq.id)}
                        className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Осмотры
                      </button>
                      <button
                        onClick={() => pushWithEquipment('/acts', eq.id)}
                        className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Акты
                      </button>
                      <button
                        onClick={() => pushWithEquipment('/violations', eq.id)}
                        className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Нарушения
                      </button>
                      <button
                        onClick={() => pushWithEquipment('/tasks', eq.id)}
                        className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Задачи
                      </button>
                    </>
                  )}
                </div>
              </div>
            )})}
          </div>

          {equipment.length === 0 && (
            <div className="lg:hidden">
              <EmptyState title="Оборудование не найдено" description="Попробуйте изменить фильтры." />
            </div>
          )}
        </div>
      )}

      {canMutate && showBulkEdit && (
        <EquipmentBulkEdit
          selectedIds={selectedIds}
          onClose={() => setShowBulkEdit(false)}
          onSuccess={handleBulkSuccess}
        />
      )}

      {canMutate && showBulkDates && (
        <EquipmentBulkDates
          selectedIds={selectedIds}
          onClose={() => setShowBulkDates(false)}
          onSuccess={handleBulkSuccess}
        />
      )}

      {canMutate && showTaskModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg border border-gray-200">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Новая задача</h3>
                {taskEquipmentId && (
                  <p className="text-xs text-gray-500 mt-1">Оборудование ID: {taskEquipmentId}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowTaskModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Название</label>
                <input
                  type="text"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600"
                  placeholder="Кратко опишите задачу"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Описание</label>
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600"
                  rows={3}
                  placeholder="Дополнительные детали"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1">Приоритет</label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm((prev) => ({ ...prev, priority: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600"
                  >
                    <option value="low">Низкий</option>
                    <option value="medium">Средний</option>
                    <option value="high">Высокий</option>
                    <option value="urgent">Срочный</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1">Срок</label>
                  <input
                    type="date"
                    value={taskForm.due_date}
                    onChange={(e) => setTaskForm((prev) => ({ ...prev, due_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={taskSaving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {taskSaving ? 'Сохранение...' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}






