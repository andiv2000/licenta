import React, { useState, useEffect, useCallback } from 'react'

interface AnswerKeyItem {
  name: string
  questions: number
}

interface AnswerKeyDetail {
  [questionNum: string]: string[]
}

interface AnswerKeysModalProps {
  isOpen: boolean
  onClose: () => void
  userFaculty: string | null
  userRole?: string | null
  canManage?: boolean
}

const FACULTIES = ['fsgc', 'drept', 'sport', 'fsas', 'fpse', 'finalizare'] as const

export const AnswerKeysModal: React.FC<AnswerKeysModalProps> = ({ isOpen, onClose, userFaculty, userRole, canManage = false }) => {
  const [keys, setKeys] = useState<AnswerKeyItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [fpseVariant, setFpseVariant] = useState<3 | 4>(4)

  const [editModal, setEditModal] = useState<{
    isOpen: boolean
    keyName: string
    answers: AnswerKeyDetail
    saving: boolean
  }>({ isOpen: false, keyName: '', answers: {}, saving: false })

  const [addMode, setAddMode] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyCount, setNewKeyCount] = useState(45)
  const [addingKey, setAddingKey] = useState(false)
  const [selectedFaculty, setSelectedFaculty] = useState<string>(userFaculty || '')
  const [generatingRandom, setGeneratingRandom] = useState(false)

  const isAdmin = userRole === 'admin'
  const hasFaculty = !!userFaculty
  const allowManage = canManage && isAdmin
  const effectiveFaculty = hasFaculty ? userFaculty! : selectedFaculty

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true))
      loadKeys()
    } else {
      setVisible(false)
    }
  }, [isOpen])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 200)
  }, [onClose])

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  const loadKeys = async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/exam/answer-keys', { credentials: 'include' })
      const data = await resp.json()
      if (data.success && data.answer_keys) {
        const keysWithCounts: AnswerKeyItem[] = await Promise.all(
          data.answer_keys.map(async (name: string) => {
            try {
              const r = await fetch(`/api/exam/answer-keys/${encodeURIComponent(name)}`, { credentials: 'include' })
              const d = await r.json()
              return { name, questions: d.success ? Object.keys(d.answers).length : 0 }
            } catch {
              return { name, questions: 0 }
            }
          })
        )
        setKeys(keysWithCounts)
      } else {
        setError(data.message || 'Nu s-au putut încărca baremele')
      }
    } catch {
      setError('Eroare la încărcarea baremelor')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = async (keyName: string) => {
    try {
      const resp = await fetch(`/api/exam/answer-keys/${encodeURIComponent(keyName)}`, { credentials: 'include' })
      const data = await resp.json()
      if (data.success) {
        setEditModal({ isOpen: true, keyName, answers: data.answers, saving: false })
      } else {
        setError(`Nu s-a putut încărca: ${data.message}`)
      }
    } catch {
      setError('Eroare la încărcarea baremului')
    }
  }

  const handleSave = async () => {
    setEditModal(prev => ({ ...prev, saving: true }))
    try {
      const resp = await fetch(`/api/exam/answer-keys/${encodeURIComponent(editModal.keyName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: editModal.keyName, answers: editModal.answers }),
      })
      const data = await resp.json()
      if (data.success) {
        setEditModal({ isOpen: false, keyName: '', answers: {}, saving: false })
        showSuccess(`Baremul "${editModal.keyName}" a fost salvat`)
        loadKeys()
      } else {
        setError(data.message || 'Nu s-a putut salva')
        setEditModal(prev => ({ ...prev, saving: false }))
      }
    } catch {
      setError('Eroare la salvare')
      setEditModal(prev => ({ ...prev, saving: false }))
    }
  }

  const handleDelete = async (keyName: string) => {
    if (!confirm(`Ștergi baremul "${keyName}"?`)) return
    try {
      const resp = await fetch(`/api/exam/answer-keys/${encodeURIComponent(keyName)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (resp.ok) {
        setKeys(prev => prev.filter(k => k.name !== keyName))
        showSuccess(`Baremul "${keyName}" a fost șters`)
      } else {
        setError('Nu s-a putut șterge baremul')
      }
    } catch {
      setError('Eroare la ștergere')
    }
  }

  const handleAddKey = async () => {
    const trimmed = newKeyName.trim()
    if (!trimmed) {
      setError('Numele baremului este obligatoriu')
      return
    }
    if (!effectiveFaculty) {
      setError('Selectați o facultate mai întâi')
      return
    }
    
    const keyPrefix = effectiveFaculty === 'fpse' && fpseVariant === 3 ? 'FPSE3' : effectiveFaculty.toUpperCase()
    const finalName = trimmed.toLowerCase().includes(effectiveFaculty.toLowerCase())
      ? trimmed
      : `${keyPrefix} - ${trimmed}`
    setAddingKey(true)
    setError(null)

    const answers: AnswerKeyDetail = {}
    for (let i = 1; i <= newKeyCount; i++) {
      answers[String(i)] = ['A']
    }

    try {
      const resp = await fetch(`/api/exam/answer-keys/${encodeURIComponent(finalName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: finalName, answers }),
      })
      const data = await resp.json()
      if (data.success) {
        setAddMode(false)
        setNewKeyName('')
        setNewKeyCount(45)
        showSuccess(`Baremul "${finalName}" a fost creat`)
        loadKeys()
      } else {
        setError(data.message || 'Nu s-a putut crea baremul')
      }
    } catch {
      setError('Eroare la crearea baremului')
    } finally {
      setAddingKey(false)
    }
  }

  const handleGenerateRandom = async () => {
    if (!effectiveFaculty) {
      setError('Selectați o facultate mai întâi')
      return
    }
    setGeneratingRandom(true)
    setError(null)
    try {
      const resp = await fetch('/api/exam/answer-keys/generate-random', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ faculty: effectiveFaculty, fpse_variant: fpseVariant }),
      })
      const data = await resp.json()
      if (data.success) {
        showSuccess(data.message)
        loadKeys()
      } else {
        setError(data.message || 'Nu s-a putut genera baremul')
      }
    } catch {
      setError('Eroare la generarea baremului aleatoriu')
    } finally {
      setGeneratingRandom(false)
    }
  }

  const updateAnswer = (qNum: string, value: string) => {
    setEditModal(prev => ({
      ...prev,
      answers: { ...prev.answers, [qNum]: [value.toUpperCase()] },
    }))
  }

  if (!isOpen) return null

  const facultyLabel = effectiveFaculty ? effectiveFaculty.toUpperCase() : (isAdmin ? 'Toate facultățile' : 'N/A')

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
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700/50 shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(12px)',
          transition: 'transform 200ms ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-700/50" style={{ background: 'rgba(15,23,42,0.95)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(251,146,60,0.2), rgba(249,115,22,0.1))' }}>
              <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100">Bareme</h2>
              <p className="text-xs text-slate-500">Facultatea {facultyLabel}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          
          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex justify-between items-center">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-300 hover:text-white font-bold ml-3">×</button>
            </div>
          )}
          {successMsg && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
              {successMsg}
            </div>
          )}

          {allowManage && isAdmin && !hasFaculty && !editModal.isOpen && (
            <div className="mb-4 p-3 rounded-xl bg-slate-800/40 border border-slate-700/30 flex items-center gap-3">
              <label className="text-xs text-slate-400 font-semibold whitespace-nowrap">Facultate:</label>
              <select
                value={selectedFaculty}
                onChange={e => setSelectedFaculty(e.target.value)}
                className="flex-1 bg-slate-700/50 border border-slate-600/30 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">— Selectează —</option>
                {FACULTIES.map(f => (
                  <option key={f} value={f}>{f.toUpperCase()}</option>
                ))}
              </select>
            </div>
          )}

          {allowManage && !addMode && !editModal.isOpen && effectiveFaculty === 'fpse' && (
            <div className="mb-3 p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5">
              <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wider">Varianta FPSE</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setFpseVariant(4)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${fpseVariant === 4 ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
                >
                  4 raspunsuri <span className="text-xs opacity-70">(45 intrebari, A-D)</span>
                </button>
                <button
                  onClick={() => setFpseVariant(3)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${fpseVariant === 3 ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
                >
                  3 raspunsuri <span className="text-xs opacity-70">(36 intrebari, A-C)</span>
                </button>
              </div>
            </div>
          )}

          {allowManage && !addMode && !editModal.isOpen && (
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => setAddMode(true)}
                disabled={!effectiveFaculty}
                className="flex-1 py-2.5 rounded-xl border border-dashed border-slate-600/50 text-slate-400 hover:text-orange-400 hover:border-orange-500/30 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Adaugă barem nou
              </button>
              <button
                onClick={handleGenerateRandom}
                disabled={!effectiveFaculty || generatingRandom}
                className="py-2.5 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {generatingRandom ? 'Se generează...' : '🎲 Generează aleatoriu'}
              </button>
            </div>
          )}

          {addMode && !editModal.isOpen && (
            <div className="mb-4 p-4 rounded-xl bg-slate-800/40 border border-slate-700/30 space-y-3">
              <p className="text-sm font-semibold text-slate-300">Barem nou pentru <span className="text-orange-400">{effectiveFaculty?.toUpperCase()}</span></p>

              {effectiveFaculty === 'fpse' && (
                <div className="p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5">
                  <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wider">Varianta FPSE</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setFpseVariant(4); setNewKeyCount(45) }}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${fpseVariant === 4 ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
                    >
                      4 raspunsuri <span className="opacity-70">(45 intrebari, A-D)</span>
                    </button>
                    <button
                      onClick={() => { setFpseVariant(3); setNewKeyCount(36) }}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${fpseVariant === 3 ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
                    >
                      3 raspunsuri <span className="opacity-70">(36 intrebari, A-C)</span>
                    </button>
                  </div>
                </div>
              )}

              <input
                type="text"
                placeholder={`ex: Sesiune Iunie 2026`}
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600/30 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <p className="text-xs text-slate-500">Numele va fi prefixat automat cu <span className="text-slate-400">{effectiveFaculty?.toUpperCase()}</span> dacă nu conține deja.</p>
              {effectiveFaculty !== 'fpse' && (
              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-500">Număr întrebări:</label>
                <select
                  value={newKeyCount}
                  onChange={e => setNewKeyCount(Number(e.target.value))}
                  className="bg-slate-700/50 border border-slate-600/30 rounded-lg px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                  <option value={40}>40</option>
                  <option value={45}>45</option>
                </select>
              </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleAddKey}
                  disabled={addingKey}
                  className="flex-1 py-2 rounded-lg bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {addingKey ? 'Se creează...' : 'Creează'}
                </button>
                <button
                  onClick={() => { setAddMode(false); setNewKeyName(''); setError(null) }}
                  className="flex-1 py-2 rounded-lg bg-slate-700/30 text-slate-400 hover:bg-slate-700/50 text-sm font-medium transition-colors"
                >
                  Anulează
                </button>
              </div>
            </div>
          )}

          {loading && !editModal.isOpen && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-10 h-10 border-3 border-orange-400 border-t-transparent rounded-full animate-spin mb-4" />
              <span className="text-slate-400 text-sm">Se încarcă baremele...</span>
            </div>
          )}

          {!loading && !editModal.isOpen && keys.length === 0 && (
            <div className="text-center py-12">
              <p className="text-slate-400 text-sm">Nu există bareme pentru {facultyLabel}.</p>
            </div>
          )}

          {!loading && !editModal.isOpen && keys.length > 0 && (
            <div className="space-y-3">
              {keys.map(key => (
                <div
                  key={key.name}
                  className="flex items-center justify-between p-4 rounded-xl bg-slate-800/30 border border-slate-700/30 hover:border-slate-600/50 transition-colors group"
                >
                  <div>
                    <p className="font-semibold text-slate-200 group-hover:text-orange-300 transition-colors">{key.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{key.questions} întrebări</p>
                  </div>
                  {allowManage && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(key.name)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                      >
                        Editează
                      </button>
                      <button
                        onClick={() => handleDelete(key.name)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      >
                        Șterge
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {editModal.isOpen && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-200">Editare: {editModal.keyName}</h3>
                  <p className="text-xs text-slate-500">{Object.keys(editModal.answers).length} întrebări</p>
                </div>
                <button
                  onClick={() => setEditModal({ isOpen: false, keyName: '', answers: {}, saving: false })}
                  className="text-slate-400 hover:text-slate-200 text-sm"
                >
                  ← Înapoi
                </button>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3 mb-5">
                {Object.keys(editModal.answers)
                  .sort((a, b) => parseInt(a) - parseInt(b))
                  .map(qNum => (
                    <div key={qNum} className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/20">
                      <label className="block text-xs text-slate-500 mb-1 font-semibold">Q{qNum}</label>
                      <select
                        value={editModal.answers[qNum]?.[0] || 'A'}
                        onChange={e => updateAnswer(qNum, e.target.value)}
                        className="w-full bg-slate-700/50 border border-slate-600/30 rounded-lg px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                      </select>
                    </div>
                  ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={editModal.saving}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 font-medium text-sm transition-colors disabled:opacity-50"
                >
                  {editModal.saving ? 'Se salvează...' : 'Salvează'}
                </button>
                <button
                  onClick={() => setEditModal({ isOpen: false, keyName: '', answers: {}, saving: false })}
                  className="flex-1 py-2.5 rounded-xl bg-slate-700/30 text-slate-400 hover:bg-slate-700/50 font-medium text-sm transition-colors"
                >
                  Anulează
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
