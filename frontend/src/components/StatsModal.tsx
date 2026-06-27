import React, { useState, useEffect, useMemo, useCallback, useRef, memo, useTransition, useDeferredValue } from 'react'
import { examAPI } from '../api/client'
import { useThemeStore } from '../store'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, LabelList,
} from 'recharts'

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

interface QuestionDist {
  question_id: string
  distribution: { A: number; B: number; C: number; D: number; no_response: number; multiple: number }
  correct_answer: string[]
  total_responses: number
}

interface QuestionStatsData {
  all_questions: string[]
  questions: QuestionDist[]
  total_students: number
  student_correct?: Record<string, number>[]
  multiplier?: number
}

interface StatsModalProps {
  isOpen: boolean
  onClose: () => void
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
  '9-10': '#8b5cf6',
}

const CustomTooltip = memo(({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload
    const light = document.documentElement.getAttribute('data-theme') === 'light'
    return (
      <div className={`${light ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-600/50'} border rounded-lg px-3 py-2 shadow-xl`}>
        <p className={`text-sm font-semibold ${light ? 'text-slate-800' : 'text-slate-200'}`}>Nota {d.range}</p>
        <p className="text-indigo-500 text-sm">{d.count} studenți ({d.percent}%)</p>
      </div>
    )
  }
  return null
})

const DetailTooltip = memo(({ active, payload, isLight }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload
    return (
      <div className={`${isLight ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-600/50'} border rounded-lg px-3 py-2 shadow-xl`}>
        <p className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
          Opțiunea {d.option} {d.isCorrect ? '✓ Corect' : ''}
        </p>
        <p className="text-indigo-400 text-sm">{d.count} studenți ({d.percent}%)</p>
      </div>
    )
  }
  return null
})

