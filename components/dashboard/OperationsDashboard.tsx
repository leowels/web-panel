'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { API_URL } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type Theme = 'light' | 'dark'
type Tone = 'red' | 'amber' | 'blue' | 'green' | 'gray'
type Row = Record<string, any>

type AttentionItem = {
  id: string
  title: string
  text: string
  badge: string
  tone: Tone
  href: string
}

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

const equipmentTitle = (item?: Row | null) => {
  if (!item) return 'ПС не указано'
  const type = item.equipment_type || 'ПС'
  const number = item.passport_number || item.registration_number || item.factory_number
  return number ? `${type} №${number}` : type
}

const shortText = (value?: string | null, max = 82) => {
  const text = (value || '').replace(/\s+/g, ' ').trim()
  if (!text) return 'описание не заполнено'
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

const riskLabel = (value?: string | null) => {
  const level = norm(value)
  if (level === 'critical') return 'критический'
  if (level === 'high') return 'высокий'
  if (level === 'medium') return 'средний'
  if (level === 'low') return 'низкий'
  return 'не рассчитан'
}

const cardTone = (tone: Tone, theme: Theme) => {
  const dark = theme === 'dark'
  const map: Record<Tone, string> = {
    red: dark ? 'border-red-500/40 bg-red-950/35 text-red-100' : 'border-red-200 bg-red-50 text-red-900',
    amber: dark ? 'border-amber-500/40 bg-amber-950/35 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900',
    blue: dark ? 'border-blue-500/40 bg-blue-950/35 text-blue-100' : 'border-blue-200 bg-blue-50 text-blue-900',
    green: dark ? 'border-emerald-500/40 bg-emerald-950/35 text-emerald-100' : 'border-emerald-200 bg-emerald-50 text-emerald-900',
    gray: dark ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900',
  }
  return map[tone]
}

const badgeTone = (tone: Tone, theme: Theme) => {
  const dark = theme === 'dark'
  const map: Record<Tone, string> = {
    red: dark ? 'bg-red-500/20 text-red-200' : 'bg-red-100 text-red-700',
    amber: dark ? 'bg-amber-500/20 text-amber-200' : 'bg-amber-100 text-amber-700',
    blue: dark ? 'bg-blue-500/20 text-blue-200' : 'bg-blue-100 text-blue-700',
    green: dark ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-100 text-emerald-700',
    gray: dark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700',
  }
  return map[tone]
}

function Section({ title, subtitle, theme, action, children }: { title: string; subtitle?: string; theme: Theme; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={`rounded-2xl border p-5 shadow-sm ${theme === 'dark' ? 'border-slate-800 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {subtitle && <p className={`mt-1 text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Metric({ title, value, text, tone, href, theme }: { title: string; value: string | number; text: string; tone: Tone; href: string; theme: Theme }) {
  return (
    <Link href={href} className={`rounded-2xl border p-5 transition hover:-translate-y-0.5 hover:shadow-md ${cardTone(tone, theme)}`}>
      <p className="text-sm font-semibold opacity-75">{title}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
      <p className="mt-3 text-sm font-medium opacity-80">{text}</p>
    </Link>
  )
}

function Progress({ value, theme, tone = 'blue' }: { value: number; theme: Theme; tone?: Tone }) {
  const safe = Math.max(0, Math.min(100, Math.round(value)))
  const colors: Record<Tone, string> = {
    red: 'bg-red-500',
    amber: 'bg-amber-500',
    blue: 'bg-blue-500',
    green: 'bg-emerald-500',
    gray: 'bg-slate-400',
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
        axios.get(`${API_URL}/api/audit?limit=8`, config),
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

  const data = useMemo(() => {
    const equipmentById = new Map<number, Row>()
    equipment.forEach((item) => equipmentById.set(Number(item.id), item))

    const open = violations.filter((item) => !isClosed(item.status))
    const overdue = open.filter((item) => {
      if (item.is_overdue) return true
      const days = daysUntil(item.deadline || item.due_date)
      return days !== null && days < 0
    })
    const criticalOpen = open.filter((item) => criticalLevels.has(norm(item.severity || item.criticality)))
    const banned = equipment.filter((item) => Boolean(item.operation_banned) || norm(item.status).includes('запрет'))

    const soon = equipment.filter((item) => {
      const pto = daysUntil(item.pto_date)
      const cto = daysUntil(item.cto_date)
      const epb = daysUntil(item.expertise_date)
      const permit = daysUntil(item.operation_permit_until)
      return [pto, cto].some((days) => days !== null && days <= 30) || [epb, permit].some((days) => days !== null && days <= 60)
    })

    const passportReadiness = passports.length
      ? Math.round(passports.reduce((sum, item) => sum + Number(item.completeness_percent || 0), 0) / passports.length)
      : 0
    const weakPassports = [...passports]
      .filter((item) => Number(item.completeness_percent || 0) < 75)
      .sort((a, b) => Number(a.completeness_percent || 0) - Number(b.completeness_percent || 0))
      .slice(0, 4)

    const attention: AttentionItem[] = []

    overdue.slice(0, 3).forEach((item) => {
      const linked = item.equipment || equipmentById.get(Number(item.equipment_id))
      const days = daysUntil(item.deadline || item.due_date)
      attention.push({
        id: `overdue-${item.id}`,
        title: `Просрочка по нарушению #${item.id}`,
        text: `${equipmentTitle(linked)} - ${shortText(item.description || item.title)}`,
        badge: days === null ? 'SLA' : `${Math.abs(days)} дн.`,
        tone: 'red',
        href: '/violations',
      })
    })

    criticalOpen.slice(0, 3).forEach((item) => {
      const linked = item.equipment || equipmentById.get(Number(item.equipment_id))
      attention.push({
        id: `critical-${item.id}`,
        title: `Критичный дефект #${item.id}`,
        text: `${equipmentTitle(linked)} - ${shortText(item.description || item.title)}`,
        badge: 'критично',
        tone: 'red',
        href: '/violations',
      })
    })

    banned.slice(0, 2).forEach((item) => {
      attention.push({
        id: `banned-${item.id}`,
        title: 'Эксплуатация запрещена',
        text: `${equipmentTitle(item)} · ${item.workshop || 'цех не указан'}`,
        badge: 'стоп',
        tone: 'red',
        href: '/equipment',
      })
    })

    soon.slice(0, 3).forEach((item) => {
      attention.push({
        id: `soon-${item.id}`,
        title: 'Скоро контрольный срок',
        text: `${equipmentTitle(item)} · ПТО ${formatDate(item.pto_date)} · ЧТО ${formatDate(item.cto_date)}`,
        badge: 'сроки',
        tone: 'amber',
        href: '/equipment',
      })
    })

    weakPassports.slice(0, 2).forEach((item) => {
      attention.push({
        id: `passport-${item.equipment_id}`,
        title: 'Паспорт заполнен не полностью',
        text: `${item.equipment_type || 'ПС'} №${item.passport_number || item.equipment_id} · готовность ${item.completeness_percent || 0}%`,
        badge: 'паспорт',
        tone: 'amber',
        href: '/passports',
      })
    })

    const risks: Row[] = riskTop.length
      ? riskTop
      : passports
          .map((item): Row => ({
            equipment_id: item.equipment_id,
            equipment_type: item.equipment_type,
            passport_number: item.passport_number,
            workshop: item.workshop,
            risk_level: item.risk_level,
            risk_score: Number(item.open_violations || 0) + Number(item.overdue_violations || 0) * 2,
          }))
          .sort((a, b) => Number(b.risk_score || 0) - Number(a.risk_score || 0))
          .slice(0, 5)

    return { open, overdue, criticalOpen, banned, soon, passportReadiness, weakPassports, attention: attention.slice(0, 7), risks }
  }, [equipment, violations, riskTop, passports])

  const pageBg = theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
  const muted = theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
  const activeAlerts = alerts.unacknowledged ?? alerts.total ?? 0
  const allGood = data.criticalOpen.length === 0 && data.overdue.length === 0 && data.banned.length === 0

  if (loading) {
    return (
      <div className={pageBg}>
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className={`h-32 animate-pulse rounded-2xl ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={pageBg}>
      {warning && <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${cardTone('amber', theme)}`}>{warning}</div>}

      <div className={`mb-6 rounded-2xl border p-5 ${allGood ? cardTone('green', theme) : cardTone('amber', theme)}`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold opacity-75">Главная сводка</p>
            <h2 className="mt-1 text-2xl font-black">
              {allGood ? 'Критичных проблем нет' : 'Есть задачи, которые требуют внимания'}
            </h2>
            <p className="mt-2 text-sm font-medium opacity-80">
              {isManager ? 'Сводка для контроля рисков, сроков и паспортов.' : 'Сводка для ежедневной работы инспектора.'}
            </p>
          </div>
          <div className="text-sm font-semibold opacity-75">
            Обновлено: {updatedAt ? updatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'только что'}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="Оборудование" value={equipment.length} text={`Запрет эксплуатации: ${data.banned.length}`} tone={data.banned.length ? 'red' : 'blue'} href="/equipment" theme={theme} />
        <Metric title="Открытые нарушения" value={data.open.length} text={`Критичных: ${data.criticalOpen.length}`} tone={data.criticalOpen.length ? 'red' : data.open.length ? 'amber' : 'green'} href="/violations" theme={theme} />
        <Metric title="Просрочено" value={data.overdue.length} text={`Активные алерты: ${activeAlerts}`} tone={data.overdue.length ? 'red' : activeAlerts ? 'amber' : 'green'} href="/alerts" theme={theme} />
        <Metric title="Паспорта" value={`${data.passportReadiness}%`} text={`Нужно заполнить: ${data.weakPassports.length}`} tone={data.passportReadiness >= 80 ? 'green' : data.passportReadiness >= 55 ? 'amber' : 'red'} href="/passports" theme={theme} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Section title="Что сделать первым" subtitle="Самые важные задачи без лишней аналитики" theme={theme} action={<Link href="/violations" className={`rounded-full px-3 py-1 text-xs font-bold ${badgeTone('blue', theme)}`}>открыть</Link>}>
          {data.attention.length === 0 ? (
            <div className={`rounded-2xl border border-dashed p-6 text-center ${theme === 'dark' ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
              Ничего срочного не найдено.
            </div>
          ) : (
            <div className="space-y-3">
              {data.attention.map((item) => (
                <Link key={item.id} href={item.href} className={`block rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${cardTone(item.tone, theme)}`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-bold">{item.title}</p>
                      <p className="mt-1 text-sm opacity-80">{item.text}</p>
                    </div>
                    <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${badgeTone(item.tone, theme)}`}>{item.badge}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title="Быстрые переходы" subtitle="Куда чаще всего нужно перейти" theme={theme}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {[
              { href: '/workshop-map', title: 'Карта цеха', text: 'оборудование на плане' },
              { href: '/defectovka', title: '3D дефектовка', text: 'узлы, точки и фото' },
              { href: '/passports', title: 'Паспорта', text: 'данные и документы крана' },
              { href: '/violations', title: 'Нарушения', text: 'дефекты и статусы' },
            ].map((item) => (
              <Link key={item.href} href={item.href} className={`rounded-2xl border p-4 transition hover:shadow-md ${theme === 'dark' ? 'border-slate-800 bg-slate-900 hover:border-blue-700' : 'border-slate-200 bg-slate-50 hover:border-blue-300'}`}>
                <p className="font-bold">{item.title}</p>
                <p className={`mt-1 text-sm ${muted}`}>{item.text}</p>
              </Link>
            ))}
          </div>
        </Section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Section title="Рискованные краны" subtitle="Первые в очереди на проверку" theme={theme}>
          {data.risks.length === 0 ? (
            <p className={muted}>Риск пока не рассчитан.</p>
          ) : (
            <div className="space-y-3">
              {data.risks.slice(0, 5).map((item, index) => {
                const tone: Tone = norm(item.risk_level) === 'critical' ? 'red' : norm(item.risk_level) === 'high' ? 'amber' : 'blue'
                return (
                  <Link key={`${item.equipment_id || item.id || index}-${index}`} href="/equipment" className={`block rounded-2xl border p-4 ${cardTone(tone, theme)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">{index + 1}. {item.equipment_type || 'ПС'} №{item.passport_number || item.equipment_id || 'без номера'}</p>
                        <p className="mt-1 text-sm opacity-80">{item.workshop || 'цех не указан'} · {riskLabel(item.risk_level)}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${badgeTone(tone, theme)}`}>{Math.round(Number(item.risk_score || 0))}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </Section>

        <Section title="Паспорта" subtitle="Готовность данных по кранам" theme={theme}>
          <div className={`mb-4 rounded-2xl border p-4 ${theme === 'dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'}`}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Средняя готовность</p>
              <p className="font-black">{data.passportReadiness}%</p>
            </div>
            <Progress value={data.passportReadiness} tone={data.passportReadiness >= 80 ? 'green' : data.passportReadiness >= 55 ? 'amber' : 'red'} theme={theme} />
          </div>
          {data.weakPassports.length === 0 ? (
            <p className={muted}>Проблемных паспортов нет.</p>
          ) : (
            <div className="space-y-3">
              {data.weakPassports.map((item) => {
                const value = Number(item.completeness_percent || 0)
                return (
                  <Link key={item.equipment_id} href="/passports" className={`block rounded-2xl border p-4 ${theme === 'dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold">{item.equipment_type || 'ПС'} №{item.passport_number || item.equipment_id}</p>
                        <p className={`text-xs ${muted}`}>{item.workshop || 'цех не указан'}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badgeTone(value < 50 ? 'red' : 'amber', theme)}`}>{value}%</span>
                    </div>
                    <Progress value={value} tone={value < 50 ? 'red' : 'amber'} theme={theme} />
                  </Link>
                )
              })}
            </div>
          )}
        </Section>

        <Section title="Ближайшие сроки" subtitle="ПТО, ЧТО, ЭПБ и разрешения" theme={theme}>
          <div className="space-y-3">
            {data.soon.slice(0, 5).map((item) => (
              <Link key={item.id} href="/equipment" className={`block rounded-2xl border p-4 ${theme === 'dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'}`}>
                <p className="font-bold">{equipmentTitle(item)}</p>
                <p className={`mt-1 text-sm ${muted}`}>ПТО: {formatDate(item.pto_date)} · ЧТО: {formatDate(item.cto_date)}</p>
              </Link>
            ))}
            {data.soon.length === 0 && <p className={muted}>Ближайших сроков не найдено.</p>}
          </div>
        </Section>
      </div>

      <Section title="Последние события" subtitle="Короткая лента аудита" theme={theme} action={<Link href="/audit" className={`rounded-full px-3 py-1 text-xs font-bold ${badgeTone('gray', theme)}`}>аудит</Link>}>
        {audit.length === 0 ? (
          <p className={muted}>Событий пока нет.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {audit.slice(0, 4).map((item, index) => (
              <div key={`${item.id || index}-${index}`} className={`rounded-2xl border p-4 ${theme === 'dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'}`}>
                <p className="text-sm font-bold">{item.description || item.message || item.action || item.action_type || 'Событие'}</p>
                <p className={`mt-2 text-xs ${muted}`}>{item.entity_type || 'system'} · {formatDate(item.performed_at || item.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
