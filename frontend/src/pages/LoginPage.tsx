import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../api/client'
import { useAuthStore } from '../store'
import { isValidEmail } from '../utils/helpers'
import { FloatingLogos } from '../components/FloatingLogos'

export const LoginPage: React.FC = () => {
  const navigate = useNavigate()
  const setUser = useAuthStore((state) => state.setUser)
  const setLoading = useAuthStore((state) => state.setLoading)
  const isLoading = useAuthStore((state) => state.isLoading)

  const [isRegistering, setIsRegistering] = useState(false)
  const [formData, setFormData] = useState({ email: '', password: '', faculty: 'default' })
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    if (!isValidEmail(formData.email)) {
      setError('Invalid email format')
      return
    }

    if (formData.password.length < 1) {
      setError('Password is required')
      return
    }

    setLoading(true)
    try {
      if (isRegistering) {
        if (formData.password.length < 4) {
          setError('Password must be at least 4 characters')
          setLoading(false)
          return
        }
        const response = await authAPI.register(formData.email, formData.password, formData.faculty)
        if (response.data.success) {
          setSuccessMsg(response.data.message || 'Account created. An administrator must approve your account before you can log in.')
          setIsRegistering(false)
          setFormData({ email: '', password: '', faculty: 'default' })
        } else {
          setError(response.data.message || 'Registration failed')
        }
      } else {
        const response = await authAPI.login(formData.email, formData.password)
        if (response.data.success) {
          setUser(response.data.user)
          navigate('/')
        } else {
          setError(response.data.message || 'Login failed')
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">

      <FloatingLogos count={120} interactive={true} baseOpacity={0.8} />

      <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full opacity-[0.05]" style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)' }} />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full opacity-[0.04]" style={{ background: 'radial-gradient(circle, #06b6d4, transparent 70%)' }} />

      <div className="max-w-md w-full relative z-10">
        
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 shadow-lg shadow-indigo-500/20" style={{ background: 'linear-gradient(135deg, #1e3a5f, #21639f)' }}>
            <img src="/uvt.svg" alt="UVT" className="w-12 h-12 object-contain" />
          </div>
          <h1 className="text-4xl font-bold text-gradient mb-2 tracking-tight">
            ExamAnalyzer
          </h1>
          
        </div>

        <div className="card card-gradient">
          {error && (
            <div className="mb-6 status-error animate-scale-in">
              <p className="font-medium text-sm">{error}</p>
            </div>
          )}

          {successMsg && (
            <div className="mb-6 status-success animate-scale-in">
              <p className="font-medium text-sm">{successMsg}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                Email Address
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="input"
                placeholder="admin@examanalyzer.com"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="input"
                placeholder="••••••••"
                disabled={isLoading}
              />
            </div>

            {isRegistering && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                  Faculty
                </label>
                <select
                  name="faculty"
                  value={formData.faculty}
                  onChange={handleChange}
                  className="input"
                  disabled={isLoading}
                >
                  <option value="default">Select Faculty</option>
                  <option value="drept">Drept</option>
                  <option value="fsgc">FSGC</option>
                  <option value="fsas">FSAS</option>
                  <option value="fpse">FPSE</option>
                  <option value="finalizare">Finalizare</option>
                  <option value="sport">Sport</option>
                </select>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3 rounded-xl font-bold text-base transition-all duration-300 ${
                isLoading
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'btn-primary-pulse text-white'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25"></circle>
                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {isRegistering ? 'Creating account...' : 'Authenticating...'}
                </span>
              ) : (
                isRegistering ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          <div className="mt-5 text-center">
            <button
              onClick={() => { setIsRegistering(!isRegistering); setError(''); setSuccessMsg('') }}
              className="text-sm text-slate-400 hover:text-indigo-400 transition-colors"
              disabled={isLoading}
            >
              {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Register"}
            </button>
            {isRegistering && (
              <p className="text-xs text-slate-500 mt-2">
                After registration, an administrator will review and approve your account.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
