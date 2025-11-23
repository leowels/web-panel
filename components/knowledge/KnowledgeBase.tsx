'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'

// Используем относительный путь для прокси Next.js
const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? '' : 'http://localhost:8000')

interface KnowledgeItem {
  id: number
  document_type: string
  section: string | null
  clause_number: string | null
  title: string
  content: string
  tags: string[] | null
}

export default function KnowledgeBase() {
  const { token, user } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null)
  const [aiSearching, setAiSearching] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadForm, setUploadForm] = useState({
    file: null as File | null,
    document_type: 'fnp461',
    section: '',
    clause_number: '',
    title: '',
    tags: ''
  })

  useEffect(() => {
    fetchKnowledge()
  }, [typeFilter])

  const fetchKnowledge = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (typeFilter) params.append('document_type', typeFilter)
      if (search) params.append('search', search)
      
      const response = await axios.get(`${API_URL}/api/knowledge?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setItems(response.data)
    } catch (error: any) {
      addNotification(error.response?.data?.detail || 'Ошибка загрузки базы знаний', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleAISearch = async () => {
    if (!search.trim()) {
      addNotification('Введите запрос для поиска', 'error')
      return
    }

    setAiSearching(true)
    try {
      const response = await axios.post(
        `${API_URL}/api/knowledge/ai/search`,
        {
          query: search,
          document_type: typeFilter || undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setItems(response.data)
      addNotification('Поиск выполнен через ИИ', 'success')
    } catch (error: any) {
      addNotification('Ошибка ИИ поиска', 'error')
      fetchKnowledge()
    } finally {
      setAiSearching(false)
    }
  }

  const handleFileUpload = async () => {
    if (!uploadForm.file) {
      addNotification('Выберите файл для загрузки', 'error')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', uploadForm.file)
      formData.append('document_type', uploadForm.document_type)
      if (uploadForm.section) formData.append('section', uploadForm.section)
      if (uploadForm.clause_number) formData.append('clause_number', uploadForm.clause_number)
      if (uploadForm.title) formData.append('title', uploadForm.title)
      if (uploadForm.tags) formData.append('tags', uploadForm.tags)

      await axios.post(
        `${API_URL}/api/knowledge/upload`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      )

      addNotification('Документ успешно загружен и обработан', 'success')
      setShowUpload(false)
      setUploadForm({
        file: null,
        document_type: 'fnp461',
        section: '',
        clause_number: '',
        title: '',
        tags: ''
      })
      fetchKnowledge()
    } catch (error: any) {
      addNotification(
        error.response?.data?.detail || 'Ошибка загрузки документа',
        'error'
      )
    } finally {
      setUploading(false)
    }
  }

  const isAdmin = user?.roles?.some((r) => r.name === 'admin') || false

  return (
    <div className="space-y-6">
      {/* Кнопка загрузки для админа */}
      {isAdmin && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Загрузка документов</h2>
              <p className="text-sm text-gray-600 mt-1">Загрузите ГОСТы, ФНП 461 и другие документы (PDF/DOCX)</p>
            </div>
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg hover:from-primary-700 hover:to-primary-800 font-semibold shadow-soft hover:shadow-medium transition-all duration-200"
            >
              {showUpload ? 'Скрыть' : 'Загрузить документ'}
            </button>
          </div>

          {showUpload && (
            <div className="mt-6 space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Файл (PDF или DOCX)
                </label>
                <input
                  type="file"
                  accept=".pdf,.docx,.doc"
                  onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Тип документа
                  </label>
                  <select
                    value={uploadForm.document_type}
                    onChange={(e) => setUploadForm({ ...uploadForm, document_type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium"
                  >
                    <option value="fnp461">ФНП 461</option>
                    <option value="gost">ГОСТ</option>
                    <option value="manual">Методичка</option>
                    <option value="other">Другое</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Заголовок (опционально)
                  </label>
                  <input
                    type="text"
                    value={uploadForm.title}
                    onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                    placeholder="Автоматически из имени файла"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Раздел (опционально)
                  </label>
                  <input
                    type="text"
                    value={uploadForm.section}
                    onChange={(e) => setUploadForm({ ...uploadForm, section: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Номер пункта (опционально)
                  </label>
                  <input
                    type="text"
                    value={uploadForm.clause_number}
                    onChange={(e) => setUploadForm({ ...uploadForm, clause_number: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Теги (через запятую, опционально)
                </label>
                <input
                  type="text"
                  value={uploadForm.tags}
                  onChange={(e) => setUploadForm({ ...uploadForm, tags: e.target.value })}
                  placeholder="например: кран, безопасность, ПТО"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 font-medium"
                />
              </div>

              <button
                onClick={handleFileUpload}
                disabled={uploading || !uploadForm.file}
                className="w-full px-4 py-2.5 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg hover:from-primary-700 hover:to-primary-800 disabled:opacity-50 font-semibold shadow-soft hover:shadow-medium transition-all duration-200"
              >
                {uploading ? 'Загрузка и обработка...' : 'Загрузить и обработать документ'}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="space-y-4">
              <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Поиск</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && fetchKnowledge()}
                  placeholder="Введите запрос..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
                <button
                  onClick={handleAISearch}
                  disabled={aiSearching}
                  className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                  title="ИИ поиск"
                >
                  🤖
                </button>
                <button
                  onClick={fetchKnowledge}
                  className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  🔍
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Тип документа</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Все типы</option>
                <option value="fnp461">ФНП 461</option>
                <option value="gost">ГОСТ</option>
                <option value="manual">Методичка</option>
              </select>
              </div>
            </div>

            {loading ? (
            <div className="mt-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            </div>
          ) : (
            <div className="mt-6 space-y-2 max-h-96 overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedItem?.id === item.id ? 'bg-primary-50 border-2 border-primary-600' : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="text-sm font-medium text-gray-900">{item.title}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {item.document_type} {item.clause_number && `• ${item.clause_number}`}
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="text-center text-gray-500 py-4">
                  Документы не найдены
                </div>
              )}
            </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
        {selectedItem ? (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-gray-900">{selectedItem.title}</h2>
                <span className="px-2 py-1 text-xs bg-gray-100 rounded">
                  {selectedItem.document_type}
                </span>
              </div>
              {selectedItem.clause_number && (
                <p className="text-sm text-gray-600 mt-1">Пункт: {selectedItem.clause_number}</p>
              )}
            </div>
            <div className="prose max-w-none">
              <div className="whitespace-pre-wrap text-gray-700">{selectedItem.content}</div>
            </div>
            {selectedItem.tags && selectedItem.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedItem.tags.map((tag, index) => (
                  <span key={index} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            Выберите документ из списка
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

