import { create } from 'zustand'

export interface AISelection {
  type: string
  id: string | number
  label?: string
}

export interface AIContextState {
  page: {
    path: string
    query: Record<string, string>
  }
  filters: Record<string, any>
  selection: AISelection | null
  setPage: (path: string, query: Record<string, string>) => void
  setFilters: (filters: Record<string, any>) => void
  setSelection: (selection: AISelection | null) => void
  clearSelection: () => void
}

export const useAIContextStore = create<AIContextState>((set) => ({
  page: { path: '', query: {} },
  filters: {},
  selection: null,
  setPage: (path, query) => set({ page: { path, query } }),
  setFilters: (filters) => set({ filters }),
  setSelection: (selection) => set({ selection }),
  clearSelection: () => set({ selection: null }),
}))
