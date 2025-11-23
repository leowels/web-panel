'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { format } from 'date-fns'
import React from 'react'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface Event {
  id: number
  type: string
  title: string
  description: string
  timestamp: string
  link?: string
  icon: React.ReactNode
}

interface EventFeedProps {
  theme: 'light' | 'dark'
}

export default function EventFeed({ theme }: EventFeedProps) {
  const { token } = useAuthStore()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token) {
      fetchEvents()
      const interval = setInterval(fetchEvents, 10000) // Обновление каждые 10 секунд
      return () => clearInterval(interval)
    }
  }, [token])

  const fetchEvents = async () => {
    if (!token) return
    try {
      // Получение лога активности
      const auditResponse = await axios.get(`${API_URL}/api/audit?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const auditLogs = auditResponse.data

      // Преобразование в события
      const newEvents: Event[] = auditLogs.map((log: any) => {
        let icon = (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        )
        let title = log.description || `${log.action_type} ${log.entity_type || ''}`
        
        if (log.action_type === 'create') {
          if (log.entity_type === 'inspection') {
            icon = (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )
          } else if (log.entity_type === 'violation') {
            icon = (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )
          } else if (log.entity_type === 'act') {
            icon = (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )
          } else {
            icon = (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            )
          }
        } else if (log.action_type === 'update') {
          icon = (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          )
        } else if (log.action_type === 'delete') {
          icon = (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          )
        } else if (log.action_type === 'login') {
          icon = (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
          )
          title = `Вход пользователя ${log.username}`
        }

        return {
          id: log.id,
          type: log.action_type,
          title,
          description: log.description || '',
          timestamp: log.created_at,
          link: log.entity_id ? `/${log.entity_type}s/${log.entity_id}` : undefined,
          icon,
        }
      })

      setEvents(newEvents)
    } catch (error: any) {
      console.error('Error fetching events:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className={`rounded-xl shadow-soft p-6 border border-gray-200 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
        <div className="animate-pulse space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`h-16 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded-lg`}></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-xl shadow-soft p-6 border border-gray-200 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
      <h2 className={`text-xl font-bold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
        Лента событий
      </h2>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {events.map((event) => (
          <div
            key={event.id}
            className={`p-3 rounded-lg border-2 ${
              theme === 'dark' 
                ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 hover:border-gray-500' 
                : 'bg-gray-50 border-gray-200 hover:bg-white hover:border-primary-300'
            } transition-all duration-200 hover:shadow-soft group`}
          >
            <div className="flex items-start space-x-3">
              <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-gray-600 text-primary-400' : 'bg-primary-100 text-primary-600'} group-hover:scale-110 transition-transform`}>
                {event.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {event.title}
                </div>
                {event.description && (
                  <div className={`text-xs mt-1 font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {event.description}
                  </div>
                )}
                <div className={`text-xs mt-2 font-semibold ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                  {format(new Date(event.timestamp), 'HH:mm:ss')}
                </div>
              </div>
              {event.link && (
                <a
                  href={event.link}
                  className={`text-xs font-semibold ${theme === 'dark' ? 'text-primary-400' : 'text-primary-600'} hover:underline flex items-center`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        ))}
        {events.length === 0 && (
          <div className={`text-center py-8 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-semibold">События отсутствуют</p>
          </div>
        )}
      </div>
    </div>
  )
}

