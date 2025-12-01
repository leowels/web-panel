'use client'

import { useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

const API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || ''
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface EquipmentOcrImportProps {
  onClose: () => void
  onSuccess: () => void
}

export default function EquipmentOcrImport({ onClose, onSuccess }: EquipmentOcrImportProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [importSummary, setImportSummary] = useState<{ created: number; skipped: number; errors: any[] } | null>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    setFile(selected || null)
  }

  const handleImport = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token) {
      addNotification('Ошибка авторизации', 'error')
      return
    }
    if (!file) {
      addNotification('Выберите фото или файл с таблицей', 'error')
      return
    }

    setLoading(true)
    setImportSummary(null)

    try {
      // 1. Загружаем файл в файловый сервис
      const formData = new FormData()
      formData.append('file', file)

      const uploadResp = await axios.post(`${API_URL}/api/files/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const fileId = uploadResp.data.id
      if (!fileId) {
        throw new Error('Не удалось получить ID загруженного файла')
      }

      // 2. Запускаем OCR-импорт оборудования
      const ocrResp = await axios.post(
        `${API_URL}/api/equipment/ocr-import`,
        { file_id: fileId },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      setImportSummary(ocrResp.data)
      addNotification(
        `Импорт с фото завершён: создано ${ocrResp.data.created}, пропущено ${ocrResp.data.skipped}`,
        'success'
      )
      onSuccess()
    } catch (error: any) {
      const detail = error.response?.data?.detail || error.message || 'Ошибка OCR-импорта'
      addNotification(typeof detail === 'string' ? detail : JSON.stringify(detail), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-strong max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200">
        <div className="p-6 border-b border-gray-300 bg-gradient-to-r from-purple-50 to-white flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Импорт оборудования с фото</h2>
            <p className="text-sm text-gray-500 mt-1">
              Загрузите фотографию бумажной таблицы с перечнем ПС — система распознает текст и создаст записи
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleImport} className="p-6 space-y-5">
          <div className="bg-purple-50 border border-dashed border-purple-200 rounded-xl p-5">
            <p className="text-sm text-gray-700 font-medium">
              Как подготовить фото для лучшего распознавания:
            </p>
            <ul className="mt-2 text-xs text-gray-600 list-disc list-inside space-y-1">
              <li>Сделайте фото таблицы ровно сверху, без сильной перспективы.</li>
              <li>Убедитесь, что текст читаемый, без бликов и размытия.</li>
              <li>Желательно, чтобы в первой строке были заголовки колонок: equipment_type, passport_number и т.д.</li>
            </ul>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Файл с таблицей</label>
            <input
              type="file"
              accept="image/*,.csv,.txt"
              onChange={handleFileChange}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Поддерживаются фотографии (JPG, PNG и др.) и файлы CSV/текста с таблицей.
            </p>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={loading || !file}
              className="flex-1 bg-gradient-to-r from-purple-600 to-purple-700 text-white py-3 px-6 rounded-lg hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-soft hover:shadow-medium transition-all duration-200"
            >
              {loading ? 'Распознаём и импортируем...' : 'Распознать и импортировать'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 font-semibold transition-all duration-200"
            >
              Отмена
            </button>
          </div>

          {importSummary && (
            <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 space-y-2">
              <p className="font-semibold text-gray-900">Результаты импорта:</p>
              <p>Создано записей: {importSummary.created}</p>
              <p>Пропущено (дубликаты + ошибки): {importSummary.skipped}</p>
              {importSummary.errors?.length > 0 && (
                <div className="max-h-40 overflow-y-auto mt-2 space-y-1">
                  {importSummary.errors.map((error, idx) => (
                    <div key={idx} className="text-xs text-gray-600 bg-white border border-gray-200 rounded p-2">
                      <pre className="whitespace-pre-wrap break-words">
                        {JSON.stringify(error, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}


