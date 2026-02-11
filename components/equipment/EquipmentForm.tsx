'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { EQUIPMENT_TYPES } from '@/constants/equipmentTypes'

const API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || ''
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface EquipmentFormProps {
  equipmentId: number | null
  onClose: () => void
  onSuccess: () => void
}

interface EquipmentFormData {
  equipment_type: string
  passport_number: string
  inventory_number: string
  position: string
  workshop: string
  rostekhnadzor_registered: boolean
  load_capacity: string
  manufacturer: string
  installation_date: string
  pto_date: string
  cto_date: string
  expertise_date: string
  operation_permit_until: string
  operation_banned: boolean
  epb_positive_details: string
  installation_location: string
  status: string
}

const emptyForm: EquipmentFormData = {
  equipment_type: '',
  passport_number: '',
  inventory_number: '',
  position: '',
  workshop: '',
  rostekhnadzor_registered: false,
  load_capacity: '',
  manufacturer: '',
  installation_date: '',
  pto_date: '',
  cto_date: '',
  expertise_date: '',
  operation_permit_until: '',
  operation_banned: false,
  epb_positive_details: '',
  installation_location: '',
  status: 'active',
}

export default function EquipmentForm({ equipmentId, onClose, onSuccess }: EquipmentFormProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()

  const [loading, setLoading] = useState(false)
  const [equipmentTypes, setEquipmentTypes] = useState<string[]>(EQUIPMENT_TYPES as unknown as string[])
  const [formData, setFormData] = useState<EquipmentFormData>(emptyForm)

  useEffect(() => {
    fetchEquipmentTypes()
    if (equipmentId) {
      fetchEquipment()
    } else {
      setFormData(emptyForm)
    }
  }, [equipmentId, token])

  const fetchEquipmentTypes = async () => {
    try {
      if (!token) {
        setEquipmentTypes(EQUIPMENT_TYPES as unknown as string[])
        return
      }
      const response = await axios.get(`${API_URL}/api/equipment/types`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (Array.isArray(response.data) && response.data.length > 0) {
        setEquipmentTypes(response.data)
      } else {
        setEquipmentTypes(EQUIPMENT_TYPES as unknown as string[])
      }
    } catch {
      setEquipmentTypes(EQUIPMENT_TYPES as unknown as string[])
    }
  }

  const fetchEquipment = async () => {
    if (!token || !equipmentId) return

    try {
      const response = await axios.get(`${API_URL}/api/equipment/${equipmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      const eq = response.data
      setFormData({
        equipment_type: eq.equipment_type || '',
        passport_number: eq.passport_number || '',
        inventory_number: eq.inventory_number || '',
        position: eq.position || '',
        workshop: eq.workshop || '',
        rostekhnadzor_registered: Boolean(eq.rostekhnadzor_registered),
        load_capacity: eq.load_capacity ? String(eq.load_capacity) : '',
        manufacturer: eq.manufacturer || '',
        installation_date: eq.installation_date ? String(eq.installation_date).split('T')[0] : '',
        pto_date: eq.pto_date ? String(eq.pto_date).split('T')[0] : '',
        cto_date: eq.cto_date ? String(eq.cto_date).split('T')[0] : '',
        expertise_date: eq.expertise_date ? String(eq.expertise_date).split('T')[0] : '',
        operation_permit_until: eq.operation_permit_until ? String(eq.operation_permit_until).split('T')[0] : '',
        operation_banned: Boolean(eq.operation_banned),
        epb_positive_details: eq.epb_positive_details || '',
        installation_location: eq.installation_location || '',
        status: eq.status || 'active',
      })
    } catch {
      addNotification('Ошибка загрузки оборудования', 'error')
    }
  }

  const toIsoDate = (value: string): string | null => {
    if (!value) return null
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  }

  const toggleRostekhnadzor = (checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      rostekhnadzor_registered: checked,
      expertise_date: checked ? prev.expertise_date : '',
      operation_permit_until: checked ? prev.operation_permit_until : '',
      operation_banned: checked ? prev.operation_banned : false,
      epb_positive_details: checked ? prev.epb_positive_details : '',
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!token) {
      addNotification('Ошибка: пользователь не авторизован', 'error')
      return
    }

    setLoading(true)
    try {
      const payload: Record<string, unknown> = {
        equipment_type: formData.equipment_type,
        passport_number: formData.passport_number,
        inventory_number: formData.inventory_number || null,
        position: formData.position || null,
        workshop: formData.workshop || null,
        rostekhnadzor_registered: Boolean(formData.rostekhnadzor_registered),
        load_capacity: formData.load_capacity ? parseFloat(formData.load_capacity) : null,
        manufacturer: formData.manufacturer || null,
        installation_date: toIsoDate(formData.installation_date),
        pto_date: toIsoDate(formData.pto_date),
        cto_date: toIsoDate(formData.cto_date),
        expertise_date: formData.rostekhnadzor_registered ? toIsoDate(formData.expertise_date) : null,
        operation_permit_until: formData.rostekhnadzor_registered ? toIsoDate(formData.operation_permit_until) : null,
        operation_banned: formData.rostekhnadzor_registered ? Boolean(formData.operation_banned) : false,
        epb_positive_details: formData.rostekhnadzor_registered ? formData.epb_positive_details || null : null,
        installation_location: formData.installation_location || null,
      }

      if (equipmentId) {
        payload.status = formData.status
        await axios.put(`${API_URL}/api/equipment/${equipmentId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        })
        addNotification('Оборудование успешно обновлено', 'success')
      } else {
        await axios.post(`${API_URL}/api/equipment`, payload, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        })
        addNotification('Оборудование успешно добавлено', 'success')
      }

      onSuccess()
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      const msg =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((x: any) => (x?.msg ? x.msg : String(x))).join(', ')
            : error?.message || 'Ошибка сохранения'
      addNotification(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white p-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {equipmentId ? 'Редактирование оборудования' : 'Добавление оборудования'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">Заполните карточку крана / ПС</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Закрыть"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">
                Тип ПС <span className="text-rose-600">*</span>
              </label>
              <select
                required
                value={formData.equipment_type}
                onChange={(e) => setFormData({ ...formData, equipment_type: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-primary-600 focus:ring-2 focus:ring-primary-600"
              >
                <option value="">Выберите тип</option>
                {equipmentTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">
                Номер паспорта <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.passport_number}
                onChange={(e) => setFormData({ ...formData, passport_number: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-primary-600 focus:ring-2 focus:ring-primary-600"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Инвентарный номер</label>
              <input
                type="text"
                value={formData.inventory_number}
                onChange={(e) => setFormData({ ...formData, inventory_number: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-primary-600 focus:ring-2 focus:ring-primary-600"
                placeholder="Например: КБ-00123"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Позиция</label>
              <input
                type="text"
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-primary-600 focus:ring-2 focus:ring-primary-600"
                placeholder="Например: КБ-12/1"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Грузоподъемность (т)</label>
              <input
                type="number"
                step="0.01"
                value={formData.load_capacity}
                onChange={(e) => setFormData({ ...formData, load_capacity: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-primary-600 focus:ring-2 focus:ring-primary-600"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Завод-изготовитель</label>
              <input
                type="text"
                value={formData.manufacturer}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-primary-600 focus:ring-2 focus:ring-primary-600"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Цех / подразделение</label>
              <input
                type="text"
                value={formData.workshop}
                onChange={(e) => setFormData({ ...formData, workshop: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-primary-600 focus:ring-2 focus:ring-primary-600"
                placeholder="Например: Цех №5"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Регистрация в Ростехнадзоре</label>
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                <input
                  type="checkbox"
                  checked={formData.rostekhnadzor_registered}
                  onChange={(e) => toggleRostekhnadzor(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-slate-800">Зарегистрирован</span>
              </label>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Дата ввода в эксплуатацию</label>
              <input
                type="date"
                value={formData.installation_date}
                onChange={(e) => setFormData({ ...formData, installation_date: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-primary-600 focus:ring-2 focus:ring-primary-600"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Дата ПТО</label>
              <input
                type="date"
                value={formData.pto_date}
                onChange={(e) => setFormData({ ...formData, pto_date: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-primary-600 focus:ring-2 focus:ring-primary-600"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Дата ЧТО</label>
              <input
                type="date"
                value={formData.cto_date}
                onChange={(e) => setFormData({ ...formData, cto_date: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-primary-600 focus:ring-2 focus:ring-primary-600"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Статус</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-primary-600 focus:ring-2 focus:ring-primary-600"
              >
                <option value="active">Активно</option>
                <option value="inactive">Неактивно</option>
                <option value="archived">Архив</option>
              </select>
            </div>
          </div>

          {formData.rostekhnadzor_registered && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-4 text-sm font-semibold text-slate-900">Данные экспертизы / ЭПБ</p>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-900">Дата проведения экспертизы</label>
                  <input
                    type="date"
                    value={formData.expertise_date}
                    onChange={(e) => setFormData({ ...formData, expertise_date: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-primary-600 focus:ring-2 focus:ring-primary-600"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-900">Разрешенный срок эксплуатации</label>
                  <input
                    type="date"
                    value={formData.operation_permit_until}
                    onChange={(e) => setFormData({ ...formData, operation_permit_until: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-primary-600 focus:ring-2 focus:ring-primary-600"
                  />
                  <label className="mt-2 inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={formData.operation_banned}
                      onChange={(e) => setFormData({ ...formData, operation_banned: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-sm font-semibold text-rose-700">Запрет на эксплуатацию</span>
                  </label>
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-sm font-semibold text-slate-900">Реквизиты положительных ЭПБ</label>
                <textarea
                  value={formData.epb_positive_details}
                  onChange={(e) => setFormData({ ...formData, epb_positive_details: e.target.value })}
                  className="min-h-[96px] w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-primary-600 focus:ring-2 focus:ring-primary-600"
                  placeholder="Номер, дата, организация, основание и другие реквизиты"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-900">Место установки</label>
            <input
              type="text"
              value={formData.installation_location}
              onChange={(e) => setFormData({ ...formData, installation_location: e.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-primary-600 focus:ring-2 focus:ring-primary-600"
              placeholder="Адрес или место установки"
            />
          </div>

          <div className="flex space-x-3 border-t border-slate-200 pt-6">
            <button
              type="submit"
              disabled={loading}
              className="flex flex-1 items-center justify-center rounded-lg bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-3 font-semibold text-white hover:from-primary-700 hover:to-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-6 py-3 font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
