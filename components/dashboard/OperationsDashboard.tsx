'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { API_URL } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type Theme = 'light' | 'dark'
type Tone = 'danger' | 'warning' | 'info' | 'success' | 'neutral'
type ViewMode = 'overview' | 'risks' | 'passports' | 'deadlines'
type Row = Record<string, any>

const closedStatuses = new Set(['closed', 'resolved', 'done', 'cancelled', 'canceled', 'fixed', 'закрыто', 'устранено'])
const criticalLevels = new Set(['critical', 'high', 'критическая', 'высокая'])

const toList = (data: unknown): Row[] => {
  if (Array.isArray(data)) return data as Row[]
  if (data && typeof data === 'object' && Array.isArray((data as Row).items)) return (data as Row).items
  return []
}

const norm = (value?: string | null) => (value || '').trim().toLowerCase()
const isClosed = (status?: string | null) => closedStatuses.has(norm(status))

const parseDate = (value?: string | null) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const daysUntil = (value?: string | null) => {
  const date = parseDate(value)
  if (!date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)
  return Math.ceil((date.getTime() - today.getTime()) / 86400000)
}

const formatDate = (value?: string | null) => {
  const date = parseDate(value)
  if (!date) return 'не указано'
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

const compact = (value?: string | null, max = 74) => {
  const text = (value || '').replace(/\s+/g, ' ').trim()
  if (!text) return 'описание не заполнено'
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

const equipmentName = (item?: Row | null) => {
  if (!item) return 'ПС не указано'
  const type = item.equipment_type || 'ПС'
  const number = item.passport_number || item.registration_number || item.factory_number
  return number ? `${type} №${number}` : type
}

const riskText = (value?: string | null) => {
  const level = norm(value)
  if (level === 'critical') return 'критический'
  if (level === 'high') return 'высокий'
  if (level === 'medium') return 'средний'
  if (level === 'low') return 'низкий'
  return 'не рассчитан'
}

const statusText = (value?: string | null) => {
  const status = norm(value)
  const map: Record<string, string> = {
    published: 'опубликован',
    draft: 'черновик',
    archived: 'архив',
    open: 'открыто',
    in_progress: 'в работе',
    closed: 'закрыто',
  }
  return map[status] || value || 'не указан'
}

const toneCard = (tone: Tone, theme: Theme) => {
  const dark = theme === 'dark'
  const map: Record<Tone, string> = {
    danger: dark ? 'border-red-500/40 bg-red-950/30 text-red-100' : 'border-red-200 bg-red-50 text-red-900',
    warning: dark ? 'border-amber-500/40 bg-amber-950/30 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900',
    info: dark ? 'border-blue-500/40 bg-blue-950/30 text-blue-100' : 'border-blue-200 bg-blue-50 text-blue-900',
    success: dark ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-100' : 'border-emerald-200 bg-emerald-50 text-emerald-900',
    neutral: dark ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900',
  }
  return map[tone]
}

const toneBadge = (tone: Tone, theme: Theme) => {
  const dark = theme === 'dark'
  const map: Record<Tone, string> = {
    danger: dark ? 'bg-red-500/20 text-red-200' : 'bg-red-100 text-red-700',
    warning: dark ? 'bg-amber-500/20 text-amber-200' : 'bg-amber-100 text-amber-700',
    info: dark ? 'bg-blue-500/20 text-blue-200' : 'bg-blue-100 text-blue-700',
    success: dark ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-100 text-emerald-700',
    neutral: dark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700',
  }
  return map[tone]
}

const riskTone = (level?: string | null): Tone => {
  const value = norm(level)
  if (value === 'critical') return 'danger'
  if (value === 'high') return 'warning'
  if (value === 'medium') return 'info'
  if (value === 'low') return 'success'
  return 'neutral'
}

function Panel({ title, subtitle, action, theme, children }: { title: string; subtitle?: string; action?: ReactNode; theme: Theme; children: ReactNode }) {
  return (
    <section className={`rounded-3xl border p-5 shadow-sm ${theme === 'dark' ? 'border-slate-800 bg-slate-950/90 text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black tracking-tight">{title}</h2>
          {subtitle && <p className={`mt-1 text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Kpi({ title, value, caption, tone, href, theme }: { title: string; value: string | number; caption: string; tone: Tone; href: string; theme: Theme }) {
  return (
    <Link href={href} className={`rounded-3xl border p-5 transition hover:-translate-y-0.5 hover:shadow-lg ${toneCard(tone, theme)}`}>
      <p className="text-sm font-bold opacity-70">{title}</p>
      <p className="mt-3 text-4xl font-black tracking-tight">{value}</p>
      <p className="mt-3 text-sm font-semibold opacity-80">{caption}</p>
    </Link>
  )
}

function Bar({ value, tone, theme }: { value: number; tone: Tone; theme: Theme }) {
  const safe = Math.max(0, Math.min(100, Math.round(value)))
  const colors: Record<Tone, string> = {
    danger: 'bg-red-500',
    warning: 'bg-amber-500',
    info: 'bg-blue-500',
    success: 'bg-emerald-500',
    neutral: 'bg-slate-400',
  }
  return (
    <div className={`h-2 rounded-full ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-100'}`}>
      <div className={`h-2 rounded-full ${colors[tone]}`} style={{ width: `${safe}%` }} />
    </div>
  )
}

export default function OperationsDashboard({ theme, isManager }: { theme: Theme; isManager: boolean }) {
  const { token } = useAuthStore()
  const [equipment, setEquipment] = useState<Row[]>([])
  const [violations, setViolations] = useState<Row[]>([])
  const [riskTop, setRiskTop] = useState<Row[]>([])
  const [passports, setPassports] = useState<Row[]>([])
  const [alerts, setAlerts] = useState<Row>({})
  const [audit, setAudit] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [warning, setWarning] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [mode, setMode] = useState<ViewMode>('overview')
  const [workshop, setWorkshop] = useState('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      setWarning(null)
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
      const results = await Promise.allSettled([
        axios.get(`${API_URL}/api/equipment?limit=1000`, config),
        axios.get(`${API_URL}/api/violations?limit=1000`, config),
        axios.get(`${API_URL}/api/equipment/risk/top?limit=8`, config),
        axios.get(`${API_URL}/api/passports/index`, config),
        axios.get(`${API_URL}/api/alerts/summary`, config),
        axios.get(`${API_URL}/api/audit?limit=10`, config),
      ])
      if (!mounted) return
      const data = results.map((result) => (result.status === 'fulfilled' ? result.value.data : null))
      const failed = results.filter((result) => result.status === 'rejected').length
      setEquipment(toList(data[0]))
      setViolations(toList(data[1]))
      setRiskTop(toList(data[2]))
      setPassports(toList(data[3]))
      setAlerts((data[4] || {}) as Row)
      setAudit(toList(data[5]))
      setUpdatedAt(new Date())
      setWarning(failed ? `Часть данных не загрузилась: ${failed} источник(а).` : null)
      setLoading(false)
    }
    load().catch(() => {
      if (!mounted) return
      setWarning('Не удалось загрузить дашборд. Проверьте API.')
      setLoading(false)
    })
    return () => {
      mounted = false
    }
  }, [token])

  const model = useMemo(() => {
    const equipmentById = new Map<number, Row>()
    equipment.forEach((item) => equipmentById.set(Number(item.id), item))

    const workshops = Array.from(new Set([...equipment, ...passports].map((item) => item.workshop).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), 'ru'))
    const search = norm(query)

    const equipmentFiltered = equipment.filter((item) => {
      const byWorkshop = workshop === 'all' || item.workshop === workshop
      const searchable = `${item.equipment_type || ''} ${item.passport_number || ''} ${item.registration_number || ''} ${item.factory_number || ''} ${item.workshop || ''}`.toLowerCase()
      return byWorkshop && (!search || searchable.includes(search))
    })
    const equipmentIds = new Set(equipmentFiltered.map((item) => Number(item.id)))

    const violationsFiltered = violations.filter((item) => {
      const linked = item.equipment || equipmentById.get(Number(item.equipment_id))
      const byWorkshop = workshop === 'all' || linked?.workshop === workshop
      const searchable = `${item.description || ''} ${item.title || ''} ${equipmentName(linked)} ${linked?.workshop || ''}`.toLowerCase()
      const bySearch = !search || searchable.includes(search)
      return byWorkshop && bySearch
    })

    const passportsFiltered = passports.filter((item) => {
      const byWorkshop = workshop === 'all' || item.workshop === workshop
      const searchable = `${item.equipment_type || ''} ${item.passport_number || ''} ${item.workshop || ''}`.toLowerCase()
      return byWorkshop && (!search || searchable.includes(search))
    })

    const open = violationsFiltered.filter((item) => !isClosed(item.status))
    const overdue = open.filter((item) => {
      if (item.is_overdue) return true
      const days = daysUntil(item.deadline || item.due_date)
      return days !== null && days < 0
    })
    const criticalOpen = open.filter((item) => criticalLevels.has(norm(item.severity || item.criticality)))
    const banned = equipmentFiltered.filter((item) => Boolean(item.operation_banned) || norm(item.status).includes('запрет'))
    const soon = equipmentFiltered.filter((item) => {
      const pto = daysUntil(item.pto_date)
      const cto = daysUntil(item.cto_date)
      const epb = daysUntil(item.expertise_date)
      const permit = daysUntil(item.operation_permit_until)
      return [pto, cto].some((days) => days !== null && days <= 30) || [epb, permit].some((days) => days !== null && days <= 60)
    })

    const passportReadiness = passportsFiltered.length
      ? Math.round(passportsFiltered.reduce((sum, item) => sum + Number(item.completeness_percent || 0), 0) / passportsFiltered.length)
      : 0
    const weakPassports = [...passportsFiltered]
      .filter((item) => Number(item.completeness_percent || 0) < 75)
      .sort((a, b) => Number(a.completeness_percent || 0) - Number(b.completeness_percent || 0))

    const computedRiskTop: Row[] = (riskTop.length ? riskTop : passportsFiltered.map((item): Row => ({
      equipment_id: item.equipment_id,
      equipment_type: item.equipment_type,
      passport_number: item.passport_number,
      workshop: item.workshop,
      risk_level: item.risk_level,
      risk_score: Number(item.open_violations || 0) + Number(item.overdue_violations || 0) * 2,
      active_violations: item.open_violations || 0,
      overdue: item.overdue_violations || 0,
    }))).filter((item) => {
      if (workshop !== 'all' && item.workshop !== workshop) return false
      if (!search) return true
      return `${item.equipment_type || ''} ${item.passport_number || ''} ${item.equipment_id || ''}`.toLowerCase().includes(search)
    }).sort((a, b) => Number(b.risk_score || 0) - Number(a.risk_score || 0)).slice(0, 8)

    const attention = [
      ...overdue.slice(0, 4).map((item): Row => ({ type: 'Просрочка', tone: 'danger', item })),
      ...criticalOpen.slice(0, 4).map((item): Row => ({ type: 'Критично', tone: 'danger', item })),
      ...soon.slice(0, 4).map((item): Row => ({ type: 'Сроки', tone: 'warning', item })),
      ...weakPassports.slice(0, 3).map((item): Row => ({ type: 'Паспорт', tone: 'warning', item })),
    ].slice(0, 8)

    const workshopRisk = workshops.map((name): Row => {
      const ids = new Set(equipment.filter((item) => item.workshop === name).map((item) => Number(item.id)))
      const related = violations.filter((item) => ids.has(Number(item.equipment_id)) || item.equipment?.workshop === name).filter((item) => !isClosed(item.status))
      const relatedOverdue = related.filter((item) => item.is_overdue || ((daysUntil(item.deadline || item.due_date) ?? 0) < 0))
      const relatedCritical = related.filter((item) => criticalLevels.has(norm(item.severity || item.criticality)))
      return {
        workshop: name,
        equipment: ids.size,
        open: related.length,
        overdue: relatedOverdue.length,
        critical: relatedCritical.length,
        score: related.length + relatedOverdue.length * 2 + relatedCritical.length * 3,
      }
    }).sort((a, b) => Number(b.score) - Number(a.score))

    return { workshops, equipmentById, equipmentFiltered, violationsFiltered, passportsFiltered, open, overdue, criticalOpen, banned, soon, passportReadiness, weakPassports, computedRiskTop, attention, workshopRisk, equipmentIds }
  }, [equipment, violations, riskTop, passports, workshop, query])

  const muted = theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
  const page = theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
  const field = theme === 'dark' ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
  const activeAlerts = alerts.unacknowledged ?? alerts.total ?? 0
  const safeState = model.overdue.length === 0 && model.criticalOpen.length === 0 && model.banned.length === 0

  if (loading) {
    return (
      <div className={page}>
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className={`h-36 animate-pulse rounded-3xl ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`} />)}
        </div>
      </div>
    )
  }

  const modes: Array<{ id: ViewMode; label: string; hint: string }> = [
    { id: 'overview', label: 'Обзор', hint: 'главное' },
    { id: 'risks', label: 'Риски', hint: 'опасные ПС' },
    { id: 'passports', label: 'Паспорта', hint: 'документы' },
    { id: 'deadlines', label: 'Сроки', hint: 'ПТО/ЧТО' },
  ]

  return (
    <div className={page}>
      {warning && <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${toneCard('warning', theme)}`}>{warning}</div>}

      <section className={`overflow-hidden rounded-[2rem] border shadow-sm ${theme === 'dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
        <div className="grid lg:grid-cols-[0.95fr_1.25fr]">
          <div className={`p-6 text-white ${safeState ? 'bg-gradient-to-br from-emerald-700 via-slate-900 to-slate-950' : 'bg-gradient-to-br from-red-700 via-slate-900 to-slate-950'}`}>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-white/65">InspectorHub</p>
            <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">{safeState ? 'Система под контролем' : 'Есть приоритетные риски'}</h1>
            <p className="mt-3 max-w-xl text-sm font-medium text-white/75">
              {isManager ? 'Управленческая сводка по кранам, дефектам, срокам и паспортам.' : 'Рабочая панель инспектора: что проверить, где просрочка, куда перейти.'}
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
                <p className="text-xs text-white/60">ПС</p>
                <p className="mt-1 text-2xl font-black">{model.equipmentFiltered.length}</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
                <p className="text-xs text-white/60">Открыто</p>
                <p className="mt-1 text-2xl font-black">{model.open.length}</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
                <p className="text-xs text-white/60">SLA</p>
                <p className="mt-1 text-2xl font-black">{model.overdue.length}</p>
              </div>
            </div>
          </div>

          <div className="p-5">
            <div className="grid gap-3 md:grid-cols-[1fr_220px]">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск: номер крана, тип, цех, дефект"
                className={`h-11 rounded-2xl border px-4 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 ${field}`}
              />
              <select value={workshop} onChange={(event) => setWorkshop(event.target.value)} className={`h-11 rounded-2xl border px-4 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 ${field}`}>
                <option value="all">Все цеха</option>
                {model.workshops.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              {modes.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setMode(item.id)}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${mode === item.id ? toneCard('info', theme) : theme === 'dark' ? 'border-slate-800 bg-slate-950 text-slate-300 hover:border-blue-700' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300'}`}
                >
                  <p className="text-sm font-black">{item.label}</p>
                  <p className="text-xs opacity-70">{item.hint}</p>
                </button>
              ))}
            </div>

            <div className={`mt-4 rounded-2xl border p-4 ${theme === 'dark' ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className={`rounded-full px-3 py-1 ${toneBadge('neutral', theme)}`}>Обновлено: {updatedAt ? updatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'только что'}</span>
                <span className={`rounded-full px-3 py-1 ${toneBadge(activeAlerts ? 'warning' : 'success', theme)}`}>Алерты: {activeAlerts}</span>
                <span className={`rounded-full px-3 py-1 ${toneBadge(model.passportReadiness >= 80 ? 'success' : 'warning', theme)}`}>Паспорта: {model.passportReadiness}%</span>
                <span className={`rounded-full px-3 py-1 ${toneBadge(model.soon.length ? 'warning' : 'success', theme)}`}>Сроки: {model.soon.length}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Оборудование" value={model.equipmentFiltered.length} caption={`Запрет эксплуатации: ${model.banned.length}`} tone={model.banned.length ? 'danger' : 'info'} href="/equipment" theme={theme} />
        <Kpi title="Нарушения" value={model.open.length} caption={`Критичных: ${model.criticalOpen.length}`} tone={model.criticalOpen.length ? 'danger' : model.open.length ? 'warning' : 'success'} href="/violations" theme={theme} />
        <Kpi title="Просрочки" value={model.overdue.length} caption={`Активные алерты: ${activeAlerts}`} tone={model.overdue.length ? 'danger' : activeAlerts ? 'warning' : 'success'} href="/alerts" theme={theme} />
        <Kpi title="Паспорта" value={`${model.passportReadiness}%`} caption={`Нужно заполнить: ${model.weakPassports.length}`} tone={model.passportReadiness >= 80 ? 'success' : model.passportReadiness >= 55 ? 'warning' : 'danger'} href="/passports" theme={theme} />
      </div>

      {mode === 'overview' && (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Panel title="Что сделать первым" subtitle="Список задач с самым высоким приоритетом" theme={theme} action={<Link href="/violations" className={`rounded-full px-3 py-1 text-xs font-bold ${toneBadge('info', theme)}`}>нарушения</Link>}>
            {model.attention.length === 0 ? (
              <div className={`rounded-2xl border border-dashed p-8 text-center ${theme === 'dark' ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}`}>Срочных задач нет.</div>
            ) : (
              <div className="space-y-3">
                {model.attention.map((entry, index) => {
                  const item = entry.item
                  const isPassport = entry.type === 'Паспорт'
                  const isDeadline = entry.type === 'Сроки'
                  const linked = isPassport || isDeadline ? item : item.equipment || model.equipmentById.get(Number(item.equipment_id))
                  const href = isPassport ? '/passports' : isDeadline ? '/equipment' : '/violations'
                  const title = isPassport ? `${item.equipment_type || 'ПС'} №${item.passport_number || item.equipment_id}` : equipmentName(linked)
                  const text = isPassport ? `готовность ${item.completeness_percent || 0}%` : isDeadline ? `ПТО ${formatDate(item.pto_date)} · ЧТО ${formatDate(item.cto_date)}` : compact(item.description || item.title)
                  return (
                    <Link key={`${entry.type}-${item.id || item.equipment_id || index}`} href={href} className={`block rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${toneCard(entry.tone as Tone, theme)}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-black">{entry.type}: {title}</p>
                          <p className="mt-1 text-sm font-medium opacity-80">{text}</p>
                        </div>
                        <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${toneBadge(entry.tone as Tone, theme)}`}>открыть</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </Panel>

          <Panel title="Быстрые действия" subtitle="Основные рабочие разделы" theme={theme}>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { href: '/workshop-map', title: 'Карта цеха', text: 'найти кран на плане', tone: 'info' as Tone },
                { href: '/defectovka', title: '3D дефектовка', text: 'узлы, точки, фото', tone: 'warning' as Tone },
                { href: '/passports', title: 'Паспорта', text: 'документы и данные', tone: 'success' as Tone },
                { href: '/violations', title: 'Нарушения', text: 'дефекты и статусы', tone: 'danger' as Tone },
              ].map((item) => (
                <Link key={item.href} href={item.href} className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${toneCard(item.tone, theme)}`}>
                  <p className="font-black">{item.title}</p>
                  <p className="mt-1 text-sm font-medium opacity-75">{item.text}</p>
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {mode === 'risks' && (
        <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Panel title="Риск по цехам" subtitle="Где больше всего открытых и просроченных дефектов" theme={theme}>
            <div className="space-y-4">
              {model.workshopRisk.slice(0, 8).map((item) => {
                const max = Math.max(1, ...model.workshopRisk.map((row) => Number(row.score || 0)))
                const tone: Tone = item.critical || item.overdue ? 'danger' : item.open ? 'warning' : 'success'
                return (
                  <div key={item.workshop}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-black">{item.workshop}</p>
                        <p className={`text-xs ${muted}`}>ПС: {item.equipment} · открыто: {item.open} · просрочено: {item.overdue}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${toneBadge(tone, theme)}`}>{item.score}</span>
                    </div>
                    <Bar value={(Number(item.score || 0) / max) * 100} tone={tone} theme={theme} />
                  </div>
                )
              })}
              {model.workshopRisk.length === 0 && <p className={muted}>Нет данных по цехам.</p>}
            </div>
          </Panel>

          <Panel title="Топ рискованных ПС" subtitle="Сортировка по risk_score" theme={theme}>
            <div className="grid gap-3 md:grid-cols-2">
              {model.computedRiskTop.map((item, index) => {
                const tone = riskTone(item.risk_level)
                return (
                  <Link key={`${item.equipment_id || item.id || index}-${index}`} href="/equipment" className={`rounded-2xl border p-4 ${toneCard(tone, theme)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black">{index + 1}. {item.equipment_type || 'ПС'} №{item.passport_number || item.equipment_id || 'без номера'}</p>
                        <p className="mt-1 text-sm opacity-80">{item.workshop || 'цех не указан'} · {riskText(item.risk_level)}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${toneBadge(tone, theme)}`}>{Math.round(Number(item.risk_score || 0))}</span>
                    </div>
                  </Link>
                )
              })}
              {model.computedRiskTop.length === 0 && <p className={muted}>Риски пока не рассчитаны.</p>}
            </div>
          </Panel>
        </div>
      )}

      {mode === 'passports' && (
        <div className="mt-6 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <Panel title="Готовность паспортов" subtitle="Общий процент по выбранному цеху/поиску" theme={theme}>
            <div className={`rounded-3xl border p-5 ${toneCard(model.passportReadiness >= 80 ? 'success' : model.passportReadiness >= 55 ? 'warning' : 'danger', theme)}`}>
              <div className="mb-3 flex items-center justify-between">
                <p className="font-black">Средняя готовность</p>
                <p className="text-3xl font-black">{model.passportReadiness}%</p>
              </div>
              <Bar value={model.passportReadiness} tone={model.passportReadiness >= 80 ? 'success' : model.passportReadiness >= 55 ? 'warning' : 'danger'} theme={theme} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className={`rounded-2xl border p-4 ${toneCard('neutral', theme)}`}>
                <p className="text-sm opacity-70">Всего паспортов</p>
                <p className="mt-1 text-2xl font-black">{model.passportsFiltered.length}</p>
              </div>
              <div className={`rounded-2xl border p-4 ${toneCard(model.weakPassports.length ? 'warning' : 'success', theme)}`}>
                <p className="text-sm opacity-70">Нужно заполнить</p>
                <p className="mt-1 text-2xl font-black">{model.weakPassports.length}</p>
              </div>
            </div>
          </Panel>

          <Panel title="Паспорта, требующие заполнения" subtitle="Самые неполные карточки сверху" theme={theme} action={<Link href="/passports" className={`rounded-full px-3 py-1 text-xs font-bold ${toneBadge('info', theme)}`}>все паспорта</Link>}>
            <div className="grid gap-3 md:grid-cols-2">
              {model.weakPassports.slice(0, 8).map((item) => {
                const value = Number(item.completeness_percent || 0)
                const tone: Tone = value < 50 ? 'danger' : 'warning'
                return (
                  <Link key={item.equipment_id} href="/passports" className={`rounded-2xl border p-4 ${toneCard(tone, theme)}`}>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black">{item.equipment_type || 'ПС'} №{item.passport_number || item.equipment_id}</p>
                        <p className="mt-1 text-sm opacity-80">{item.workshop || 'цех не указан'} · {statusText(item.passport_status)}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${toneBadge(tone, theme)}`}>{value}%</span>
                    </div>
                    <Bar value={value} tone={tone} theme={theme} />
                  </Link>
                )
              })}
              {model.weakPassports.length === 0 && <p className={muted}>Проблемных паспортов не найдено.</p>}
            </div>
          </Panel>
        </div>
      )}

      {mode === 'deadlines' && (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Panel title="Ближайшие сроки" subtitle="ПТО, ЧТО, ЭПБ и разрешения" theme={theme}>
            <div className="grid gap-3 md:grid-cols-2">
              {model.soon.slice(0, 10).map((item) => {
                const pto = daysUntil(item.pto_date)
                const cto = daysUntil(item.cto_date)
                const tone: Tone = [pto, cto].some((days) => days !== null && days < 0) ? 'danger' : 'warning'
                return (
                  <Link key={item.id} href="/equipment" className={`rounded-2xl border p-4 ${toneCard(tone, theme)}`}>
                    <p className="font-black">{equipmentName(item)}</p>
                    <p className="mt-2 text-sm opacity-80">ПТО: {formatDate(item.pto_date)} · ЧТО: {formatDate(item.cto_date)}</p>
                    <p className="mt-1 text-sm opacity-80">ЭПБ: {formatDate(item.expertise_date)} · Разрешение: {formatDate(item.operation_permit_until)}</p>
                  </Link>
                )
              })}
              {model.soon.length === 0 && <p className={muted}>Ближайших сроков не найдено.</p>}
            </div>
          </Panel>

          <Panel title="Последние события" subtitle="Лента аудита" theme={theme} action={<Link href="/audit" className={`rounded-full px-3 py-1 text-xs font-bold ${toneBadge('neutral', theme)}`}>аудит</Link>}>
            <div className="space-y-3">
              {audit.slice(0, 7).map((item, index) => (
                <div key={`${item.id || index}-${index}`} className={`rounded-2xl border p-4 ${theme === 'dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'}`}>
                  <p className="text-sm font-black">{item.description || item.message || item.action || item.action_type || 'Событие'}</p>
                  <p className={`mt-1 text-xs ${muted}`}>{item.entity_type || 'system'} · {formatDate(item.performed_at || item.created_at)}</p>
                </div>
              ))}
              {audit.length === 0 && <p className={muted}>Событий пока нет.</p>}
            </div>
          </Panel>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Открытые нарушения" subtitle="Последние по текущему фильтру" theme={theme}>
          <div className="space-y-3">
            {model.open.slice(0, 5).map((item) => {
              const linked = item.equipment || model.equipmentById.get(Number(item.equipment_id))
              const tone: Tone = criticalLevels.has(norm(item.severity || item.criticality)) ? 'danger' : 'warning'
              return (
                <Link key={item.id} href="/violations" className={`block rounded-2xl border p-4 ${toneCard(tone, theme)}`}>
                  <p className="font-black">{equipmentName(linked)}</p>
                  <p className="mt-1 text-sm opacity-80">{compact(item.description || item.title)}</p>
                </Link>
              )
            })}
            {model.open.length === 0 && <p className={muted}>Открытых нарушений по фильтру нет.</p>}
          </div>
        </Panel>

        <Panel title="Краны в выборке" subtitle="Быстрая проверка найденного оборудования" theme={theme}>
          <div className="space-y-3">
            {model.equipmentFiltered.slice(0, 5).map((item) => (
              <Link key={item.id} href="/equipment" className={`block rounded-2xl border p-4 ${theme === 'dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{equipmentName(item)}</p>
                    <p className={`mt-1 text-sm ${muted}`}>{item.workshop || 'цех не указан'} · рег. № {item.registration_number || 'не указан'}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${toneBadge(item.operation_banned ? 'danger' : 'success', theme)}`}>{item.operation_banned ? 'стоп' : 'в работе'}</span>
                </div>
              </Link>
            ))}
            {model.equipmentFiltered.length === 0 && <p className={muted}>Оборудование не найдено.</p>}
          </div>
        </Panel>
      </div>
    </div>
  )
}
