'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { API_URL } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type Theme = 'light' | 'dark'
type Tone = 'critical' | 'warning' | 'info' | 'success' | 'neutral'
type Row = Record<string, any>

type Attention = {
  id: string
  title: string
  subtitle: string
  badge: string
  tone: Tone
  href: string
}

const closed = new Set(['closed', 'resolved', 'done', 'cancelled', 'canceled', 'fixed', 'устранено', 'закрыто', 'отменено'])
const critical = new Set(['critical', 'high', 'критическая', 'высокая'])

const list = (data: unknown): Row[] => {
  if (Array.isArray(data)) return data as Row[]
  if (data && typeof data === 'object' && Array.isArray((data as Row).items)) return (data as Row).items
  return []
}

const norm = (value?: string | null) => (value || '').trim().toLowerCase()
const isClosed = (status?: string | null) => closed.has(norm(status))

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

const shortText = (value?: string | null, max = 86) => {
  const text = (value || '').replace(/\s+/g, ' ').trim()
  if (!text) return 'Описание не заполнено'
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

const equipmentName = (item?: Row | null) => {
  if (!item) return 'ПС не указано'
  const type = item.equipment_type || 'ПС'
  const number = item.passport_number || item.registration_number || item.factory_number
  return number ? `${type} №${number}` : type
}

const riskLabel = (level?: string | null) => {
  const key = norm(level)
  if (key === 'critical') return 'критический'
  if (key === 'high') return 'высокий'
  if (key === 'medium') return 'средний'
  if (key === 'low') return 'низкий'
  return 'не рассчитан'
}

const statusLabel = (status?: string | null) => {
  const key = norm(status)
  const labels: Record<string, string> = {
    published: 'опубликован',
    draft: 'черновик',
    archived: 'архив',
    open: 'открыто',
    in_progress: 'в работе',
    closed: 'закрыто',
  }
  return labels[key] || status || 'не указан'
}

const toneClass = (tone: Tone, theme: Theme) => {
  const dark = theme === 'dark'
  const map: Record<Tone, string> = {
    critical: dark ? 'border-red-500/40 bg-red-950/35 text-red-100' : 'border-red-200 bg-red-50 text-red-900',
    warning: dark ? 'border-amber-500/40 bg-amber-950/35 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900',
    info: dark ? 'border-sky-500/40 bg-sky-950/35 text-sky-100' : 'border-sky-200 bg-sky-50 text-sky-900',
    success: dark ? 'border-emerald-500/40 bg-emerald-950/35 text-emerald-100' : 'border-emerald-200 bg-emerald-50 text-emerald-900',
    neutral: dark ? 'border-slate-700 bg-slate-900/70 text-slate-100' : 'border-slate-200 bg-white text-slate-900',
  }
  return map[tone]
}

const badgeClass = (tone: Tone, theme: Theme) => {
  const dark = theme === 'dark'
  const map: Record<Tone, string> = {
    critical: dark ? 'bg-red-500/20 text-red-200 ring-red-400/30' : 'bg-red-100 text-red-700 ring-red-200',
    warning: dark ? 'bg-amber-500/20 text-amber-200 ring-amber-400/30' : 'bg-amber-100 text-amber-700 ring-amber-200',
    info: dark ? 'bg-sky-500/20 text-sky-200 ring-sky-400/30' : 'bg-sky-100 text-sky-700 ring-sky-200',
    success: dark ? 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/30' : 'bg-emerald-100 text-emerald-700 ring-emerald-200',
    neutral: dark ? 'bg-slate-700 text-slate-200 ring-slate-600' : 'bg-slate-100 text-slate-700 ring-slate-200',
  }
  return map[tone]
}

const riskTone = (level?: string | null): Tone => {
  const key = norm(level)
  if (key === 'critical') return 'critical'
  if (key === 'high') return 'warning'
  if (key === 'medium') return 'info'
  if (key === 'low') return 'success'
  return 'neutral'
}

function StatCard({ title, value, detail, tone, href, theme }: { title: string; value: string | number; detail: string; tone: Tone; href: string; theme: Theme }) {
  return (
    <Link href={href} className={`group rounded-3xl border p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${toneClass(tone, theme)}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold opacity-75">{title}</p>
          <p className="mt-3 text-3xl font-black tracking-tight">{value}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${badgeClass(tone, theme)}`}>открыть</span>
      </div>
      <p className="mt-4 text-sm font-medium opacity-80">{detail}</p>
    </Link>
  )
}

function Panel({ title, subtitle, action, theme, children }: { title: string; subtitle?: string; action?: ReactNode; theme: Theme; children: ReactNode }) {
  return (
    <section className={`rounded-3xl border p-5 shadow-sm ${theme === 'dark' ? 'border-slate-800 bg-slate-950/70 text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`}>
      <div className="mb-5 flex items-start justify-between gap-4">
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

function ProgressBar({ value, tone, theme }: { value: number; tone: Tone; theme: Theme }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)))
  const color: Record<Tone, string> = {
    critical: 'bg-red-500',
    warning: 'bg-amber-500',
    info: 'bg-sky-500',
    success: 'bg-emerald-500',
    neutral: 'bg-slate-400',
  }
  return (
    <div className={`h-2 overflow-hidden rounded-full ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-100'}`}>
      <div className={`h-full rounded-full ${color[tone]}`} style={{ width: `${safeValue}%` }} />
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

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      setWarning(null)
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
      const results = await Promise.allSettled([
        axios.get(`${API_URL}/api/equipment?limit=1000`, config),
        axios.get(`${API_URL}/api/violations?limit=1000`, config),
        axios.get(`${API_URL}/api/equipment/risk/top?limit=5`, config),
        axios.get(`${API_URL}/api/passports/index`, config),
        axios.get(`${API_URL}/api/alerts/summary`, config),
        axios.get(`${API_URL}/api/audit?limit=12`, config),
      ])
      if (!mounted) return
      const data = results.map((result) => (result.status === 'fulfilled' ? result.value.data : null))
      const failed = results.filter((result) => result.status === 'rejected').length
      setEquipment(list(data[0]))
      setViolations(list(data[1]))
      setRiskTop(list(data[2]))
      setPassports(list(data[3]))
      setAlerts((data[4] || {}) as Row)
      setAudit(list(data[5]))
      setUpdatedAt(new Date())
      setWarning(failed ? `Часть данных не загрузилась: ${failed} источник(а). Основная сводка показана по доступным данным.` : null)
      setLoading(false)
    }
    load().catch(() => {
      if (!mounted) return
      setWarning('Не удалось загрузить сводку дашборда. Проверьте подключение к API.')
      setLoading(false)
    })
    return () => {
      mounted = false
    }
  }, [token])

  const derived = useMemo(() => {
    const byId = new Map<number, Row>()
    equipment.forEach((item) => byId.set(Number(item.id), item))

    const activeViolations = violations.filter((item) => !isClosed(item.status))
    const overdueViolations = activeViolations.filter((item) => {
      if (item.is_overdue) return true
      const days = daysUntil(item.deadline || item.due_date)
      return days !== null && days < 0
    })
    const criticalOpen = activeViolations.filter((item) => critical.has(norm(item.severity || item.criticality)))
    const bannedEquipment = equipment.filter((item) => Boolean(item.operation_banned) || norm(item.status).includes('запрет'))
    const ptoSoon = equipment.filter((item) => {
      const days = daysUntil(item.pto_date)
      return days !== null && days <= 30
    })
    const ctoSoon = equipment.filter((item) => {
      const days = daysUntil(item.cto_date)
      return days !== null && days <= 30
    })
    const epbSoon = equipment.filter((item) => {
      const expertise = daysUntil(item.expertise_date)
      const permit = daysUntil(item.operation_permit_until)
      return (expertise !== null && expertise <= 60) || (permit !== null && permit <= 60)
    })

    const passportReadiness = passports.length ? Math.round(passports.reduce((sum, item) => sum + Number(item.completeness_percent || 0), 0) / passports.length) : 0
    const weakPassports = [...passports]
      .filter((item) => Number(item.completeness_percent || 0) < 75)
      .sort((a, b) => Number(a.completeness_percent || 0) - Number(b.completeness_percent || 0))
      .slice(0, 6)

    const attention: Attention[] = []
    overdueViolations.slice(0, 4).forEach((item) => {
      const linked = item.equipment || byId.get(Number(item.equipment_id))
      const days = daysUntil(item.deadline || item.due_date)
      attention.push({
        id: `overdue-${item.id}`,
        title: `Просрочено нарушение #${item.id}`,
        subtitle: `${equipmentName(linked)} - ${shortText(item.description || item.title)}`,
        badge: days === null ? 'SLA' : `${Math.abs(days)} дн.`,
        tone: 'critical',
        href: '/violations',
      })
    })
    criticalOpen.slice(0, 4).forEach((item) => {
      const linked = item.equipment || byId.get(Number(item.equipment_id))
      attention.push({
        id: `critical-${item.id}`,
        title: `Критичный дефект #${item.id}`,
        subtitle: `${equipmentName(linked)} - ${shortText(item.description || item.title)}`,
        badge: 'критично',
        tone: 'critical',
        href: '/violations',
      })
    })
    bannedEquipment.slice(0, 3).forEach((item) => {
      attention.push({
        id: `ban-${item.id}`,
        title: 'Эксплуатация запрещена',
        subtitle: `${equipmentName(item)} · ${item.workshop || 'цех не указан'}`,
        badge: 'стоп',
        tone: 'critical',
        href: '/equipment',
      })
    })
    ptoSoon.slice(0, 3).forEach((item) => {
      const days = daysUntil(item.pto_date)
      attention.push({
        id: `pto-${item.id}`,
        title: 'Подходит срок ПТО',
        subtitle: `${equipmentName(item)} · дата: ${formatDate(item.pto_date)}`,
        badge: days !== null && days < 0 ? 'просрочено' : `${days ?? 0} дн.`,
        tone: days !== null && days < 0 ? 'critical' : 'warning',
        href: '/equipment',
      })
    })
    weakPassports.slice(0, 3).forEach((item) => {
      attention.push({
        id: `passport-${item.equipment_id}`,
        title: 'Паспорт требует заполнения',
        subtitle: `${item.equipment_type || 'ПС'} №${item.passport_number || item.equipment_id} · готовность ${item.completeness_percent || 0}%`,
        badge: 'паспорт',
        tone: 'warning',
        href: '/passports',
      })
    })

    const workshopMap = new Map<string, Row>()
    equipment.forEach((item) => {
      const workshop = item.workshop || 'Без цеха'
      const current = workshopMap.get(workshop) || { workshop, equipmentCount: 0, open: 0, critical: 0, overdue: 0, score: 0 }
      current.equipmentCount += 1
      workshopMap.set(workshop, current)
    })
    activeViolations.forEach((item) => {
      const linked = item.equipment || byId.get(Number(item.equipment_id))
      const workshop = linked?.workshop || 'Без цеха'
      const current = workshopMap.get(workshop) || { workshop, equipmentCount: 0, open: 0, critical: 0, overdue: 0, score: 0 }
      const isCritical = critical.has(norm(item.severity || item.criticality))
      const isOverdue = item.is_overdue || ((daysUntil(item.deadline || item.due_date) ?? 0) < 0)
      current.open += 1
      if (isCritical) current.critical += 1
      if (isOverdue) current.overdue += 1
      current.score = current.open + current.critical * 3 + current.overdue * 2
      workshopMap.set(workshop, current)
    })
    const workshopRisk = (Array.from(workshopMap.values()) as Row[])
      .map((item): Row => ({
        ...item,
        score: Number(item.open || 0) + Number(item.critical || 0) * 3 + Number(item.overdue || 0) * 2,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)

    const computedRiskTop: Row[] = riskTop.length
      ? riskTop
      : passports
          .map((item): Row => ({
            equipment_id: item.equipment_id,
            passport_number: item.passport_number,
            equipment_type: item.equipment_type,
            workshop: item.workshop,
            risk_level: item.risk_level,
            risk_score: Number(item.open_violations || 0) + Number(item.overdue_violations || 0) * 2,
            active_violations: item.open_violations || 0,
            overdue: item.overdue_violations || 0,
          }))
          .sort((a, b) => Number(b.risk_score || 0) - Number(a.risk_score || 0))
          .slice(0, 5)

    const expiringControls = new Set<number>([...ptoSoon, ...ctoSoon, ...epbSoon].map((item) => Number(item.id))).size
    return { activeViolations, overdueViolations, criticalOpen, bannedEquipment, ptoSoon, ctoSoon, epbSoon, passportReadiness, weakPassports, attention: attention.slice(0, 8), workshopRisk, computedRiskTop, expiringControls }
  }, [equipment, violations, passports, riskTop])

  const pageText = theme === 'dark' ? 'text-slate-100' : 'text-slate-900'
  const mutedText = theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
  const shellBg = theme === 'dark' ? 'bg-slate-950' : 'bg-slate-50'
  const heroBg = theme === 'dark' ? 'from-slate-950 via-slate-900 to-cyan-950' : 'from-slate-950 via-blue-950 to-emerald-900'
  const maxWorkshopScore = Math.max(1, ...derived.workshopRisk.map((item) => Number(item.score)))
  const activeAlerts = alerts.unacknowledged ?? alerts.total ?? 0

  if (loading) {
    return (
      <div className={`${shellBg} ${pageText}`}>
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className={`h-36 animate-pulse rounded-3xl ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`} />)}
        </div>
      </div>
    )
  }

  return (
    <div className={`${shellBg} ${pageText}`}>
      {warning && <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${toneClass('warning', theme)}`}>{warning}</div>}

      <section className={`overflow-hidden rounded-[2rem] bg-gradient-to-br ${heroBg} text-white shadow-xl`}>
        <div className="relative p-6 md:p-8">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="absolute bottom-0 right-28 h-28 w-28 rounded-full bg-emerald-300/20 blur-2xl" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.28em] text-cyan-100/80">Операционный центр</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">{isManager ? 'Пульт управления рисками ПС' : 'Пульт инспектора по кранам'}</h1>
              <p className="mt-4 max-w-2xl text-base font-medium text-slate-200">Оборудование, дефекты, паспорта, SLA и ближайшие проверки собраны в одну понятную сводку.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Оборудование</p>
                <p className="mt-2 text-2xl font-black">{equipment.length}</p>
                <p className="text-sm text-slate-300">в реестре</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Открыто</p>
                <p className="mt-2 text-2xl font-black">{derived.activeViolations.length}</p>
                <p className="text-sm text-slate-300">нарушений</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Паспорта</p>
                <p className="mt-2 text-2xl font-black">{derived.passportReadiness}%</p>
                <p className="text-sm text-slate-300">средняя готовность</p>
              </div>
            </div>
          </div>
          <div className="relative mt-6 flex flex-wrap gap-2 text-sm font-semibold text-slate-200">
            <span className="rounded-full bg-white/10 px-4 py-2 ring-1 ring-white/15">Роль: {isManager ? 'менеджер' : 'инспектор'}</span>
            <span className="rounded-full bg-white/10 px-4 py-2 ring-1 ring-white/15">Обновлено: {updatedAt ? updatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'только что'}</span>
            <span className="rounded-full bg-white/10 px-4 py-2 ring-1 ring-white/15">Просрочки SLA: {derived.overdueViolations.length}</span>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="ПС в работе" value={Math.max(0, equipment.length - derived.bannedEquipment.length)} detail={`Запрет эксплуатации: ${derived.bannedEquipment.length}`} tone={derived.bannedEquipment.length ? 'critical' : 'success'} href="/equipment" theme={theme} />
        <StatCard title="Критичные дефекты" value={derived.criticalOpen.length} detail={`Открыто всего: ${derived.activeViolations.length}`} tone={derived.criticalOpen.length ? 'critical' : 'success'} href="/violations" theme={theme} />
        <StatCard title="Просрочено SLA" value={derived.overdueViolations.length} detail="Нужно закрыть или эскалировать" tone={derived.overdueViolations.length ? 'critical' : 'success'} href="/alerts" theme={theme} />
        <StatCard title="Контроль рядом" value={derived.expiringControls} detail="ПТО, ЧТО, ЭПБ или разрешение" tone={derived.expiringControls ? 'warning' : 'success'} href="/equipment" theme={theme} />
        <StatCard title="Активные алерты" value={activeAlerts} detail={`SLA overdue: ${alerts.overdue || 0}, warning: ${alerts.warning || 0}`} tone={activeAlerts ? 'warning' : 'success'} href="/alerts" theme={theme} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
        <Panel title="Требует внимания" subtitle="Автоматическая подборка: просрочки, критичные дефекты, запреты, слабые паспорта" theme={theme} action={<Link href="/violations" className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${badgeClass('info', theme)}`}>все нарушения</Link>}>
          {derived.attention.length === 0 ? (
            <div className={`rounded-2xl border border-dashed p-8 text-center ${theme === 'dark' ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}`}>Критичных событий нет. Хороший момент заполнить паспорта и проверить ближайшие сроки.</div>
          ) : (
            <div className="space-y-3">
              {derived.attention.map((item) => (
                <Link href={item.href} key={item.id} className={`block rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${toneClass(item.tone, theme)}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-black">{item.title}</p>
                      <p className="mt-1 text-sm font-medium opacity-80">{item.subtitle}</p>
                    </div>
                    <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ring-1 ${badgeClass(item.tone, theme)}`}>{item.badge}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Быстрые действия" subtitle="Частые переходы без лишних кликов" theme={theme}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {[
              { href: '/workshop-map', title: 'Карта цеха', text: 'Найти ПС на плане и открыть подсказки' },
              { href: '/defectovka', title: '3D дефектовка', text: 'Узлы крана, точки дефектов и фото' },
              { href: '/passports', title: 'Электронные паспорта', text: 'Данные крана, документы, история' },
              { href: '/violations', title: 'Нарушения', text: 'Создать дефект или закрыть существующий' },
            ].map((item) => (
              <Link key={item.href} href={item.href} className={`rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${theme === 'dark' ? 'border-slate-800 bg-slate-900/70 hover:border-cyan-700' : 'border-slate-200 bg-slate-50 hover:border-cyan-300'}`}>
                <p className="font-black">{item.title}</p>
                <p className={`mt-1 text-sm ${mutedText}`}>{item.text}</p>
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel title="Риск по цехам" subtitle="Где сконцентрированы открытые и просроченные дефекты" theme={theme}>
          {derived.workshopRisk.length === 0 ? (
            <p className={mutedText}>Нет данных по цехам.</p>
          ) : (
            <div className="space-y-4">
              {derived.workshopRisk.map((item) => {
                const percent = (Number(item.score) / maxWorkshopScore) * 100
                const tone: Tone = item.critical || item.overdue ? 'critical' : item.open ? 'warning' : 'success'
                return (
                  <div key={item.workshop}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-black">{item.workshop}</p>
                        <p className={`text-xs ${mutedText}`}>ПС: {item.equipmentCount} · открыто: {item.open} · просрочено: {item.overdue}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${badgeClass(tone, theme)}`}>{item.score}</span>
                    </div>
                    <ProgressBar value={percent} tone={tone} theme={theme} />
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        <Panel title="Топ рискованных ПС" subtitle="По скорингу и активным нарушениям" theme={theme}>
          {derived.computedRiskTop.length === 0 ? (
            <p className={mutedText}>Риск пока не рассчитан.</p>
          ) : (
            <div className="space-y-3">
              {derived.computedRiskTop.map((item, index) => {
                const tone = riskTone(item.risk_level)
                return (
                  <Link href="/equipment" key={`${item.equipment_id || item.id || index}-${index}`} className={`block rounded-2xl border p-4 ${toneClass(tone, theme)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black">{index + 1}. {item.equipment_type || 'ПС'} №{item.passport_number || item.equipment_id || 'без номера'}</p>
                        <p className="mt-1 text-sm opacity-80">{item.workshop || 'цех не указан'} · риск: {riskLabel(item.risk_level)}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${badgeClass(tone, theme)}`}>{Math.round(Number(item.risk_score || 0))}</span>
                    </div>
                    <p className="mt-2 text-xs opacity-75">Открыто: {item.active_violations || 0} · просрочено: {item.overdue || 0}</p>
                  </Link>
                )
              })}
            </div>
          )}
        </Panel>

        <Panel title="Паспорта кранов" subtitle="Готовность, проблемные карточки и ближайший контроль" theme={theme}>
          <div className={`mb-5 rounded-2xl border p-4 ${theme === 'dark' ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50'}`}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold">Средняя готовность</p>
              <p className="text-sm font-black">{derived.passportReadiness}%</p>
            </div>
            <ProgressBar value={derived.passportReadiness} tone={derived.passportReadiness >= 85 ? 'success' : derived.passportReadiness >= 60 ? 'warning' : 'critical'} theme={theme} />
          </div>
          {derived.weakPassports.length === 0 ? (
            <p className={mutedText}>Проблемных паспортов не найдено.</p>
          ) : (
            <div className="space-y-3">
              {derived.weakPassports.map((item) => {
                const readiness = Number(item.completeness_percent || 0)
                return (
                  <Link key={item.equipment_id} href="/passports" className={`block rounded-2xl border p-4 transition-all hover:-translate-y-0.5 ${theme === 'dark' ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white'}`}>
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black">{item.equipment_type || 'ПС'} №{item.passport_number || item.equipment_id}</p>
                        <p className={`text-xs ${mutedText}`}>{item.workshop || 'цех не указан'} · {statusLabel(item.passport_status)}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${badgeClass(readiness < 50 ? 'critical' : 'warning', theme)}`}>{readiness}%</span>
                    </div>
                    <ProgressBar value={readiness} tone={readiness < 50 ? 'critical' : 'warning'} theme={theme} />
                  </Link>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <Panel title="Ближайший контроль" subtitle="Сроки ПТО, ЧТО, ЭПБ и разрешений" theme={theme}>
          <div className="grid gap-3 md:grid-cols-3">
            <div className={`rounded-2xl border p-4 ${toneClass(derived.ptoSoon.length ? 'warning' : 'success', theme)}`}>
              <p className="text-sm font-bold opacity-75">ПТО до 30 дней</p>
              <p className="mt-2 text-3xl font-black">{derived.ptoSoon.length}</p>
            </div>
            <div className={`rounded-2xl border p-4 ${toneClass(derived.ctoSoon.length ? 'warning' : 'success', theme)}`}>
              <p className="text-sm font-bold opacity-75">ЧТО до 30 дней</p>
              <p className="mt-2 text-3xl font-black">{derived.ctoSoon.length}</p>
            </div>
            <div className={`rounded-2xl border p-4 ${toneClass(derived.epbSoon.length ? 'warning' : 'success', theme)}`}>
              <p className="text-sm font-bold opacity-75">ЭПБ/разрешение</p>
              <p className="mt-2 text-3xl font-black">{derived.epbSoon.length}</p>
            </div>
          </div>
        </Panel>

        <Panel title="Последние события" subtitle="Аудит действий и изменений" theme={theme}>
          {audit.length === 0 ? (
            <p className={mutedText}>Событий пока нет.</p>
          ) : (
            <div className="space-y-3">
              {audit.slice(0, 6).map((item, index) => (
                <div key={`${item.id || index}-${index}`} className={`rounded-2xl border p-3 ${theme === 'dark' ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black">{item.description || item.message || item.action || item.action_type || 'Событие'}</p>
                      <p className={`mt-1 text-xs ${mutedText}`}>{item.entity_type || 'system'} · {item.username || item.user?.username || item.source || 'система'}</p>
                    </div>
                    <span className={`shrink-0 text-xs ${mutedText}`}>{formatDate(item.performed_at || item.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
