'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { format } from 'date-fns'
import { canMutateData } from '@/utils/roles'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface Equipment {
  id: number
  equipment_type: string
  passport_number: string
  inventory_number: string | null
  position: string | null
  workshop: string | null
  rostekhnadzor_registered?: boolean | null
  load_capacity: number | null
  manufacturer: string | null
  installation_date: string | null
  pto_date: string | null
  cto_date: string | null
  expertise_date?: string | null
  operation_permit_until?: string | null
  operation_banned?: boolean | null
  epb_positive_details?: string | null
  map_x?: number | null
  map_y?: number | null
  installation_location: string | null
  status: string
  created_at: string
  updated_at: string
}

interface EquipmentCardProps {
  equipmentId: number
  onClose: () => void
  onEdit: () => void
  onOpenRelations?: (tab: 'violations' | 'inspections' | 'acts' | 'tasks', equipmentId: number) => void
}

interface RelatedFile {
  id: number
  original_filename: string
  description?: string | null
  file_type: string
  mime_type: string
  file_size: number
  created_at: string
}

type Tone = 'success' | 'warning' | 'danger' | 'neutral'

const toneClass: Record<Tone, string> = {
  success: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  danger: 'bg-rose-100 text-rose-800 border-rose-200',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
}

export default function EquipmentCard({ equipmentId, onClose, onEdit, onOpenRelations }: EquipmentCardProps) {
  const { token, user } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const router = useRouter()
  const canMutate = canMutateData(user)
  const isAdmin = (user?.roles || []).some((role) => role.name === 'admin')
  const [equipment, setEquipment] = useState<Equipment | null>(null)
  const [loading, setLoading] = useState(true)
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [newFileDescription, setNewFileDescription] = useState('')
  const [newFile, setNewFile] = useState<File | null>(null)
  const [related, setRelated] = useState({
    violations: [] as any[],
    inspections: [] as any[],
    acts: [] as any[],
    tasks: [] as any[],
    files: [] as RelatedFile[],
  })

  useEffect(() => {
    fetchEquipment()
    fetchRelated()
  }, [equipmentId])

  const fetchEquipment = async () => {
    setLoading(true)
    try {
      const response = await axios.get(`${API_URL}/api/equipment/${equipmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setEquipment(response.data)
    } catch {
      addNotification('Ошибка загрузки оборудования', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchRelated = async () => {
    if (!token) return
    setRelatedLoading(true)
    try {
      const params = { equipment_id: equipmentId, limit: 5 }
      const fileParams = { equipment_id: equipmentId }
      const [violations, inspections, acts, tasks, files] = await Promise.allSettled([
        axios.get(`${API_URL}/api/violations`, { params, headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/inspections`, { params, headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/acts`, { params, headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/tasks`, { params, headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/files`, { params: fileParams, headers: { Authorization: `Bearer ${token}` } }),
      ])

      let hasUnexpectedError = false
      const getPayload = <T,>(result: PromiseSettledResult<{ data: T }>, fallback: T): T => {
        if (result.status === 'fulfilled') {
          return result.value?.data ?? fallback
        }
        const error = result.reason
        const status = axios.isAxiosError(error) ? error.response?.status : undefined
        // 401/403 are expected for some read-limited roles (e.g. viewer).
        if (status !== 401 && status !== 403) {
          hasUnexpectedError = true
        }
        return fallback
      }

      setRelated({
        violations: getPayload(violations, [] as any[]),
        inspections: getPayload(inspections, [] as any[]),
        acts: getPayload(acts, [] as any[]),
        tasks: getPayload(tasks, [] as any[]),
        files: getPayload(files, [] as RelatedFile[]),
      })
      if (hasUnexpectedError) {
        addNotification('Ошибка загрузки части связанных данных', 'error')
      }
    } catch {
      addNotification('Ошибка загрузки связанных данных', 'error')
    } finally {
      setRelatedLoading(false)
    }
  }

  const formatDateSafe = (value?: string | null) => {
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '—'
    return format(d, 'dd.MM.yyyy')
  }

  const formatDateTimeSafe = (value?: string | null) => {
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '—'
    return format(d, 'dd.MM.yyyy HH:mm')
  }

  const formatFileSize = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 Б'
    if (bytes < 1024) return `${bytes} Б`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
  }

  const getFileTypeLabel = (fileType: string, mimeType: string) => {
    if (fileType === 'photo') return 'Фото'
    if (fileType === 'pdf') return 'PDF'
    if (fileType === 'video') return 'Видео'
    if (mimeType.includes('word')) return 'DOCX'
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'XLSX'
    return 'Документ'
  }

  const handleFileUpload = async () => {
    if (!canMutate) return
    if (!token) {
      addNotification('Ошибка авторизации', 'error')
      return
    }
    if (!newFile) {
      addNotification('Выберите файл для загрузки', 'warning')
      return
    }
    const formData = new FormData()
    formData.append('file', newFile)
    formData.append('equipment_id', String(equipmentId))
    if (newFileDescription.trim()) {
      formData.append('description', newFileDescription.trim())
    }

    setUploadingFile(true)
    try {
      await axios.post(`${API_URL}/api/files/upload`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setNewFile(null)
      setNewFileDescription('')
      await fetchRelated()
      addNotification('Файл прикреплен к оборудованию', 'success')
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка загрузки файла', 'error')
    } finally {
      setUploadingFile(false)
    }
  }

  const handleDownloadFile = async (file: RelatedFile) => {
    if (!token) {
      addNotification('Ошибка авторизации', 'error')
      return
    }
    try {
      const response = await axios.get(`${API_URL}/api/files/${file.id}`, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` },
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', file.original_filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка скачивания файла', 'error')
    }
  }

  const handleDeleteFile = async (file: RelatedFile) => {
    if (!canMutate) return
    if (!token) {
      addNotification('Ошибка авторизации', 'error')
      return
    }
    if (!confirm(`Удалить файл "${file.original_filename}"?`)) {
      return
    }
    try {
      await axios.delete(`${API_URL}/api/files/${file.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      await fetchRelated()
      addNotification('Файл удален', 'success')
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка удаления файла', 'error')
    }
  }

  const statusBadge = useMemo(() => {
    if (!equipment) return { text: '—', tone: 'neutral' as Tone }
    if (equipment.status === 'active') return { text: 'Активно', tone: 'success' as Tone }
    if (equipment.status === 'inactive') return { text: 'Неактивно', tone: 'warning' as Tone }
    return { text: 'Архив', tone: 'neutral' as Tone }
  }, [equipment])

  const permitBadge = useMemo(() => {
    if (equipment?.operation_banned) {
      return { text: 'Запрет на эксплуатацию', tone: 'danger' as Tone }
    }
    if (!equipment?.operation_permit_until) {
      return { text: 'Срок не указан', tone: 'neutral' as Tone }
    }
    const permit = new Date(equipment.operation_permit_until)
    if (Number.isNaN(permit.getTime())) {
      return { text: 'Некорректная дата', tone: 'neutral' as Tone }
    }
    const diffDays = Math.ceil((permit.getTime() - Date.now()) / 86400000)
    if (diffDays < 0) {
      return { text: `Просрочено: ${Math.abs(diffDays)} дн`, tone: 'danger' as Tone }
    }
    if (diffDays <= 30) {
      return { text: `До окончания: ${diffDays} дн`, tone: 'danger' as Tone }
    }
    if (diffDays <= 90) {
      return { text: `До окончания: ${diffDays} дн`, tone: 'warning' as Tone }
    }
    return { text: `До окончания: ${diffDays} дн`, tone: 'success' as Tone }
  }, [equipment])

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow border border-slate-200 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-slate-200 rounded w-2/3" />
          <div className="h-4 bg-slate-200 rounded" />
          <div className="h-4 bg-slate-200 rounded w-5/6" />
        </div>
      </div>
    )
  }

  if (!equipment) {
    return (
      <div className="bg-white rounded-xl shadow border border-slate-200 p-6">
        <p className="text-slate-500">Оборудование не найдено</p>
      </div>
    )
  }

  const quickStats: Array<{
    title: string
    value: number
    tab: 'violations' | 'inspections' | 'acts' | 'tasks'
    href: string
  }> = [
    { title: 'Нарушения', value: related.violations.length, tab: 'violations', href: `/violations?equipment_id=${equipment.id}` },
    { title: 'Осмотры', value: related.inspections.length, tab: 'inspections', href: `/inspections?equipment_id=${equipment.id}` },
    { title: 'Акты', value: related.acts.length, tab: 'acts', href: `/acts?equipment_id=${equipment.id}` },
    { title: 'Задачи', value: related.tasks.length, tab: 'tasks', href: `/tasks?equipment_id=${equipment.id}` },
  ]

  return (
    <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Карточка крана / ПС</p>
          <h2 className="text-xl font-bold text-slate-900 mt-1">Паспорт № {equipment.passport_number}</h2>
          <p className="text-sm text-slate-600 mt-1">{equipment.equipment_type}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full border ${toneClass[statusBadge.tone]}`}>
              Статус: {statusBadge.text}
            </span>
            <span className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full border ${equipment.rostekhnadzor_registered ? toneClass.success : toneClass.danger}`}>
              Ростехнадзор: {equipment.rostekhnadzor_registered ? 'зарегистрирован' : 'не зарегистрирован'}
            </span>
            {equipment.operation_banned ? (
              <span className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full border ${toneClass.danger}`}>
                Эксплуатация: запрещена
              </span>
            ) : null}
            <span className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full border ${toneClass[permitBadge.tone]}`}>
              Эксплуатация: {permitBadge.text}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded" aria-label="Закрыть">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="border border-slate-200 rounded-xl p-4 bg-white">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Основные сведения</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">ID оборудования</dt><dd className="font-medium text-slate-900">{equipment.id}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Инвентарный номер</dt><dd className="font-medium text-slate-900">{equipment.inventory_number || '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Позиция</dt><dd className="font-medium text-slate-900">{equipment.position || '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Цех</dt><dd className="font-medium text-slate-900">{equipment.workshop || '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Грузоподъемность</dt><dd className="font-medium text-slate-900">{equipment.load_capacity ? `${equipment.load_capacity} т` : '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Завод-изготовитель</dt><dd className="font-medium text-slate-900 text-right">{equipment.manufacturer || '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Место установки</dt><dd className="font-medium text-slate-900 text-right">{equipment.installation_location || '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Создано</dt><dd className="font-medium text-slate-900">{formatDateSafe(equipment.created_at)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Обновлено</dt><dd className="font-medium text-slate-900">{formatDateSafe(equipment.updated_at)}</dd></div>
            </dl>
          </section>

          <section className="border border-slate-200 rounded-xl p-4 bg-slate-50/60">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Экспертиза и допуск</h3>
            <dl className="space-y-2 text-sm mb-3">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Дата ввода</dt><dd className="font-medium text-slate-900">{formatDateSafe(equipment.installation_date)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">ПТО</dt><dd className="font-medium text-slate-900">{formatDateSafe(equipment.pto_date)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">ЧТО</dt><dd className="font-medium text-slate-900">{formatDateSafe(equipment.cto_date)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Координаты на карте</dt><dd className="font-medium text-slate-900">{equipment.map_x != null && equipment.map_y != null ? `${equipment.map_x}; ${equipment.map_y}` : '—'}</dd></div>
            </dl>
            {equipment.rostekhnadzor_registered ? (
              <>
                <dl className="space-y-2 text-sm border-t border-slate-200 pt-3">
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Дата экспертизы</dt><dd className="font-medium text-slate-900">{formatDateSafe(equipment.expertise_date)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Разрешенный срок</dt><dd className="font-medium text-slate-900">{formatDateSafe(equipment.operation_permit_until)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Запрет на эксплуатацию</dt><dd className="font-medium text-slate-900">{equipment.operation_banned ? 'Да' : 'Нет'}</dd></div>
                </dl>
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Реквизиты положительной ЭПБ</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{equipment.epb_positive_details || 'Не заполнено'}</p>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-500 border-t border-slate-200 pt-3">
                Поля экспертизы доступны только для оборудования, зарегистрированного в Ростехнадзоре.
              </div>
            )}
          </section>
        </div>

        <section className="border border-slate-200 rounded-xl p-4 bg-white">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Связанные данные</h3>
            <button
              onClick={() => {
                const params = new URLSearchParams()
                if (equipment.workshop) params.set('workshop', equipment.workshop)
                params.set('equipment_id', String(equipment.id))
                router.push(`/workshop-map?${params.toString()}`)
              }}
              className="text-xs font-semibold text-primary-600 hover:text-primary-700"
            >
              На карте
            </button>
          </div>

          {relatedLoading ? (
            <div className="text-sm text-slate-500">Загрузка...</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {quickStats.map((item) => (
                <button
                  key={item.title}
                  onClick={() => {
                    if (onOpenRelations) {
                      onOpenRelations(item.tab, equipment.id)
                      return
                    }
                    router.push(item.href)
                  }}
                  className="text-left border border-slate-200 rounded-lg p-3 hover:border-primary-300 hover:bg-primary-50/40 transition-colors"
                >
                  <p className="text-xs uppercase tracking-wide text-slate-500">{item.title}</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">{item.value}</p>
                </button>
              ))}
            </div>
          )}

          {!relatedLoading && (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="border border-slate-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-800 mb-2">Последние нарушения</p>
                {related.violations.length > 0 ? (
                  <ul className="space-y-2">
                    {related.violations.slice(0, 3).map((v) => (
                      <li key={v.id} className="text-xs text-slate-700">
                        <div className="font-medium">{v.violation_type || 'Нарушение'}</div>
                        <div className="text-[11px] text-slate-500">{(v.status || 'open')} • {v.created_at ? format(new Date(v.created_at), 'dd.MM.yyyy') : '—'}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-slate-500">Нет данных</div>
                )}
              </div>

              <div className="border border-slate-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-800 mb-2">Последние акты</p>
                {related.acts.length > 0 ? (
                  <ul className="space-y-2">
                    {related.acts.slice(0, 3).map((a) => (
                      <li key={a.id} className="text-xs text-slate-700">
                        <div className="font-medium">{a.act_number || `Акт #${a.id}`}</div>
                        <div className="text-[11px] text-slate-500">{(a.status || 'draft')} • {a.act_date ? format(new Date(a.act_date), 'dd.MM.yyyy') : '—'}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-slate-500">Нет данных</div>
                )}
              </div>

              <div className="border border-slate-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-800 mb-2">Последние осмотры</p>
                {related.inspections.length > 0 ? (
                  <ul className="space-y-2">
                    {related.inspections.slice(0, 3).map((i) => (
                      <li key={i.id} className="text-xs text-slate-700">
                        <div className="font-medium">Осмотр #{i.id}</div>
                        <div className="text-[11px] text-slate-500">{(i.status || 'draft')} • {i.updated_at ? format(new Date(i.updated_at), 'dd.MM.yyyy') : '—'}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-slate-500">Нет данных</div>
                )}
              </div>

              <div className="border border-slate-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-800 mb-2">Последние задачи</p>
                {related.tasks.length > 0 ? (
                  <ul className="space-y-2">
                    {related.tasks.slice(0, 3).map((t) => (
                      <li key={t.id} className="text-xs text-slate-700">
                        <div className="font-medium">{t.title || `Задача #${t.id}`}</div>
                        <div className="text-[11px] text-slate-500">{(t.status || 'open')} • {t.updated_at ? format(new Date(t.updated_at), 'dd.MM.yyyy') : '—'}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-slate-500">Нет данных</div>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 border border-slate-200 rounded-lg p-4 bg-slate-50/70">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h4 className="text-sm font-semibold text-slate-900">Файлы оборудования</h4>
              <span className="text-xs font-semibold text-slate-500">Всего: {related.files.length}</span>
            </div>

            {canMutate && (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px_170px] mb-4">
                <input
                  type="file"
                  onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-slate-700 border border-slate-300 rounded-lg bg-white file:mr-4 file:py-2 file:px-4 file:border-0 file:rounded-l-lg file:bg-slate-800 file:text-white file:font-semibold hover:file:bg-slate-900"
                />
                <input
                  type="text"
                  value={newFileDescription}
                  onChange={(e) => setNewFileDescription(e.target.value)}
                  placeholder="Описание файла (например, скан ЭПБ)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={handleFileUpload}
                  disabled={uploadingFile || !newFile}
                  className="w-full px-4 py-2 rounded-lg text-sm font-semibold text-white bg-primary-600 border border-primary-700 shadow-sm hover:bg-primary-700 disabled:bg-slate-300 disabled:border-slate-300 disabled:cursor-not-allowed"
                >
                  {uploadingFile ? 'Загрузка...' : 'Прикрепить'}
                </button>
              </div>
            )}

            {related.files.length === 0 ? (
              <div className="text-sm text-slate-500">Файлы не прикреплены.</div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {related.files.map((file) => (
                  <div key={file.id} className="bg-white border border-slate-200 rounded-lg p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center flex-wrap gap-2 mb-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-slate-100 text-slate-700 border-slate-200">
                          {getFileTypeLabel(file.file_type, file.mime_type)}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {formatFileSize(file.file_size)} • {formatDateTimeSafe(file.created_at)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-900 truncate">{file.original_filename}</p>
                      <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap break-words">
                        {file.description?.trim() ? file.description : 'Описание не указано'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDownloadFile(file)}
                        className="px-2.5 py-1 text-xs font-semibold rounded border border-blue-700 text-white bg-blue-600 hover:bg-blue-700"
                      >
                        Скачать
                      </button>
                      {canMutate && isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDeleteFile(file)}
                          className="px-2.5 py-1 text-xs font-semibold rounded border border-rose-700 text-white bg-rose-600 hover:bg-rose-700"
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {canMutate && (
          <div className="pt-1">
            <button
              onClick={onEdit}
              className="w-full bg-primary-600 text-white py-2.5 px-4 rounded-lg hover:bg-primary-700 font-semibold"
            >
              Редактировать карточку
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
