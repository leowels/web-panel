'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import axios from 'axios'

import { API_URL } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { canMutateData, getRoleNames } from '@/utils/roles'
import PageHeader from '@/components/ui/PageHeader'

interface EquipmentItem {
  id: number
  equipment_type: string
  passport_number: string
  registration_number?: string | null
  factory_number?: string | null
  workshop?: string | null
  installation_location?: string | null
  status: string
}

interface EquipmentListResponse {
  items: EquipmentItem[]
  total: number
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
  is_required: boolean
  notes?: string | null
  file?: {
    id: number
    original_filename: string
    mime_type: string
    file_size: number
  } | null
}

interface PassportEvent {
  id: number
  event_type: string
  title: string
  description?: string | null
  event_date?: string | null
  source: string
}

interface PassportVersion {
  id: number
  version_number: number
  status: string
  change_summary?: string | null
  created_at?: string | null
  snapshot?: any
}

interface PassportResponse {
  passport_id: number
  equipment: EquipmentItem & {
    inventory_number?: string | null
    manufacturer?: string | null
    load_capacity?: number | null
    pto_date?: string | null
    cto_date?: string | null
    expertise_date?: string | null
    operation_permit_until?: string | null
    operation_banned?: boolean | null
    rostekhnadzor_registered?: boolean | null
  }
  passport_status: string
  completeness_percent: number
  current_version_id?: number | null
  current_version_number?: number | null
  last_published_at?: string | null
  draft_data: Record<string, any>
  documents: PassportDocument[]
  events: PassportEvent[]
  versions: PassportVersion[]
  aggregates: Record<string, any>
}

type TabKey = 'draft' | 'documents' | 'events' | 'versions'

type FieldConfig = {
  section: string
  key: string
  label: string
  type?: 'text' | 'date' | 'number' | 'textarea' | 'checkbox'
  placeholder?: string
}

