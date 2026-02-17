'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

const API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || ''
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface SLAAlertsCardProps {
  theme: 'light' | 'dark'
}

interface AlertsSummary {
  total: number
  overdue: number
  warning: number
  unacknowledged: number
}

export default function SLAAlertsCard({ theme }: SLAAlertsCardProps) {
  const { token } = useAuthStore()
  const [summary, setSummary] = useState<AlertsSummary>({
    total: 0,
    overdue: 0,
    warning: 0,
    unacknowledged: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    fetchSummary()
    const interval = setInterval(fetchSummary, 30000)
    return () => clearInterval(interval)
  }, [token])

  const fetchSummary = async () => {
    if (!token) return
    try {
      setLoading(true)
      const response = await axios.get(`${API_URL}/api/alerts/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setSummary(response.data)
    } catch (error) {
      console.error('Error fetching alerts summary:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`rounded-xl border p-5 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>SLA-уведомления</h3>
        <Link
          href="/alerts"
          className={`text-sm font-semibold ${theme === 'dark' ? 'text-blue-300 hover:text-blue-200' : 'text-blue-600 hover:text-blue-700'}`}
        >
          Открыть
        </Link>
      </div>

      {loading ? (
        <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Загрузка...</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-lg p-3 ${theme === 'dark' ? 'bg-gray-700/70 text-gray-100' : 'bg-gray-50 text-gray-800'}`}>
            <div className="text-xs opacity-80">Всего</div>
            <div className="text-xl font-bold">{summary.total}</div>
          </div>
          <div className="rounded-lg bg-rose-100 p-3 text-rose-800">
            <div className="text-xs opacity-80">Просрочено</div>
            <div className="text-xl font-bold">{summary.overdue}</div>
          </div>
          <div className="rounded-lg bg-amber-100 p-3 text-amber-800">
            <div className="text-xs opacity-80">До 24 часов</div>
            <div className="text-xl font-bold">{summary.warning}</div>
          </div>
          <div className="rounded-lg bg-blue-100 p-3 text-blue-800">
            <div className="text-xs opacity-80">Не подтверждено</div>
            <div className="text-xl font-bold">{summary.unacknowledged}</div>
          </div>
        </div>
      )}
    </div>
  )
}
