'use client'

import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import EquipmentCard from './EquipmentCard'
import { getEquipmentTypeIcon } from '@/utils/equipmentMapIcons'
import { CraneIcon, CraneBeamIcon, ColumnIcon, WallIcon, isCraneBeamType, isCraneType } from './WorkshopMapIcons'

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
  pto_date: string | null
  cto_date: string | null
  installation_location: string | null
  status: string
  map_x?: number | null  // Координата X на карте (0-100%)
  map_y?: number | null  // Координата Y на карте (0-100%)
}

interface WorkshopMapProps {
  workshop?: string  // Фильтр по цеху
  onEquipmentClick?: (equipment: Equipment) => void
}

export default function WorkshopMap({ workshop, onEquipmentClick }: WorkshopMapProps) {
  const { token } = useAuthStore()
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredEquipment, setHoveredEquipment] = useState<Equipment | null>(null)
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [mapElements, setMapElements] = useState<Array<{ id: string; type: string; x: number; y: number; width?: number; height?: number; radius?: number; color?: string }>>([])
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    fetchEquipment()
    const saved = typeof window !== 'undefined' ? localStorage.getItem(`workshop_map_${workshop || 'default'}`) : null
    if (saved) {
      try {
        setMapElements(JSON.parse(saved))
      } catch {
        setMapElements([])
      }
    } else {
      setMapElements([])
    }
  }, [workshop, token])

  const fetchEquipment = async () => {
    try {
      setLoading(true)
      const params: any = { limit: 1000 }
      if (workshop) {
        params.workshop = workshop
      }

      const response = await axios.get(`${API_URL}/api/equipment`, {
        params,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      // Только оборудование с координатами на карте
      const equipmentWithCoords = response.data.filter(
        (eq: Equipment) =>
          eq.map_x != null &&
          eq.map_y != null &&
          typeof eq.map_x === 'number' &&
          typeof eq.map_y === 'number'
      )
      setEquipment(equipmentWithCoords)
    } catch (error) {
      console.error('Ошибка загрузки оборудования:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEquipmentHover = (e: React.MouseEvent<SVGCircleElement>, eq: Equipment) => {
    setHoveredEquipment(eq)
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect()
      setTooltipPosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 10
      })
    }
  }

  const handleEquipmentClick = (eq: Equipment) => {
    setSelectedEquipment(eq)
    if (onEquipmentClick) {
      onEquipmentClick(eq)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#10b981' // green
      case 'inactive':
        return '#ef4444' // red
      case 'archived':
        return '#6b7280' // gray
      default:
        return '#3b82f6' // blue
    }
  }

  const getCoordinates = (eq: Equipment) => {
    if (eq.map_x != null && eq.map_y != null) {
      return { x: eq.map_x, y: eq.map_y }
    }
    return { x: 50, y: 50 }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg border border-gray-200">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка карты цеха...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* SVG Карта цеха */}
      <div className="relative bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <svg
          ref={svgRef}
          viewBox="0 0 1000 600"
          className="w-full h-auto min-h-[600px]"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Фон цеха (можно заменить на реальный план) */}
          <rect width="1000" height="600" fill="#f9fafb" />
          
          {/* Сетка для ориентира — карта пустая, оборудование добавляется вручную */}
          <defs>
            <pattern id="grid-workshop" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="1000" height="600" fill="url(#grid-workshop)" />

          {/* Стены и колонны (из редактора) */}
          {mapElements.map((el) => {
            const x = (el.x / 100) * 1000
            const y = (el.y / 100) * 600
            if (el.type === 'wall') {
              const w = Math.max(25, ((el.width || 5) / 100) * 500)
              const h = Math.max(60, ((el.height || 20) / 100) * 400)
              return <WallIcon key={el.id} id={el.id} x={x} y={y} width={w} height={h} fill={el.color || '#78716c'} stroke="#57534e" />
            }
            if (el.type === 'column') {
              const r = Math.max(18, ((el.radius || 2) / 100) * 200)
              return <ColumnIcon key={el.id} id={el.id} x={x} y={y} size={r * 2} fill={el.color || '#94a3b8'} stroke="#64748b" />
            }
            return null
          })}

          {/* Подсказка при пустой карте */}
          {equipment.length === 0 && (
            <text x="500" y="300" textAnchor="middle" fontSize="18" fill="#9ca3af" className="pointer-events-none">
              Карта пуста. Добавьте оборудование в режиме редактирования.
            </text>
          )}

          {/* Оборудование — только с координатами map_x, map_y */}
          {equipment.map((eq) => {
            const coords = getCoordinates(eq)
            const x = (coords.x / 100) * 1000
            const y = (coords.y / 100) * 600
            const statusColor = getStatusColor(eq.status)
            const isHovered = hoveredEquipment?.id === eq.id

            return (
              <g key={eq.id}>
                {/* Тень при наведении */}
                {isHovered && (
                  <circle
                    cx={x}
                    cy={y}
                    r="25"
                    fill="rgba(0,0,0,0.1)"
                    className="pointer-events-none"
                  />
                )}
                
                {/* Круг оборудования */}
                <circle
                  cx={x}
                  cy={y}
                  r="20"
                  fill={statusColor}
                  stroke="white"
                  strokeWidth={isHovered ? "4" : "2"}
                  className="cursor-pointer transition-all duration-200"
                  style={{
                    filter: isHovered ? 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
                    transform: isHovered ? 'scale(1.2)' : 'scale(1)',
                  }}
                  onMouseEnter={(e) => handleEquipmentHover(e, eq)}
                  onMouseLeave={() => setHoveredEquipment(null)}
                  onClick={() => handleEquipmentClick(eq)}
                />
                
                {/* Иконка типа оборудования */}
                {isCraneBeamType(eq.equipment_type) ? (
                  <CraneBeamIcon x={x} y={y} size={24} fill="white" />
                ) : isCraneType(eq.equipment_type) ? (
                  <CraneIcon x={x} y={y} size={24} fill="white" />
                ) : (
                  <text x={x} y={y + 6} textAnchor="middle" fontSize="14" fill="white" className="pointer-events-none select-none">
                    {getEquipmentTypeIcon(eq.equipment_type)}
                  </text>
                )}

                {/* Линия к подписи (если есть позиция) */}
                {eq.position && (
                  <line
                    x1={x}
                    y1={y + 20}
                    x2={x}
                    y2={y + 35}
                    stroke="#6b7280"
                    strokeWidth="1"
                    strokeDasharray="2,2"
                  />
                )}
                
                {/* Подпись позиции */}
                {eq.position && (
                  <text
                    x={x}
                    y={y + 45}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#6b7280"
                    className="pointer-events-none select-none font-medium"
                  >
                    {eq.position}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Tooltip при наведении */}
        {hoveredEquipment && (
          <div
            className="absolute z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[200px] pointer-events-none"
            style={{
              left: `${tooltipPosition.x}px`,
              top: `${tooltipPosition.y}px`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="flex items-start gap-2">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                style={{ backgroundColor: getStatusColor(hoveredEquipment.status) }}
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 truncate">
                  {hoveredEquipment.equipment_type}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Паспорт: {hoveredEquipment.passport_number}
                </p>
                {hoveredEquipment.inventory_number && (
                  <p className="text-xs text-gray-600">
                    Инв. №: {hoveredEquipment.inventory_number}
                  </p>
                )}
                {hoveredEquipment.position && (
                  <p className="text-xs text-gray-500 mt-1">
                    Позиция: {hoveredEquipment.position}
                  </p>
                )}
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      hoveredEquipment.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : hoveredEquipment.status === 'inactive'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {hoveredEquipment.status === 'active' ? 'Активно' : 
                     hoveredEquipment.status === 'inactive' ? 'Неактивно' : 'Архив'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Легенда */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-green-500"></div>
          <span className="text-gray-700">Активное</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-red-500"></div>
          <span className="text-gray-700">Неактивное</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-gray-500"></div>
          <span className="text-gray-700">Архив</span>
        </div>
        <div className="ml-auto text-gray-500 text-xs">
          Наведите курсор на оборудование для информации, кликните для подробностей
        </div>
      </div>

      {/* Модальное окно с подробной информацией */}
      {selectedEquipment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                Оборудование: {selectedEquipment.equipment_type}
              </h2>
              <button
                onClick={() => setSelectedEquipment(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <EquipmentCard
                equipmentId={selectedEquipment.id}
                onClose={() => setSelectedEquipment(null)}
                onEdit={() => {
                  // Можно открыть форму редактирования
                  setSelectedEquipment(null)
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
