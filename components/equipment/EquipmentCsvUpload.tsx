'use client'

import { useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

const API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || ''
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface EquipmentCsvUploadProps {
  onClose: () => void
  onSuccess: () => void
}

export default function EquipmentCsvUpload({ onClose, onSuccess }: EquipmentCsvUploadProps) {
  const { token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [importSummary, setImportSummary] = useState<{ created: number; skipped: number; errors: any[] } | null>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    setFile(selected || null)
  }

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token) {
      addNotification('Ошибка авторизации', 'error')
      return
    }
    if (!file) {
      addNotification('Выберите Excel или CSV файл', 'error')
      return
    }

    const formData = new FormData()
    formData.append('file', file)

    setLoading(true)
    setImportSummary(null)
    try {
      const response = await axios.post(
        `${API_URL}/api/equipment/bulk/upload?skip_duplicates=${skipDuplicates}`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
      setImportSummary(response.data)
      addNotification(`Импорт завершен: создано ${response.data.created}, пропущено ${response.data.skipped}`, 'success')
      onSuccess()
    } catch (error: any) {
      const detail = error.response?.data?.detail || error.message || 'Ошибка импорта'
      addNotification(typeof detail === 'string' ? detail : JSON.stringify(detail), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-strong max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200">
        <div className="p-6 border-b border-gray-300 bg-gradient-to-r from-gray-50 to-white flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Импорт оборудования из Excel/CSV</h2>
            <p className="text-sm text-gray-500 mt-1">
              Используйте шаблон, заполните данные в Excel и загрузите готовый файл
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

        <form onSubmit={handleUpload} className="p-6 space-y-5">
          <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-5">
            <p className="text-sm text-gray-600">
              1. Скачайте шаблон:{' '}
              <a
                href="/templates/equipment-import.csv"
                download
                className="text-primary-600 font-semibold hover:underline"
              >
                equipment-import.csv
              </a>
            </p>
            <p className="text-sm text-gray-600 mt-2">
              2. Заполните данные (формат даты: YYYY-MM-DD или DD.MM.YYYY)
            </p>
            <p className="text-xs text-gray-500 mt-1">
              • Файл использует разделитель «точка с запятой» ( ; ) — Excel откроет его как таблицу автоматически. <br />
              • Вторая строка содержит подсказки — её можно не трогать, система пропустит её при импорте.
            </p>
            <p className="text-sm text-gray-600 mt-2">3. Можно загрузить экспортированный Excel-файл оборудования без переименования колонок.</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Excel/CSV файл</label>
            <input
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileChange}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <p className="text-xs text-gray-500 mt-1">Поддерживаются XLSX из экспорта оборудования и CSV с русскими или техническими колонками.</p>
            {file && (
              <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
                <span>{file.name} • {(file.size / 1024).toFixed(1)} KB</span>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-accent-600 hover:text-accent-700"
                >
                  Очистить
                </button>
              </div>
            )}
          </div>

          <label className="inline-flex items-center space-x-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={skipDuplicates}
              onChange={(e) => setSkipDuplicates(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span>Пропускать записи с уже существующими паспортами/инвентарными номерами</span>
          </label>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={loading || !file}
              className="flex-1 bg-gradient-to-r from-primary-600 to-primary-700 text-white py-3 px-6 rounded-lg hover:from-primary-700 hover:to-primary-800 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-soft hover:shadow-medium transition-all duration-200"
            >
              {loading ? 'Импорт...' : 'Импортировать'}
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
