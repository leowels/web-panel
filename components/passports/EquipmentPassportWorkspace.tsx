
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import axios from 'axios'

import { API_URL } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { canMutateData, getRoleNames } from '@/utils/roles'
import PageHeader from '@/components/ui/PageHeader'

interface PassportIndexItem {
  equipment_id: number
  passport_id?: number | null
  equipment_type: string
  passport_number: string
  registration_number?: string | null
  factory_number?: string | null
  inventory_number?: string | null
  workshop?: string | null
  equipment_status: string
  passport_status: string
  completeness_percent: number
  open_violations: number
  overdue_violations: number
  next_control_date?: string | null
  last_published_at?: string | null
  risk_level: string
}

interface EquipmentSummary {
  id: number
  equipment_type: string
  passport_number: string
  registration_number?: string | null
  factory_number?: string | null
  inventory_number?: string | null
  workshop?: string | null
  installation_location?: string | null
  manufacturer?: string | null
  load_capacity?: number | null
  status: string
  installation_date?: string | null
  pto_date?: string | null
  cto_date?: string | null
  expertise_date?: string | null
  operation_permit_until?: string | null
  operation_banned?: boolean | null
  rostekhnadzor_registered?: boolean | null
  epb_positive_details?: string | null
  updated_at?: string | null
}

interface LinkedFile {
  id: number
  original_filename: string
  description?: string | null
  file_type: string
  mime_type: string
  file_size: number
  created_at?: string | null
  violation_id?: number | null
  act_id?: number | null
  task_id?: number | null
  download_url: string
}

interface PassportDocument {
  id: number
  file_id: number | null
  document_type: string
  title: string
  document_number?: string | null
  issuer?: string | null
  issue_date?: string | null
  expiry_date?: string | null
  status: string
  status_label: string
  is_required: boolean
  notes?: string | null
  file?: LinkedFile | null
}

interface PassportEvent {
  id: number
  event_type: string
  title: string
  description?: string | null
  event_date?: string | null
  source: string
  source_label: string
}

interface PassportVersion {
  id: number
  version_number: number
  status: string
  status_label: string
  change_summary?: string | null
  created_at?: string | null
  snapshot?: any
}

interface RelatedViolation {
  id: number
  description: string
  status: string
  status_label: string
  severity?: string | null
  severity_label: string
  criticality_level?: string | null
  violation_type?: string | null
  location?: string | null
  deadline?: string | null
  is_overdue: boolean
  resolved_at?: string | null
  created_at?: string | null
  fnp_clause?: string | null
  gost_clause?: string | null
  norm_reference?: string | null
  defect_node?: {
    id: number
    title: string
    key: string
  } | null
  attachments: LinkedFile[]
}

interface RelatedInspection {
  id: number
  status: string
  status_label: string
  notes?: string | null
  started_at?: string | null
  completed_at?: string | null
  created_at?: string | null
  violations_count: number
}

interface RelatedTask {
  id: number
  title: string
  description?: string | null
  status: string
  status_label: string
  priority?: string | null
  due_date?: string | null
  created_at?: string | null
  violation_id?: number | null
  attachments: LinkedFile[]
}

interface RelatedAct {
  id: number
  act_number?: string | null
  status: string
  status_label: string
  act_date?: string | null
  created_at?: string | null
  attachments: LinkedFile[]
}

interface PassportResponse {
  passport_id: number
  equipment: EquipmentSummary
  passport_status: string
  completeness_percent: number
  current_version_id?: number | null
  current_version_number?: number | null
  last_published_at?: string | null
  profile: Record<string, any>
  draft_data?: Record<string, any>
  dashboard: {
    risk_level: string
    violations_total: number
    violations_open: number
    violations_overdue: number
    inspections_total: number
    acts_total: number
    tasks_total: number
    tasks_open: number
    passport_documents_total: number
    related_files_total: number
    versions_total: number
    next_control_date?: string | null
    days_to_next_control?: number | null
    last_event_at?: string | null
    readiness: {
      identity_ready: boolean
      supervision_ready: boolean
      documents_ready: boolean
      history_ready: boolean
      missing_fields: string[]
    }
  }
  documents: PassportDocument[]
  events: PassportEvent[]
  versions: PassportVersion[]
  related: {
    violations: RelatedViolation[]
    inspections: RelatedInspection[]
    tasks: RelatedTask[]
    acts: RelatedAct[]
    files: LinkedFile[]
  }
  timeline: Array<{
    kind: string
    title: string
    subtitle?: string | null
    date?: string | null
    status?: string | null
  }>
}

type TabKey = 'overview' | 'profile' | 'documents' | 'operations' | 'defects' | 'versions'

type FieldConfig = {
  section: string
  key: string
  label: string
  type?: 'text' | 'date' | 'number' | 'textarea' | 'checkbox'
  placeholder?: string
}

