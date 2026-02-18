import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import axios from 'axios'

const API_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || '')
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

interface Role {
  id: number
  name: string
}

interface User {
  id: number
  username: string
  email: string
  full_name: string | null
  organization?: string | null
  is_active?: boolean
  roles?: Role[]
}

interface AuthState {
  user: User | null
  token: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string, fullName?: string) => Promise<void>
  logout: () => void
  fetchUser: () => Promise<void>
  refreshAccessToken: () => Promise<string>
}

const parseApiError = (error: any, fallback: string) => {
  const data = error?.response?.data
  return data?.error?.message || data?.detail || fallback
}

const storage = typeof window !== 'undefined'
  ? createJSONStorage(() => localStorage)
  : {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    }

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,

      login: async (username: string, password: string) => {
        try {
          const response = await axios.post(`${API_URL}/api/auth/login`, {
            username,
            password,
          }, { withCredentials: true })
          const { access_token, refresh_token } = response.data
          set({ token: access_token, refreshToken: refresh_token, isAuthenticated: true })

          const userResponse = await axios.get(`${API_URL}/api/users/me`, {
            headers: { Authorization: `Bearer ${access_token}` },
          })
          set({ user: userResponse.data })
        } catch (error: any) {
          throw new Error(parseApiError(error, 'Ошибка входа'))
        }
      },

      register: async (_username: string, _email: string, _password: string, _fullName?: string) => {
        throw new Error('Регистрация отключена. Пользователи создаются администратором.')
      },

      logout: () => {
        const { refreshToken } = get()
        // Сначала чистим состояние, чтобы избежать гонок с интерсепторами и редирект-циклов
        set({ user: null, token: null, refreshToken: null, isAuthenticated: false })

        // Выходим на сервере через fetch (без axios-интерсепторов с refresh-логикой)
        if (typeof window !== 'undefined') {
          fetch(`${API_URL}/api/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
          }).catch(() => {})
        }
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get()
        if (!refreshToken) throw new Error('No refresh token')

        const response = await axios.post(
          `${API_URL}/api/auth/refresh`,
          { refresh_token: refreshToken },
          { withCredentials: true }
        )
        const { access_token, refresh_token } = response.data
        set({
          token: access_token,
          refreshToken: refresh_token,
          isAuthenticated: true,
        })
        return access_token
      },

      fetchUser: async () => {
        const { token } = get()
        if (!token) return

        try {
          const response = await axios.get(`${API_URL}/api/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          set({ user: response.data })
        } catch (error: any) {
          if (error?.response?.status === 401 && get().refreshToken) {
            try {
              const newToken = await get().refreshAccessToken()
              const retryResponse = await axios.get(`${API_URL}/api/users/me`, {
                headers: { Authorization: `Bearer ${newToken}` },
              })
              set({ user: retryResponse.data })
              return
            } catch {
            }
          }
          get().logout()
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: storage as any,
      partialize: (state) => ({ token: state.token, refreshToken: state.refreshToken, isAuthenticated: state.isAuthenticated }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (!state.token && !state.refreshToken) {
          state.user = null
          state.isAuthenticated = false
          return
        }
        state.isAuthenticated = Boolean(state.token || state.refreshToken)
      },
    }
  )
)

let refreshPromise: Promise<string> | null = null
let interceptorsInstalled = false

if (typeof window !== 'undefined' && !interceptorsInstalled) {
  interceptorsInstalled = true
  axios.defaults.withCredentials = true
  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const status = error?.response?.status
      const original = error?.config || {}
      const url: string = original?.url || ''
      const isAuthRoute = url.includes('/api/auth/login') || url.includes('/api/auth/refresh') || url.includes('/api/auth/logout')

      if (status !== 401 || original._retry || isAuthRoute) {
        throw error
      }

      const auth = useAuthStore.getState()
      if (!auth.refreshToken) {
        auth.logout()
        throw error
      }

      original._retry = true

      try {
        if (!refreshPromise) {
          refreshPromise = auth.refreshAccessToken().finally(() => {
            refreshPromise = null
          })
        }
        const newToken = await refreshPromise
        original.headers = original.headers || {}
        original.headers.Authorization = `Bearer ${newToken}`
        return axios(original)
      } catch {
        useAuthStore.getState().logout()
        throw error
      }
    }
  )
}
