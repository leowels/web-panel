'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import Link from 'next/link'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface Equipment {
  id: number
  equipment_type: string
  passport_number: string
  status: string
  pto_date: string | null
  cto_date: string | null
}

interface HealthMapProps {
  theme: 'light' | 'dark'
}

export default function HealthMap({ theme }: HealthMapProps) {
  const { token } = useAuthStore()
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [healthScores, setHealthScores] = useState<Record<number, number>>({})

  useEffect(() => {
    if (token) {
      fetchEquipment()
      const interval = setInterval(fetchEquipment, 60000) // Обновление каждую минуту
      return () => clearInterval(interval)
    }
  }, [token])

  useEffect(() => {
    calculateHealthScores()
  }, [equipment])

  const fetchEquipment = async () => {
    if (!token) return
    try {
      const response = await axios.get(`${API_URL}/api/equipment?limit=1000`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setEquipment(response.data)
    } catch (error: any) {
      console.error('Error fetching equipment:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateHealthScores = async () => {
    const scores: Record<number, number> = {}
    const now = new Date()

    // Получаем все нарушения один раз
    let allViolations: any[] = []
    try {
      const violationsResponse = await axios.get(`${API_URL}/api/violations?limit=1000&status=open`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      allViolations = violationsResponse.data
    } catch (error) {
      console.error('Error fetching violations:', error)
    }

    for (const eq of equipment) {
      let score = 100

      // Проверка дефектов для этого оборудования
      const violations = allViolations.filter((v: any) => v.equipment_id === eq.id)
      const criticalViolations = violations.filter((v: any) => v.severity === 'critical').length
      const highViolations = violations.filter((v: any) => v.severity === 'high').length
      score -= criticalViolations * 30
      score -= highViolations * 15
      score -= (violations.length - criticalViolations - highViolations) * 5

      // Проверка сроков ПТО/ЧТО
      if (eq.pto_date) {
        const ptoDate = new Date(eq.pto_date)
        const daysUntil = (ptoDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        if (daysUntil < 0) {
          score -= 20 // Просрочено
        } else if (daysUntil <= 7) {
          score -= 10 // Скоро срок
        }
      }

      if (eq.cto_date) {
        const ctoDate = new Date(eq.cto_date)
        const daysUntil = (ctoDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        if (daysUntil < 0) {
          score -= 20 // Просрочено
        } else if (daysUntil <= 7) {
          score -= 10 // Скоро срок
        }
      }

      // Проверка статуса
      if (eq.status === 'inactive') {
        score -= 10
      } else if (eq.status === 'archived') {
        score -= 30
      }

      scores[eq.id] = Math.max(0, Math.min(100, score))
    }

    setHealthScores(scores)
  }

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'bg-green-500'
    if (score >= 50) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getHealthText = (score: number) => {
    if (score >= 80) return 'Норма'
    if (score >= 50) return 'Замечания'
    return 'Критично'
  }

  if (loading) {
    return (
      <div className={`rounded-xl shadow-soft p-6 border border-gray-200 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
        <div className="animate-pulse">
          <div className={`h-6 w-48 mb-4 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded`}></div>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`h-14 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded-lg`}></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-xl shadow-soft p-6 border border-gray-200 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Карта рисков ПС
          </h2>
          <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Индекс здоровья оборудования
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Норма</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Замечания</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Критично</span>
          </div>
        </div>
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {equipment.map((eq) => {
          const score = healthScores[eq.id] || 50
          return (
            <Link
              key={eq.id}
              href={`/equipment?id=${eq.id}`}
              className={`flex items-center justify-between p-4 rounded-lg border-2 ${
                theme === 'dark' 
                  ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 hover:border-gray-500' 
                  : 'bg-gray-50 border-gray-200 hover:bg-white hover:border-primary-300'
              } transition-all duration-200 cursor-pointer group shadow-soft hover:shadow-medium`}
            >
              <div className="flex items-center space-x-4 flex-1">
                <div className={`w-4 h-4 rounded-full ${getHealthColor(score)} shadow-lg`}></div>
                <div className="flex-1">
                  <div className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {eq.passport_number}
                  </div>
                  <div className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {eq.equipment_type}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <div className={`text-sm font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {getHealthText(score)}
                  </div>
                  <div className={`text-xs font-semibold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {score}%
                  </div>
                </div>
                <svg className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-400'} group-hover:text-primary-600 transition-colors`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

