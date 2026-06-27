import React, { useState, useEffect } from 'react'
import { useAuthStore } from '../store'
import { isGlobalAdmin } from '../utils/permissions'
import { authAPI } from '../api/client'

interface UserData {
  id: string
  email: string
  role: string
  faculty: string
  created_at: string
}

interface AnswerKey {
  name: string
  questions: number
}

interface AnswerKeyDetail {
  [questionNum: string]: string[]
}

interface NewUserForm {
  email: string
  password: string
  role: 'admin' | 'teacher'
  faculty: string
}

const FACULTIES = ['fsgc', 'drept', 'sport', 'fsas', 'fpse', 'finalizare'] as const

export const SettingsPage: React.FC = () => {
  const user = useAuthStore((state) => state.user)
  const [activeTab, setActiveTab] = useState<'pending' | 'users' | 'keys' | 'config'>('pending')
  const [users, setUsers] = useState<UserData[]>([])
  const [pendingUsers, setPendingUsers] = useState<UserData[]>([])
  const [answerKeys, setAnswerKeys] = useState<AnswerKey[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [showAddUserForm, setShowAddUserForm] = useState(false)
  const [newUser, setNewUser] = useState<NewUserForm>({
    email: '',
    password: '',
    role: 'teacher',
    faculty: 'default',
  })

  const [editModal, setEditModal] = useState<{
    isOpen: boolean
    keyName: string
    answers: AnswerKeyDetail
    saving: boolean
  }>({ isOpen: false, keyName: '', answers: {}, saving: false })

  const [selectedFaculty, setSelectedFaculty] = useState<string>('')
  const [fpseVariant, setFpseVariant] = useState<3 | 4>(4)
  const [generatingRandom, setGeneratingRandom] = useState(false)
  const [addMode, setAddMode] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyCount, setNewKeyCount] = useState(45)
  const [addingKey, setAddingKey] = useState(false)

  if (!isGlobalAdmin(user)) {
    return (
      <div className="glass-stat rounded-2xl p-6 border border-red-500/20 text-red-300 animate-float-up">
        <p className="font-semibold">Access Denied</p>
        <p className="text-sm">Doar administratorii globali au acces la setările sistemului.</p>
      </div>
    )
  }

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  const loadUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/users')
      const data = await response.json()
      if (data.success && data.users) {
        setUsers(data.users.filter((u: any) => u.approved !== 'false').map((u: any) => ({
          id: u.id,
          email: u.email,
          role: u.role || 'user',
          faculty: u.faculty || 'default',
          created_at: u.created_at ? u.created_at.split('T')[0] : '-',
        })))
      } else {
        setError(data.message || 'Failed to load users')
      }
    } catch (err: any) {
      setError('Failed to load users from server')
    } finally {
      setLoading(false)
    }
  }

  const loadPendingUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await authAPI.getPendingUsers()
      if (response.data.success && response.data.users) {
        setPendingUsers(response.data.users.map((u: any) => ({
          id: u.id,
          email: u.email,
          role: u.role || 'user',
          faculty: u.faculty || 'default',
          created_at: u.created_at ? u.created_at.split('T')[0] : '-',
        })))
      } else {
        setError(response.data.message || 'Failed to load pending users')
      }
    } catch (err: any) {
      setError('Failed to load pending users')
    } finally {
      setLoading(false)
    }
  }

  const handleApproveUser = async (userId: string, email: string, role?: string, faculty?: string) => {
    try {
      const response = await authAPI.approveUser(userId, role, faculty)
      if (response.data.success) {
        showSuccess(`User "${email}" approved`)
        loadPendingUsers()
      } else {
        setError(response.data.message || 'Failed to approve user')
      }
    } catch (err: any) {
      setError('Error approving user')
    }
  }

  const handleRejectUser = async (userId: string, email: string) => {
    if (!confirm(`Reject and delete account "${email}"? This cannot be undone.`)) return
    try {
      const response = await authAPI.rejectUser(userId)
      if (response.data.success) {
        showSuccess(`User "${email}" rejected`)
        loadPendingUsers()
      } else {
        setError(response.data.message || 'Failed to reject user')
      }
    } catch (err: any) {
      setError('Error rejecting user')
    }
  }

  const loadAnswerKeys = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/exam/answer-keys')
      const data = await response.json()
      if (data.success && data.answer_keys) {
        
        const keysWithCounts: AnswerKey[] = await Promise.all(
          data.answer_keys.map(async (name: string) => {
            try {
              const r = await fetch(`/api/exam/answer-keys/${encodeURIComponent(name)}`)
              const d = await r.json()
              return { name, questions: d.success ? Object.keys(d.answers).length : 0 }
            } catch {
              return { name, questions: 0 }
            }
          })
        )
        setAnswerKeys(keysWithCounts)
      }
    } catch (err: any) {
      setError('Failed to load answer keys')
    } finally {
      setLoading(false)
    }
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUser.email || !newUser.password) {
      setError('Email and password are required')
      return
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })

      const data = await response.json()
      if (data.success) {
        setNewUser({ email: '', password: '', role: 'teacher', faculty: 'default' })
        setShowAddUserForm(false)
        setError(null)
        showSuccess('User created successfully')
        
        loadUsers()
      } else {
        setError(data.message || 'Failed to add user')
      }
    } catch (err: any) {
      setError('Error adding user: ' + err.message)
    }
  }

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Delete user "${email}"? This action cannot be undone.`)) return

    try {
      const response = await fetch(`/api/auth/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      })
      const data = await response.json()

      if (data.success) {
        showSuccess(`User "${email}" deleted`)
        loadUsers()
      } else {
        setError(data.message || 'Failed to delete user')
      }
    } catch (err: any) {
      setError('Error deleting user')
    }
  }

  const handleAddNewKey = async () => {
    const trimmed = newKeyName.trim()
    if (!trimmed) { setError('Numele baremului este obligatoriu'); return }
    if (!selectedFaculty) { setError('Selectați o facultate mai întâi'); return }

    const keyPrefix = selectedFaculty === 'fpse' && fpseVariant === 3 ? 'FPSE3' : selectedFaculty.toUpperCase()
    const finalName = trimmed.toLowerCase().includes(selectedFaculty.toLowerCase())
      ? trimmed
      : `${keyPrefix} - ${trimmed}`

    setAddingKey(true)
    setError(null)

    const answers: AnswerKeyDetail = {}
    for (let i = 1; i <= newKeyCount; i++) answers[String(i)] = ['A']

    try {
      const resp = await fetch(`/api/exam/answer-keys/${encodeURIComponent(finalName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: finalName, answers }),
      })
      const data = await resp.json()
      if (data.success) {
        setAddMode(false); setNewKeyName(''); setNewKeyCount(45)
        showSuccess(`Baremul "${finalName}" a fost creat`)
        loadAnswerKeys()
      } else { setError(data.message || 'Nu s-a putut crea baremul') }
    } catch { setError('Eroare la crearea baremului') }
    finally { setAddingKey(false) }
  }

  const handleGenerateRandom = async () => {
    if (!selectedFaculty) { setError('Selectați o facultate mai întâi'); return }
    setGeneratingRandom(true); setError(null)
    try {
      const resp = await fetch('/api/exam/answer-keys/generate-random', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faculty: selectedFaculty, fpse_variant: fpseVariant }),
      })
      const data = await resp.json()
      if (data.success) { showSuccess(data.message); loadAnswerKeys() }
      else { setError(data.message || 'Nu s-a putut genera baremul') }
    } catch { setError('Eroare la generarea baremului aleatoriu') }
    finally { setGeneratingRandom(false) }
  }

  const handleDeleteAnswerKey = async (keyName: string) => {
    if (!confirm(`Delete answer key "${keyName}"?`)) return

    try {
      const response = await fetch(`/api/exam/answer-keys/${encodeURIComponent(keyName)}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setAnswerKeys(answerKeys.filter((k) => k.name !== keyName))
        showSuccess(`Answer key "${keyName}" deleted`)
      } else {
        setError('Failed to delete answer key')
      }
    } catch (err: any) {
      setError('Error deleting answer key')
    }
  }

  const handleEditAnswerKey = async (keyName: string) => {
    try {
      const response = await fetch(`/api/exam/answer-keys/${encodeURIComponent(keyName)}`)
      const data = await response.json()
      if (data.success) {
        setEditModal({ isOpen: true, keyName, answers: data.answers, saving: false })
      } else {
        setError(`Failed to load answer key: ${data.message}`)
      }
    } catch (err: any) {
      setError('Error loading answer key data')
    }
  }

  const handleSaveAnswerKey = async () => {
    setEditModal((prev) => ({ ...prev, saving: true }))
    try {
      const response = await fetch(`/api/exam/answer-keys/${encodeURIComponent(editModal.keyName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editModal.keyName, answers: editModal.answers }),
      })
      const data = await response.json()
      if (data.success) {
        setEditModal({ isOpen: false, keyName: '', answers: {}, saving: false })
        showSuccess(`Answer key "${editModal.keyName}" saved`)
        loadAnswerKeys()
      } else {
        setError(data.message || 'Failed to save')
        setEditModal((prev) => ({ ...prev, saving: false }))
      }
    } catch (err: any) {
      setError('Error saving answer key')
      setEditModal((prev) => ({ ...prev, saving: false }))
    }
  }

  const updateAnswer = (qNum: string, value: string) => {
    setEditModal((prev) => ({
      ...prev,
      answers: { ...prev.answers, [qNum]: [value.toUpperCase()] },
    }))
  }

  useEffect(() => {
    if (activeTab === 'pending') {
      loadPendingUsers()
    } else if (activeTab === 'users') {
      loadUsers()
    } else if (activeTab === 'keys') {
      loadAnswerKeys()
    }
  }, [activeTab])

  const tabs = [
    { id: 'pending' as const, label: 'Pending Approvals' },
    { id: 'users' as const, label: 'Users Management' },
    { id: 'keys' as const, label: 'Answer Keys' },
    { id: 'config' as const, label: 'Configuration' },
  ]

  return (
    <div className="max-w-6xl mx-auto">
      
      <div className="hero-gradient rounded-2xl p-8 relative overflow-hidden animate-float-up mb-6">
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)', animation: 'pulse-ring 4s ease-in-out infinite' }} />
        <div className="absolute -bottom-12 -left-12 w-36 h-36 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #06b6d4, transparent 70%)', animation: 'pulse-ring 5s ease-in-out 1s infinite' }} />
        <div className="relative z-10">
          <h1 className="text-4xl font-extrabold mb-2 text-gradient tracking-tight">
            System Settings
          </h1>
          <p className="text-slate-400 text-sm">Gestionează utilizatori, bareme și configurația sistemului</p>
        </div>
      </div>

      <div className="glass-stat rounded-2xl p-2 flex gap-2 mb-6 overflow-x-auto animate-float-up" style={{ animationDelay: '0.06s' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 rounded-xl font-medium whitespace-nowrap transition-all duration-300 text-sm ${
              activeTab === tab.id
                ? 'btn-primary-pulse text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="status-error mb-6 animate-slide-in">
          {error}
          <button onClick={() => setError(null)} className="ml-4 text-red-200 hover:text-white font-bold">x</button>
        </div>
      )}

      {successMsg && (
        <div className="status-success mb-6 animate-slide-in">
          {successMsg}
        </div>
      )}

      {activeTab === 'pending' && (
        <div className="glass-stat rounded-2xl p-6 animate-float-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gradient">Pending Approvals</h2>
            <button onClick={loadPendingUsers} className="text-sm text-slate-400 hover:text-indigo-400 transition-colors">
              Refresh
            </button>
          </div>

          {!loading ? (
            pendingUsers.length > 0 ? (
              <div className="space-y-4">
                {pendingUsers.map((u) => (
                  <div key={u.id} className="glass rounded-xl p-5 border border-amber-500/20 hover:border-amber-500/40 transition-all duration-300">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-200 font-semibold text-lg">{u.email}</p>
                        <div className="flex gap-3 mt-1">
                          <span className="text-xs text-slate-500">Faculty: <span className="text-slate-400">{u.faculty.toUpperCase()}</span></span>
                          <span className="text-xs text-slate-500">Registered: <span className="text-slate-400">{u.created_at}</span></span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApproveUser(u.id, u.email, 'user', u.faculty)}
                          className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all duration-300"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectUser(u.id, u.email)}
                          className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 transition-all duration-300"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 mb-4">
                  <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-slate-400 text-lg font-medium">No pending approvals</p>
                <p className="text-slate-500 text-sm mt-1">All registration requests have been handled.</p>
              </div>
            )
          ) : (
            <div className="text-center py-8 text-slate-400">Loading pending users...</div>
          )}
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-6">
          
          {showAddUserForm && (
            <div className="glass-stat rounded-2xl p-6 animate-float-up" style={{ borderLeft: '3px solid #10b981', animationDelay: '0.1s' }}>
              <h3 className="text-xl font-bold text-gradient mb-4">Add New User</h3>
              <form onSubmit={handleAddUser} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="email"
                    placeholder="Email address"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    className="input col-span-2"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="input"
                  />
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value as 'admin' | 'teacher' })}
                    className="input"
                  >
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
                  <select
                    value={newUser.faculty}
                    onChange={(e) => setNewUser({ ...newUser, faculty: e.target.value })}
                    className="input"
                  >
                    <option value="default">Default</option>
                    <option value="drept">Drept</option>
                    <option value="fsgc">FSGC</option>
                    <option value="fsas">FSAS</option>
                    <option value="fpse">FPSE</option>
                    <option value="finalizare">Finalizare</option>
                    <option value="sport">Sport</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <button type="submit" className="btn-success flex-1">
                    Create User
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddUserForm(false)}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="glass-stat rounded-2xl p-6 animate-float-up" style={{ animationDelay: '0.12s' }}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gradient">User Management</h2>
              <button
                onClick={() => setShowAddUserForm(!showAddUserForm)}
                className="btn-primary btn-primary-pulse"
              >
                Add User
              </button>
            </div>

            {!loading ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-700/50">
                    <tr>
                      <th className="text-left py-3 px-4 text-slate-500 font-semibold text-xs uppercase tracking-wider">Email</th>
                      <th className="text-left py-3 px-4 text-slate-500 font-semibold text-xs uppercase tracking-wider">Role</th>
                      <th className="text-left py-3 px-4 text-slate-500 font-semibold text-xs uppercase tracking-wider">Faculty</th>
                      <th className="text-left py-3 px-4 text-slate-500 font-semibold text-xs uppercase tracking-wider">Created</th>
                      <th className="text-left py-3 px-4 text-slate-500 font-semibold text-xs uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="table-row-hover border-b border-slate-800/50 transition-colors">
                        <td className="py-4 px-4 text-slate-300">{u.email}</td>
                        <td className="py-4 px-4">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              u.role === 'admin' ? 'badge-info' : 'badge'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-slate-400">{u.faculty.toUpperCase()}</td>
                        <td className="py-4 px-4 text-slate-500 text-xs">{u.created_at}</td>
                        <td className="py-4 px-4">
                          <div className="flex gap-2">
                            <button className="text-blue-400 hover:text-blue-300 text-sm transition-colors font-medium">
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id, u.email)}
                              className="text-red-400 hover:text-red-300 text-sm transition-colors font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">Loading users...</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'keys' && (
        <div className="glass-stat rounded-2xl p-6 animate-float-up" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-2xl font-bold text-gradient mb-6">Answer Keys Management</h2>

          <div className="mb-5 p-4 rounded-xl bg-slate-800/40 border border-slate-700/30">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm text-slate-400 font-semibold">Facultate:</label>
              <select
                value={selectedFaculty}
                onChange={e => setSelectedFaculty(e.target.value)}
                className="input max-w-xs"
              >
                <option value="">— Selectează facultatea —</option>
                {FACULTIES.map(f => (
                  <option key={f} value={f}>{f.toUpperCase()}</option>
                ))}
              </select>
              
              {selectedFaculty === 'fpse' && (
                <div className="flex gap-2 ml-2">
                  <button
                    onClick={() => { setFpseVariant(4); setNewKeyCount(45) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${fpseVariant === 4 ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400 hover:text-slate-200'}`}
                  >4 rasp (A-D)</button>
                  <button
                    onClick={() => { setFpseVariant(3); setNewKeyCount(36) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${fpseVariant === 3 ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400 hover:text-slate-200'}`}
                  >3 rasp (A-C)</button>
                </div>
              )}
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={() => setAddMode(true)}
                  disabled={!selectedFaculty || addMode}
                  className="btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  + Adaugă barem
                </button>
                <button
                  onClick={handleGenerateRandom}
                  disabled={!selectedFaculty || generatingRandom}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {generatingRandom ? 'Se generează...' : 'Generează aleatoriu'}
                </button>
              </div>
            </div>
          </div>

          {addMode && (
            <div className="mb-5 p-4 rounded-xl bg-slate-800/40 border border-orange-500/20 space-y-3 animate-float-up">
              <p className="text-sm font-semibold text-slate-300">
                Barem nou pentru <span className="text-orange-400">{selectedFaculty?.toUpperCase()}</span>
              </p>
              <input
                type="text"
                placeholder="ex: Sesiune Iunie 2026"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                className="input w-full"
              />
              <p className="text-xs text-slate-500">
                Numele va fi prefixat automat cu <span className="text-slate-400">{selectedFaculty?.toUpperCase()}</span> dacă nu conține deja.
              </p>
              {selectedFaculty !== 'fpse' ? (
                <div className="flex items-center gap-3">
                  <label className="text-xs text-slate-500">Număr întrebări:</label>
                  <select
                    value={newKeyCount}
                    onChange={e => setNewKeyCount(Number(e.target.value))}
                    className="input max-w-[100px]"
                  >
                    <option value={20}>20</option>
                    <option value={30}>30</option>
                    <option value={40}>40</option>
                    <option value={45}>45</option>
                  </select>
                </div>
              ) : (
                <p className="text-xs text-indigo-400">
                  {fpseVariant === 3 ? '36 întrebări, 3 raspunsuri (A-C)' : '45 întrebări, 4 raspunsuri (A-D)'}
                </p>
              )}
              <div className="flex gap-2">
                <button onClick={handleAddNewKey} disabled={addingKey} className="btn-success flex-1 disabled:opacity-50">
                  {addingKey ? 'Se creează...' : 'Creează'}
                </button>
                <button
                  onClick={() => { setAddMode(false); setNewKeyName(''); setError(null) }}
                  className="btn-secondary flex-1"
                >
                  Anulează
                </button>
              </div>
            </div>
          )}

          {!loading ? (
            answerKeys.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {answerKeys.map((key, idx) => (
                  <div
                    key={idx}
                    className="glass-stat rounded-2xl p-5 hover:scale-[1.02] transition-all duration-300 group dash-card-lift"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-bold text-slate-200 text-lg group-hover:text-indigo-300 transition-colors">{key.name}</p>
                        <p className="text-xs text-slate-500 mt-1">{key.questions} questions</p>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-3 border-t border-slate-700/30">
                      <button
                        onClick={() => handleEditAnswerKey(key.name)}
                        className="text-indigo-400 hover:text-indigo-300 text-sm flex-1 transition-colors font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteAnswerKey(key.name)}
                        className="text-red-400/70 hover:text-red-300 text-sm flex-1 transition-colors font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-slate-400 text-lg font-medium">Nu există bareme</p>
                <p className="text-slate-500 text-sm mt-1">Selectați o facultate și creați un barem nou.</p>
              </div>
            )
          ) : (
            <div className="text-center py-8 text-slate-400">Loading answer keys...</div>
          )}
        </div>
      )}

      {activeTab === 'config' && (
        <div className="glass-stat rounded-2xl p-6 animate-float-up space-y-6" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-2xl font-bold text-gradient mb-6">System Configuration</h2>

          <div className="space-y-4">
            <div className="glass rounded-xl p-4">
              <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Max Batch Files</label>
              <input type="number" value={250} className="input" disabled />
              <p className="text-xs text-slate-600 mt-2">Maximum files allowed per batch processing</p>
            </div>

            <div className="glass rounded-xl p-4">
              <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Default Answer Key</label>
              <select className="input">
                <option>TestKey</option>
                <option>DefaultKey</option>
              </select>
            </div>

            <div className="glass rounded-xl p-4">
              <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Grid Detection Type</label>
              <select className="input">
                <option>Automatic (Recommended)</option>
                <option>Manual Configuration</option>
              </select>
            </div>

            <div className="flex items-center gap-3 glass rounded-xl p-4">
              <input type="checkbox" id="auto-save" defaultChecked className="w-4 h-4" />
              <label htmlFor="auto-save" className="text-slate-300">
                Auto-save configurations
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-700/30">
            <button className="btn-primary">Save Configuration</button>
          </div>
        </div>
      )}

      {editModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 "
             onClick={(e) => { if (e.target === e.currentTarget) setEditModal({ isOpen: false, keyName: '', answers: {}, saving: false }) }}>
          <div className="glass-card rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-auto shadow-2xl animate-scale-in">
            
            <div className="sticky top-0 glass rounded-t-2xl border-b border-slate-700/30 p-6 flex justify-between items-center z-10">
              <div>
                <h3 className="text-2xl font-bold text-gradient">Edit Answer Key</h3>
                <p className="text-slate-500 text-sm mt-1">{editModal.keyName} - {Object.keys(editModal.answers).length} questions</p>
              </div>
              <button
                onClick={() => setEditModal({ isOpen: false, keyName: '', answers: {}, saving: false })}
                className="text-slate-400 hover:text-slate-200 transition-colors text-2xl"
              >
                x
              </button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3">
                {Object.keys(editModal.answers)
                  .sort((a, b) => parseInt(a) - parseInt(b))
                  .map((qNum) => (
                    <div key={qNum} className="glass rounded-xl p-3 hover:border-indigo-500/30 border border-transparent transition-all duration-200">
                      <label className="block text-xs text-slate-500 mb-1 font-semibold">Q{qNum}</label>
                      <select
                        value={editModal.answers[qNum]?.[0] || 'A'}
                        onChange={(e) => updateAnswer(qNum, e.target.value)}
                        className="w-full bg-slate-800/50 border border-slate-600/30 rounded-lg px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      >
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                        <option value="E">E</option>
                      </select>
                    </div>
                  ))}
              </div>
            </div>

            <div className="sticky bottom-0 glass rounded-b-2xl border-t border-slate-700/30 p-6 flex gap-3">
              <button
                onClick={handleSaveAnswerKey}
                disabled={editModal.saving}
                className="btn-success flex-1"
              >
                {editModal.saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditModal({ isOpen: false, keyName: '', answers: {}, saving: false })}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
