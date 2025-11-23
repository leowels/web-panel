'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface DashboardChartsProps {
  theme: 'light' | 'dark'
}

export default function DashboardCharts({ theme }: DashboardChartsProps) {
  const { token } = useAuthStore()
  const [defectsByType, setDefectsByType] = useState<any[]>([])
  const [defectsTimeline, setDefectsTimeline] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token) {
      fetchChartData()
    }
  }, [token])

  const fetchChartData = async () => {
    if (!token) return
    try {
      const violationsResponse = await axios.get(`${API_URL}/api/violations?limit=1000`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const violations = violationsResponse.data

      // Дефекты по типам
      const typeCounts: Record<string, number> = {}
      violations.forEach((v: any) => {
        const type = v.severity || 'unknown'
        typeCounts[type] = (typeCounts[type] || 0) + 1
      })
      setDefectsByType(
        Object.entries(typeCounts).map(([name, value]) => ({ name, value }))
      )

      // Динамика по месяцам
      const monthCounts: Record<string, number> = {}
      violations.forEach((v: any) => {
        const date = new Date(v.created_at)
        const month = `${date.getMonth() + 1}/${date.getFullYear()}`
        monthCounts[month] = (monthCounts[month] || 0) + 1
      })
      setDefectsTimeline(
        Object.entries(monthCounts)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => {
            const [aMonth, aYear] = a.name.split('/').map(Number)
            const [bMonth, bYear] = b.name.split('/').map(Number)
            if (aYear !== bYear) return aYear - bYear
            return aMonth - bMonth
          })
      )
    } catch (error: any) {
      console.error('Error fetching chart data:', error)
    } finally {
      setLoading(false)
    }
  }

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8']

  if (loading) {
    return (
      <div className={`rounded-lg shadow-lg p-6 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="animate-pulse">
          <div className={`h-64 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded`}></div>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-lg shadow-lg p-6 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
      <h2 className={`text-xl font-semibold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
        Графики и аналитика
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Дефекты по типам */}
        <div>
          <h3 className={`text-sm font-medium mb-3 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
            Дефекты по критичности
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={defectsByType}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {defectsByType.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Динамика дефектов */}
        <div>
          <h3 className={`text-sm font-medium mb-3 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
            Динамика дефектов
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={defectsTimeline}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} />
              <XAxis 
                dataKey="name" 
                stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'}
                fontSize={12}
              />
              <YAxis 
                stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'}
                fontSize={12}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                  border: theme === 'dark' ? '1px solid #374151' : '1px solid #e5e7eb',
                  color: theme === 'dark' ? '#ffffff' : '#000000',
                }}
              />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

