import React, { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '../store'
import { examAPI } from '../api/client'

interface AnalysisResult {
  student_id: string
  grade: number | null
  status: string
  original_filename: string
  annotated_image?: string
  answers?: Record<string, string>
}

export const SingleUploadPage: React.FC = () => {
  const user = useAuthStore((state) => state.user)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [answerKeys, setAnswerKeys] = useState<string[]>([])
  const [selectedAnswerKey, setSelectedAnswerKey] = useState('')
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [exportStatus, setExportStatus] = useState<string | null>(null)

  const faculty = user?.faculty || 'default'

  useEffect(() => {
    const fetchKeys = async () => {
      try {
        const response = await examAPI.getAnswerKeys()
        if (response.data.success && response.data.answer_keys) {
          setAnswerKeys(response.data.answer_keys)
          if (response.data.answer_keys.length > 0) {
            setSelectedAnswerKey(response.data.answer_keys[0])
          }
        }
      } catch (err: any) {
        if (err.response?.status === 403) {
          setError(err.response.data?.message || 'Facultatea nu este configurată.')
        } else {
          console.error('Failed to fetch answer keys:', err)
        }
      }
    }
    fetchKeys()
  }, [])

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files?.[0]) selectFile(e.dataTransfer.files[0])
  }

  const selectFile = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase() || ''
    if (!['jpg', 'jpeg', 'png', 'bmp', 'tiff'].includes(ext)) {
      setError('Invalid file type. Use JPG, PNG, BMP or TIFF.')
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setResult(null)
    setError(null)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) selectFile(e.target.files[0])
  }

  const handleAnalyze = async () => {
    if (!file) {
      setError('Please select a file first')
      return
    }

    setProcessing(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('answer_key', selectedAnswerKey)

      let sim = 0
      const interval = setInterval(() => {
        sim += Math.random() * 25
        if (sim > 90) sim = 90
        setProgress(Math.floor(sim))
      }, 400)

      const response = await fetch('/api/upload/exam-sheet', {
        method: 'POST',
        body: formData,
      })

      clearInterval(interval)
      setProgress(100)

      const data = await response.json()
      if (data.success && data.analysis) {
        setResult({
          student_id: data.analysis.student_id || 'N/A',
          grade: data.analysis.grade,
          status: data.analysis.grade !== null ? 'Success' : 'Error',
          original_filename: file.name,
          annotated_image: data.analysis.output_image || null,
          answers: data.analysis.answers || {},
        })
      } else {
        throw new Error(data.message || 'Analysis failed')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during analysis')
    } finally {
      setProcessing(false)
      setTimeout(() => setProgress(0), 800)
    }
  }

  const handleReset = () => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    setProgress(0)
    setExportStatus(null)
  }

  return (
    <div className="max-w-5xl mx-auto">
      
      <div className="hero-gradient rounded-2xl p-8 relative overflow-hidden animate-float-up mb-6">
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #c084fc, transparent 70%)', animation: 'pulse-ring 4s ease-in-out infinite' }} />
        <div className="absolute -bottom-12 -left-12 w-36 h-36 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #f472b6, transparent 70%)', animation: 'pulse-ring 5s ease-in-out 1s infinite' }} />
        <div className="relative z-10">
          <h1 className="text-4xl font-extrabold mb-2 text-gradient-warm tracking-tight">
            Single Sheet Analysis
          </h1>
          <p className="text-slate-400 text-sm">
            Încarcă o fișă de examen și vizualizează rezultatele detecției
          </p>
        </div>
      </div>

      <div className="glass-stat rounded-2xl p-6 mb-6 animate-float-up" style={{ animationDelay: '0.06s' }}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
              Faculty: <span className="font-bold text-violet-400">{faculty.toUpperCase()}</span>
            </label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Answer Key</label>
            <select
              value={selectedAnswerKey}
              onChange={(e) => setSelectedAnswerKey(e.target.value)}
              className="input"
              disabled={processing}
            >
              {answerKeys.map((key) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!result ? (
        <>
          
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`dropzone rounded-2xl p-6 mb-6 animate-float-up ${dragActive ? 'active' : ''}`}
            style={{
              animationDelay: '0.12s',
              ...(file && !dragActive ? {
                borderColor: 'rgba(16,185,129,0.35)',
                background: 'rgba(16,185,129,0.04)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(16,185,129,0.08)',
              } : {}),
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.bmp,.tiff"
              onChange={handleFileSelect}
              className="hidden"
            />

            {file && preview ? (
              <div className="flex items-center gap-6">
                <img
                  src={preview}
                  alt="Selected"
                  className="w-40 h-40 object-cover rounded-lg border border-slate-700"
                />
                <div className="flex-1">
                  <p className="text-lg font-semibold text-slate-200">{file.name}</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                  <p className="text-xs text-emerald-400 mt-2">Ready for analysis</p>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleReset() }}
                    className="text-red-400 hover:text-red-300 text-sm mt-3 font-medium"
                  >
                    Remove file
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="w-16 h-16 mx-auto text-slate-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
                <p className="text-slate-300 mb-1">
                  <span className="font-bold text-purple-400">Click to select</span> or drag and drop
                </p>
                <p className="text-sm text-slate-500">PNG, JPG, BMP, TIFF</p>
              </div>
            )}
          </div>

          {error && (
            <div className="status-error mb-6 animate-slide-in">{error}</div>
          )}

          {processing && (
            <div className="glass-stat rounded-2xl p-6 mb-6 animate-float-up">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-300 font-medium">Analyzing sheet...</p>
                <p className="text-blue-400 font-bold">{progress}%</p>
              </div>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <div className="glass-stat rounded-2xl p-6 animate-float-up" style={{ animationDelay: '0.15s' }}>
            <button
              onClick={handleAnalyze}
              disabled={!file || processing}
              className={`w-full py-3 rounded-lg font-bold text-lg transition-all duration-300 ${
                !file || processing
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'btn-primary-pulse text-white'
              }`}
            >
              {processing ? `Analyzing ${progress}%...` : 'Analyze Sheet'}
            </button>
          </div>
        </>
      ) : (
        
        <div className="space-y-6 animate-slide-in">
          
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-stat rounded-2xl p-5 animate-float-up dash-card-lift" style={{ borderLeft: '3px solid #6366f1', animationDelay: '0.08s' }}>
              <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Student ID</p>
              <p className="text-3xl font-extrabold text-indigo-400 mt-1 tabular-nums">{result.student_id || 'N/A'}</p>
            </div>
            <div className={`glass-stat rounded-2xl p-5 animate-float-up dash-card-lift`} style={{ borderLeft: `3px solid ${result.grade !== null && result.grade >= 5 ? '#10b981' : '#ef4444'}`, animationDelay: '0.14s' }}>
              <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Grade</p>
              <p className={`text-3xl font-extrabold ${
                result.grade !== null && result.grade >= 5 ? 'text-emerald-400' : 'text-red-400'
              } tabular-nums`}>
                {result.grade !== null ? result.grade.toFixed(2) : '-'} / 10
              </p>
            </div>
          </div>

          <div className="glass-stat rounded-2xl p-6 animate-float-up" style={{ animationDelay: '0.18s' }}>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                result.status === 'Success' ? 'badge-success' : result.status === 'Error' ? 'badge-error' : 'badge-warning'
              }`}>
                {result.status}
              </span>
              <span className="text-slate-400 text-sm">{result.original_filename}</span>
            </div>
          </div>

          {result.annotated_image ? (
            <div className="glass-stat rounded-2xl p-6 animate-float-up" style={{ animationDelay: '0.22s' }}>
              <h3 className="text-xl font-bold text-gradient mb-4">Detection Result</h3>
              <p className="text-slate-400 text-sm mb-4">
                The image below shows how the grid detection worked on your exam sheet.
              </p>
              <div className="rounded-xl overflow-hidden border border-slate-700/30">
                <img
                  src={result.annotated_image}
                  alt="Analyzed exam sheet"
                  className="w-full rounded-lg"
                />
              </div>
              <p className="text-xs text-slate-500 text-center mt-3">
                Green: Correct answers &bull; Red: Incorrect answers &bull; Blue: Detected options
              </p>
            </div>
          ) : (
            <div className="glass-stat rounded-2xl p-6 text-center py-8 animate-float-up" style={{ animationDelay: '0.22s' }}>
              <p className="text-slate-400">No annotated image available for this result.</p>
            </div>
          )}

          <div className="glass-stat rounded-2xl p-6 flex gap-4 animate-float-up" style={{ animationDelay: '0.26s' }}>
            <button onClick={handleReset} className="btn-primary flex-1">
              Analyze Another Sheet
            </button>
            <button
              onClick={async () => {
                if (!result) return
                setExportStatus('Exporting...')
                try {
                  const resp = await examAPI.exportToNocoDB(
                    [{ student_id: result.student_id, grade: result.grade, answers: result.answers, status: result.status, annotated_image: result.annotated_image }],
                    selectedAnswerKey
                  )
                  if (resp.data.success) {
                    setExportStatus(resp.data.message)
                  } else {
                    setExportStatus('Export failed: ' + (resp.data.message || 'Unknown error'))
                  }
                } catch (err: any) {
                  setExportStatus('Export failed: ' + (err.response?.data?.message || err.message))
                }
              }}
              disabled={exportStatus === 'Exporting...'}
              className="btn-success flex-1"
            >
              {exportStatus === 'Exporting...' ? 'Exporting...' : 'Export to NocoDB'}
            </button>
          </div>
          {exportStatus && exportStatus !== 'Exporting...' && (
            <div className={exportStatus.includes('failed') ? 'status-error' : 'status-success'}>
              {exportStatus}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
