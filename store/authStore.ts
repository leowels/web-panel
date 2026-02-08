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
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string, fullName?: string) => Promise<void>
  logout: () => void
  fetchUser: () => Promise<void>
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
      isAuthenticated: false,

      login: async (username: string, password: string) => {
        try {
          const response = await axios.post(`${API_URL}/api/auth/login`, {
            username,
            password,
          })
          const { access_token } = response.data
          set({ token: access_token, isAuthenticated: true })

          const userResponse = await axios.get(`${API_URL}/api/users/me`, {
            headers: { Authorization: `Bearer ${access_token}` },
          })
          set({ user: userResponse.data })
        } catch (error: any) {
          throw new Error(error.response?.data?.detail || 'Ошибка входа')
        }
      },

      register: async (_username: string, _email: string, _password: string, _fullName?: string) => {
        throw new Error('Регистрация отключена. Пользователи создаются администратором.')
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false })
      },

      fetchUser: async () => {
        const { token } = get()
        if (!token) return

        try {
          const response = await axios.get(`${API_URL}/api/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          set({ user: response.data })
        } catch (error) {
          get().logout()
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: storage as any,
      partialize: (state) => ({ token: state.token, isAuthenticated: state.isAuthenticated }),
    }
  )
)
