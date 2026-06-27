import React, { useState, useEffect } from 'react'
import { examAPI } from '../api/client'

interface StatsData {
  faculty: string
  total: number
  distribution: Record<string, number>
  stats: {
    average: number
    median: number
    min: number
    max: number
    passed: number
    failed: number
    pass_rate: number
  }
}

interface StatsCardProps {
  isAdmin: boolean
  userFaculty: string | null
}

const FACULTIES = [
  { key: 'fsgc', label: 'FSGC' },
  { key: 'drept', label: 'Drept' },
  { key: 'sport', label: 'Sport' },
  { key: 'fsas', label: 'FSAS' },
  { key: 'fpse', label: 'FPSE' },
  { key: 'finalizare', label: 'Finalizare' },
]

const BAR_COLORS: Record<string, string> = {
  '1-2': '#ef4444',
  '2-3': '#f97316',
  '3-4': '#f59e0b',
  '4-5': '#eab308',
  '5-6': '#84cc16',
  '6-7': '#22c55e',
  '7-8': '#10b981',
  '8-9': '#06b6d4',
  '9-10': '#6366f1',
}

export const StatsCard: React.FC<StatsCardProps> = ({ isAdmin, userFaculty }) => {
  const [selectedFaculty, setSelectedFaculty] = useState(
    isAdmin ? 'fsgc' : (userFaculty?.toLowerCase() || 'fsgc')
  )
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true)
      setError(null)
      try {
        const resp = await examAPI.getStats(selectedFaculty)
        if (resp.data.success) {
          setData(resp.data)
        } else {
          setError(resp.data.message || 'Failed to load stats')
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load statistics')
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [selectedFaculty])

  const maxCount = data
    ? Math.max(...Object.values(data.distribution), 1)
    : 1

  return (
    <div className="card card-gradient relative overflow-hidden">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background:
                'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(16,185,129,0.1))',
            }}
          >
            <svg
              className="w-5 h-5 text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-200">Statistici Note</h2>
        </div>

        {isAdmin ? (
          <select
            value={selectedFaculty}
            onChange={(e) => setSelectedFaculty(e.target.value)}
            className="bg-slate-700/50 border border-slate-600/50 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {FACULTIES.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="badge-info text-xs">
            {FACULTIES.find((f) => f.key === selectedFaculty)?.label || selectedFaculty}
          </span>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          <span className="ml-3 text-slate-400 text-sm">Se încarcă...</span>
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm py-4 text-center">{error}</div>
      )}

      {!loading && !error && data && data.total === 0 && (
        <div className="text-slate-500 text-sm py-8 text-center">
          Nu există date pentru această facultate.
        </div>
      )}

      {!loading && !error && data && data.total > 0 && (
        <>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-slate-800/40 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-slate-100">
                {data.total}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Total</div>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-indigo-400">
                {data.stats.average}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Medie</div>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-emerald-400">
                {data.stats.pass_rate}%
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Promovare</div>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-cyan-400">
                {data.stats.median}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Mediană</div>
            </div>
          </div>

          <div className="mb-5">
            <div className="flex justify-between text-xs text-slate-400 mb-1.5">
              <span>
                Promovați: {data.stats.passed}
              </span>
              <span>
                Nepromovați: {data.stats.failed}
              </span>
            </div>
            <div className="w-full h-3 bg-slate-700/50 rounded-full overflow-hidden flex">
              <div
                className="h-full rounded-l-full"
                style={{
                  width: `${data.stats.pass_rate}%`,
                  background: 'linear-gradient(90deg, #22c55e, #10b981)',
                  transition: 'width 0.5s ease',
                }}
              />
              <div
                className="h-full rounded-r-full"
                style={{
                  width: `${100 - data.stats.pass_rate}%`,
                  background: 'linear-gradient(90deg, #ef4444, #dc2626)',
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-slate-400 font-medium mb-2">
              Distribuția notelor
            </div>
            {Object.entries(data.distribution).map(([range, count]) => (
              <div key={range} className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-8 text-right font-mono">
                  {range}
                </span>
                <div className="flex-1 h-5 bg-slate-800/40 rounded overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{
                      width: count > 0 ? `${Math.max((count / maxCount) * 100, 3)}%` : '0%',
                      backgroundColor: BAR_COLORS[range] || '#6366f1',
                      transition: 'width 0.5s ease',
                    }}
                  />
                </div>
                <span className="text-xs text-slate-300 w-7 text-right font-mono">
                  {count}
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-between mt-4 pt-3 border-t border-slate-700/50 text-xs text-slate-500">
            <span>Min: <span className="text-slate-300">{data.stats.min}</span></span>
            <span>Max: <span className="text-slate-300">{data.stats.max}</span></span>
          </div>
        </>
      )}
    </div>
  )
}