const profileSections: Array<{ title: string; section: string; fields: FieldConfig[] }> = [
  {
    title: 'Идентификация крана',
    section: 'identity',
    fields: [
      { section: 'identity', key: 'passport_number', label: 'Паспортный номер' },
      { section: 'identity', key: 'equipment_type', label: 'Тип крана' },
      { section: 'identity', key: 'registration_number', label: 'Регистрационный номер' },
      { section: 'identity', key: 'factory_number', label: 'Заводской номер' },
      { section: 'identity', key: 'inventory_number', label: 'Инвентарный номер' },
      { section: 'identity', key: 'manufacturer', label: 'Изготовитель' },
      { section: 'identity', key: 'workshop', label: 'Цех' },
      { section: 'identity', key: 'installation_location', label: 'Место установки' },
      { section: 'identity', key: 'owner_department', label: 'Подразделение-владелец' },
      { section: 'identity', key: 'responsible_person', label: 'Ответственный' },
      { section: 'identity', key: 'commissioning_date', label: 'Дата ввода', type: 'date' },
      { section: 'identity', key: 'commissioning_order', label: 'Приказ о вводе' },
    ],
  },
  {
    title: 'Технические характеристики',
    section: 'specifications',
    fields: [
      { section: 'specifications', key: 'load_capacity_t', label: 'Грузоподъемность, т', type: 'number' },
      { section: 'specifications', key: 'span_m', label: 'Пролет, м', type: 'number' },
      { section: 'specifications', key: 'lifting_height_m', label: 'Высота подъема, м', type: 'number' },
      { section: 'specifications', key: 'duty_group', label: 'Группа режима работы' },
      { section: 'specifications', key: 'control_mode', label: 'Управление' },
      { section: 'specifications', key: 'power_supply', label: 'Питание' },
      { section: 'specifications', key: 'climate_version', label: 'Климатическое исполнение' },
      { section: 'specifications', key: 'factory_year', label: 'Год выпуска', type: 'number' },
      { section: 'specifications', key: 'drive_type', label: 'Тип привода' },
      { section: 'specifications', key: 'notes', label: 'Примечание', type: 'textarea' },
    ],
  },
  {
    title: 'Надзор и допуск',
    section: 'supervision',
    fields: [
      { section: 'supervision', key: 'rostekhnadzor_registered', label: 'Зарегистрирован в Ростехнадзоре', type: 'checkbox' },
      { section: 'supervision', key: 'registration_date', label: 'Дата регистрации', type: 'date' },
      { section: 'supervision', key: 'expertise_date', label: 'Дата экспертизы', type: 'date' },
      { section: 'supervision', key: 'operation_permit_until', label: 'Срок разрешенной эксплуатации', type: 'date' },
      { section: 'supervision', key: 'operation_banned', label: 'Запрет на эксплуатацию', type: 'checkbox' },
      { section: 'supervision', key: 'safety_devices', label: 'Приборы безопасности' },
      { section: 'supervision', key: 'epb_details', label: 'Реквизиты ЭПБ', type: 'textarea' },
      { section: 'supervision', key: 'restrictions', label: 'Ограничения', type: 'textarea' },
    ],
  },
  {
    title: 'Обслуживание',
    section: 'service',
    fields: [
      { section: 'service', key: 'pto_date', label: 'Дата ПТО', type: 'date' },
      { section: 'service', key: 'cto_date', label: 'Дата ЧТО', type: 'date' },
      { section: 'service', key: 'service_interval_days', label: 'Интервал обслуживания, дней', type: 'number' },
      { section: 'service', key: 'last_major_repair_at', label: 'Последний капитальный ремонт', type: 'date' },
      { section: 'service', key: 'service_contract', label: 'Договор / подрядчик' },
      { section: 'service', key: 'maintenance_notes', label: 'Примечания по обслуживанию', type: 'textarea' },
      { section: 'service', key: 'modernization_notes', label: 'Модернизации', type: 'textarea' },
    ],
  },
  {
    title: 'Эксплуатационные заметки',
    section: 'notes',
    fields: [
      { section: 'notes', key: 'summary', label: 'Общая сводка', type: 'textarea' },
      { section: 'notes', key: 'operating_notes', label: 'Эксплуатационные заметки', type: 'textarea' },
      { section: 'notes', key: 'defect_notes', label: 'Критичные дефекты и ограничения', type: 'textarea' },
      { section: 'notes', key: 'spare_parts_notes', label: 'Комплектность / запасные части', type: 'textarea' },
    ],
  },
]

const defaultDocumentForm = {
  title: '',
  document_type: 'passport',
  document_number: '',
  issuer: '',
  issue_date: '',
  expiry_date: '',
  is_required: false,
  notes: '',
}

const defaultEventForm = {
  title: '',
  event_type: 'maintenance',
  event_date: '',
  source: 'manual',
  description: '',
}

