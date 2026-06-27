import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom'
import { useAuthStore } from './store'
import { authAPI } from './api/client'
import { isGlobalAdmin } from './utils/permissions'
import { useThemeStore } from './store'
import { LoginPage } from './pages/LoginPage'
import { Chatbot } from './components/Chatbot'
import { DashboardPage } from './pages/DashboardPage'
import { BatchProcessingPage } from './pages/BatchProcessingPage'
import { SettingsPage } from './pages/SettingsPage'
import { SingleUploadPage } from './pages/SingleUploadPage'
import './styles/index.css'

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

const Navigation: React.FC = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const clearUser = useAuthStore((state) => state.clearUser)
  const { theme, toggleTheme } = useThemeStore()

  if (!isAuthenticated) {
    return null
  }

  const handleLogout = () => {
    clearUser()
  }

  const navLinkStyle = {
    padding: '6px 14px',
    borderRadius: '20px',
    fontSize: '0.84rem',
    fontWeight: 500,
    letterSpacing: '-0.01em',
    transition: 'background 0.2s ease, color 0.2s ease',
    color: theme === 'light' ? 'rgba(29,29,31,0.65)' : 'rgba(245,245,247,0.65)',
  }

  return (
    <nav>
      <div className="container flex items-center justify-between" style={{ height: 52 }}>
        
        <Link to="/" style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.03em' }} className="text-gradient hover:opacity-80 transition-opacity">
          ExamAnalyzer
        </Link>

        <div className="flex items-center gap-0.5" style={{
          background: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
          borderRadius: 24,
          padding: '3px',
          border: theme === 'light' ? '1px solid rgba(0,0,0,0.07)' : '1px solid rgba(255,255,255,0.08)',
        }}>
          <Link to="/" style={navLinkStyle}
            className="hover:bg-white/10 hover:text-white transition-all"
          >Dashboard</Link>
          <Link to="/batch" style={navLinkStyle}
            className="hover:bg-white/10 hover:text-white transition-all"
          >Batch</Link>
          {isGlobalAdmin(user) && (
            <Link to="/settings" style={navLinkStyle}
              className="hover:bg-white/10 hover:text-white transition-all"
            >Settings</Link>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            style={{
              width: 32, height: 32,
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)',
              border: theme === 'light' ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.09)',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
              color: theme === 'light' ? '#424245' : 'rgba(245,245,247,0.7)',
            }}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          <span style={{
            fontSize: '0.76rem',
            fontWeight: 500,
            color: theme === 'light' ? '#6e6e73' : 'rgba(245,245,247,0.4)',
            maxWidth: 140,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{user?.email}</span>

          <button
            onClick={handleLogout}
            style={{
              padding: '5px 14px',
              borderRadius: 20,
              fontSize: '0.78rem',
              fontWeight: 500,
              background: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)',
              border: theme === 'light' ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.09)',
              color: theme === 'light' ? '#424245' : 'rgba(245,245,247,0.6)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const setUser = useAuthStore((state) => state.setUser)
  const theme = useThemeStore((state) => state.theme)

  useEffect(() => {
    if (!isAuthenticated) {
      authAPI.getCurrentUser()
        .then((res) => {
          if (res.data?.success && res.data?.user) {
            setUser(res.data.user)
          }
        })
        .catch(() => {})
    }
  }, [])

  return (
    <Router>
      <div className={`flex flex-col min-h-screen relative overflow-hidden ${theme === 'light' ? 'bg-[#f5f5f7] text-[#1d1d1f]' : 'bg-black'}`}>

        {isAuthenticated && <Navigation />}
        <main className="flex-1 relative z-10">
          {isAuthenticated ? (
            <div className="container py-8">
              <Routes>
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/batch"
                  element={
                    <ProtectedRoute>
                      <BatchProcessingPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/upload"
                  element={
                    <ProtectedRoute>
                      <SingleUploadPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="/login" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          ) : (
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          )}
        </main>
      </div>
      <Chatbot />
    </Router>
  )
}

export default App