const QButton = memo(({ qid, selected, onClick }: { qid: string; selected: boolean; onClick: (qid: string) => void }) => (
  <button
    onClick={() => onClick(qid)}
    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
      selected
        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
        : 'bg-slate-700/30 text-slate-500 border border-slate-600/20 hover:text-slate-300'
    }`}
  >
    {qid}
  </button>
))

export const StatsModal: React.FC<StatsModalProps> = ({ isOpen, onClose, isAdmin, userFaculty }) => {
  const [selectedFaculty, setSelectedFaculty] = useState(
    isAdmin ? 'fsgc' : (userFaculty?.toLowerCase() || 'fsgc')
  )
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [activeTab, setActiveTab] = useState<'grades' | 'questions'>('grades')

  const [qStatsData, setQStatsData] = useState<QuestionStatsData | null>(null)
  const [qLoading, setQLoading] = useState(false)
  const [qError, setQError] = useState<string | null>(null)
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set())
  const [allQSelected, setAllQSelected] = useState(true)
  const [checkedForDetail, setCheckedForDetail] = useState<Set<string>>(new Set())
  const [showDetailModals, setShowDetailModals] = useState(false)

  const [, startTransition] = useTransition()

  const [answerKeys, setAnswerKeys] = useState<{ key: string; label: string }[]>([])
  const [selectedBarem, setSelectedBarem] = useState<string>('')

  const theme = useThemeStore((s) => s.theme)
  const isLight = theme === 'light'

  const cacheRef = useRef<Record<string, StatsData>>({})
  const qCacheRef = useRef<Record<string, QuestionStatsData>>({})

  useEffect(() => {
    if (isOpen) {
      
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [isOpen])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 200) 
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return
    
    if (cacheRef.current[selectedFaculty]) {
      setData(cacheRef.current[selectedFaculty])
      return
    }
    const fetchStats = async () => {
      setLoading(true)
      setError(null)
      try {
        const resp = await examAPI.getStats(selectedFaculty)
        if (resp.data.success) {
          setData(resp.data)
          cacheRef.current[selectedFaculty] = resp.data
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
  }, [selectedFaculty, isOpen])

  useEffect(() => {
    if (!isOpen) return
    const fetchKeys = async () => {
      try {
        const resp = await examAPI.getAnswerKeys()
        if (resp.data.success) {
          const raw = resp.data.answer_keys || []
          
          const allKeys: string[] = Array.isArray(raw) ? raw : Object.keys(raw)
          
          const facultyLower = selectedFaculty.toLowerCase()
          const keys = allKeys.filter(k => k.toLowerCase().includes(facultyLower))
          setAnswerKeys(keys.map(k => ({ key: k, label: k })))
          
          if (keys.length > 0 && !keys.includes(selectedBarem)) {
            setSelectedBarem(keys[0])
          } else if (keys.length === 0) {
            setSelectedBarem('')
          }
        }
      } catch {  }
    }
    fetchKeys()
  }, [isOpen, selectedFaculty])

  useEffect(() => {
    if (!isOpen || activeTab !== 'questions') return
    const cacheKey = `${selectedFaculty}__${selectedBarem}`
    if (qCacheRef.current[cacheKey]) {
      setQStatsData(qCacheRef.current[cacheKey])
      return
    }
    const fetchQStats = async () => {
      setQLoading(true)
      setQError(null)
      try {
        const resp = await examAPI.getQuestionStats(selectedFaculty, undefined, selectedBarem || undefined)
        if (resp.data.success) {
          setQStatsData(resp.data)
          qCacheRef.current[cacheKey] = resp.data
          
          setSelectedQuestions(new Set(resp.data.all_questions))
          setAllQSelected(true)
        } else {
          setQError(resp.data.message || 'Failed to load question stats')
        }
      } catch (err: any) {
        setQError(err.response?.data?.message || 'Failed to load question statistics')
      } finally {
        setQLoading(false)
      }
    }
    fetchQStats()
  }, [selectedFaculty, isOpen, activeTab, selectedBarem])

  const toggleQuestion = useCallback((qid: string) => {
    startTransition(() => {
      setSelectedQuestions(prev => {
        
        if (qStatsData && prev.size === qStatsData.all_questions.length) {
          setAllQSelected(false)
          return new Set([qid])
        }
        const next = new Set(prev)
        if (next.has(qid)) {
          next.delete(qid)
          
          if (next.size === 0) {
            setAllQSelected(true)
            return new Set(qStatsData?.all_questions || [])
          }
        } else {
          next.add(qid)
        }
        setAllQSelected(qStatsData ? next.size === qStatsData.all_questions.length : false)
        return next
      })
    })
  }, [qStatsData])

  const toggleAllQuestions = useCallback(() => {
    if (!qStatsData) return
    startTransition(() => {
      setSelectedQuestions(new Set(qStatsData.all_questions))
      setAllQSelected(true)
    })
  }, [qStatsData])

  const questionSections = useMemo(() => {
    if (!qStatsData) return []
    const sectionMap = new Map<string, string[]>()
    for (const qid of qStatsData.all_questions) {
      const match = qid.match(/^([A-Za-z]+)/)
      if (match) {
        const section = match[1].toUpperCase()
        if (!sectionMap.has(section)) sectionMap.set(section, [])
        sectionMap.get(section)!.push(qid)
      }
    }
    return Array.from(sectionMap.entries()).map(([section, qids]) => ({ section, qids }))
  }, [qStatsData])

  const selectSection = useCallback((sectionQids: string[]) => {
    startTransition(() => {
      setSelectedQuestions(prev => {
        const allInSection = sectionQids.every(q => prev.has(q))
        const next = new Set(prev)
        if (allInSection) {
          sectionQids.forEach(q => next.delete(q))
        } else {
          sectionQids.forEach(q => next.add(q))
        }
        setAllQSelected(qStatsData ? next.size === qStatsData.all_questions.length : false)
        return next
      })
    })
  }, [qStatsData])

  const selectRange = useCallback((start: number, end: number) => {
    if (!qStatsData) return
    startTransition(() => {
      const from = Math.min(start, end)
      const to = Math.max(start, end)
      const rangeQids = qStatsData.all_questions.slice(from, to + 1)
      setSelectedQuestions(new Set(rangeQids))
      setAllQSelected(rangeQids.length === qStatsData.all_questions.length)
    })
  }, [qStatsData])

  const deferredSelected = useDeferredValue(selectedQuestions)
  const isStale = deferredSelected !== selectedQuestions

  const filteredQData = useMemo(() => {
    if (!qStatsData) return []
    return qStatsData.questions.filter(q => deferredSelected.has(q.question_id))
  }, [qStatsData, deferredSelected])

  const selectionStats = useMemo(() => {
    if (!filteredQData || filteredQData.length === 0) return null
    
    const multiplier = selectedFaculty === 'sport' ? 0.225 : 0.2
    const questionRates: { qid: string; rate: number }[] = []
    for (const q of filteredQData) {
      const correctSet = new Set(q.correct_answer.map(c => c.toUpperCase()))
      if (correctSet.size === 0) continue
      const correctCount = (['A', 'B', 'C', 'D'] as const)
        .filter(opt => correctSet.has(opt))
        .reduce((sum, opt) => sum + q.distribution[opt], 0)
      const total = q.total_responses || 1
      questionRates.push({ qid: q.question_id, rate: correctCount / total })
    }
    if (questionRates.length === 0) return null
    const sorted = [...questionRates].sort((a, b) => a.rate - b.rate)
    const hardest = sorted[0]
    const easiest = sorted[sorted.length - 1]
    const avgRate = questionRates.reduce((s, r) => s + r.rate, 0) / questionRates.length
    const maxPossiblePts = questionRates.length * multiplier
    const avgPts = questionRates.reduce((s, r) => s + r.rate * multiplier, 0)
    const rates = questionRates.map(r => r.rate * 100)
    const sortedRates = [...rates].sort((a, b) => a - b)
    const mid = Math.floor(sortedRates.length / 2)
    const medianRate = sortedRates.length % 2 === 0 ? (sortedRates[mid - 1] + sortedRates[mid]) / 2 : sortedRates[mid]
    return {
      hardest, easiest,
      avgRate: avgRate * 100,
      medianRate,
      maxPossiblePts,
      avgPts,
      multiplier,
      count: questionRates.length,
    }
  }, [filteredQData, selectedFaculty])

  const subsetScoreStats = useMemo(() => {
    if (!qStatsData?.student_correct || qStatsData.student_correct.length === 0) return null
    if (deferredSelected.size === 0) return null
    const mult = qStatsData.multiplier ?? (selectedFaculty === 'sport' ? 0.225 : 0.2)
    const selectedQids = Array.from(deferredSelected)
    const scores: number[] = []
    for (const studentRow of qStatsData.student_correct) {
      let score = 0
      for (const qid of selectedQids) {
        if (studentRow[qid] === 1) score += mult
      }
      scores.push(Math.round(score * 1000) / 1000)
    }
    if (scores.length === 0) return null
    const sorted = [...scores].sort((a, b) => a - b)
    const n = sorted.length
    const mid = Math.floor(n / 2)
    const median = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
    return {
      min: sorted[0],
      max: sorted[n - 1],
      average: Math.round((scores.reduce((s, v) => s + v, 0) / n) * 100) / 100,
      median: Math.round(median * 100) / 100,
      maxPossible: Math.round(selectedQids.length * mult * 100) / 100,
    }
  }, [qStatsData, deferredSelected, selectedFaculty])

  const barData = useMemo(() => {
    if (!data) return []
    return Object.entries(data.distribution).map(([range, count]) => ({
      range,
      count,
      percent: data.total > 0 ? ((count / data.total) * 100).toFixed(1) : '0',
    }))
  }, [data])

  const pieData = useMemo(() => {
    if (!data) return []
    return [
      { name: 'Promovați', value: data.stats.passed, color: '#22c55e' },
      { name: 'Nepromovați', value: data.stats.failed, color: '#ef4444' },
    ]
  }, [data])

  const facultyLabel = useMemo(
    () => FACULTIES.find(f => f.key === selectedFaculty)?.label || selectedFaculty,
    [selectedFaculty]
  )

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease-out',
        pointerEvents: visible ? 'auto' : 'none',
      }}
      onClick={handleClose}
    >
      
      <div className="absolute inset-0 bg-black/60" />

      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700/50 shadow-2xl"
        style={{
          background: isLight
            ? 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)'
            : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(12px)',
          transition: 'transform 200ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-700/50" style={{ background: isLight ? 'rgba(255,255,255,0.95)' : 'rgba(15,23,42,0.95)', backdropFilter: 'blur(8px)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(16,185,129,0.1))' }}>
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h2 className={`text-xl font-bold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>Statistici Examene</h2>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Analiză detaliată a notelor</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAdmin ? (
              <select
                value={selectedFaculty}
                onChange={(e) => setSelectedFaculty(e.target.value)}
                className="bg-slate-700/60 border border-slate-600/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {FACULTIES.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            ) : (
              <span className="px-3 py-1.5 bg-indigo-500/20 text-indigo-300 rounded-lg text-sm font-medium">
                {facultyLabel}
              </span>
            )}
            <button
              onClick={handleClose}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6">
          
          <div className="flex gap-2 mb-6 bg-slate-800/50 rounded-xl p-1">
            <button
              onClick={() => setActiveTab('grades')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'grades'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
              }`}
            >
              Distribuția Notelor
            </button>
            <button
              onClick={() => setActiveTab('questions')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'questions'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
              }`}
            >
              Analiză pe Întrebări
            </button>
          </div>

          {activeTab === 'grades' && (<>
          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-10 h-10 border-3 border-indigo-400 border-t-transparent rounded-full animate-spin mb-4" />
              <span className="text-slate-400 text-sm">Se încarcă statisticile...</span>
            </div>
          )}

          {error && (
            <div className="text-center py-12">       
              <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.072 16.5C3.302 17.333 4.268 19 5.804 19z" />
                </svg>
              </div>
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && data && data.total === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <p className="text-slate-400 text-sm">Nu există date pentru {facultyLabel}.</p>
            </div>
          )}

          {!loading && !error && data && data.total > 0 && (
            <>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Studenți</div>
                  <div className="text-3xl font-bold text-slate-100">{data.total}</div>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Media Generală</div>
                  <div className="text-3xl font-bold text-indigo-400">{data.stats.average}</div>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Mediană</div>
                  <div className="text-3xl font-bold text-cyan-400">{data.stats.median}</div>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Rată Promovare</div>
                  <div className="text-3xl font-bold text-emerald-400">{data.stats.pass_rate}%</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                
                <div className="lg:col-span-2 bg-slate-800/30 rounded-xl p-5 border border-slate-700/30">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4">Distribuția Notelor</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isLight ? '#cbd5e1' : '#334155'} />
                      <XAxis dataKey="range" tick={{ fill: isLight ? '#334155' : '#94a3b8', fontSize: 12 }} axisLine={{ stroke: isLight ? '#94a3b8' : '#475569' }} />
                      <YAxis tick={{ fill: isLight ? '#334155' : '#94a3b8', fontSize: 12 }} axisLine={{ stroke: isLight ? '#94a3b8' : '#475569' }} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                        {barData.map((entry) => (
                          <Cell key={entry.range} fill={BAR_COLORS[entry.range] || '#6366f1'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-700/30">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4">Promovați vs Nepromovați</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                        isAnimationActive={false}
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        iconSize={8}
                        formatter={(value: string) => <span style={{ color: isLight ? '#334155' : '#cbd5e1', fontSize: '12px' }}>{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="text-center mt-2">
                    <span className="text-2xl font-bold text-emerald-400">{data.stats.passed}</span>
                    <span className="text-slate-500 mx-2">/</span>
                    <span className="text-2xl font-bold text-red-400">{data.stats.failed}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-700/30">
                  <h3 className="text-sm font-semibold text-slate-300">Detalii pe Interval de Note</h3>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700/30">
                      <th className="text-left text-xs text-slate-500 uppercase tracking-wider px-5 py-3">Interval</th>
                      <th className="text-center text-xs text-slate-500 uppercase tracking-wider px-5 py-3">Studenți</th>
                      <th className="text-center text-xs text-slate-500 uppercase tracking-wider px-5 py-3">Procent</th>
                      <th className="text-left text-xs text-slate-500 uppercase tracking-wider px-5 py-3 hidden sm:table-cell">Grafic</th>
                    </tr>
                  </thead>
                  <tbody>
                    {barData.map((row) => {
                      const pct = parseFloat(row.percent)
                      return (
                        <tr key={row.range} className="border-b border-slate-700/20 last:border-0 hover:bg-slate-700/20 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: BAR_COLORS[row.range] }} />
                              <span className="text-sm font-medium text-slate-200">Nota {row.range}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className="text-sm font-semibold text-slate-100">{row.count}</span>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className="text-sm font-semibold" style={{ color: BAR_COLORS[row.range] }}>
                              {row.percent}%
                            </span>
                          </td>
                          <td className="px-5 py-3 hidden sm:table-cell">
                            <div className="w-full h-2.5 bg-slate-700/50 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`,
                                  backgroundColor: BAR_COLORS[row.range],
                                  transition: 'width 0.5s ease',
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                <div className="bg-slate-800/30 rounded-lg px-4 py-3 border border-slate-700/20 text-center">
                  <div className="text-xs text-slate-500 mb-0.5">Nota Minimă</div>
                  <div className="text-lg font-bold text-red-400">{data.stats.min}</div>
                </div>
                <div className="bg-slate-800/30 rounded-lg px-4 py-3 border border-slate-700/20 text-center">
                  <div className="text-xs text-slate-500 mb-0.5">Nota Maximă</div>
                  <div className="text-lg font-bold text-emerald-400">{data.stats.max}</div>
                </div>
                <div className="bg-slate-800/30 rounded-lg px-4 py-3 border border-slate-700/20 text-center">
                  <div className="text-xs text-slate-500 mb-0.5">Promovați</div>
                  <div className="text-lg font-bold text-green-400">{data.stats.passed} ({data.stats.pass_rate}%)</div>
                </div>
                <div className="bg-slate-800/30 rounded-lg px-4 py-3 border border-slate-700/20 text-center">
                  <div className="text-xs text-slate-500 mb-0.5">Nepromovați</div>
                  <div className="text-lg font-bold text-red-400">{data.stats.failed} ({(100 - data.stats.pass_rate).toFixed(1)}%)</div>
                </div>
              </div>
            </>
          )}
          </>)}

          {activeTab === 'questions' && (
            <div>
              
              <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30 mb-4">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-semibold text-slate-300 whitespace-nowrap">Barem:</label>
                  {answerKeys.length > 0 ? (
                    <select
                      value={selectedBarem}
                      onChange={(e) => {
                        setSelectedBarem(e.target.value)
                        qCacheRef.current = {}
                      }}
                      className="flex-1 bg-slate-700/60 border border-slate-600/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">Fără barem (fără răspunsuri corecte)</option>
                      {answerKeys.map((k) => (
                        <option key={k.key} value={k.key}>{k.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-sm text-slate-500">Nu există bareme pentru {facultyLabel}</span>
                  )}
                </div>
              </div>

              {qLoading && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-10 h-10 border-3 border-indigo-400 border-t-transparent rounded-full animate-spin mb-4" />
                  <span className="text-slate-400 text-sm">Se încarcă statisticile pe întrebări...</span>
                </div>
              )}

              {qError && (
                <div className="text-center py-12">
                  <p className="text-red-400 text-sm">{qError}</p>
                </div>
              )}

              {!qLoading && !qError && qStatsData && (
                <>
                  
                  <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30 mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-300">Selectează Întrebările</h3>
                        {!allQSelected && (
                          <button
                            onClick={toggleAllQuestions}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                          >
                            Selectează Toate
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {questionSections.length > 1 && questionSections.map(({ section, qids }) => {
                          const allIn = qids.every(q => selectedQuestions.has(q))
                          return (
                            <button
                              key={section}
                              onClick={() => selectSection(qids)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                allIn
                                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                                  : 'bg-slate-700/30 text-slate-500 border border-slate-600/20 hover:text-slate-300'
                              }`}
                              title={`Secțiunea ${section} (${qids.length} întrebări)`}
                            >
                              Sec. {section}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                      {qStatsData.all_questions.map((qid) => (
                        <QButton
                          key={qid}
                          qid={qid}
                          selected={selectedQuestions.has(qid)}
                          onClick={toggleQuestion}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        {selectedQuestions.size} din {qStatsData.all_questions.length} întrebări selectate — {qStatsData.total_students} studenți analizați
                      </span>
                      
                      <div className="flex items-center gap-1.5">
                        {[5, 10, 20].filter(n => n < qStatsData.all_questions.length).map(n => (
                          <button
                            key={n}
                            onClick={() => selectRange(0, n - 1)}
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-700/30 text-slate-500 border border-slate-600/20 hover:text-slate-300 transition-colors"
                          >
                            Primele {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ opacity: isStale ? 0.6 : 1, transition: 'opacity 150ms ease' }}>
                  
                  {selectionStats && (
                    <div className="space-y-4 mb-6">
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
                          <div className="text-xs text-slate-500 mb-1">Punctaj maxim posibil</div>
                          <div className="text-2xl font-bold text-indigo-400">{selectionStats.maxPossiblePts.toFixed(1)}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">din {selectionStats.count} întrebări × {selectionStats.multiplier} p.</div>
                        </div>
                        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
                          <div className="text-xs text-slate-500 mb-1">Punctaj mediu</div>
                          <div className="text-2xl font-bold text-cyan-400">{selectionStats.avgPts.toFixed(2)}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">media punctelor obținute</div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-red-500/5 rounded-xl p-4 border border-red-500/15 flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">Cea mai grea întrebare</div>
                            <div className="text-lg font-bold text-red-400">{selectionStats.hardest.qid}</div>
                            <div className="text-xs text-slate-400">doar {(selectionStats.hardest.rate * 100).toFixed(0)}% au răspuns corect</div>
                          </div>
                        </div>
                        <div className="bg-emerald-500/5 rounded-xl p-4 border border-emerald-500/15 flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">Cea mai ușoară întrebare</div>
                            <div className="text-lg font-bold text-emerald-400">{selectionStats.easiest.qid}</div>
                            <div className="text-xs text-slate-400">{(selectionStats.easiest.rate * 100).toFixed(0)}% au răspuns corect</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {subsetScoreStats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                      <div className="bg-slate-800/30 rounded-lg px-4 py-3 border border-slate-700/20 text-center">
                        <div className="text-xs text-slate-500 mb-0.5">Punctaj Minim</div>
                        <div className="text-lg font-bold text-red-400">{subsetScoreStats.min.toFixed(2)}</div>
                        <div className="text-[10px] text-slate-500">din {subsetScoreStats.maxPossible} p.</div>
                      </div>
                      <div className="bg-slate-800/30 rounded-lg px-4 py-3 border border-slate-700/20 text-center">
                        <div className="text-xs text-slate-500 mb-0.5">Punctaj Maxim</div>
                        <div className="text-lg font-bold text-emerald-400">{subsetScoreStats.max.toFixed(2)}</div>
                        <div className="text-[10px] text-slate-500">din {subsetScoreStats.maxPossible} p.</div>
                      </div>
                      <div className="bg-slate-800/30 rounded-lg px-4 py-3 border border-slate-700/20 text-center">
                        <div className="text-xs text-slate-500 mb-0.5">Media Punctajelor</div>
                        <div className="text-lg font-bold text-indigo-400">{subsetScoreStats.average.toFixed(2)}</div>
                        <div className="text-[10px] text-slate-500">medie per candidat</div>
                      </div>
                      <div className="bg-slate-800/30 rounded-lg px-4 py-3 border border-slate-700/20 text-center">
                        <div className="text-xs text-slate-500 mb-0.5">Mediană Punctaje</div>
                        <div className="text-lg font-bold text-cyan-400">{subsetScoreStats.median.toFixed(2)}</div>
                        <div className="text-[10px] text-slate-500">valoare mediană</div>
                      </div>
                    </div>
                  )}

                  {filteredQData.length > 0 ? (
                    <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 overflow-hidden">
                      <div className="px-5 py-3 border-b border-slate-700/30 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-300">Distribuția Răspunsurilor</h3>
                        <div className="flex items-center gap-2">
                          {checkedForDetail.size > 0 && (
                            <>
                              <span className="text-xs text-slate-500">{checkedForDetail.size}/5 selectate</span>
                              <button
                                onClick={() => setCheckedForDetail(new Set())}
                                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                              >
                                Resetează
                              </button>
                              <button
                                onClick={() => setShowDetailModals(true)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30 transition-colors flex items-center gap-1.5"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                Deschide Detalii ({checkedForDetail.size})
                              </button>
                            </>
                          )}
                          {checkedForDetail.size === 0 && (
                            <span className="text-xs text-slate-500 italic">Bifează întrebări (max 5) apoi apasă Deschide</span>
                          )}
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-slate-700/30">
                              <th className="text-left text-xs text-slate-500 uppercase tracking-wider px-4 py-3">Întrebare</th>
                              <th className="text-center text-xs text-slate-500 uppercase tracking-wider px-3 py-3">A</th>
                              <th className="text-center text-xs text-slate-500 uppercase tracking-wider px-3 py-3">B</th>
                              <th className="text-center text-xs text-slate-500 uppercase tracking-wider px-3 py-3">C</th>
                              <th className="text-center text-xs text-slate-500 uppercase tracking-wider px-3 py-3">D</th>
                              <th className="text-center text-xs text-slate-500 uppercase tracking-wider px-3 py-3">Fără răsp.</th>
                              <th className="text-center text-xs text-slate-500 uppercase tracking-wider px-3 py-3">Multiplu</th>
                              <th className="text-left text-xs text-slate-500 uppercase tracking-wider px-3 py-3">Corect</th>
                              <th className="text-left text-xs text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Distribuție</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredQData.map((q) => {
                              const total = q.total_responses || 1
                              const maxOpt = Math.max(q.distribution.A, q.distribution.B, q.distribution.C, q.distribution.D)
                              const correctSet = new Set(q.correct_answer.map(c => c.toUpperCase()))
                              return (
                                <tr
                                  key={q.question_id}
                                  className={`border-b border-slate-700/20 last:border-0 hover:bg-indigo-500/10 cursor-pointer ${
                                    checkedForDetail.has(q.question_id) ? 'bg-indigo-500/15 ring-1 ring-indigo-500/30' : ''
                                  }`}
                                  onClick={() => {
                                    setCheckedForDetail(prev => {
                                      const next = new Set(prev)
                                      if (next.has(q.question_id)) {
                                        next.delete(q.question_id)
                                      } else {
                                        if (next.size >= 5) return prev
                                        next.add(q.question_id)
                                      }
                                      return next
                                    })
                                  }}
                                  title={checkedForDetail.has(q.question_id) ? 'Click pentru a deselecta' : checkedForDetail.size >= 5 ? 'Maxim 5 întrebări' : 'Click pentru a selecta'}
                                >
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                                        checkedForDetail.has(q.question_id)
                                          ? 'bg-indigo-500 border-indigo-500'
                                          : 'border-slate-500 hover:border-indigo-400'
                                      }`}>
                                        {checkedForDetail.has(q.question_id) && (
                                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                          </svg>
                                        )}
                                      </div>
                                      <span className="text-sm font-semibold text-slate-200">{q.question_id}</span>
                                    </div>
                                  </td>
                                  {(['A', 'B', 'C', 'D'] as const).map(opt => {
                                    const count = q.distribution[opt]
                                    const isCorrect = correctSet.has(opt)
                                    const isMax = count === maxOpt && count > 0
                                    return (
                                      <td key={opt} className="px-3 py-3 text-center">
                                        <span className={`text-sm font-semibold ${
                                          isCorrect
                                            ? 'text-emerald-400'
                                            : isMax
                                              ? 'text-amber-400'
                                              : 'text-slate-300'
                                        }`}>
                                          {count}
                                        </span>
                                        <span className="text-xs text-slate-500 ml-0.5">
                                          ({total > 0 ? ((count / total) * 100).toFixed(0) : 0}%)
                                        </span>
                                      </td>
                                    )
                                  })}
                                  <td className="px-3 py-3 text-center">
                                    <span className="text-sm text-slate-400">{q.distribution.no_response}</span>
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <span className="text-sm text-slate-400">{q.distribution.multiple}</span>
                                  </td>
                                  <td className="px-3 py-3">
                                    {q.correct_answer.length > 0 ? (
                                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-xs font-bold">
                                        {q.correct_answer.join(', ')}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-slate-500">—</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 hidden md:table-cell">
                                    <div className="flex gap-0.5 h-4">
                                      {(['A', 'B', 'C', 'D'] as const).map(opt => {
                                        const count = q.distribution[opt]
                                        const pct = total > 0 ? (count / total) * 100 : 0
                                        const isCorrect = correctSet.has(opt)
                                        const colors: Record<string, string> = { A: '#6366f1', B: '#f59e0b', C: '#06b6d4', D: '#f472b6' }
                                        return (
                                          <div
                                            key={opt}
                                            className="rounded-sm"
                                            style={{
                                              width: `${Math.max(pct, pct > 0 ? 3 : 0)}%`,
                                              minWidth: pct > 0 ? '4px' : '0',
                                              backgroundColor: isCorrect ? '#22c55e' : colors[opt],
                                              opacity: isCorrect ? 1 : 0.5,
                                            }}
                                            title={`${opt}: ${count} (${pct.toFixed(0)}%)`}
                                          />
                                        )
                                      })}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-400 text-sm">
                      Selectează cel puțin o întrebare pentru a vedea distribuția.
                    </div>
                  )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showDetailModals && checkedForDetail.size > 0 && (() => {
        const detailQs = filteredQData.filter(q => checkedForDetail.has(q.question_id))
        if (detailQs.length === 0) return null
        return (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={() => setShowDetailModals(false)}
        >
          <div className="absolute inset-0 bg-black/70" />
          <div
            className="relative w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700/50 shadow-2xl p-6"
            style={{
              background: isLight ? 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)' : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              maxWidth: detailQs.length === 1 ? '32rem' : '90rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className={`text-lg font-bold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                  {detailQs.length === 1
                    ? `Întrebarea ${detailQs[0].question_id}`
                    : `Detalii pentru ${detailQs.length} întrebări`
                  }
                </h3>
                <p className="text-xs text-slate-500">
                  {detailQs.length === 1
                    ? `${detailQs[0].total_responses} răspunsuri totale`
                    : detailQs.map(q => q.question_id).join(', ')
                  }
                </p>
              </div>
              <button
                onClick={() => setShowDetailModals(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className={`grid gap-6 ${
              detailQs.length === 1 ? 'grid-cols-1' :
              detailQs.length === 2 ? 'grid-cols-1 lg:grid-cols-2' :
              detailQs.length === 3 ? 'grid-cols-1 lg:grid-cols-3' :
              'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'
            }`}>
              {detailQs.map((dq) => {
                const correctSet = new Set(dq.correct_answer.map(c => c.toUpperCase()))
                const total = dq.total_responses || 1
                const chartData = (['A', 'B', 'C', 'D'] as const).map(opt => ({
                  option: opt,
                  count: dq.distribution[opt],
                  percent: ((dq.distribution[opt] / total) * 100).toFixed(1),
                  isCorrect: correctSet.has(opt),
                }))
                const OPTION_COLORS: Record<string, string> = { A: '#6366f1', B: '#f59e0b', C: '#06b6d4', D: '#f472b6' }

                return (
                  <div key={dq.question_id} className={`rounded-xl p-4 border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/30 border-slate-700/30'}`}>
                    
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className={`text-base font-bold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>Întrebarea {dq.question_id}</h4>
                        <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>{dq.total_responses} răspunsuri</p>
                      </div>
                      {dq.correct_answer.length > 0 && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
                          {dq.correct_answer.join(', ')}
                        </span>
                      )}
                    </div>

                    <ResponsiveContainer width="100%" height={detailQs.length === 1 ? 240 : 180}>
                      <BarChart data={chartData} margin={{ top: 20, right: 10, left: -15, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isLight ? '#cbd5e1' : '#334155'} />
                        <XAxis dataKey="option" tick={{ fill: isLight ? '#1e293b' : '#94a3b8', fontSize: 13, fontWeight: 600 }} axisLine={{ stroke: isLight ? '#94a3b8' : '#475569' }} />
                        <YAxis tick={{ fill: isLight ? '#334155' : '#94a3b8', fontSize: 11 }} axisLine={{ stroke: isLight ? '#94a3b8' : '#475569' }} allowDecimals={false} />
                        <Tooltip
                          content={<DetailTooltip isLight={isLight} />}
                          cursor={{ fill: 'rgba(99,102,241,0.08)' }}
                        />
                        <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={64} isAnimationActive={false}>
                          {chartData.map((entry) => (
                            <Cell
                              key={entry.option}
                              fill={entry.isCorrect ? '#22c55e' : OPTION_COLORS[entry.option]}
                              opacity={entry.isCorrect ? 1 : 0.7}
                            />
                          ))}
                          <LabelList dataKey="percent" position="top" formatter={(v: any) => `${v}%`} style={{ fill: isLight ? '#1e293b' : '#cbd5e1', fontSize: 11, fontWeight: 600 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    <div className="grid grid-cols-4 gap-2 mt-3">
                      {chartData.map(d => (
                        <div
                          key={d.option}
                          className={`rounded-lg p-2 text-center border ${
                            d.isCorrect
                              ? 'bg-emerald-500/10 border-emerald-500/30'
                              : isLight
                                ? 'bg-white border-slate-200'
                                : 'bg-slate-800/50 border-slate-700/30'
                          }`}
                        >
                          <div className={`text-sm font-bold ${d.isCorrect ? 'text-emerald-400' : isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                            {d.option}
                          </div>
                          <div className={`text-lg font-bold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>{d.count}</div>
                          <div className={`text-[11px] font-medium ${d.isCorrect ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {d.percent}%
                          </div>
                          {d.isCorrect && <div className="text-[9px] text-emerald-400 font-bold">CORECT</div>}
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-3 mt-2 text-xs">
                      <span className={isLight ? 'text-slate-500' : 'text-slate-500'}>Fără răsp: <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{dq.distribution.no_response}</span></span>
                      <span className={isLight ? 'text-slate-500' : 'text-slate-500'}>Multiplu: <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{dq.distribution.multiple}</span></span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}
