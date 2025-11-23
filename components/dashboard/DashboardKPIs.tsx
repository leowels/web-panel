'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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

  const kpiCards = [
    {
      title: 'Всего ПС',
      value: kpis.total_equipment,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      color: 'blue',
      link: '/equipment',
    },
    {
      title: 'В работе',
      value: kpis.in_work,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'green',
      link: '/equipment?status=active',
    },
    {
      title: 'В простое',
      value: kpis.idle,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'yellow',
      link: '/equipment?status=inactive',
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
      title: 'Инциденты за месяц',
      value: kpis.incidents_month,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: 'purple',
      link: '/violations',
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
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
      {kpiCards.map((kpi, index) => (
        <Link
          key={index}
          href={kpi.link}
          className={`${getColorClasses(kpi.color, kpi.urgent)} rounded-xl shadow-soft p-4 border-2 cursor-pointer hover:shadow-medium transition-all duration-200 transform hover:scale-105 group`}
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
        </Link>
      ))}
    </div>
  )
}

