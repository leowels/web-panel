'use client'

import { useEffect, useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd'
import { useDocumentStore, Document } from '@/store/documentStore'
import { useNotificationStore } from '@/store/notificationStore'
import { format, parseISO } from 'date-fns'

interface DocumentListProps {
  onSelectDoc: (id: number | null) => void
  selectedDoc: number | null
}

export default function DocumentList({ onSelectDoc, selectedDoc }: DocumentListProps) {
  const { documents, loading, fetchDocuments, reorderDocuments, deleteDocument, createDocument } = useDocumentStore()
  const { addNotification } = useNotificationStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    fetchDocuments()
  }, [fetchDocuments])

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return
    reorderDocuments(result.source.index, result.destination.index)
  }

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch = doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.content?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-green-100 text-green-800'
      case 'draft':
        return 'bg-yellow-100 text-yellow-800'
      case 'archived':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-blue-100 text-blue-800'
    }
  }

  if (!isMounted) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Список документов</h2>
          <button
            onClick={async () => {
              try {
                const newDoc = await createDocument('Новый документ', '', undefined)
                onSelectDoc(newDoc.id)
                addNotification('Документ успешно создан', 'success')
              } catch (error: any) {
                addNotification(error.message || 'Ошибка создания документа', 'error')
              }
            }}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Создать
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Поиск документов..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <svg
              className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="all">Все статусы</option>
            <option value="draft">Черновики</option>
            <option value="published">Опубликованные</option>
            <option value="archived">Архив</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="documents">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="divide-y divide-gray-200">
                {filteredDocs.map((doc, index) => (
                  <Draggable key={doc.id} draggableId={doc.id.toString()} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                          selectedDoc === doc.id ? 'bg-primary-50 border-l-4 border-primary-600' : ''
                        } ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                        onClick={() => onSelectDoc(doc.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <div {...provided.dragHandleProps} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                                </svg>
                              </div>
                              <h3 className="text-lg font-medium text-gray-900">{doc.title}</h3>
                            </div>
                            {doc.content && (
                              <p className="mt-1 text-sm text-gray-600 line-clamp-2">{doc.content}</p>
                            )}
                            <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                              <span>{format(parseISO(doc.updated_at), 'dd MMM yyyy')}</span>
                              {doc.category && <span className="text-primary-600">#{doc.category}</span>}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 ml-4">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(doc.status)}`}>
                              {doc.status === 'published' ? 'Опубликован' : doc.status === 'draft' ? 'Черновик' : 'Архив'}
                            </span>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation()
                                if (confirm('Удалить документ?')) {
                                  try {
                                    await deleteDocument(doc.id)
                                    addNotification('Документ успешно удален', 'success')
                                    if (selectedDoc === doc.id) {
                                      onSelectDoc(null)
                                    }
                                  } catch (error: any) {
                                    addNotification(error.message || 'Ошибка удаления документа', 'error')
                                  }
                                }
                              }}
                              className="text-red-600 hover:text-red-800"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {filteredDocs.length === 0 && !loading && (
        <div className="p-6 text-center text-gray-500">
          {searchTerm ? 'Документы не найдены' : 'Нет документов. Создайте первый документ.'}
        </div>
      )}
    </div>
  )
}
