'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useRouter } from 'next/navigation'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface KPIData {
  total_equipment: number
  in_work: number
  idle: number
  requires_pto: number
  requires_cto: number
  expired_inspection: number
  total_defects: number
  critical_defects: number
  incidents_month: number
}

interface EquipmentItem {
  id: number
  equipment_type: string
  passport_number: string
  inventory_number?: string | null
  position?: string | null
  workshop?: string | null
  status: string
  installation_location?: string | null
  pto_date?: string | null
  cto_date?: string | null
  updated_at?: string
}

interface ViolationItem {
  id: number
  equipment_id: number
  severity: string
  status: string
  created_at: string
}

interface DrawerItem extends EquipmentItem {
  meta?: string
  metaAccent?: 'warning' | 'danger' | 'info'
}

interface DrawerState {
  open: boolean
  title: string
  items: DrawerItem[]
  link?: string
  description?: string
}

type CardConfig = {
  key: string
  title: string
  value: number | string
  color: string
  icon: JSX.Element
  link?: string
  urgent?: boolean
  drawerDescription?: string
}

interface DashboardKPIsProps {
  theme: 'light' | 'dark'
}

export default function DashboardKPIs({ theme }: DashboardKPIsProps) {
  const { token } = useAuthStore()
  const router = useRouter()
  const [kpis, setKpis] = useState<KPIData>({
    total_equipment: 0,
    in_work: 0,
    idle: 0,
    requires_pto: 0,
    requires_cto: 0,
    expired_inspection: 0,
    total_defects: 0,
    critical_defects: 0,
    incidents_month: 0,
  })
  const [loading, setLoading] = useState(true)
  const [equipmentData, setEquipmentData] = useState<EquipmentItem[]>([])
  const [violationsData, setViolationsData] = useState<ViolationItem[]>([])
  const [drawerState, setDrawerState] = useState<DrawerState>({
    open: false,
    title: '',
    items: [],
  })

  const closeDrawer = () => setDrawerState((prev) => ({ ...prev, open: false }))

  const formatDateShort = (dateStr?: string | null) => {
    if (!dateStr) return 'не указано'
    try {
      return new Date(dateStr).toLocaleDateString('ru-RU')
    } catch {
      return dateStr
    }
  }

  const isWithinDays = (dateStr: string | null | undefined, days: number) => {
    if (!dateStr) return false
    const target = new Date(dateStr)
    const now = new Date()
    const diffDays = (target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    return diffDays <= days && diffDays >= 0
  }

  const isExpired = (dateStr: string | null | undefined) => {
    if (!dateStr) return false
    return new Date(dateStr) < new Date()
  }

  const equipmentMatchesCard = (equipment: EquipmentItem, cardKey: string) => {
    switch (cardKey) {
      case 'in_work':
        return equipment.status === 'active'
      case 'idle':
        return equipment.status === 'inactive'
      case 'requires_pto':
        return isWithinDays(equipment.pto_date, 30)
      case 'requires_cto':
        return isWithinDays(equipment.cto_date, 30)
      case 'expired_inspection': {
        const dates = [equipment.pto_date, equipment.cto_date].filter(Boolean) as string[]
        if (!dates.length) return false
        return dates.some((d) => isExpired(d))
      }
      default:
        return true
    }
  }

  const getEquipmentForCard = (cardKey: string): DrawerItem[] => {
    if (!equipmentData.length) return []

    if (cardKey === 'defects' || cardKey === 'incidents') {
      const now = new Date()
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const filteredViolations = violationsData.filter((violation) => {
        if (cardKey === 'defects') {
          return violation.status === 'open'
        }
        return new Date(violation.created_at) >= monthAgo
      })
      const ids = new Set(filteredViolations.map((v) => v.equipment_id))
      const criticalIds = new Set(
        filteredViolations.filter((v) => v.severity === 'critical').map((v) => v.equipment_id)
      )

      return equipmentData
        .filter((equipment) => ids.has(equipment.id))
        .map((equipment) => ({
          ...equipment,
          meta: criticalIds.has(equipment.id)
            ? 'Критическое нарушение'
            : cardKey === 'defects'
              ? 'Открытое нарушение'
              : 'Инцидент за 30 дней',
          metaAccent: criticalIds.has(equipment.id) ? 'danger' : 'warning',
        }))
    }

    const filtered = equipmentData.filter((equipment) => equipmentMatchesCard(equipment, cardKey))

    return filtered.map((equipment) => {
      let meta: string | undefined
      let metaAccent: DrawerItem['metaAccent']
      if (cardKey === 'requires_pto') {
        meta = `ПТО до ${formatDateShort(equipment.pto_date)}`
        metaAccent = 'warning'
      } else if (cardKey === 'requires_cto') {
        meta = `ЧТО до ${formatDateShort(equipment.cto_date)}`
        metaAccent = 'warning'
      } else if (cardKey === 'expired_inspection') {
        meta = 'Просрочена экспертиза'
        metaAccent = 'danger'
      } else if (cardKey === 'idle') {
        meta = 'В простое'
        metaAccent = 'info'
      } else if (cardKey === 'in_work') {
        meta = 'Активно'
        metaAccent = 'info'
      }
      return { ...equipment, meta, metaAccent }
    })
  }

  const handleCardClick = (card: CardConfig) => {
    const items = getEquipmentForCard(card.key)
    setDrawerState({
      open: true,
      title: `${card.title} • ${items.length}`,
      items,
      link: card.link,
      description: card.drawerDescription,
    })
  }

  useEffect(() => {
    if (token) {
      fetchKPIs()
      const interval = setInterval(fetchKPIs, 30000) // Обновление каждые 30 секунд
      return () => clearInterval(interval)
    }
  }, [token])

  const fetchKPIs = async () => {
    if (!token) return
    try {
      // Получение оборудования
      const eqResponse = await axios.get(`${API_URL}/api/equipment?limit=1000`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const equipment = eqResponse.data

      // Получение нарушений
      const violationsResponse = await axios.get(`${API_URL}/api/violations?limit=1000`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const violations = violationsResponse.data

      // Подсчет KPI
      const now = new Date()
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      const requiresPTO = equipment.filter((eq: any) => {
        if (!eq.pto_date) return false
        const ptoDate = new Date(eq.pto_date)
        const daysUntil = (ptoDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        return daysUntil <= 30 && daysUntil >= 0
      }).length

      const requiresCTO = equipment.filter((eq: any) => {
        if (!eq.cto_date) return false
        const ctoDate = new Date(eq.cto_date)
        const daysUntil = (ctoDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        return daysUntil <= 30 && daysUntil >= 0
      }).length

      const expiredInspection = equipment.filter((eq: any) => {
        if (!eq.pto_date && !eq.cto_date) return false
        const ptoDate = eq.pto_date ? new Date(eq.pto_date) : null
        const ctoDate = eq.cto_date ? new Date(eq.cto_date) : null
        const expiredDate = ptoDate && ctoDate 
          ? (ptoDate < ctoDate ? ptoDate : ctoDate)
          : (ptoDate || ctoDate)
        return expiredDate && expiredDate < now
      }).length

      const criticalDefects = violations.filter((v: any) => 
        v.severity === 'critical' && v.status === 'open'
      ).length

      const incidentsMonth = violations.filter((v: any) => {
        const created = new Date(v.created_at)
        return created >= monthAgo
      }).length

      setEquipmentData(equipment)
      setViolationsData(violations)

      setKpis({
        total_equipment: equipment.length,
        in_work: equipment.filter((eq: any) => eq.status === 'active').length,
        idle: equipment.filter((eq: any) => eq.status === 'inactive').length,
        requires_pto: requiresPTO,
        requires_cto: requiresCTO,
        expired_inspection: expiredInspection,
        total_defects: violations.filter((v: any) => v.status === 'open').length,
        critical_defects: criticalDefects,
        incidents_month: incidentsMonth,
      })
    } catch (error: any) {
      console.error('Error fetching KPIs:', error)
    } finally {
      setLoading(false)
    }
  }

  const kpiCards: CardConfig[] = [
    {
      key: 'total',
      title: 'Всего ПС',
      value: kpis.total_equipment,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      color: 'blue',
      link: '/equipment',
      drawerDescription: 'Полный список зарегистрированного оборудования.',
    },
    {
      key: 'in_work',
      title: 'В работе',
      value: kpis.in_work,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'green',
      link: '/equipment?status=active',
      drawerDescription: 'Оборудование со статусом "Активно".',
    },
    {
      key: 'idle',
      title: 'В простое',
      value: kpis.idle,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'yellow',
      link: '/equipment?status=inactive',
      drawerDescription: 'ПС, находящиеся в простое.',
    },
    {
      key: 'requires_pto',
      title: 'Требуют ПТО',
      value: kpis.requires_pto,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: 'orange',
      link: '/equipment',
      urgent: kpis.requires_pto > 0,
      drawerDescription: 'ПС с плановым ПТО в ближайшие 30 дней.',
    },
    {
      key: 'requires_cto',
      title: 'Требуют ЧТО',
      value: kpis.requires_cto,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
      color: 'orange',
      link: '/equipment',
      urgent: kpis.requires_cto > 0,
      drawerDescription: 'ПС с плановым ЧТО в ближайшие 30 дней.',
    },
    {
      key: 'expired_inspection',
      title: 'Просрочена экспертиза',
      value: kpis.expired_inspection,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
      color: 'red',
      link: '/equipment',
      urgent: kpis.expired_inspection > 0,
      drawerDescription: 'ПС с просроченными ПТО/ЧТО.',
    },
    {
      key: 'defects',
      title: 'Дефекты',
      value: `${kpis.total_defects} / ${kpis.critical_defects}`,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
      color: 'red',
      link: '/violations',
      urgent: kpis.critical_defects > 0,
      drawerDescription: 'ПС с открытыми нарушениями. Критические подсвечены отдельно.',
    },
    {
      key: 'incidents',
      title: 'Инциденты за месяц',
      value: kpis.incidents_month,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: 'purple',
      link: '/violations',
      drawerDescription: 'ПС, по которым зарегистрированы нарушения за последние 30 дней.',
    },
  ]

  const getColorClasses = (color: string, urgent?: boolean) => {
    if (urgent) {
      return theme === 'dark'
        ? 'bg-gradient-to-br from-accent-900 to-accent-800 border-accent-600'
        : 'bg-gradient-to-br from-accent-50 to-accent-100 border-accent-500'
    }
    
    const colors: Record<string, { dark: string; light: string; border: string }> = {
      blue: {
        dark: 'bg-gradient-to-br from-primary-800 to-primary-900 border-primary-700',
        light: 'bg-gradient-to-br from-primary-50 to-primary-100 border-primary-300',
        border: 'border-primary-300'
      },
      green: {
        dark: 'bg-gradient-to-br from-green-800 to-green-900 border-green-700',
        light: 'bg-gradient-to-br from-green-50 to-green-100 border-green-300',
        border: 'border-green-300'
      },
      yellow: {
        dark: 'bg-gradient-to-br from-yellow-800 to-yellow-900 border-yellow-700',
        light: 'bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-300',
        border: 'border-yellow-300'
      },
      orange: {
        dark: 'bg-gradient-to-br from-orange-800 to-orange-900 border-orange-700',
        light: 'bg-gradient-to-br from-orange-50 to-orange-100 border-orange-300',
        border: 'border-orange-300'
      },
      red: {
        dark: 'bg-gradient-to-br from-red-800 to-red-900 border-red-700',
        light: 'bg-gradient-to-br from-red-50 to-red-100 border-red-300',
        border: 'border-red-300'
      },
      purple: {
        dark: 'bg-gradient-to-br from-purple-800 to-purple-900 border-purple-700',
        light: 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-300',
        border: 'border-purple-300'
      },
    }
    
    const colorScheme = colors[color] || colors.blue
    return theme === 'dark' ? colorScheme.dark : colorScheme.light
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className={`h-28 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} animate-pulse border border-gray-200`}
          />
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {kpiCards.map((kpi, index) => (
          <button
            key={index}
            type="button"
            onClick={() => handleCardClick(kpi)}
            className={`${getColorClasses(kpi.color, kpi.urgent)} rounded-xl shadow-soft p-4 border-2 cursor-pointer hover:shadow-medium transition-all duration-200 transform hover:scale-105 group text-left`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`${kpi.urgent ? 'text-accent-600' : theme === 'dark' ? 'text-primary-400' : 'text-primary-600'} group-hover:scale-110 transition-transform`}>
                {kpi.icon}
              </div>
              {kpi.urgent && (
                <span className="w-2.5 h-2.5 bg-accent-600 rounded-full animate-pulse shadow-lg"></span>
              )}
            </div>
            <div className={`text-2xl font-bold mb-1 ${kpi.urgent ? 'text-accent-700' : theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {kpi.value}
            </div>
            <div className={`text-xs font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {kpi.title}
            </div>
          </button>
        ))}
      </div>

      {drawerState.open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black bg-opacity-40" onClick={closeDrawer}></div>
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl border-l border-gray-200 flex flex-col">
            <div className="p-5 border-b border-gray-200 flex justify-between items-start">
              <div>
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Отбор</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">{drawerState.title}</h3>
                {drawerState.description && (
                  <p className="text-sm text-gray-500 mt-1">{drawerState.description}</p>
                )}
              </div>
              <button
                onClick={closeDrawer}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {drawerState.items.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">
                  Данные отсутствуют для выбранного фильтра.
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {drawerState.items.map((equipment) => (
                    <li key={equipment.id} className="p-5 hover:bg-gray-50 transition">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-lg font-semibold text-gray-900">{equipment.passport_number}</p>
                          <p className="text-sm text-gray-600">{equipment.equipment_type}</p>
                          {equipment.position && (
                            <p className="text-xs text-gray-500 mt-1">Позиция: {equipment.position}</p>
                          )}
                        </div>
                        {equipment.meta && (
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              equipment.metaAccent === 'danger'
                                ? 'bg-red-100 text-red-800'
                                : equipment.metaAccent === 'warning'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {equipment.meta}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                        {equipment.inventory_number && <span>Инв. № {equipment.inventory_number}</span>}
                        {equipment.workshop && <span>Цех: {equipment.workshop}</span>}
                        {equipment.installation_location && (
                          <span>Локация: {equipment.installation_location}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="p-5 border-t border-gray-200 flex justify-between items-center">
              <span className="text-sm text-gray-500">
                Найдено: {drawerState.items.length}
              </span>
              {drawerState.link && (
                <button
                  onClick={() => {
                    router.push(drawerState.link as string)
                    closeDrawer()
                  }}
                  className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg"
                >
                  Перейти в раздел
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

