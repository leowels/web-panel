'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import Layout from '@/components/Layout'
import PageHeader from '@/components/ui/PageHeader'
import FilterBar from '@/components/ui/FilterBar'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

const API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || ''
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface WorkflowOverviewItem {
  equipment_id: number
  passport_number: string
  equipment_type: string
  workshop?: string | null
  inspections_total: number
  inspections_completed: number
  violations_open: number
  tasks_open: number
  tasks_in_work: number
  acts_draft: number
  acts_signed: number
  acts_completed: number
  last_inspection_at?: string | null
}

interface WorkflowCase {
  violation_id: number
  violation_status: string
  violation_severity: string
  task_ids: number[]
  open_task_ids: number[]
  act_ids: number[]
  draft_act_ids: number[]
}

interface WorkflowEquipmentDetails {
  equipment_id: number
  passport_number: string
  equipment_type: string
  workshop?: string | null
  inspections_total: number
  inspections_completed: number
  violations_open: number
  violations_resolved: number
  tasks_open: number
  tasks_in_work: number
  tasks_completed: number
  acts_draft: number
  acts_signed: number
  acts_archived: number
  acts_completed: number
  last_inspection_at?: string | null
  cases: WorkflowCase[]
}

export default function WorkflowPage() {
  const router = useRouter()
  const { isAuthenticated, token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [loading, setLoading] = useState(true)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [rows, setRows] = useState<WorkflowOverviewItem[]>([])
  const [search, setSearch] = useState('')
  const [workshopFilter, setWorkshopFilter] = useState('')
  const [selected, setSelected] = useState<WorkflowEquipmentDetails | null>(null)

  const fetchOverview = async () => {
    if (!token) return
    setLoading(true)
    try {
      const response = await axios.get(`${API_URL}/api/workflow/overview`, {
        params: { limit: 500, workshop: workshopFilter || undefined },
        headers: { Authorization: `Bearer ${token}` },
      })
      setRows(response.data || [])
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка загрузки workflow', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchDetails = async (equipmentId: number) => {
    if (!token) return
    setDetailsLoading(true)
    try {
      const response = await axios.get(`${API_URL}/api/workflow/equipment/${equipmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setSelected(response.data)
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка загрузки деталей workflow', 'error')
    } finally {
      setDetailsLoading(false)
    }
  }

  useEffect(() => {
    fetchOverview()
  }, [token, workshopFilter])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (item) =>
        item.passport_number.toLowerCase().includes(q) ||
        item.equipment_type.toLowerCase().includes(q) ||
        (item.workshop || '').toLowerCase().includes(q)
    )
  }, [rows, search])

  const workshopOptions = useMemo(
    () => Array.from(new Set(rows.map((item) => item.workshop).filter(Boolean))) as string[],
    [rows]
  )

  const summary = useMemo(() => {
    const total = rows.length
    const withoutInspections = rows.filter((item) => item.inspections_total === 0).length
    const withOpenViolations = rows.filter((item) => item.violations_open > 0).length
    const withoutTasks = rows.filter((item) => item.violations_open > 0 && (item.tasks_open + item.tasks_in_work) === 0).length
    const withoutActs = rows.filter((item) => item.violations_open > 0 && (item.acts_draft + item.acts_signed + item.acts_completed) === 0).length
    return {
      total,
      withoutInspections,
      withOpenViolations,
      withoutTasks,
      withoutActs,
    }
  }, [rows])

  const renderChainBadges = (row: WorkflowOverviewItem) => {
    const inspectionsTone = row.inspections_total > 0 ? 'success' : 'warning'
    const violationsTone = row.violations_open > 0 ? 'danger' : 'success'
    const tasksTone =
      row.violations_open === 0
        ? 'neutral'
        : row.tasks_in_work > 0
          ? 'info'
          : row.tasks_open > 0
            ? 'warning'
            : 'danger'
    const actsTone =
      row.violations_open === 0
        ? 'neutral'
        : row.acts_signed + row.acts_completed > 0
          ? 'success'
          : row.acts_draft > 0
            ? 'info'
            : 'danger'

    return (
      <div className="flex flex-wrap gap-1">
        <StatusBadge label="Осмотр" tone={inspectionsTone} />
        <StatusBadge label="Нарушения" tone={violationsTone} />
        <StatusBadge label="Задачи" tone={tasksTone} />
        <StatusBadge label="Акты" tone={actsTone} />
      </div>
    )
  }

  const stageBadge = (done: boolean) =>
    done ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'

  if (!isAuthenticated) return null

  return (
    <Layout>
      <div className="p-4 sm:p-6">
        <div className="max-w-[1600px] mx-auto space-y-6">
          <PageHeader
            title="Сквозной workflow"
            subtitle="Осмотр → Нарушение → Задача → Акт → Закрытие"
            actions={(
              <button
                type="button"
                onClick={fetchOverview}
                className="inline-flex items-center justify-center px-4 py-2 border border-primary-200 text-sm font-semibold rounded-lg text-primary-700 bg-primary-50 hover:bg-primary-100"
              >
                Обновить
              </button>
            )}
          />

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs uppercase text-slate-400">Всего объектов</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{summary.total}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs uppercase text-slate-400">Без осмотров</div>
              <div className="mt-1 text-2xl font-semibold text-amber-600">{summary.withoutInspections}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs uppercase text-slate-400">Открытые нарушения</div>
              <div className="mt-1 text-2xl font-semibold text-red-600">{summary.withOpenViolations}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs uppercase text-slate-400">Нет задач</div>
              <div className="mt-1 text-2xl font-semibold text-amber-600">{summary.withoutTasks}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs uppercase text-slate-400">Нет актов</div>
              <div className="mt-1 text-2xl font-semibold text-amber-600">{summary.withoutActs}</div>
            </div>
          </div>

          <FilterBar className="p-4 sm:p-5">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по паспорту, типу, цеху"
                className="lg:col-span-3 px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <select
                value={workshopFilter}
                onChange={(e) => setWorkshopFilter(e.target.value)}
                className="px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Все цеха</option>
                {workshopOptions.map((workshop) => (
                  <option key={workshop} value={workshop}>
                    {workshop}
                  </option>
                ))}
              </select>
            </div>
          </FilterBar>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Паспорт</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Осмотры</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Нарушения</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Задачи</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Акты</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Цепочка</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Действия</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredRows.map((row) => (
                        <tr key={row.equipment_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="text-sm font-semibold text-gray-900">{row.passport_number}</div>
                            <div className="text-xs text-gray-500">{row.equipment_type}</div>
                            {row.workshop && <div className="text-xs text-gray-500">{row.workshop}</div>}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {row.inspections_completed}/{row.inspections_total}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={row.violations_open > 0 ? 'text-red-600 font-semibold' : 'text-emerald-700 font-semibold'}>
                              {row.violations_open}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            открыто: {row.tasks_open}, в работе: {row.tasks_in_work}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            черновик: {row.acts_draft}, подписано: {row.acts_signed + row.acts_completed}
                          </td>
                          <td className="px-4 py-3">
                            {renderChainBadges(row)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => fetchDetails(row.equipment_id)}
                              className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-semibold rounded-lg border border-primary-200 text-primary-700 bg-primary-50 hover:bg-primary-100"
                            >
                              Детали
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredRows.length === 0 && (
                    <EmptyState title="Данные не найдены" description="Попробуйте изменить фильтры." />
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
              {detailsLoading ? (
                <div className="p-6 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                </div>
              ) : selected ? (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{selected.passport_number}</h2>
                    <p className="text-sm text-gray-600">{selected.equipment_type}</p>
                    {selected.workshop && <p className="text-xs text-gray-500">{selected.workshop}</p>}
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div className={`border rounded-lg px-3 py-2 text-sm ${stageBadge(selected.inspections_completed > 0)}`}>
                      Осмотр: {selected.inspections_completed}/{selected.inspections_total}
                    </div>
                    <div className={`border rounded-lg px-3 py-2 text-sm ${stageBadge(selected.violations_open === 0 && (selected.violations_resolved > 0 || selected.violations_open === 0))}`}>
                      Нарушения: открыто {selected.violations_open}, устранено {selected.violations_resolved}
                    </div>
                    <div className={`border rounded-lg px-3 py-2 text-sm ${stageBadge(selected.tasks_open === 0 && selected.tasks_in_work === 0)}`}>
                      Задачи: открыто {selected.tasks_open}, в работе {selected.tasks_in_work}, закрыто {selected.tasks_completed}
                    </div>
                    <div className={`border rounded-lg px-3 py-2 text-sm ${stageBadge(selected.acts_signed + selected.acts_completed > 0)}`}>
                      Акты: черновик {selected.acts_draft}, подписано {selected.acts_signed + selected.acts_completed}
                    </div>
                  </div>

                  <div className="pt-2">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Связки по нарушениям</p>
                    <div className="max-h-[260px] overflow-auto border border-gray-200 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase">ID</th>
                            <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase">Статус</th>
                            <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase">Задачи</th>
                            <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase">Акты</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {selected.cases.slice(0, 50).map((item) => (
                            <tr key={item.violation_id}>
                              <td className="px-2 py-2 text-xs font-semibold text-gray-800">#{item.violation_id}</td>
                              <td className="px-2 py-2 text-xs">{item.violation_status}</td>
                              <td className="px-2 py-2 text-xs">{item.open_task_ids.length}/{item.task_ids.length}</td>
                              <td className="px-2 py-2 text-xs">{item.draft_act_ids.length}/{item.act_ids.length}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      onClick={() => router.push(`/violations?equipment_id=${selected.equipment_id}`)}
                      className="inline-flex items-center justify-center px-3 py-2 text-sm font-semibold rounded-lg border border-primary-200 text-primary-700 bg-primary-50 hover:bg-primary-100"
                    >
                      К нарушениям
                    </button>
                    <button
                      onClick={() => router.push(`/acts?equipment_id=${selected.equipment_id}`)}
                      className="inline-flex items-center justify-center px-3 py-2 text-sm font-semibold rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                    >
                      К актам
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-sm text-gray-500 text-center">
                  Выберите оборудование слева, чтобы увидеть цепочку процесса.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
