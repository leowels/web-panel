'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns'
import Link from 'next/link'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface CalendarEvent {
  date: Date
  type: 'pto' | 'cto'
  equipment_id: number
  equipment_name: string
  isOverdue: boolean
}

interface PTOCalendarProps {
  theme: 'light' | 'dark'
}

export default function PTOCalendar({ theme }: PTOCalendarProps) {
  const { token } = useAuthStore()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token) {
      fetchCalendarData()
    }
  }, [currentMonth, token])

  const fetchCalendarData = async () => {
    if (!token) return
    try {
      const response = await axios.get(`${API_URL}/api/equipment?limit=1000`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const equipment = response.data

      const monthStart = startOfMonth(currentMonth)
      const monthEnd = endOfMonth(currentMonth)
      const now = new Date()

      const calendarEvents: CalendarEvent[] = []

      equipment.forEach((eq: any) => {
        if (eq.pto_date) {
          const ptoDate = new Date(eq.pto_date)
          if (ptoDate >= monthStart && ptoDate <= monthEnd) {
            calendarEvents.push({
              date: ptoDate,
              type: 'pto',
              equipment_id: eq.id,
              equipment_name: eq.passport_number,
              isOverdue: ptoDate < now,
            })
          }
        }
        if (eq.cto_date) {
          const ctoDate = new Date(eq.cto_date)
          if (ctoDate >= monthStart && ctoDate <= monthEnd) {
            calendarEvents.push({
              date: ctoDate,
              type: 'cto',
              equipment_id: eq.id,
              equipment_name: eq.passport_number,
              isOverdue: ctoDate < now,
            })
          }
        }
      })

      setEvents(calendarEvents)
    } catch (error: any) {
      console.error('Error fetching calendar data:', error)
    } finally {
      setLoading(false)
    }
  }

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })

  const getDayEvents = (day: Date) => {
    return events.filter(e => isSameDay(e.date, day))
  }

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
  }

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
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          Календарь ПТО/ЧТО
        </h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={prevMonth}
            className={`p-2 rounded ${theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700'} hover:bg-gray-300`}
          >
            ←
          </button>
          <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <button
            onClick={nextMonth}
            className={`p-2 rounded ${theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700'} hover:bg-gray-300`}
          >
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
          <div
            key={day}
            className={`text-center text-xs font-medium py-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dayEvents = getDayEvents(day)
          const isToday = isSameDay(day, new Date())
          
          return (
            <div
              key={day.toISOString()}
              className={`min-h-20 p-1 border rounded ${
                theme === 'dark' 
                  ? 'bg-gray-700 border-gray-600' 
                  : 'bg-gray-50 border-gray-200'
              } ${isToday ? 'ring-2 ring-blue-500' : ''}`}
            >
              <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                {format(day, 'd')}
              </div>
              <div className="space-y-1">
                {dayEvents.map((event, idx) => (
                  <Link
                    key={idx}
                    href={`/equipment?id=${event.equipment_id}`}
                    className={`block text-xs p-1 rounded truncate ${
                      event.isOverdue
                        ? 'bg-red-500 text-white'
                        : event.type === 'pto'
                        ? 'bg-blue-500 text-white'
                        : 'bg-green-500 text-white'
                    } hover:opacity-80`}
                    title={event.equipment_name}
                  >
                    {event.type.toUpperCase()}
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center space-x-4 text-xs">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-blue-500 rounded"></div>
          <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>ПТО</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded"></div>
          <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>ЧТО</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-red-500 rounded"></div>
          <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>Просрочено</span>
        </div>
      </div>
    </div>
  )
}