const parseError = (error: any, fallback: string) => error?.response?.data?.error?.message || error?.response?.data?.detail || fallback
const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ru-RU')
}
const formatBytes = (value?: number | null) => {
  if (!value) return '—'
  if (value < 1024) return `${value} Б`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} КБ`
  return `${(value / (1024 * 1024)).toFixed(1)} МБ`
}
const getPreviewMode = (file?: LinkedFile | null) => {
  if (!file) return 'unsupported'
  const mime = (file.mime_type || '').toLowerCase()
  const name = (file.original_filename || '').toLowerCase()
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name)) return 'image'
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (mime.startsWith('text/') || /\.(txt|csv|json|xml|log|md)$/i.test(name)) return 'text'
  return 'unsupported'
}
const riskTone = (value?: string) => ({ critical: 'bg-rose-100 text-rose-800 border-rose-200', high: 'bg-orange-100 text-orange-800 border-orange-200', medium: 'bg-amber-100 text-amber-800 border-amber-200', low: 'bg-blue-100 text-blue-800 border-blue-200', stable: 'bg-emerald-100 text-emerald-800 border-emerald-200' }[value || 'stable'] || 'bg-slate-100 text-slate-700 border-slate-200')
const statusTone = (value?: string) => ({ approved: 'bg-emerald-100 text-emerald-800 border-emerald-200', draft: 'bg-slate-100 text-slate-700 border-slate-200', review: 'bg-amber-100 text-amber-800 border-amber-200', archived: 'bg-slate-200 text-slate-700 border-slate-300', open: 'bg-rose-100 text-rose-800 border-rose-200', in_progress: 'bg-blue-100 text-blue-800 border-blue-200', resolved: 'bg-emerald-100 text-emerald-800 border-emerald-200' }[value || 'draft'] || 'bg-slate-100 text-slate-700 border-slate-200')
const severityTone = (value?: string | null) => ({ critical: 'bg-rose-100 text-rose-800 border-rose-200', high: 'bg-orange-100 text-orange-800 border-orange-200', medium: 'bg-amber-100 text-amber-800 border-amber-200', low: 'bg-sky-100 text-sky-800 border-sky-200' }[value || 'medium'] || 'bg-slate-100 text-slate-700 border-slate-200')

export default function EquipmentPassportWorkspace() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { token, user, isAuthenticated } = useAuthStore()
  const { addNotification } = useNotificationStore()

  const [items, setItems] = useState<PassportIndexItem[]>([])
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null)
  const [passport, setPassport] = useState<PassportResponse | null>(null)
  const [profile, setProfile] = useState<Record<string, any>>({})
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [search, setSearch] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingPassport, setLoadingPassport] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [documentForm, setDocumentForm] = useState(defaultDocumentForm)
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [documentSubmitting, setDocumentSubmitting] = useState(false)
  const [eventForm, setEventForm] = useState(defaultEventForm)
  const [eventSubmitting, setEventSubmitting] = useState(false)
  const [previewFile, setPreviewFile] = useState<LinkedFile | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const roleNames = getRoleNames(user)
  const canEdit = canMutateData(user)
  const canPublish = roleNames.includes('admin')

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return items
    return items.filter((item) =>
      [item.passport_number, item.equipment_type, item.registration_number, item.factory_number, item.inventory_number, item.workshop]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    )
  }, [items, search])

  const fetchIndex = async () => {
    if (!token) return
    setLoadingList(true)
    try {
      const response = await axios.get<PassportIndexItem[]>(`${API_URL}/api/passports/index`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const nextItems = response.data || []
      setItems(nextItems)
      const fromQuery = Number(searchParams.get('equipment_id'))
      if (fromQuery && nextItems.some((item) => item.equipment_id === fromQuery)) {
        setSelectedEquipmentId(fromQuery)
      } else if (!selectedEquipmentId && nextItems.length > 0) {
        setSelectedEquipmentId(nextItems[0].equipment_id)
      }
    } catch (error) {
      addNotification(parseError(error, 'Не удалось загрузить список паспортов'), 'error')
    } finally {
      setLoadingList(false)
    }
  }

  const fetchPassport = async (equipmentId: number) => {
    if (!token) return
    setLoadingPassport(true)
    try {
      const response = await axios.get<PassportResponse>(`${API_URL}/api/passports/equipment/${equipmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setPassport(response.data)
      setProfile(response.data.profile || response.data.draft_data || {})
    } catch (error) {
      addNotification(parseError(error, 'Не удалось загрузить паспорт крана'), 'error')
      setPassport(null)
    } finally {
      setLoadingPassport(false)
    }
  }

  useEffect(() => {
    if (!token) return
    fetchIndex()
  }, [token])

  useEffect(() => {
    if (!token || !selectedEquipmentId) return
    fetchPassport(selectedEquipmentId)
  }, [selectedEquipmentId, token])

  useEffect(() => {
    return () => {
      if (previewUrl) window.URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleSelectEquipment = (equipmentId: number) => {
    setSelectedEquipmentId(equipmentId)
    const params = new URLSearchParams(searchParams.toString())
    params.set('equipment_id', String(equipmentId))
    router.replace(`/passports?${params.toString()}`)
  }

  const updateField = (section: string, key: string, value: any) => {
    setProfile((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] || {}),
        [key]: value,
      },
    }))
  }

  const saveProfile = async () => {
    if (!token || !selectedEquipmentId) return
    setSavingProfile(true)
    try {
      const response = await axios.put<PassportResponse>(
        `${API_URL}/api/passports/equipment/${selectedEquipmentId}/profile`,
        { profile, passport_status: 'draft' },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setPassport(response.data)
      setProfile(response.data.profile || response.data.draft_data || {})
      addNotification('Профиль паспорта сохранен', 'success')
      fetchIndex()
    } catch (error) {
      addNotification(parseError(error, 'Не удалось сохранить паспорт'), 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  const publishPassport = async () => {
    if (!token || !selectedEquipmentId) return
    setPublishing(true)
    try {
      const response = await axios.post<PassportResponse>(
        `${API_URL}/api/passports/equipment/${selectedEquipmentId}/publish`,
        { change_summary: 'Публикация версии через новый интерфейс паспорта' },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setPassport(response.data)
      setProfile(response.data.profile || response.data.draft_data || {})
      addNotification('Версия паспорта опубликована', 'success')
      fetchIndex()
    } catch (error) {
      addNotification(parseError(error, 'Не удалось опубликовать паспорт'), 'error')
    } finally {
      setPublishing(false)
    }
  }

  const openFilePreview = async (file: LinkedFile | null | undefined) => {
    if (!token || !file) return
    const mode = getPreviewMode(file)
    setPreviewFile(file)
    setPreviewError(null)
    setPreviewUrl(null)

    if (mode === 'unsupported') {
      setPreviewError('Этот формат нельзя надежно показать в браузере. Файл можно скачать.')
      return
    }

    setPreviewLoading(true)
    try {
      const response = await axios.get(`${API_URL}/api/files/${file.id}`, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` },
      })
      const blob = new Blob([response.data], { type: file.mime_type || response.data?.type || 'application/octet-stream' })
      setPreviewUrl(window.URL.createObjectURL(blob))
    } catch (error) {
      setPreviewError(parseError(error, 'Не удалось открыть файл для просмотра'))
    } finally {
      setPreviewLoading(false)
    }
  }

  const closeFilePreview = () => {
    setPreviewFile(null)
    setPreviewUrl(null)
    setPreviewLoading(false)
    setPreviewError(null)
  }

  const downloadFile = async (file: LinkedFile | null | undefined) => {
    if (!token || !file) return
    try {
      const response = await axios.get(`${API_URL}/api/files/${file.id}`, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` },
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = window.document.createElement('a')
      link.href = url
      link.setAttribute('download', file.original_filename)
      window.document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      addNotification(parseError(error, 'Не удалось скачать файл'), 'error')
    }
  }

  const renderFileActions = (file: LinkedFile) => (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => openFilePreview(file)}
        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
      >
        Просмотр
      </button>
      <button
        onClick={() => downloadFile(file)}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Скачать
      </button>
    </div>
  )

  const submitDocument = async () => {
    if (!token || !selectedEquipmentId) return
    if (!documentForm.title.trim()) {
      addNotification('Укажите название документа', 'warning')
      return
    }

    setDocumentSubmitting(true)
    try {
      let fileId: number | null = null
      if (documentFile) {
        const formData = new FormData()
        formData.append('file', documentFile)
        formData.append('equipment_id', String(selectedEquipmentId))
        formData.append('description', documentForm.title.trim())
        const uploadResponse = await axios.post(`${API_URL}/api/files/upload`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        })
        fileId = uploadResponse.data.id
      }

      const response = await axios.post<PassportResponse>(
        `${API_URL}/api/passports/equipment/${selectedEquipmentId}/documents`,
        {
          ...documentForm,
          file_id: fileId,
          issue_date: documentForm.issue_date || null,
          expiry_date: documentForm.expiry_date || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setPassport(response.data)
      setDocumentForm(defaultDocumentForm)
      setDocumentFile(null)
      addNotification('Документ добавлен в паспорт', 'success')
      fetchIndex()
    } catch (error) {
      addNotification(parseError(error, 'Не удалось добавить документ'), 'error')
    } finally {
      setDocumentSubmitting(false)
    }
  }

  const deleteDocument = async (documentId: number) => {
    if (!token || !selectedEquipmentId) return
    try {
      await axios.delete(`${API_URL}/api/passports/documents/${documentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      await fetchPassport(selectedEquipmentId)
      addNotification('Документ удален', 'success')
      fetchIndex()
    } catch (error) {
      addNotification(parseError(error, 'Не удалось удалить документ'), 'error')
    }
  }

  const submitEvent = async () => {
    if (!token || !selectedEquipmentId) return
    if (!eventForm.title.trim()) {
      addNotification('Укажите название события', 'warning')
      return
    }

    setEventSubmitting(true)
    try {
      const response = await axios.post<PassportResponse>(
        `${API_URL}/api/passports/equipment/${selectedEquipmentId}/events`,
        {
          ...eventForm,
          event_date: eventForm.event_date || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setPassport(response.data)
      setEventForm(defaultEventForm)
      addNotification('Событие добавлено в историю крана', 'success')
      fetchIndex()
    } catch (error) {
      addNotification(parseError(error, 'Не удалось добавить событие'), 'error')
    } finally {
      setEventSubmitting(false)
    }
  }

  const deleteEvent = async (eventId: number) => {
    if (!token || !selectedEquipmentId) return
    try {
      await axios.delete(`${API_URL}/api/passports/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      await fetchPassport(selectedEquipmentId)
      addNotification('Событие удалено', 'success')
    } catch (error) {
      addNotification(parseError(error, 'Не удалось удалить событие'), 'error')
    }
  }

  const summaryCards = passport
    ? [
        { label: 'Статус паспорта', value: passport.passport_status, tone: statusTone(passport.passport_status) },
        { label: 'Готовность', value: `${passport.completeness_percent}%`, tone: 'bg-blue-50 text-blue-800 border-blue-200' },
        { label: 'Риск', value: passport.dashboard.risk_level, tone: riskTone(passport.dashboard.risk_level) },
        { label: 'Открытые дефекты', value: String(passport.dashboard.violations_open), tone: 'bg-rose-50 text-rose-800 border-rose-200' },
        { label: 'Просрочено', value: String(passport.dashboard.violations_overdue), tone: 'bg-orange-50 text-orange-800 border-orange-200' },
        { label: 'Следующий контроль', value: formatDate(passport.dashboard.next_control_date), tone: 'bg-slate-50 text-slate-800 border-slate-200' },
      ]
    : []

  if (!isAuthenticated) return null

  const draftCompletionBySection = useMemo(() => {
    return fieldSections.map((section) => {
      const filled = section.fields.reduce((acc, field) => {
        const value = draftData?.[field.section]?.[field.key]
        if (field.type === 'checkbox') return acc + (Boolean(value) ? 1 : 0)
        return acc + (String(value ?? '').trim() ? 1 : 0)
      }, 0)
      return {
        section: section.section,
        title: section.title,
        filled,
        total: section.fields.length,
        percent: Math.round((filled / Math.max(section.fields.length, 1)) * 100),
      }
    })
  }, [draftData])

  if (!isAuthenticated) {
    return null
  }

  const previewMode = getPreviewMode(previewFile)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Паспорта кранов"
        subtitle="Единое досье крана: паспортные данные, документы, дефекты, осмотры, ремонты и версии в одном месте"
        actions={passport ? (
          <>
            {canEdit && (
              <button
                onClick={saveProfile}
                disabled={savingProfile}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {savingProfile ? 'Сохраняем...' : 'Сохранить паспорт'}
              </button>
            )}
            {canPublish && (
              <button
                onClick={publishPassport}
                disabled={publishing}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {publishing ? 'Публикуем...' : 'Опубликовать версию'}
              </button>
            )}
          </>
        ) : undefined}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[340px,minmax(0,1fr)] gap-6">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4 h-fit">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Поиск крана</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Паспорт, рег. номер, цех..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="max-h-[72vh] overflow-y-auto space-y-2 pr-1">
            {loadingList ? (
              <div className="text-sm text-slate-500">Загрузка паспортов...</div>
            ) : filteredItems.length === 0 ? (
              <div className="text-sm text-slate-500">Краны не найдены</div>
            ) : filteredItems.map((item) => {
              const isActive = item.equipment_id === selectedEquipmentId
              return (
                <button
                  key={item.equipment_id}
                  onClick={() => handleSelectEquipment(item.equipment_id)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition ${isActive ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{item.passport_number}</div>
                      <div className="mt-1 text-xs text-slate-600">{item.equipment_type}</div>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${riskTone(item.risk_level)}`}>{item.risk_level}</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">{item.workshop || 'Цех не указан'}</div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <span className={`rounded-full border px-2 py-0.5 ${statusTone(item.passport_status)}`}>{item.passport_status}</span>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-700">Готовность {item.completeness_percent}%</span>
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700">Открыто {item.open_violations}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="space-y-6">
          {!passport || loadingPassport ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-500 shadow-sm">
              {loadingPassport ? 'Загрузка паспорта крана...' : 'Выберите кран слева'}
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-bold text-slate-900">Кран {passport.equipment.passport_number}</h2>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(passport.passport_status)}`}>{passport.passport_status}</span>
                    </div>
                    <p className="mt-2 text-slate-600">{passport.equipment.equipment_type}</p>
                    <p className="mt-2 text-sm text-slate-500">{passport.equipment.workshop || 'Цех не указан'} • {passport.equipment.installation_location || 'Место установки не указано'}</p>
                  </div>
                  <div className="text-sm text-slate-500 space-y-1">
                    <div>Последняя публикация: {formatDate(passport.last_published_at)}</div>
                    <div>Последняя активность: {formatDate(passport.dashboard.last_event_at)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {summaryCards.map((card) => (
                    <div key={card.label} className={`rounded-xl border px-4 py-3 ${card.tone}`}>
                      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{card.label}</div>
                      <div className="mt-2 text-xl font-bold">{card.value}</div>
                    </div>
                  ))}
                </div>

                <div className="border-b border-slate-200 flex flex-wrap gap-2 pb-4">
                  {[
                    { key: 'overview', label: 'Обзор' },
                    { key: 'profile', label: 'Паспортные данные' },
                    { key: 'documents', label: 'Документы' },
                    { key: 'operations', label: 'Осмотры и работы' },
                    { key: 'defects', label: 'Дефекты и нарушения' },
                    { key: 'versions', label: 'Версии' },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key as TabKey)}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="p-6">
                  {activeTab === 'draft' && (
                    <div className="space-y-8">
                      <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-indigo-50 to-white p-4 md:p-5">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Удобное заполнение</p>
                            <h3 className="text-lg font-bold text-slate-900">Навигация по разделам паспорта</h3>
                          </div>
                          <div className="text-sm text-slate-600">
                            Заполнено: <span className="font-semibold text-slate-900">{passport.completeness_percent}%</span>
                          </div>
                        </div>
                        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-blue-100">
                          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${passport.completeness_percent}%` }} />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {draftCompletionBySection.map((section) => (
                            <button
                              key={section.section}
                              onClick={() => {
                                const element = document.getElementById(`passport-section-${section.section}`)
                                element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                              }}
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700"
                            >
                              <span>{section.title}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                {section.filled}/{section.total}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {fieldSections.map((section) => (
                        <div key={section.section} id={`passport-section-${section.section}`} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 md:p-5 space-y-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <h3 className="text-lg font-semibold text-slate-900">{section.title}</h3>
                            <span className="inline-flex w-fit items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 border border-slate-200">
                              {draftCompletionBySection.find((item) => item.section === section.section)?.percent ?? 0}% заполнено
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {section.fields.map((field) => {
                              const value = draftData?.[field.section]?.[field.key]
                              if (field.type === 'textarea') {
                                return (
                                  <label key={`${field.section}.${field.key}`} className="md:col-span-2 block">
                                    <span className="block text-sm font-semibold text-slate-700 mb-1.5">{field.label}</span>
                                    <textarea
                                      value={value || ''}
                                      disabled={!canEdit}
                                      onChange={(e) => updateField(field.section, field.key, e.target.value)}
                                      rows={3}
                                      placeholder={field.placeholder}
                                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/70 disabled:bg-slate-100"
                                    />
                                  </label>
                                )
                              }
                              if (field.type === 'checkbox') {
                                return (
                                  <label key={`${field.section}.${field.key}`} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white shadow-sm">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(value)}
                                      disabled={!canEdit}
                                      onChange={(e) => updateField(field.section, field.key, e.target.checked)}
                                      className="h-4 w-4"
                                    />
                                    <span className="text-sm font-medium text-slate-700">{field.label}</span>
                                  </label>
                                )
                              }
                              return (
                                <label key={`${field.section}.${field.key}`} className="block">
                                  <span className="block text-sm font-semibold text-slate-700 mb-1.5">{field.label}</span>
                                  <input
                                    type={field.type || 'text'}
                                    value={value || ''}
                                    disabled={!canEdit}
                                    onChange={(e) => updateField(field.section, field.key, e.target.value)}
                                    placeholder={field.placeholder}
                                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/70 disabled:bg-slate-100"
                                  />
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <div className="rounded-2xl border border-slate-200 p-5">
                        <h3 className="text-lg font-semibold text-slate-900">Готовность досье</h3>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          {[
                            { label: 'Идентификация', ok: passport.dashboard.readiness.identity_ready },
                            { label: 'Надзор', ok: passport.dashboard.readiness.supervision_ready },
                            { label: 'Документы', ok: passport.dashboard.readiness.documents_ready },
                            { label: 'История работ', ok: passport.dashboard.readiness.history_ready },
                          ].map((row) => (
                            <div key={row.label} className={`rounded-xl border px-3 py-3 ${row.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                              <div className="text-xs uppercase tracking-wide opacity-80">{row.label}</div>
                              <div className="mt-2 font-semibold">{row.ok ? 'Готово' : 'Нужно заполнить'}</div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4">
                          <div className="text-sm font-medium text-slate-700">Не хватает данных</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {passport.dashboard.readiness.missing_fields.length === 0 ? <span className="text-sm text-emerald-700">Все ключевые поля заполнены</span> : passport.dashboard.readiness.missing_fields.map((field) => <span key={field} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">{field}</span>)}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 p-5">
                        <h3 className="text-lg font-semibold text-slate-900">Последние события</h3>
                        <div className="mt-4 space-y-3">
                          {passport.timeline.length === 0 ? <div className="text-sm text-slate-500">История пока пуста</div> : passport.timeline.slice(0, 8).map((item, index) => (
                            <div key={`${item.kind}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                                  <div className="mt-1 text-xs text-slate-500">{item.subtitle || item.kind}</div>
                                </div>
                                <div className="text-xs text-slate-500">{formatDate(item.date)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'profile' && (
                  <div className="space-y-8">
                    {profileSections.map((section) => (
                      <div key={section.section} className="space-y-4">
                        <h3 className="text-lg font-semibold text-slate-900">{section.title}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{section.fields.map(renderField)}</div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'documents' && (
                  <div className="space-y-6">
                    {canEdit && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                        <h3 className="text-lg font-semibold text-slate-900">Добавить документ паспорта</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <input value={documentForm.title} onChange={(e) => setDocumentForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Название документа" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          <input value={documentForm.document_type} onChange={(e) => setDocumentForm((prev) => ({ ...prev, document_type: e.target.value }))} placeholder="Тип документа" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          <input value={documentForm.document_number} onChange={(e) => setDocumentForm((prev) => ({ ...prev, document_number: e.target.value }))} placeholder="Номер документа" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          <input value={documentForm.issuer} onChange={(e) => setDocumentForm((prev) => ({ ...prev, issuer: e.target.value }))} placeholder="Кем выдан" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          <input type="date" value={documentForm.issue_date} onChange={(e) => setDocumentForm((prev) => ({ ...prev, issue_date: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          <input type="date" value={documentForm.expiry_date} onChange={(e) => setDocumentForm((prev) => ({ ...prev, expiry_date: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"><input type="checkbox" checked={documentForm.is_required} onChange={(e) => setDocumentForm((prev) => ({ ...prev, is_required: e.target.checked }))} /><span className="text-sm text-slate-700">Обязательный документ</span></label>
                          <input type="file" onChange={(e) => setDocumentFile(e.target.files?.[0] || null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white" />
                        </div>
                        <textarea value={documentForm.notes} onChange={(e) => setDocumentForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Примечание" rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                        <button onClick={submitDocument} disabled={documentSubmitting} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{documentSubmitting ? 'Добавляем...' : 'Добавить документ'}</button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-slate-900">Документы паспорта</h3>
                        {passport.documents.length === 0 ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">Документы паспорта еще не добавлены</div> : passport.documents.map((document) => (
                          <div key={document.id} className="rounded-2xl border border-slate-200 p-4 space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-900">{document.title}</div><div className="mt-1 text-xs text-slate-500">{document.document_type} • {document.document_number || 'без номера'}</div></div><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusTone(document.status)}`}>{document.status_label}</span></div>
                            <div className="text-sm text-slate-600">Выдан: {document.issuer || '—'} • Дата: {formatDate(document.issue_date)}</div>
                            {document.notes && <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{document.notes}</div>}
                            <div className="flex flex-wrap gap-2">{document.file && renderFileActions(document.file)}{canEdit && <button onClick={() => deleteDocument(document.id)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50">Удалить</button>}</div>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-slate-900">Вложения по крану</h3>
                        {passport.related.files.length === 0 ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">Нет прикрепленных общих файлов</div> : passport.related.files.map((file) => (
                          <div key={file.id} className="rounded-2xl border border-slate-200 p-4 flex items-start justify-between gap-4"><div><div className="text-sm font-semibold text-slate-900">{file.original_filename}</div><div className="mt-1 text-xs text-slate-500">{file.description || file.file_type} • {formatBytes(file.file_size)}</div></div>{renderFileActions(file)}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'operations' && (
                  <div className="space-y-6">
                    {canEdit && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                        <h3 className="text-lg font-semibold text-slate-900">Добавить событие в историю крана</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <input value={eventForm.title} onChange={(e) => setEventForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Название события" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          <input value={eventForm.event_type} onChange={(e) => setEventForm((prev) => ({ ...prev, event_type: e.target.value }))} placeholder="Тип события" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          <input type="date" value={eventForm.event_date} onChange={(e) => setEventForm((prev) => ({ ...prev, event_date: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          <input value={eventForm.source} onChange={(e) => setEventForm((prev) => ({ ...prev, source: e.target.value }))} placeholder="Источник" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                        </div>
                        <textarea value={eventForm.description} onChange={(e) => setEventForm((prev) => ({ ...prev, description: e.target.value }))} rows={3} placeholder="Описание события" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                        <button onClick={submitEvent} disabled={eventSubmitting} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{eventSubmitting ? 'Добавляем...' : 'Добавить событие'}</button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <div className="space-y-3"><h3 className="text-lg font-semibold text-slate-900">Ручные события</h3>{passport.events.length === 0 ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">События пока не добавлены</div> : passport.events.map((event) => <div key={event.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-900">{event.title}</div><div className="mt-1 text-xs text-slate-500">{event.event_type} • {event.source_label}</div></div><div className="text-xs text-slate-500">{formatDate(event.event_date)}</div></div>{event.description && <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{event.description}</div>}{canEdit && <button onClick={() => deleteEvent(event.id)} className="mt-3 rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50">Удалить</button>}</div>)}</div>
                      <div className="space-y-3"><h3 className="text-lg font-semibold text-slate-900">Осмотры</h3>{passport.related.inspections.length === 0 ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">Осмотры не найдены</div> : passport.related.inspections.map((inspection) => <div key={inspection.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-900">Осмотр #{inspection.id}</div><div className="mt-1 text-xs text-slate-500">Нарушений: {inspection.violations_count}</div></div><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusTone(inspection.status)}`}>{inspection.status_label}</span></div><div className="mt-3 text-sm text-slate-600">Создан: {formatDate(inspection.created_at)} • Завершен: {formatDate(inspection.completed_at)}</div>{inspection.notes && <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{inspection.notes}</div>}</div>)}</div>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <div className="space-y-3"><h3 className="text-lg font-semibold text-slate-900">Акты</h3>{passport.related.acts.length === 0 ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">Акты не найдены</div> : passport.related.acts.map((act) => <div key={act.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-900">{act.act_number || `Акт #${act.id}`}</div><div className="mt-1 text-xs text-slate-500">Дата акта: {formatDate(act.act_date)}</div></div><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusTone(act.status)}`}>{act.status_label}</span></div><div className="mt-3 flex flex-wrap gap-2">{act.attachments.map((file) => <div key={file.id}>{renderFileActions(file)}</div>)}</div></div>)}</div>
                      <div className="space-y-3"><h3 className="text-lg font-semibold text-slate-900">Задачи и работы</h3>{passport.related.tasks.length === 0 ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">Задачи не найдены</div> : passport.related.tasks.map((task) => <div key={task.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-900">{task.title}</div><div className="mt-1 text-xs text-slate-500">Приоритет: {task.priority || '—'} • Срок: {formatDate(task.due_date)}</div></div><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusTone(task.status)}`}>{task.status_label}</span></div>{task.description && <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{task.description}</div>}{task.attachments.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{task.attachments.map((file) => <div key={file.id}>{renderFileActions(file)}</div>)}</div>}</div>)}</div>
                    </div>
                  </div>
                )}

                {activeTab === 'defects' && (
                  <div className="space-y-4">
                    {passport.related.violations.length === 0 ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">По крану пока нет зарегистрированных нарушений</div> : passport.related.violations.map((violation) => (
                      <div key={violation.id} className="rounded-2xl border border-slate-200 p-5 space-y-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="space-y-2"><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(violation.status)}`}>{violation.status_label}</span><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${severityTone(violation.severity)}`}>{violation.severity_label}</span>{violation.is_overdue && <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">Просрочено</span>}</div><div className="text-base font-semibold text-slate-900">{violation.description}</div><div className="text-sm text-slate-500">Нарушение #{violation.id} • Дедлайн: {formatDate(violation.deadline)}</div></div>{violation.defect_node && <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">Узел: <span className="font-semibold">{violation.defect_node.title}</span></div>}</div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">{violation.violation_type && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-slate-500">Тип нарушения</div><div className="mt-1 font-medium text-slate-900">{violation.violation_type}</div></div>}{violation.fnp_clause && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-slate-500">ФНП</div><div className="mt-1 font-medium text-slate-900">{violation.fnp_clause}</div></div>}{violation.gost_clause && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-slate-500">ГОСТ</div><div className="mt-1 font-medium text-slate-900">{violation.gost_clause}</div></div>}</div>
                        {violation.attachments.length > 0 && <div><div className="mb-2 text-sm font-medium text-slate-700">Вложения дефекта</div><div className="flex flex-wrap gap-2">{violation.attachments.map((file) => <div key={file.id}>{renderFileActions(file)}</div>)}</div></div>}
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'versions' && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Текущая версия: <span className="font-semibold">{passport.current_version_number ? `v${passport.current_version_number}` : 'не опубликована'}</span> • Последняя публикация: <span className="font-semibold">{formatDate(passport.last_published_at)}</span></div>
                    {passport.versions.length === 0 ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">Версии паспорта ещё не публиковались</div> : passport.versions.map((version) => (
                      <div key={version.id} className="rounded-2xl border border-slate-200 p-5 space-y-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-base font-semibold text-slate-900">Версия v{version.version_number}</div><div className="mt-1 text-sm text-slate-500">Создана: {formatDate(version.created_at)}</div></div><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(version.status)}`}>{version.status_label}</span></div>{version.change_summary && <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{version.change_summary}</div>}{version.snapshot?.dashboard && <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-slate-500">Открытых нарушений</div><div className="mt-1 font-semibold text-slate-900">{version.snapshot.dashboard.violations_open ?? '—'}</div></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-slate-500">Документов</div><div className="mt-1 font-semibold text-slate-900">{version.snapshot.dashboard.passport_documents_total ?? '—'}</div></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-slate-500">Готовность</div><div className="mt-1 font-semibold text-slate-900">{version.snapshot.passport?.completeness_percent ?? '—'}%</div></div></div>}</div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-base font-semibold text-slate-900">{previewFile.original_filename}</div>
                <div className="mt-1 text-sm text-slate-500">
                  {previewFile.mime_type || previewFile.file_type} • {formatBytes(previewFile.file_size)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {previewUrl && (
                  <button
                    onClick={() => window.open(previewUrl, '_blank')}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    В новой вкладке
                  </button>
                )}
                <button
                  onClick={() => downloadFile(previewFile)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Скачать
                </button>
                <button
                  onClick={closeFilePreview}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Закрыть
                </button>
              </div>
            </div>

            <div className="min-h-[420px] flex-1 overflow-auto bg-slate-100 p-4">
              {previewLoading ? (
                <div className="flex h-[60vh] items-center justify-center text-sm text-slate-500">Открываем документ...</div>
              ) : previewError ? (
                <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
                  {previewError}
                </div>
              ) : previewUrl && previewMode === 'image' ? (
                <div className="flex min-h-[60vh] items-center justify-center">
                  <img src={previewUrl} alt={previewFile.original_filename} className="max-h-[76vh] max-w-full rounded-xl bg-white object-contain shadow" />
                </div>
              ) : previewUrl && (previewMode === 'pdf' || previewMode === 'text') ? (
                <iframe src={previewUrl} title={previewFile.original_filename} className="h-[76vh] w-full rounded-xl border border-slate-200 bg-white" />
              ) : (
                <div className="flex h-[60vh] items-center justify-center text-sm text-slate-500">Нет данных для просмотра</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


