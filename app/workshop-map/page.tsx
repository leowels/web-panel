'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import WorkshopMap from '@/components/equipment/WorkshopMap'
import WorkshopMapEditor from '@/components/equipment/WorkshopMapEditor'
import axios from 'axios'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

function WorkshopMapPageContent() {
  const { isAuthenticated, token, user } = useAuthStore()
  const searchParams = useSearchParams()
  const initialWorkshop = searchParams.get('workshop') || ''
  const initialEquipmentId = searchParams.get('equipment_id')
    ? Number(searchParams.get('equipment_id'))
    : null
  const [selectedWorkshop, setSelectedWorkshop] = useState<string>(initialWorkshop)
  const [customWorkshop, setCustomWorkshop] = useState<string>('')
  const [focusEquipmentId, setFocusEquipmentId] = useState<number | null>(
    initialEquipmentId && !Number.isNaN(initialEquipmentId) ? initialEquipmentId : null
  )
  const [workshops, setWorkshops] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [isEditMode, setIsEditMode] = useState(false)

  const isAdmin = user?.roles?.some((r) => r.name === 'admin') || false

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchWorkshops()
    }
  }, [isAuthenticated, token])

  useEffect(() => {
    const eqIdRaw = searchParams.get('equipment_id')
    const ws = searchParams.get('workshop')
    const eqId = eqIdRaw ? Number(eqIdRaw) : null
    if (ws) {
      setSelectedWorkshop(ws)
      setCustomWorkshop('')
    }
    if (eqId && !Number.isNaN(eqId)) {
      setFocusEquipmentId(eqId)
    }
  }, [searchParams])

  const fetchWorkshops = async () => {
    try {
      setLoading(true)
      const response = await axios.get(`${API_URL}/api/equipment`, {
        params: { limit: 1000 },
        headers: { Authorization: `Bearer ${token}` },
      })

      const data = Array.isArray(response.data) ? response.data : response.data?.items || []
      const uniqueWorkshops = Array.from(
        new Set(
          data
            .map((eq: any) => eq.workshop)
            .filter((w: string | null) => w && w.trim() !== '')
        )
      ) as string[]

      setWorkshops(uniqueWorkshops.sort())
    } catch (error) {
      console.error('Ошибка загрузки цехов:', error)
    } finally {
      setLoading(false)
    }
  }

  const effectiveWorkshop = customWorkshop.trim() || selectedWorkshop || undefined

  if (!isAuthenticated) {
    return null
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Карта цеха</h1>
              <p className="text-gray-600 mt-2 font-medium">
                {isEditMode ? 'Редактор карты цеха' : 'Интерактивная карта расположения оборудования'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="text-sm font-medium text-gray-700">Цех:</label>
              <select
                value={selectedWorkshop}
                onChange={(e) => {
                  setSelectedWorkshop(e.target.value)
                  if (e.target.value) setCustomWorkshop('')
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Выберите цех</option>
                {workshops.map((ws) => (
                  <option key={ws} value={ws}>{ws}</option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-sm">или новый:</span>
                <input
                  type="text"
                  value={customWorkshop}
                  onChange={(e) => {
                    setCustomWorkshop(e.target.value)
                    if (e.target.value) setSelectedWorkshop('')
                  }}
                  placeholder="Введите название цеха"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              {isAdmin && (
                <button
                  onClick={() => setIsEditMode(!isEditMode)}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                    isEditMode
                      ? 'bg-gray-600 text-white hover:bg-gray-700'
                      : 'bg-primary-600 text-white hover:bg-primary-700'
                  }`}
                >
                  {isEditMode ? 'Режим просмотра' : 'Режим редактирования'}
                </button>
              )}
            </div>
          </div>

          {loading && !effectiveWorkshop ? (
            <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-gray-600">Загрузка списка цехов...</div>
          ) : isEditMode && isAdmin ? (
            effectiveWorkshop ? (
              <WorkshopMapEditor
                workshop={effectiveWorkshop}
                onSave={() => fetchWorkshops()}
              />
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
                <p className="text-amber-800 font-medium">Выберите цех или введите название нового</p>
                <p className="text-amber-700 text-sm mt-1">Редактирование карты доступно после выбора цеха</p>
              </div>
            )
          ) : (
            <WorkshopMap workshop={effectiveWorkshop} focusEquipmentId={focusEquipmentId} />
          )}
        </div>
      </div>
    </Layout>
  )
}

export default function WorkshopMapPage() {
  return (
    <Suspense fallback={null}>
      <WorkshopMapPageContent />
    </Suspense>
  )
}
