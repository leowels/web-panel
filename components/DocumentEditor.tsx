'use client'

import { useEffect, useState } from 'react'
import { useDocumentStore, Document } from '@/store/documentStore'
import { useNotificationStore } from '@/store/notificationStore'
import AutocompleteInput from './AutocompleteInput'

interface DocumentEditorProps {
  docId: number
  onClose: () => void
}

export default function DocumentEditor({ docId, onClose }: DocumentEditorProps) {
  const { documents, updateDocument } = useDocumentStore()
  const { addNotification } = useNotificationStore()
  const doc = documents.find((d) => d.id === docId)
  
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('draft')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (doc) {
      setTitle(doc.title)
      setContent(doc.content || '')
      setCategory(doc.category || '')
      setStatus(doc.status)
    }
  }, [doc])

  const handleSave = async () => {
    if (!doc) return
    
    if (!title.trim()) {
      addNotification('Название документа обязательно', 'error')
      return
    }
    
    setSaving(true)
    try {
      await updateDocument(docId, { title, content, category, status })
      addNotification('Документ успешно сохранен', 'success')
    } catch (error: any) {
      addNotification(error.message || 'Ошибка сохранения', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!doc) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500">Документ не найден</p>
      </div>
    )
  }

  const categories = ['Отчет', 'Приказ', 'Распоряжение', 'Письмо', 'Протокол']

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Редактирование</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Название
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Категория
          </label>
          <AutocompleteInput
            value={category}
            onChange={setCategory}
            suggestions={categories}
            placeholder="Выберите категорию"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Статус
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="draft">Черновик</option>
            <option value="published">Опубликован</option>
            <option value="archived">Архив</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Содержание
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="Введите текст документа..."
          />
        </div>

        <div className="flex space-x-3 pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-primary-600 text-white py-2 px-4 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}

