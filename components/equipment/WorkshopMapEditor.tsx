'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { EQUIPMENT_TYPES } from '@/constants/equipmentTypes'
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
  status: string
  map_x?: number | null
  map_y?: number | null
}

interface MapElement {
  id: string
  type: 'wall' | 'column' | 'zone' | 'text'
  x: number
  y: number
  width?: number
  height?: number
  radius?: number
  label?: string
  color?: string
}

interface WorkshopMapEditorProps {
  workshop?: string
  onSave?: () => void
}

export default function WorkshopMapEditor({ workshop, onSave }: WorkshopMapEditorProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [mapElements, setMapElements] = useState<MapElement[]>([])
  const [selectedTool, setSelectedTool] = useState<'select' | 'wall' | 'column' | 'zone' | 'equipment'>('select')
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null)
  const [draggedEquipment, setDraggedEquipment] = useState<Equipment | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [editingElement, setEditingElement] = useState<MapElement | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newEquipment, setNewEquipment] = useState({ equipment_type: 'Кран', passport_number: '', position: '' })
  const [creating, setCreating] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    fetchEquipment()
    loadMapElements()
  }, [workshop, token])

  const fetchEquipment = async () => {
    try {
      const params: any = { limit: 1000 }
      if (workshop) {
        params.workshop = workshop
      }

      const response = await axios.get(`${API_URL}/api/equipment`, {
        params,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      setEquipment(response.data)
    } catch (error) {
      console.error('Ошибка загрузки оборудования:', error)
    }
  }

  const loadMapElements = () => {
    // Загружаем сохраненные элементы карты из localStorage
    const saved = localStorage.getItem(`workshop_map_${workshop || 'default'}`)
    if (saved) {
      try {
        setMapElements(JSON.parse(saved))
      } catch (e) {
        console.error('Ошибка загрузки элементов карты:', e)
      }
    }
  }

  const saveMapElements = () => {
    localStorage.setItem(`workshop_map_${workshop || 'default'}`, JSON.stringify(mapElements))
    addNotification('Элементы карты сохранены', 'success')
  }

  const handleSvgClick = async (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return

    const rect = svgRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))

    if (selectedTool === 'equipment' && selectedEquipment) {
      // Размещаем выбранное оборудование на карте
      const updated = { ...selectedEquipment, map_x: x, map_y: y }
      setEquipment(equipment.map(eq => eq.id === updated.id ? updated : eq))
      setSelectedEquipment(null)
      setSelectedTool('select')
      
      try {
        await axios.put(
          `${API_URL}/api/equipment/${updated.id}`,
          { map_x: updated.map_x, map_y: updated.map_y },
          { headers: { Authorization: `Bearer ${token}` } }
        )
        addNotification('Оборудование размещено на карте', 'success')
        if (onSave) onSave()
      } catch (error) {
        console.error('Ошибка сохранения координат:', error)
        addNotification('Ошибка сохранения координат', 'error')
      }
    } else if (selectedTool === 'wall') {
      const newWall: MapElement = {
        id: `wall_${Date.now()}`,
        type: 'wall',
        x,
        y,
        width: 5,
        height: 20,
        color: '#9ca3af'
      }
      setMapElements([...mapElements, newWall])
    } else if (selectedTool === 'column') {
      const newColumn: MapElement = {
        id: `column_${Date.now()}`,
        type: 'column',
        x,
        y,
        radius: 2,
        color: '#e5e7eb'
      }
      setMapElements([...mapElements, newColumn])
    } else if (selectedTool === 'zone') {
      const newZone: MapElement = {
        id: `zone_${Date.now()}`,
        type: 'zone',
        x,
        y,
        width: 15,
        height: 15,
        color: '#dbeafe',
        label: 'Зона'
      }
      setMapElements([...mapElements, newZone])
    }
  }

  const handleEquipmentDragStart = (e: React.MouseEvent, eq: Equipment) => {
    e.stopPropagation()
    setDraggedEquipment(eq)
    setIsDragging(true)
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      setDragOffset({
        x: x - (eq.map_x || 0),
        y: y - (eq.map_y || 0)
      })
    }
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !draggedEquipment || !svgRef.current) return

    const rect = svgRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100 - dragOffset.x))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100 - dragOffset.y))

    setEquipment(prev => prev.map(eq => 
      eq.id === draggedEquipment.id 
        ? { ...eq, map_x: x, map_y: y }
        : eq
    ))
  }, [isDragging, draggedEquipment, dragOffset])

  const handleMouseUp = useCallback(async () => {
    if (isDragging && draggedEquipment) {
      const updated = equipment.find(eq => eq.id === draggedEquipment.id)
      if (updated && (updated.map_x !== draggedEquipment.map_x || updated.map_y !== draggedEquipment.map_y)) {
        // Сохраняем координаты на сервере
        try {
          await axios.put(
            `${API_URL}/api/equipment/${updated.id}`,
            { map_x: updated.map_x, map_y: updated.map_y },
            { headers: { Authorization: `Bearer ${token}` } }
          )
          addNotification('Координаты оборудования обновлены', 'success')
          if (onSave) onSave()
        } catch (error) {
          console.error('Ошибка сохранения координат:', error)
          addNotification('Ошибка сохранения координат', 'error')
        }
      }
    }
    setIsDragging(false)
    setDraggedEquipment(null)
  }, [isDragging, draggedEquipment, equipment, token, onSave])

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  const deleteMapElement = (id: string) => {
    setMapElements(mapElements.filter(el => el.id !== id))
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#10b981'
      case 'inactive': return '#ef4444'
      case 'archived': return '#6b7280'
      default: return '#3b82f6'
    }
  }

  const equipmentWithCoords = equipment.filter(eq => 
    eq.map_x !== null && eq.map_x !== undefined && eq.map_y !== null && eq.map_y !== undefined
  )

  return (
    <div className="space-y-4">
      {/* Панель инструментов */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Инструменты:</span>
          
          <button
            onClick={() => setSelectedTool('select')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              selectedTool === 'select'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Выбор
          </button>
          
          <button
            onClick={() => setSelectedTool('wall')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              selectedTool === 'wall'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <svg width="20" height="20" viewBox="-15 -40 30 80" className="flex-shrink-0">
              <rect x="-12" y="-35" width="24" height="70" fill="currentColor" stroke="currentColor" strokeWidth={0.5} opacity={0.9} />
            </svg>
            Стена
          </button>
          
          <button
            onClick={() => setSelectedTool('column')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              selectedTool === 'column'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <svg width="20" height="20" viewBox="-10 -10 20 20" className="flex-shrink-0">
              <circle cx="0" cy="0" r="8" fill="currentColor" stroke="currentColor" strokeWidth={0.5} />
            </svg>
            Колонна
          </button>
          
          <button
            onClick={() => setSelectedTool('zone')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              selectedTool === 'zone'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Зона
          </button>

          <div className="ml-auto flex gap-2">
            <button
              onClick={saveMapElements}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Сохранить карту
            </button>
            <button
              onClick={() => setMapElements([])}
              className="px-4 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Очистить
            </button>
          </div>
        </div>
      </div>

      {/* Список оборудования для размещения */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Оборудование (выберите и кликните на карту для размещения):
          </h3>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            + Добавить новое
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
          {equipment
            .filter((eq) => !eq.map_x || !eq.map_y)
            .map((eq) => (
              <div
                key={eq.id}
                onClick={() => {
                  setSelectedEquipment(eq)
                  setSelectedTool('equipment')
                }}
                className={`p-2 border rounded cursor-pointer hover:bg-gray-50 text-xs transition-colors flex items-center gap-2 ${
                  selectedEquipment?.id === eq.id && selectedTool === 'equipment'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200'
                }`}
                title={`${eq.equipment_type} - ${eq.passport_number}`}
              >
                <span className="text-base">{getEquipmentTypeIcon(eq.equipment_type)}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{eq.equipment_type}</div>
                  <div className="text-gray-500 truncate">{eq.passport_number}</div>
                </div>
              </div>
            ))}
        </div>
        {equipment.filter((eq) => !eq.map_x || !eq.map_y).length === 0 && (
          <p className="text-sm text-gray-500 mt-2">
            Всё оборудование размещено на карте. Нажмите «Добавить новое», чтобы создать.
          </p>
        )}
        {selectedTool === 'equipment' && selectedEquipment && (
          <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
            Выбрано: {selectedEquipment.equipment_type} ({selectedEquipment.passport_number}). Кликните на карту, чтобы разместить.
          </div>
        )}
      </div>

      {/* Модалка создания нового оборудования */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Новое оборудование</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Тип оборудования</label>
                <select
                  value={newEquipment.equipment_type}
                  onChange={(e) => setNewEquipment({ ...newEquipment, equipment_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {EQUIPMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Паспорт *</label>
                <input
                  type="text"
                  value={newEquipment.passport_number}
                  onChange={(e) => setNewEquipment({ ...newEquipment, passport_number: e.target.value })}
                  placeholder="№ паспорта"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Позиция (необяз.)</label>
                <input
                  type="text"
                  value={newEquipment.position}
                  onChange={(e) => setNewEquipment({ ...newEquipment, position: e.target.value })}
                  placeholder="Напр. А-1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setNewEquipment({ equipment_type: 'Кран', passport_number: '', position: '' })
                }}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Отмена
              </button>
              <button
                disabled={!newEquipment.passport_number.trim() || creating}
                onClick={async () => {
                  if (!newEquipment.passport_number.trim()) return
                  setCreating(true)
                  try {
                    const payload = {
                      equipment_type: newEquipment.equipment_type,
                      passport_number: newEquipment.passport_number.trim(),
                      position: newEquipment.position.trim() || undefined,
                      workshop: workshop || undefined,
                      status: 'active',
                    }
                    const { data } = await axios.post(`${API_URL}/api/equipment`, payload, {
                      headers: { Authorization: `Bearer ${token}` },
                    })
                    setEquipment((prev) => [...prev, data])
                    setShowCreateModal(false)
                    setNewEquipment({ equipment_type: 'Кран', passport_number: '', position: '' })
                    setSelectedEquipment(data)
                    setSelectedTool('equipment')
                    addNotification('Оборудование создано. Кликните на карту, чтобы разместить.', 'success')
                    if (onSave) onSave()
                  } catch (err: any) {
                    const msg = err.response?.data?.detail || err.message || 'Ошибка создания'
                    addNotification(typeof msg === 'string' ? msg : JSON.stringify(msg), 'error')
                  } finally {
                    setCreating(false)
                  }
                }}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Создание...' : 'Создать и разместить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SVG Карта */}
      <div className="relative bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <svg
          ref={svgRef}
          viewBox="0 0 1000 600"
          className="w-full h-auto min-h-[600px] cursor-crosshair"
          preserveAspectRatio="xMidYMid meet"
          onClick={handleSvgClick}
        >
          {/* Фон */}
          <rect width="1000" height="600" fill="#f9fafb" />
          
          {/* Пустая карта — только сетка */}
          <defs>
            <pattern id="grid-editor" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="1000" height="600" fill="url(#grid-editor)" />

          {/* Сохраненные элементы карты */}
          {mapElements.map(el => {
            const x = (el.x / 100) * 1000
            const y = (el.y / 100) * 600
            
            if (el.type === 'wall') {
              const w = Math.max(25, ((el.width || 5) / 100) * 500)
              const h = Math.max(60, ((el.height || 20) / 100) * 400)
              return (
                <g
                  key={el.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (selectedTool === 'select') setEditingElement(el)
                  }}
                >
                  <WallIcon id={el.id} x={x} y={y} width={w} height={h} fill={el.color || '#78716c'} stroke="#57534e" />
                </g>
              )
            } else if (el.type === 'column') {
              const r = Math.max(18, ((el.radius || 2) / 100) * 200)
              return (
                <g
                  key={el.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (selectedTool === 'select') setEditingElement(el)
                  }}
                >
                  <ColumnIcon id={el.id} x={x} y={y} size={r * 2} fill={el.color || '#94a3b8'} stroke="#64748b" />
                </g>
              )
            } else if (el.type === 'zone') {
              return (
                <g key={el.id}>
                  <rect
                    x={x}
                    y={y}
                    width={(el.width || 15) / 100 * 1000}
                    height={(el.height || 15) / 100 * 600}
                    fill={el.color || '#dbeafe'}
                    stroke="#3b82f6"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (selectedTool === 'select') {
                        setEditingElement(el)
                      }
                    }}
                  />
                  {el.label && (
                    <text
                      x={x + (el.width || 15) / 100 * 500}
                      y={y + (el.height || 15) / 100 * 300}
                      textAnchor="middle"
                      fontSize="14"
                      fill="#1e40af"
                      className="pointer-events-none"
                    >
                      {el.label}
                    </text>
                  )}
                </g>
              )
            }
            return null
          })}

          {/* Оборудование */}
          {equipmentWithCoords.map(eq => {
            const x = (eq.map_x! / 100) * 1000
            const y = (eq.map_y! / 100) * 600
            const statusColor = getStatusColor(eq.status)
            const isSelected = selectedEquipment?.id === eq.id
            const isDragged = draggedEquipment?.id === eq.id

            return (
              <g key={eq.id}>
                {isDragged && (
                  <circle
                    cx={x}
                    cy={y}
                    r="25"
                    fill="rgba(59, 130, 246, 0.2)"
                    className="pointer-events-none"
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r="20"
                  fill={statusColor}
                  stroke={isSelected ? "#3b82f6" : "white"}
                  strokeWidth={isSelected ? "4" : "2"}
                  className="cursor-move"
                  style={{
                    filter: isSelected ? 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    handleEquipmentDragStart(e, eq)
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedEquipment(eq)
                  }}
                />
                {isCraneBeamType(eq.equipment_type) ? (
                  <CraneBeamIcon x={x} y={y} size={24} fill="white" />
                ) : isCraneType(eq.equipment_type) ? (
                  <CraneIcon x={x} y={y} size={24} fill="white" />
                ) : (
                  <text x={x} y={y + 6} textAnchor="middle" fontSize="14" fill="white" className="pointer-events-none select-none">
                    {getEquipmentTypeIcon(eq.equipment_type)}
                  </text>
                )}
                {eq.position && (
                  <text
                    x={x}
                    y={y + 35}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#6b7280"
                    className="pointer-events-none select-none"
                  >
                    {eq.position}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Панель редактирования выбранного элемента */}
      {editingElement && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">
              Редактирование: {editingElement.type === 'wall' ? 'Стена' : editingElement.type === 'column' ? 'Колонна' : 'Зона'}
            </h3>
            <button
              onClick={() => {
                deleteMapElement(editingElement.id)
                setEditingElement(null)
              }}
              className="text-red-600 hover:text-red-700 text-sm"
            >
              Удалить
            </button>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600">X (%)</label>
                <input
                  type="number"
                  value={editingElement.x.toFixed(1)}
                  onChange={(e) => {
                    const newX = parseFloat(e.target.value) || 0
                    setEditingElement({ ...editingElement, x: Math.max(0, Math.min(100, newX)) })
                    setMapElements(mapElements.map(el => 
                      el.id === editingElement.id ? { ...el, x: Math.max(0, Math.min(100, newX)) } : el
                    ))
                  }}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Y (%)</label>
                <input
                  type="number"
                  value={editingElement.y.toFixed(1)}
                  onChange={(e) => {
                    const newY = parseFloat(e.target.value) || 0
                    setEditingElement({ ...editingElement, y: Math.max(0, Math.min(100, newY)) })
                    setMapElements(mapElements.map(el => 
                      el.id === editingElement.id ? { ...el, y: Math.max(0, Math.min(100, newY)) } : el
                    ))
                  }}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                />
              </div>
            </div>
            {editingElement.type === 'zone' && (
              <div>
                <label className="text-xs text-gray-600">Название</label>
                <input
                  type="text"
                  value={editingElement.label || ''}
                  onChange={(e) => {
                    setEditingElement({ ...editingElement, label: e.target.value })
                    setMapElements(mapElements.map(el => 
                      el.id === editingElement.id ? { ...el, label: e.target.value } : el
                    ))
                  }}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Информация о выбранном оборудовании */}
      {selectedEquipment && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Оборудование</h3>
            <button
              onClick={() => setSelectedEquipment(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          <div className="space-y-2 text-sm">
            <div><span className="font-medium">Тип:</span> {selectedEquipment.equipment_type}</div>
            <div><span className="font-medium">Паспорт:</span> {selectedEquipment.passport_number}</div>
            {selectedEquipment.inventory_number && (
              <div><span className="font-medium">Инв. №:</span> {selectedEquipment.inventory_number}</div>
            )}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div>
                <label className="text-xs text-gray-600">X координата (%)</label>
                <input
                  type="number"
                  value={selectedEquipment.map_x?.toFixed(1) || ''}
                  onChange={async (e) => {
                    const newX = parseFloat(e.target.value) || 0
                    const updated = { ...selectedEquipment, map_x: Math.max(0, Math.min(100, newX)) }
                    setSelectedEquipment(updated)
                    setEquipment(equipment.map(eq => eq.id === updated.id ? updated : eq))
                    
                    try {
                      await axios.put(
                        `${API_URL}/api/equipment/${updated.id}`,
                        { map_x: updated.map_x, map_y: updated.map_y },
                        { headers: { Authorization: `Bearer ${token}` } }
                      )
                      addNotification('Координаты обновлены', 'success')
                    } catch (error) {
                      console.error('Ошибка сохранения:', error)
                    }
                  }}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Y координата (%)</label>
                <input
                  type="number"
                  value={selectedEquipment.map_y?.toFixed(1) || ''}
                  onChange={async (e) => {
                    const newY = parseFloat(e.target.value) || 0
                    const updated = { ...selectedEquipment, map_y: Math.max(0, Math.min(100, newY)) }
                    setSelectedEquipment(updated)
                    setEquipment(equipment.map(eq => eq.id === updated.id ? updated : eq))
                    
                    try {
                      await axios.put(
                        `${API_URL}/api/equipment/${updated.id}`,
                        { map_x: updated.map_x, map_y: updated.map_y },
                        { headers: { Authorization: `Bearer ${token}` } }
                      )
                      addNotification('Координаты обновлены', 'success')
                    } catch (error) {
                      console.error('Ошибка сохранения:', error)
                    }
                  }}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
