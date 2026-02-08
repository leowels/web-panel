'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
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
  pto_date: string | null
  cto_date: string | null
  installation_location: string | null
  status: string
  created_at: string
  updated_at: string
}

interface EquipmentCardProps {
  equipmentId: number
  onClose: () => void
  onEdit: () => void
}

export default function EquipmentCard({ equipmentId, onClose, onEdit }: EquipmentCardProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const router = useRouter()
  const [equipment, setEquipment] = useState<Equipment | null>(null)
  const [loading, setLoading] = useState(true)
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [related, setRelated] = useState({
    violations: [] as any[],
    inspections: [] as any[],
    acts: [] as any[],
    tasks: [] as any[],
    files: [] as any[],
  })

  useEffect(() => {
    fetchEquipment()
    fetchRelated()
  }, [equipmentId])

  const fetchEquipment = async () => {
    setLoading(true)
    try {
      const response = await axios.get(`${API_URL}/api/equipment/${equipmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setEquipment(response.data)
    } catch (error: any) {
      addNotification('Ошибка загрузки оборудования', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchRelated = async () => {
    if (!token) return
    setRelatedLoading(true)
    try {
      const params = { equipment_id: equipmentId, limit: 5 }
      const [violations, inspections, acts, tasks, files] = await Promise.all([
        axios.get(`${API_URL}/api/violations`, { params, headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/inspections`, { params, headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/acts`, { params, headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/tasks`, { params, headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/files`, { params, headers: { Authorization: `Bearer ${token}` } }),
      ])
      setRelated({
        violations: violations.data || [],
        inspections: inspections.data || [],
        acts: acts.data || [],
        tasks: tasks.data || [],
        files: files.data || [],
      })
    } catch (error: any) {
      addNotification('Ошибка загрузки связанных данных', 'error')
    } finally {
      setRelatedLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!equipment) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500">Оборудование не найдено</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Карточка оборудования</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-500">Номер паспорта</label>
          <p className="text-lg font-semibold text-gray-900">{equipment.passport_number}</p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-500">Тип ПС</label>
          <p className="text-gray-900">{equipment.equipment_type}</p>
        </div>

        {equipment.inventory_number && (
          <div>
            <label className="text-sm font-medium text-gray-500">Инвентарный номер</label>
            <p className="text-gray-900">{equipment.inventory_number}</p>
          </div>
        )}

        {equipment.position && (
          <div>
            <label className="text-sm font-medium text-gray-500">Позиция</label>
            <p className="text-gray-900">{equipment.position}</p>
          </div>
        )}

        {equipment.workshop && (
          <div>
            <label className="text-sm font-medium text-gray-500">Цех / подразделение</label>
            <p className="text-gray-900">{equipment.workshop}</p>
          </div>
        )}

        {equipment.load_capacity && (
          <div>
            <label className="text-sm font-medium text-gray-500">Грузоподъемность</label>
            <p className="text-gray-900">{equipment.load_capacity} С‚</p>
          </div>
        )}

        {equipment.manufacturer && (
          <div>
            <label className="text-sm font-medium text-gray-500">Завод-изготовитель</label>
            <p className="text-gray-900">{equipment.manufacturer}</p>
          </div>
        )}

        {equipment.installation_location && (
          <div>
            <label className="text-sm font-medium text-gray-500">Место установки</label>
            <p className="text-gray-900">{equipment.installation_location}</p>
          </div>
        )}

        {equipment.installation_date && (
          <div>
            <label className="text-sm font-medium text-gray-500">Дата ввода в эксплуатацию</label>
            <p className="text-gray-900">{format(new Date(equipment.installation_date), 'dd.MM.yyyy')}</p>
          </div>
        )}

        {equipment.pto_date && (
          <div>
            <label className="text-sm font-medium text-gray-500">Дата ПТО</label>
            <p className="text-gray-900">{format(new Date(equipment.pto_date), 'dd.MM.yyyy')}</p>
          </div>
        )}

        {equipment.cto_date && (
          <div>
            <label className="text-sm font-medium text-gray-500">Дата ЧТО</label>
            <p className="text-gray-900">{format(new Date(equipment.cto_date), 'dd.MM.yyyy')}</p>
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-gray-500">Статус</label>
          <p className="text-gray-900">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              equipment.status === 'active' ? 'bg-green-100 text-green-800' :
              equipment.status === 'inactive' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {equipment.status === 'active' ? 'Активно' :
               equipment.status === 'inactive' ? 'Неактивно' : 'Архив'}
            </span>
          </p>
        </div>

        <div className="pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Связанные данные</h3>
            <button
              onClick={() => {
                const params = new URLSearchParams()
                if (equipment.workshop) params.set('workshop', equipment.workshop)
                params.set('equipment_id', String(equipment.id))
                router.push(`/workshop-map?${params.toString()}`)
              }}
              className="text-xs font-semibold text-primary-600 hover:text-primary-700"
            >
              На карте
            </button>
          </div>
          {relatedLoading ? (
            <div className="text-sm text-gray-500">Загрузка...</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-800">Нарушения</span>
                  <button
                    onClick={() => router.push(`/violations?equipment_id=${equipment.id}`)}
                    className="text-xs text-primary-600 hover:underline"
                  >
                    Открыть
                  </button>
                </div>
                {related.violations.length > 0 ? (
                  <ul className="space-y-1">
                    {related.violations.slice(0, 3).map((v) => (
                      <li key={v.id} className="text-xs text-gray-700">
                        <div className="font-medium">{v.violation_type || 'Нарушение'}</div>
                        <div className="text-[11px] text-gray-500">
                          {(v.status || 'open')} • {v.created_at ? format(new Date(v.created_at), 'dd.MM.yyyy') : '—'}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-gray-500">Нет данных</div>
                )}
              </div>

              <div className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-800">Осмотры</span>
                  <button
                    onClick={() => router.push(`/inspections?equipment_id=${equipment.id}`)}
                    className="text-xs text-primary-600 hover:underline"
                  >
                    Открыть
                  </button>
                </div>
                {related.inspections.length > 0 ? (
                  <ul className="space-y-1">
                    {related.inspections.slice(0, 3).map((i) => (
                      <li key={i.id} className="text-xs text-gray-700">
                        <div className="font-medium">Осмотр #{i.id}</div>
                        <div className="text-[11px] text-gray-500">
                          {(i.status || 'in_progress')} • {i.created_at ? format(new Date(i.created_at), 'dd.MM.yyyy') : '—'}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-gray-500">Нет данных</div>
                )}
              </div>

              <div className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-800">Акты</span>
                  <button
                    onClick={() => router.push(`/acts?equipment_id=${equipment.id}`)}
                    className="text-xs text-primary-600 hover:underline"
                  >
                    Открыть
                  </button>
                </div>
                {related.acts.length > 0 ? (
                  <ul className="space-y-1">
                    {related.acts.slice(0, 3).map((a) => (
                      <li key={a.id} className="text-xs text-gray-700">
                        <div className="font-medium">{a.act_number || `Акт #${a.id}`}</div>
                        <div className="text-[11px] text-gray-500">
                          {(a.status || 'draft')} • {a.act_date ? format(new Date(a.act_date), 'dd.MM.yyyy') : '—'}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-gray-500">Нет данных</div>
                )}
              </div>

              <div className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-800">Задачи</span>
                  <button
                    onClick={() => router.push(`/equipment?task_equipment_id=${equipment.id}`)}
                    className="text-xs text-primary-600 hover:underline"
                  >
                    Создать
                  </button>
                </div>
                {related.tasks.length > 0 ? (
                  <ul className="space-y-1">
                    {related.tasks.slice(0, 3).map((t) => (
                      <li key={t.id} className="text-xs text-gray-700">
                        <div className="font-medium">{t.title}</div>
                        <div className="text-[11px] text-gray-500">
                          {(t.status || 'open')} • {t.due_date ? format(new Date(t.due_date), 'dd.MM.yyyy') : '—'}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-gray-500">Нет данных</div>
                )}
              </div>

              <div className="border border-gray-200 rounded-lg p-3 md:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-800">Файлы</span>
                </div>
                {related.files.length > 0 ? (
                  <ul className="space-y-1">
                    {related.files.slice(0, 3).map((f) => (
                      <li key={f.id} className="text-xs text-gray-700">
                        <div className="font-medium">{f.original_filename || f.filename}</div>
                        <div className="text-[11px] text-gray-500">
                          {f.created_at ? format(new Date(f.created_at), 'dd.MM.yyyy') : '—'} • {f.file_type || 'file'}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-gray-500">Нет данных</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={onEdit}
            className="w-full bg-primary-600 text-white py-2 px-4 rounded-lg hover:bg-primary-700"
          >
            Редактировать
          </button>
        </div>
      </div>
    </div>
  )
}

