'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

const API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || ''
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface TopRiskEquipmentProps {
  theme: 'light' | 'dark'
}

interface TopRiskItem {
  equipment_id: number
  passport_number: string
  equipment_type: string
  workshop?: string | null
  risk_score: number
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  active_violations: number
  overdue: number
}

const RISK_LABELS: Record<TopRiskItem['risk_level'], string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
}

const RISK_TONES: Record<TopRiskItem['risk_level'], string> = {
  low: 'bg-emerald-100 text-emerald-800',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-rose-100 text-rose-800',
}

export default function TopRiskEquipment({ theme }: TopRiskEquipmentProps) {
  const { token } = useAuthStore()
  const [items, setItems] = useState<TopRiskItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    fetchTopRisk()
  }, [token])

  const fetchTopRisk = async () => {
    if (!token) return
    try {
      setLoading(true)
      const response = await axios.get(`${API_URL}/api/equipment/risk/top?limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setItems(response.data?.items || [])
    } catch (error) {
      console.error('Error fetching top risk equipment:', error)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`rounded-xl border p-5 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Топ-5 рискованных ПС</h3>
        <Link
          href="/equipment"
          className={`text-sm font-semibold ${theme === 'dark' ? 'text-blue-300 hover:text-blue-200' : 'text-blue-600 hover:text-blue-700'}`}
        >
          Все ПС
        </Link>
      </div>

      {loading ? (
        <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Загрузка...</p>
      ) : items.length === 0 ? (
        <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Нет данных по рискам</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Link
              key={item.equipment_id}
              href={`/equipment?equipment_id=${item.equipment_id}`}
              className={`block rounded-lg border p-3 transition ${theme === 'dark' ? 'border-gray-700 hover:bg-gray-700/50' : 'border-gray-200 hover:bg-gray-50'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {item.passport_number}
                  </div>
                  <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                    {item.equipment_type}
                    {item.workshop ? ` · ${item.workshop}` : ''}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${RISK_TONES[item.risk_level]}`}>
                  {RISK_LABELS[item.risk_level]}
                </span>
              </div>
              <div className={`mt-2 flex flex-wrap items-center gap-4 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <span>Риск: {item.risk_score}</span>
                <span>Открыто: {item.active_violations}</span>
                <span>Просрочено: {item.overdue}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
