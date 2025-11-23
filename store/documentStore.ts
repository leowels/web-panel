import { create } from 'zustand'
import axios from 'axios'
import { useAuthStore } from './authStore'

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

export interface Document {
  id: number
  title: string
  content: string | null
  category: string | null
  status: string
  user_id: number
  created_at: string
  updated_at: string
}

interface DocumentState {
  documents: Document[]
  loading: boolean
  error: string | null
  fetchDocuments: () => Promise<void>
  createDocument: (title: string, content?: string, category?: string) => Promise<Document>
  updateDocument: (id: number, updates: Partial<Document>) => Promise<void>
  deleteDocument: (id: number) => Promise<void>
  reorderDocuments: (startIndex: number, endIndex: number) => void
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  loading: false,
  error: null,

  fetchDocuments: async () => {
    set({ loading: true, error: null })
    try {
      const token = useAuthStore.getState().token
      const response = await axios.get(`${API_URL}/api/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      set({ documents: response.data, loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  createDocument: async (title: string, content?: string, category?: string) => {
    try {
      const token = useAuthStore.getState().token
      const response = await axios.post(
        `${API_URL}/api/documents`,
        { title, content, category },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const newDoc = response.data
      set((state) => ({ documents: [newDoc, ...state.documents] }))
      return newDoc
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Ошибка создания документа')
    }
  },

  updateDocument: async (id: number, updates: Partial<Document>) => {
    try {
      const token = useAuthStore.getState().token
      await axios.put(
        `${API_URL}/api/documents/${id}`,
        updates,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      set((state) => ({
        documents: state.documents.map((doc) =>
          doc.id === id ? { ...doc, ...updates } : doc
        ),
      }))
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Ошибка обновления документа')
    }
  },

  deleteDocument: async (id: number) => {
    try {
      const token = useAuthStore.getState().token
      await axios.delete(`${API_URL}/api/documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      set((state) => ({
        documents: state.documents.filter((doc) => doc.id !== id),
      }))
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Ошибка удаления документа')
    }
  },

  reorderDocuments: (startIndex: number, endIndex: number) => {
    const { documents } = get()
    const result = Array.from(documents)
    const [removed] = result.splice(startIndex, 1)
    result.splice(endIndex, 0, removed)
    set({ documents: result })
  },
}))

