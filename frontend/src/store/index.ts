import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
  email: string
  role: 'admin' | 'user' | 'teacher'
  faculty: string | null
  is_global_admin?: boolean
  is_faculty_admin?: boolean
  can_manage_users?: boolean
  can_manage_answer_keys?: boolean
  can_correct?: boolean
}

export interface ClipboardStore {
  user: User | null
  isAuthenticated: boolean
  setUser: (user: User) => void
  clearUser: () => void
  isLoading: boolean
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<ClipboardStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setUser: (user: User) =>
        set({ user, isAuthenticated: true }),
      clearUser: () =>
        set({ user: null, isAuthenticated: false }),
      isLoading: false,
      setLoading: (loading: boolean) =>
        set({ isLoading: loading }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
)

export interface ExamStore {
  selectedAnswerKey: string | null
  processedResults: any[]
  setSelectedAnswerKey: (key: string) => void
  addResult: (result: any) => void
  clearResults: () => void
}

export const useExamStore = create<ExamStore>((set) => ({
  selectedAnswerKey: null,
  processedResults: [],
  setSelectedAnswerKey: (key: string) =>
    set({ selectedAnswerKey: key }),
  addResult: (result: any) =>
    set((state) => ({
      processedResults: [...state.processedResults, result],
    })),
  clearResults: () =>
    set({ processedResults: [] }),
}))

export interface ThemeStore {
  theme: 'dark' | 'light'
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'dark' as const,
      toggleTheme: () =>
        set((state) => {
          const next = state.theme === 'dark' ? 'light' : 'dark'
          document.documentElement.setAttribute('data-theme', next)
          return { theme: next }
        }),
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.setAttribute('data-theme', state.theme)
        }
      },
    }
  )
)
