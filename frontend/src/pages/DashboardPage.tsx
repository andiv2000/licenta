import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store'
import { StatsModal } from '../components/StatsModal'
import { AnswerKeysModal } from '../components/AnswerKeysModal'
import { examAPI } from '../api/client'
import { isGlobalAdmin, isFacultyAdmin, canManageAnswerKeys } from '../utils/permissions'

interface DashboardStats {
  total: number
  average: number
  pass_rate: number
}

function useCountUp(target: number, duration = 1200, active = true) {
  const [value, setValue] = useState(0)
  const rafRef = useRef(0)
  useEffect(() => {
    if (!active || target <= 0) { setValue(target); return }
    let start: number | null = null
    const step = (ts: number) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) 
      setValue(Math.round(eased * target * 100) / 100)
      if (progress < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration, active])
  return value
}

function useLiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

const WEEKDAYS_RO = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă']
const MONTHS_RO = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie']

function formatRoDate(d: Date) {
  return `${WEEKDAYS_RO[d.getDay()]}, ${d.getDate()} ${MONTHS_RO[d.getMonth()]} ${d.getFullYear()}`
}
function formatTime(d: Date) {
  return d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const Sparkline: React.FC<{ color?: string }> = ({ color = '#818cf8' }) => {
  const points = useRef(Array.from({ length: 20 }, () => 10 + Math.random() * 30)).current
  const max = Math.max(...points)
  const h = 32, w = 120
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i / (points.length - 1)) * w},${h - (p / max) * (h - 4)}`).join(' ')
  return (
    <svg width={w} height={h} className="opacity-60">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="url(#sparkGrad)" />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [statsOpen, setStatsOpen] = useState(false)
  const [baremeOpen, setBaremeOpen] = useState(false)
  const [dashStats, setDashStats] = useState<DashboardStats | null>(null)
  const [dashLoading, setDashLoading] = useState(true)
  const now = useLiveClock()

  useEffect(() => {
    if (!isAuthenticated) navigate('/login')
  }, [isAuthenticated, navigate])

  const globalAdmin = isGlobalAdmin(user)
  const facultyAdmin = isFacultyAdmin(user)
  const manageBareme = canManageAnswerKeys(user)
  const [facultyLabel, setFacultyLabel] = useState<string>('toate facultățile')

  useEffect(() => {
    if (!isAuthenticated || (!globalAdmin && !facultyAdmin)) return
    examAPI.getDashboardStats()
      .then(resp => {
        if (resp.data.success && resp.data.total > 0) {
          setDashStats({
            total: resp.data.total,
            average: resp.data.stats.average,
            pass_rate: resp.data.stats.pass_rate,
          })
          setFacultyLabel(resp.data.faculty_label || 'toate facultățile')
        } else {
          setDashStats({ total: 0, average: 0, pass_rate: 0 })
          setFacultyLabel(resp.data.faculty_label || 'toate facultățile')
        }
      })
      .catch(() => setDashStats(null))
      .finally(() => setDashLoading(false))
  }, [isAuthenticated, globalAdmin, facultyAdmin])

  const animTotal = useCountUp(dashStats?.total ?? 0, 1400, !dashLoading)
  const animAvg = useCountUp(dashStats?.average ?? 0, 1200, !dashLoading)
  const animRate = useCountUp(dashStats?.pass_rate ?? 0, 1000, !dashLoading)

  if (!isAuthenticated) return null

  return (
    <div className="space-y-6 pb-8">

      <div className="hero-gradient rounded-2xl p-8 relative overflow-hidden animate-float-up">
        
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)', animation: 'pulse-ring 4s ease-in-out infinite' }} />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #06b6d4, transparent 70%)', animation: 'pulse-ring 5s ease-in-out 1s infinite' }} />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-sm text-indigo-300/70 font-medium mb-1">{formatRoDate(now)}</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-1">
              <span className="text-gradient">Bine ai revenit</span>
            </h1>
            <p className="text-slate-400 text-sm">
              {user?.email}
              {globalAdmin && <span className="ml-2 px-2 py-0.5 text-[10px] rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider font-bold">Admin</span>}
              {facultyAdmin && <span className="ml-2 px-2 py-0.5 text-[10px] rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 uppercase tracking-wider font-bold">{user?.faculty?.toUpperCase()} Admin</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Sparkline />
            <div className="text-right">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Ora</p>
              <p className="text-lg font-mono font-bold text-slate-200 tabular-nums">{formatTime(now)}</p>
            </div>
          </div>
        </div>
      </div>

      {(globalAdmin || facultyAdmin) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          
          <div className="glass-stat rounded-2xl p-5 animate-float-up dash-card-lift" style={{ animationDelay: '0.08s' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold">Total Procesate</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.12)' }}>
                <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
            </div>
            {dashLoading ? (
              <div className="h-10 w-24 bg-slate-700/40 rounded-lg animate-pulse" />
            ) : (
              <p className="text-4xl font-extrabold text-slate-50 tracking-tight tabular-nums">
                {Math.round(animTotal).toLocaleString()}
              </p>
            )}
            <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400" />
              {facultyLabel}
            </p>
          </div>

          <div className="glass-stat rounded-2xl p-5 animate-float-up dash-card-lift" style={{ animationDelay: '0.16s' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold">Medie Generală</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.12)' }}>
                <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              </div>
            </div>
            {dashLoading ? (
              <div className="h-10 w-16 bg-slate-700/40 rounded-lg animate-pulse" />
            ) : (
              <div className="flex items-baseline gap-2">
                <p className="text-4xl font-extrabold text-slate-50 tracking-tight tabular-nums">
                  {animAvg.toFixed(2)}
                </p>
                <span className="text-sm text-slate-500 font-medium">/ 10</span>
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400" />
              media notelor
            </p>
          </div>

          <div className="glass-stat rounded-2xl p-5 animate-float-up dash-card-lift" style={{ animationDelay: '0.24s' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold">Promovabilitate</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.12)' }}>
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
            </div>
            {dashLoading ? (
              <div className="h-10 w-16 bg-slate-700/40 rounded-lg animate-pulse" />
            ) : (
              <div className="flex items-baseline gap-1">
                <p className="text-4xl font-extrabold tracking-tight tabular-nums" style={{ color: (dashStats?.pass_rate ?? 0) >= 50 ? '#4ade80' : '#f87171' }}>
                  {animRate.toFixed(1)}%
                </p>
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
              nota ≥ 5
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

        <div
          className="group md:col-span-2 rounded-2xl p-6 cursor-pointer relative overflow-hidden dash-card-lift animate-float-up glass-stat"
          style={{ animationDelay: '0.1s' }}
          onClick={() => navigate('/batch')}
        >
          <div className="shimmer-on-hover absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.07) 50%, transparent 100%)' }} />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 8px 24px rgba(99,102,241,0.25)' }}>
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-100 group-hover:text-indigo-300 transition-colors mb-1">Batch Processing</h2>
              <p className="text-slate-500 text-sm leading-relaxed">
                Procesează până la 250 foi de examen simultan cu corectare automată
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>Start</span>
              <svg className="w-5 h-5 text-slate-600 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>

        <div
          className="group rounded-2xl p-6 cursor-pointer relative overflow-hidden dash-card-lift animate-float-up glass-stat"
          style={{ animationDelay: '0.18s' }}
          onClick={() => navigate('/upload')}
        >
          <div className="shimmer-on-hover absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.07) 50%, transparent 100%)' }} />
          <div className="relative z-10 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(192,132,252,0.1))' }}>
              <svg className="w-6 h-6 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-200 group-hover:text-violet-300 transition-colors mb-1">Single Upload</h2>
              <p className="text-slate-500 text-xs leading-relaxed">
                Încarcă și analizează o singură foaie de examen
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        <div
          className="group rounded-2xl p-5 cursor-pointer relative overflow-hidden dash-card-lift animate-float-up glass-stat"
          style={{ animationDelay: '0.26s' }}
          onClick={() => setStatsOpen(true)}
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,197,94,0.1)' }}>
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-slate-200 group-hover:text-emerald-300 transition-colors">Statistici Note</h3>
              <p className="text-xs text-slate-500 truncate">Grafice și procente detaliate pe facultăți</p>
            </div>
            <svg className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>

        {manageBareme && facultyAdmin ? (
          <div
            className="group rounded-2xl p-5 cursor-pointer relative overflow-hidden dash-card-lift animate-float-up glass-stat"
            style={{ animationDelay: '0.32s' }}
            onClick={() => setBaremeOpen(true)}
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(251,146,60,0.1)' }}>
                <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-200 group-hover:text-orange-300 transition-colors">Bareme</h3>
                <p className="text-xs text-slate-500 truncate">Gestionează baremele pentru {user?.faculty?.toUpperCase()}</p>
              </div>
              <svg className="w-4 h-4 text-slate-600 group-hover:text-orange-400 group-hover:translate-x-1 transition-all flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        ) : null}

        {globalAdmin && (
          <div
            className="group rounded-2xl p-5 cursor-pointer relative overflow-hidden dash-card-lift animate-float-up glass-stat"
            style={{ animationDelay: '0.32s' }}
            onClick={() => navigate('/settings')}
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(6,182,212,0.1)' }}>
                <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-200 group-hover:text-cyan-300 transition-colors">System Settings</h3>
                <p className="text-xs text-slate-500 truncate">Utilizatori, bareme și configurare sistem</p>
              </div>
              <svg className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        )}
      </div>

      <StatsModal
        isOpen={statsOpen}
        onClose={() => setStatsOpen(false)}
        isAdmin={globalAdmin}
        userFaculty={user?.faculty || null}
      />
      <AnswerKeysModal
        isOpen={baremeOpen}
        onClose={() => setBaremeOpen(false)}
        userFaculty={user?.faculty || null}
        userRole={user?.role || null}
        canManage={manageBareme}
      />
    </div>
  )
}