const fieldSections: Array<{ title: string; section: string; fields: FieldConfig[] }> = [
  {
    title: 'Общие сведения',
    section: 'general',
    fields: [
      { section: 'general', key: 'passport_number', label: 'Номер паспорта' },
      { section: 'general', key: 'equipment_type', label: 'Тип оборудования' },
      { section: 'general', key: 'registration_number', label: 'Регистрационный номер' },
      { section: 'general', key: 'factory_number', label: 'Заводской номер' },
      { section: 'general', key: 'inventory_number', label: 'Инвентарный номер' },
      { section: 'general', key: 'workshop', label: 'Цех' },
      { section: 'general', key: 'installation_location', label: 'Место установки' },
      { section: 'general', key: 'manufacturer', label: 'Изготовитель' },
      { section: 'general', key: 'owner_department', label: 'Подразделение-владелец' },
      { section: 'general', key: 'responsible_person', label: 'Ответственный' },
      { section: 'general', key: 'commissioning_order', label: 'Приказ о вводе' },
      { section: 'general', key: 'notes', label: 'Примечания', type: 'textarea', placeholder: 'Короткая справка по паспорту' },
    ],
  },
  {
    title: 'Технические характеристики',
    section: 'technical',
    fields: [
      { section: 'technical', key: 'load_capacity_t', label: 'Грузоподъемность, т', type: 'number' },
      { section: 'technical', key: 'span_m', label: 'Пролет, м', type: 'number' },
      { section: 'technical', key: 'lifting_height_m', label: 'Высота подъема, м', type: 'number' },
      { section: 'technical', key: 'duty_group', label: 'Группа режима работы' },
      { section: 'technical', key: 'power_supply', label: 'Питание' },
      { section: 'technical', key: 'control_mode', label: 'Управление' },
      { section: 'technical', key: 'climate_version', label: 'Климатическое исполнение' },
      { section: 'technical', key: 'factory_year', label: 'Год выпуска', type: 'number' },
    ],
  },
  {
    title: 'Надзор и соответствие',
    section: 'compliance',
    fields: [
      { section: 'compliance', key: 'rostekhnadzor_registered', label: 'Зарегистрировано в Ростехнадзоре', type: 'checkbox' },
      { section: 'compliance', key: 'registration_date', label: 'Дата регистрации', type: 'date' },
      { section: 'compliance', key: 'expertise_date', label: 'Дата экспертизы', type: 'date' },
      { section: 'compliance', key: 'operation_permit_until', label: 'Срок разрешенной эксплуатации', type: 'date' },
      { section: 'compliance', key: 'safety_devices', label: 'Приборы безопасности' },
      { section: 'compliance', key: 'restrictions', label: 'Ограничения', type: 'textarea' },
      { section: 'compliance', key: 'epb_details', label: 'Реквизиты ЭПБ', type: 'textarea' },
    ],
  },
  {
    title: 'Обслуживание и ремонт',
    section: 'maintenance',
    fields: [
      { section: 'maintenance', key: 'service_interval_days', label: 'Интервал обслуживания, дней', type: 'number' },
      { section: 'maintenance', key: 'last_major_repair_at', label: 'Последний капитальный ремонт', type: 'date' },
      { section: 'maintenance', key: 'maintenance_notes', label: 'Примечания по обслуживанию', type: 'textarea' },
      { section: 'maintenance', key: 'modernization_notes', label: 'Модернизации', type: 'textarea' },
    ],
  },
  {
    title: 'Эксплуатационные заметки',
    section: 'notes',
    fields: [
      { section: 'notes', key: 'operating_notes', label: 'Эксплуатационные заметки', type: 'textarea' },
      { section: 'notes', key: 'defect_notes', label: 'Особые дефекты и ограничения', type: 'textarea' },
      { section: 'notes', key: 'spare_parts_notes', label: 'Запасные части / комплектность', type: 'textarea' },
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

const parseError = (error: any, fallback: string) => {
  return error?.response?.data?.error?.message || error?.response?.data?.detail || fallback
}

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ru-RU')
}

export default function EquipmentPassportWorkspace() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { token, user, isAuthenticated } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([])
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null)
  const [passport, setPassport] = useState<PassportResponse | null>(null)
  const [draftData, setDraftData] = useState<Record<string, any>>({})
  const [activeTab, setActiveTab] = useState<TabKey>('draft')
  const [equipmentSearch, setEquipmentSearch] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingPassport, setLoadingPassport] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [documentForm, setDocumentForm] = useState(defaultDocumentForm)
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [documentSubmitting, setDocumentSubmitting] = useState(false)
  const [eventForm, setEventForm] = useState(defaultEventForm)
  const [eventSubmitting, setEventSubmitting] = useState(false)

  const roleNames = getRoleNames(user)
  const canEdit = canMutateData(user)
  const canPublish = roleNames.includes('admin')

  const filteredEquipment = useMemo(() => {
    const query = equipmentSearch.trim().toLowerCase()
    if (!query) return equipmentList
    return equipmentList.filter((item) =>
      [item.passport_number, item.equipment_type, item.registration_number, item.factory_number, item.workshop]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    )
  }, [equipmentList, equipmentSearch])

  useEffect(() => {
    if (!token) return
    const fetchEquipment = async () => {
      setLoadingList(true)
      try {
        const response = await axios.get<EquipmentListResponse>(`${API_URL}/api/equipment`, {
          params: { limit: 1000 },
          headers: { Authorization: `Bearer ${token}` },
        })
        const items = response.data.items || []
        setEquipmentList(items)

        const fromQuery = Number(searchParams.get('equipment_id'))
        if (fromQuery && items.some((item) => item.id === fromQuery)) {
          setSelectedEquipmentId(fromQuery)
        } else if (!selectedEquipmentId && items.length > 0) {
          setSelectedEquipmentId(items[0].id)
        }
      } catch (error) {
        addNotification(parseError(error, 'Не удалось загрузить оборудование'), 'error')
      } finally {
        setLoadingList(false)
      }
    }
    fetchEquipment()
  }, [token])

  useEffect(() => {
    if (!token || !selectedEquipmentId) return
    const fetchPassport = async () => {
      setLoadingPassport(true)
      try {
        const response = await axios.get<PassportResponse>(`${API_URL}/api/passports/equipment/${selectedEquipmentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        setPassport(response.data)
        setDraftData(response.data.draft_data || {})
      } catch (error) {
        addNotification(parseError(error, 'Не удалось загрузить электронный паспорт'), 'error')
        setPassport(null)
      } finally {
        setLoadingPassport(false)
      }
    }
    fetchPassport()
  }, [selectedEquipmentId, token])

  const handleSelectEquipment = (equipmentId: number) => {
    setSelectedEquipmentId(equipmentId)
    const params = new URLSearchParams(searchParams.toString())
    params.set('equipment_id', String(equipmentId))
    router.replace(`/passports?${params.toString()}`)
  }

  const updateField = (section: string, key: string, value: any) => {
    setDraftData((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] || {}),
        [key]: value,
      },
    }))
  }

  const saveDraft = async () => {
    if (!token || !selectedEquipmentId) return
    setSavingDraft(true)
    try {
      const response = await axios.put<PassportResponse>(
        `${API_URL}/api/passports/equipment/${selectedEquipmentId}/draft`,
        { draft_data: draftData, passport_status: 'draft' },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setPassport(response.data)
      setDraftData(response.data.draft_data || {})
      addNotification('Черновик паспорта сохранен', 'success')
    } catch (error) {
      addNotification(parseError(error, 'Не удалось сохранить черновик'), 'error')
    } finally {
      setSavingDraft(false)
    }
  }

  const publishPassport = async () => {
    if (!token || !selectedEquipmentId) return
    setPublishing(true)
    try {
      const response = await axios.post<PassportResponse>(
        `${API_URL}/api/passports/equipment/${selectedEquipmentId}/publish`,
        { change_summary: 'Публикация версии через веб-интерфейс' },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setPassport(response.data)
      setDraftData(response.data.draft_data || {})
      addNotification('Новая версия паспорта опубликована', 'success')
    } catch (error) {
      addNotification(parseError(error, 'Не удалось опубликовать версию'), 'error')
    } finally {
      setPublishing(false)
    }
  }

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
        if (documentForm.title.trim()) {
          formData.append('description', documentForm.title.trim())
        }
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
      addNotification('Документ паспорта добавлен', 'success')
    } catch (error) {
      addNotification(parseError(error, 'Не удалось добавить документ'), 'error')
    } finally {
      setDocumentSubmitting(false)
    }
  }

  const deleteDocument = async (documentId: number) => {
    if (!token) return
    try {
      await axios.delete(`${API_URL}/api/passports/documents/${documentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (selectedEquipmentId) {
        const response = await axios.get<PassportResponse>(`${API_URL}/api/passports/equipment/${selectedEquipmentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        setPassport(response.data)
      }
      addNotification('Документ паспорта удален', 'success')
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
      addNotification('Событие добавлено в паспорт', 'success')
    } catch (error) {
      addNotification(parseError(error, 'Не удалось добавить событие'), 'error')
    } finally {
      setEventSubmitting(false)
    }
  }

  const deleteEvent = async (eventId: number) => {
    if (!token) return
    try {
      await axios.delete(`${API_URL}/api/passports/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (selectedEquipmentId) {
        const response = await axios.get<PassportResponse>(`${API_URL}/api/passports/equipment/${selectedEquipmentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        setPassport(response.data)
      }
      addNotification('Событие удалено', 'success')
    } catch (error) {
      addNotification(parseError(error, 'Не удалось удалить событие'), 'error')
    }
  }

  const downloadDocumentFile = async (passportDocument: PassportDocument) => {
    if (!token || !passportDocument.file) return
    try {
      const response = await axios.get(`${API_URL}/api/files/${passportDocument.file.id}`, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` },
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = window.document.createElement('a')
      link.href = url
      link.setAttribute('download', passportDocument.file.original_filename)
      window.document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      addNotification(parseError(error, 'Не удалось скачать файл документа'), 'error')
    }
  }

  const summaryCards = passport ? [
    { label: 'Готовность паспорта', value: `${passport.completeness_percent}%`, tone: 'blue' },
    { label: 'Статус паспорта', value: passport.passport_status === 'approved' ? 'Утвержден' : passport.passport_status === 'draft' ? 'Черновик' : passport.passport_status, tone: 'slate' },
    { label: 'Текущая версия', value: passport.current_version_number ? `v${passport.current_version_number}` : '—', tone: 'emerald' },
    { label: 'Открытые нарушения', value: String(passport.aggregates?.violations_open || 0), tone: 'rose' },
    { label: 'Просрочено', value: String(passport.aggregates?.violations_overdue || 0), tone: 'amber' },
    { label: 'Документы', value: String(passport.documents?.length || 0), tone: 'violet' },
  ] : []

  const toneMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    slate: 'bg-slate-50 border-slate-200 text-slate-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    rose: 'bg-rose-50 border-rose-200 text-rose-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    violet: 'bg-violet-50 border-violet-200 text-violet-800',
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Электронные паспорта"
        subtitle="Промышленный контур цифрового паспорта оборудования: черновики, документы, события и версии"
        actions={passport ? (
          <>
            {canEdit && (
              <button
                onClick={saveDraft}
                disabled={savingDraft}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {savingDraft ? 'Сохраняем...' : 'Сохранить черновик'}
              </button>
            )}
            {canPublish && (
              <button
                onClick={publishPassport}
                disabled={publishing}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
              >
                {publishing ? 'Публикуем...' : 'Опубликовать версию'}
              </button>
            )}
          </>
        ) : undefined}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[320px,minmax(0,1fr)] gap-6">
        <aside className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4 h-fit">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Поиск оборудования</label>
            <input
              value={equipmentSearch}
              onChange={(e) => setEquipmentSearch(e.target.value)}
              placeholder="Номер паспорта, цех, тип..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="max-h-[70vh] overflow-y-auto space-y-2 pr-1">
            {loadingList ? (
              <div className="text-sm text-slate-500">Загрузка списка оборудования...</div>
            ) : filteredEquipment.length === 0 ? (
              <div className="text-sm text-slate-500">Оборудование не найдено</div>
            ) : filteredEquipment.map((item) => {
              const isActive = item.id === selectedEquipmentId
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectEquipment(item.id)}
                  className={`w-full text-left rounded-xl border px-3 py-3 transition ${isActive ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                >
                  <div className="text-sm font-semibold text-slate-900">{item.passport_number}</div>
                  <div className="text-xs text-slate-600 mt-1">{item.equipment_type}</div>
                  <div className="text-xs text-slate-500 mt-2">{item.workshop || 'Цех не указан'}</div>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="space-y-6">
          {!passport || loadingPassport ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-slate-500">
              {loadingPassport ? 'Загрузка электронного паспорта...' : 'Выберите оборудование слева'}
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">{passport.equipment.passport_number}</h2>
                    <p className="text-slate-600 mt-1">{passport.equipment.equipment_type}</p>
                    <p className="text-sm text-slate-500 mt-2">
                      {passport.equipment.workshop || 'Цех не указан'} • {passport.equipment.installation_location || 'Место установки не указано'}
                    </p>
                  </div>
                  <div className="text-sm text-slate-500">
                    Последняя публикация: {formatDate(passport.last_published_at)}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {summaryCards.map((card) => (
                    <div key={card.label} className={`rounded-xl border px-4 py-3 ${toneMap[card.tone]}`}>
                      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{card.label}</div>
                      <div className="text-xl font-bold mt-2">{card.value}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 text-sm">
                  <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                    <div className="text-slate-500">Регистрационный номер</div>
                    <div className="font-semibold text-slate-900 mt-1">{passport.equipment.registration_number || '—'}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                    <div className="text-slate-500">Заводской номер</div>
                    <div className="font-semibold text-slate-900 mt-1">{passport.equipment.factory_number || '—'}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                    <div className="text-slate-500">ПТО</div>
                    <div className="font-semibold text-slate-900 mt-1">{formatDate(passport.equipment.pto_date)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                    <div className="text-slate-500">ЧТО</div>
                    <div className="font-semibold text-slate-900 mt-1">{formatDate(passport.equipment.cto_date)}</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="border-b border-slate-200 px-4 py-3 flex flex-wrap gap-2">
                  {[
                    { key: 'draft', label: 'Черновик' },
                    { key: 'documents', label: 'Документы' },
                    { key: 'events', label: 'События' },
                    { key: 'versions', label: 'Версии' },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key as TabKey)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="p-6">
                  {activeTab === 'draft' && (
                    <div className="space-y-8">
                      {fieldSections.map((section) => (
                        <div key={section.section} className="space-y-4">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">{section.title}</h3>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {section.fields.map((field) => {
                              const value = draftData?.[field.section]?.[field.key]
                              if (field.type === 'textarea') {
                                return (
                                  <label key={`${field.section}.${field.key}`} className="md:col-span-2 block">
                                    <span className="block text-sm font-medium text-slate-700 mb-1">{field.label}</span>
                                    <textarea
                                      value={value || ''}
                                      disabled={!canEdit}
                                      onChange={(e) => updateField(field.section, field.key, e.target.value)}
                                      rows={3}
                                      placeholder={field.placeholder}
                                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                                    />
                                  </label>
                                )
                              }
                              if (field.type === 'checkbox') {
                                return (
                                  <label key={`${field.section}.${field.key}`} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 bg-slate-50">
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
                                  <span className="block text-sm font-medium text-slate-700 mb-1">{field.label}</span>
                                  <input
                                    type={field.type || 'text'}
                                    value={value || ''}
                                    disabled={!canEdit}
                                    onChange={(e) => updateField(field.section, field.key, e.target.value)}
                                    placeholder={field.placeholder}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                                  />
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === 'documents' && (
                    <div className="space-y-6">
                      {canEdit && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                          <h3 className="text-lg font-semibold text-slate-900">Добавить документ</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input value={documentForm.title} onChange={(e) => setDocumentForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Название документа" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            <input value={documentForm.document_type} onChange={(e) => setDocumentForm((prev) => ({ ...prev, document_type: e.target.value }))} placeholder="Тип документа" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            <input value={documentForm.document_number} onChange={(e) => setDocumentForm((prev) => ({ ...prev, document_number: e.target.value }))} placeholder="Номер документа" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            <input value={documentForm.issuer} onChange={(e) => setDocumentForm((prev) => ({ ...prev, issuer: e.target.value }))} placeholder="Кем выдан" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            <input type="date" value={documentForm.issue_date} onChange={(e) => setDocumentForm((prev) => ({ ...prev, issue_date: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            <input type="date" value={documentForm.expiry_date} onChange={(e) => setDocumentForm((prev) => ({ ...prev, expiry_date: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 bg-white">
                              <input type="checkbox" checked={documentForm.is_required} onChange={(e) => setDocumentForm((prev) => ({ ...prev, is_required: e.target.checked }))} />
                              <span className="text-sm text-slate-700">Обязательный документ</span>
                            </label>
                            <input type="file" onChange={(e) => setDocumentFile(e.target.files?.[0] || null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white" />
                          </div>
                          <textarea value={documentForm.notes} onChange={(e) => setDocumentForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Примечание" rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          <button onClick={submitDocument} disabled={documentSubmitting} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
                            {documentSubmitting ? 'Добавляем...' : 'Добавить документ'}
                          </button>
                        </div>
                      )}

                      <div className="space-y-3">
                        {passport.documents.length === 0 ? (
                          <div className="text-sm text-slate-500">Документы еще не добавлены</div>
                        ) : passport.documents.map((document) => (
                          <div key={document.id} className="rounded-xl border border-slate-200 p-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="text-base font-semibold text-slate-900">{document.title}</div>
                              <div className="text-sm text-slate-600 mt-1">{document.document_type}{document.document_number ? ` • № ${document.document_number}` : ''}</div>
                              <div className="text-sm text-slate-500 mt-2">Выдан: {document.issuer || '—'} • {formatDate(document.issue_date)} → {formatDate(document.expiry_date)}</div>
                              <div className="text-sm text-slate-500 mt-1">{document.notes || 'Без примечаний'}</div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {document.file && (
                                <button onClick={() => downloadDocumentFile(document)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200">
                                  Скачать файл
                                </button>
                              )}
                              {canEdit && (
                                <button onClick={() => deleteDocument(document.id)} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700">
                                  Удалить
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTab === 'events' && (
                    <div className="space-y-6">
                      {canEdit && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                          <h3 className="text-lg font-semibold text-slate-900">Добавить событие</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input value={eventForm.title} onChange={(e) => setEventForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Название события" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            <input value={eventForm.event_type} onChange={(e) => setEventForm((prev) => ({ ...prev, event_type: e.target.value }))} placeholder="Тип события" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            <input type="date" value={eventForm.event_date} onChange={(e) => setEventForm((prev) => ({ ...prev, event_date: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            <select value={eventForm.source} onChange={(e) => setEventForm((prev) => ({ ...prev, source: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                              <option value="manual">manual</option>
                              <option value="system">system</option>
                              <option value="ai">ai</option>
                            </select>
                          </div>
                          <textarea value={eventForm.description} onChange={(e) => setEventForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Описание события" rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          <button onClick={submitEvent} disabled={eventSubmitting} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
                            {eventSubmitting ? 'Добавляем...' : 'Добавить событие'}
                          </button>
                        </div>
                      )}

                      <div className="space-y-3">
                        {passport.events.length === 0 ? (
                          <div className="text-sm text-slate-500">Событий пока нет</div>
                        ) : passport.events.map((event) => (
                          <div key={event.id} className="rounded-xl border border-slate-200 p-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="text-base font-semibold text-slate-900">{event.title}</div>
                              <div className="text-sm text-slate-600 mt-1">{event.event_type} • {event.source}</div>
                              <div className="text-sm text-slate-500 mt-2">{formatDate(event.event_date)}</div>
                              <div className="text-sm text-slate-500 mt-1">{event.description || 'Без описания'}</div>
                            </div>
                            {canEdit && (
                              <button onClick={() => deleteEvent(event.id)} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700">
                                Удалить
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTab === 'versions' && (
                    <div className="space-y-4">
                      {passport.versions.length === 0 ? (
                        <div className="text-sm text-slate-500">Версии еще не публиковались</div>
                      ) : passport.versions.map((version) => (
                        <div key={version.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
                          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <div className="text-lg font-semibold text-slate-900">Версия v{version.version_number}</div>
                              <div className="text-sm text-slate-500 mt-1">Статус: {version.status} • {formatDate(version.created_at)}</div>
                            </div>
                            <div className="text-sm text-slate-500">
                              {version.change_summary || 'Описание публикации не указано'}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div className="text-slate-500">Готовность</div>
                              <div className="font-semibold text-slate-900 mt-1">{version.snapshot?.passport?.completeness_percent || '—'}%</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div className="text-slate-500">Документов</div>
                              <div className="font-semibold text-slate-900 mt-1">{version.snapshot?.documents?.length || 0}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div className="text-slate-500">Открытых нарушений</div>
                              <div className="font-semibold text-slate-900 mt-1">{version.snapshot?.aggregates?.violations_open || 0}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
