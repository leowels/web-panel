'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface AIPanelProps {
  theme: 'light' | 'dark'
}

export default function AIPanel({ theme }: AIPanelProps) {
  const { token } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])

  const fetchAISuggestions = async () => {
    setLoading(true)
    try {
      // TODO: Реализовать API для получения AI подсказок
      // Пока используем заглушку
      setTimeout(() => {
        setSuggestions([
          'Рекомендуется провести внеплановый осмотр крана #123',
          'Обнаружена тенденция к увеличению дефектов в цехе №2',
          'Срок ПТО для подъемника #456 истекает через 3 дня',
        ])
        setLoading(false)
      }, 1000)
    } catch (error) {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAISuggestions()
  }, [])

  return (
    <div className={`rounded-lg shadow-lg p-6 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          🤖 AI-инспектор
        </h2>
        <button
          onClick={fetchAISuggestions}
          disabled={loading}
          className={`text-sm px-3 py-1 rounded ${theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700'} hover:bg-gray-300 disabled:opacity-50`}
        >
          {loading ? '...' : '🔄'}
        </button>
      </div>
      <div className="space-y-3">
        {loading ? (
          <div className="animate-pulse space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`h-16 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded`}></div>
            ))}
          </div>
        ) : (
          suggestions.map((suggestion, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg border ${
                theme === 'dark' 
                  ? 'bg-gray-700 border-gray-600' 
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                {suggestion}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

