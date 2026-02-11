'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { format } from 'date-fns'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface Equipment {
  id: number
  equipment_type: string
  passport_number: string
  inventory_number: string | null
  position: string | null
  workshop: string | null
  load_capacity: number | null
  manufacturer: string | null
  installation_date: string | null
  installation_location: string | null
  status: string
  pto_date: string | null
  cto_date: string | null
}

interface Violation {
  id: number
  description: string
  fnp_clause: string | null
  gost_clause: string | null
  severity: string
  status: string
  deadline: string | null
  created_at: string
  resolved_at: string | null
}

interface HealthMapProps {
  theme: 'light' | 'dark'
  allowDetails?: boolean
}

export default function HealthMap({ theme, allowDetails = true }: HealthMapProps) {
  const { token } = useAuthStore()
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [healthScores, setHealthScores] = useState<Record<number, number>>({})
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null)
  const [violations, setViolations] = useState<Violation[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)

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

  const handleEquipmentClick = async (eq: Equipment) => {
    if (!allowDetails) return
    setSelectedEquipment(eq)
    setLoadingDetails(true)
    try {
      // Загружаем полные данные оборудования
      const eqResponse = await axios.get(`${API_URL}/api/equipment/${eq.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setSelectedEquipment(eqResponse.data)

      // Загружаем нарушения для этого оборудования
      const violationsResponse = await axios.get(`${API_URL}/api/violations?equipment_id=${eq.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setViolations(violationsResponse.data || [])
    } catch (error: any) {
      console.error('Error fetching equipment details:', error)
    } finally {
      setLoadingDetails(false)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800'
      case 'high':
        return 'bg-orange-100 text-orange-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      case 'low':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getSeverityText = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'Критическое'
      case 'high':
        return 'Высокое'
      case 'medium':
        return 'Среднее'
      case 'low':
        return 'Низкое'
      default:
        return severity
    }
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
            <button
              key={eq.id}
              onClick={() => handleEquipmentClick(eq)}
              className={`w-full flex items-center justify-between p-4 rounded-lg border-2 ${
                theme === 'dark' 
                  ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 hover:border-gray-500' 
                  : 'bg-gray-50 border-gray-200 hover:bg-white hover:border-primary-300'
              } transition-all duration-200 ${allowDetails ? 'cursor-pointer' : 'cursor-default'} group shadow-soft hover:shadow-medium`}
            >
              <div className="flex items-center space-x-4 flex-1">
                <div className={`w-4 h-4 rounded-full ${getHealthColor(score)} shadow-lg`}></div>
                <div className="flex-1 text-left">
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
            </button>
          )
        })}
      </div>

      {/* Модальное окно с деталями оборудования */}
      {allowDetails && selectedEquipment && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`rounded-xl shadow-strong max-w-4xl w-full max-h-[90vh] overflow-y-auto border ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className={`p-6 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} flex justify-between items-center sticky top-0 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
              <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                Детали оборудования
              </h2>
              <button
                onClick={() => setSelectedEquipment(null)}
                className={`${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'} hover:bg-gray-100 rounded-lg p-2 transition-colors`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loadingDetails ? (
              <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-200 border-t-primary-600 mx-auto"></div>
                <p className={`mt-4 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Загрузка...</p>
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Данные оборудования */}
                <div>
                  <h3 className={`text-lg font-semibold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    Информация об оборудовании
                  </h3>
                  <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-4`}>
                    <div>
                      <label className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Номер паспорта</label>
                      <p className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{selectedEquipment.passport_number}</p>
                    </div>
                    <div>
                      <label className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Тип ПС</label>
                      <p className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{selectedEquipment.equipment_type}</p>
                    </div>
                    {selectedEquipment.inventory_number && (
                      <div>
                        <label className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Инвентарный номер</label>
                        <p className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{selectedEquipment.inventory_number}</p>
                      </div>
                    )}
                    {selectedEquipment.position && (
                      <div>
                        <label className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Позиция</label>
                        <p className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{selectedEquipment.position}</p>
                      </div>
                    )}
                    {selectedEquipment.workshop && (
                      <div>
                        <label className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Цех</label>
                        <p className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{selectedEquipment.workshop}</p>
                      </div>
                    )}
                    {selectedEquipment.load_capacity && (
                      <div>
                        <label className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Грузоподъемность</label>
                        <p className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{selectedEquipment.load_capacity} т</p>
                      </div>
                    )}
                    {selectedEquipment.manufacturer && (
                      <div>
                        <label className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Завод-изготовитель</label>
                        <p className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{selectedEquipment.manufacturer}</p>
                      </div>
                    )}
                    {selectedEquipment.installation_location && (
                      <div>
                        <label className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Место установки</label>
                        <p className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{selectedEquipment.installation_location}</p>
                      </div>
                    )}
                    {selectedEquipment.installation_date && (
                      <div>
                        <label className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Дата ввода</label>
                        <p className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                          {format(new Date(selectedEquipment.installation_date), 'dd.MM.yyyy')}
                        </p>
                      </div>
                    )}
                    {selectedEquipment.pto_date && (
                      <div>
                        <label className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Дата ПТО</label>
                        <p className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                          {format(new Date(selectedEquipment.pto_date), 'dd.MM.yyyy')}
                        </p>
                      </div>
                    )}
                    {selectedEquipment.cto_date && (
                      <div>
                        <label className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Дата ЧТО</label>
                        <p className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                          {format(new Date(selectedEquipment.cto_date), 'dd.MM.yyyy')}
                        </p>
                      </div>
                    )}
                    <div>
                      <label className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Статус</label>
                      <p className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          selectedEquipment.status === 'active' ? 'bg-green-100 text-green-800' :
                          selectedEquipment.status === 'inactive' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {selectedEquipment.status === 'active' ? 'Активно' :
                           selectedEquipment.status === 'inactive' ? 'Неактивно' : 'Архив'}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Нарушения */}
                <div>
                  <h3 className={`text-lg font-semibold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    Нарушения ({violations.length})
                  </h3>
                  {violations.length === 0 ? (
                    <div className={`${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-4 text-center`}>
                      <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Нарушения отсутствуют</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {violations.map((violation) => (
                        <div
                          key={violation.id}
                          className={`${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'} border rounded-lg p-4`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <p className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                {violation.description}
                              </p>
                              {(violation.fnp_clause || violation.gost_clause) && (
                                <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                  {violation.fnp_clause && `ФНП: ${violation.fnp_clause}`}
                                  {violation.fnp_clause && violation.gost_clause && ' • '}
                                  {violation.gost_clause && `ГОСТ: ${violation.gost_clause}`}
                                </p>
                              )}
                            </div>
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ml-2 ${getSeverityColor(violation.severity)}`}>
                              {getSeverityText(violation.severity)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2 text-xs">
                            <span className={`px-2 py-1 rounded-full ${
                              violation.status === 'resolved' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {violation.status === 'resolved' ? 'Устранено' : 'Открыто'}
                            </span>
                            {violation.deadline && (
                              <span className={`px-2 py-1 rounded-full ${theme === 'dark' ? 'bg-gray-600 text-gray-300' : 'bg-gray-200 text-gray-700'}`}>
                                Срок: {format(new Date(violation.deadline), 'dd.MM.yyyy')}
                              </span>
                            )}
                            <span className={`px-2 py-1 rounded-full ${theme === 'dark' ? 'bg-gray-600 text-gray-300' : 'bg-gray-200 text-gray-700'}`}>
                              Создано: {format(new Date(violation.created_at), 'dd.MM.yyyy')}
                            </span>
                            {violation.resolved_at && (
                              <span className={`px-2 py-1 rounded-full ${theme === 'dark' ? 'bg-gray-600 text-gray-300' : 'bg-gray-200 text-gray-700'}`}>
                                Устранено: {format(new Date(violation.resolved_at), 'dd.MM.yyyy')}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
