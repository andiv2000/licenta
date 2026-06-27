import React, { useState, useRef } from 'react'
import { useAuthStore, useThemeStore } from '../store'
import { examAPI } from '../api/client'

interface FileItem {
  file: File
  id: string
  preview?: string
}

interface BatchResult {
  student_id: string
  grade: number | null
  correct_count?: number | null
  status: string
  original_filename: string
  annotated_image?: string
  answer_key_used?: string
  answers?: Record<string, string>
}

interface ImageModalData {
  isOpen: boolean
  studentId: string
  imagePath?: string
  grade?: number
  answerKeyUsed?: string
  correctCount?: number
}

export const BatchProcessingPage: React.FC = () => {
  const user = useAuthStore((state) => state.user)
  const [files, setFiles] = useState<FileItem[]>([])
  const [answerKeys, setAnswerKeys] = useState<string[]>(['TestKey', 'DefaultKey'])
  const [selectedAnswerKey, setSelectedAnswerKey] = useState('TestKey')

  const AUTO_DETECT_KEY       = '__AUTO_DETECT__'
  const AUTO_DETECT_FPSE3_KEY = '__AUTO_DETECT_FPSE3__'
  const AUTO_DETECT_FPSE4_KEY = '__AUTO_DETECT_FPSE4__'
  const AUTO_DETECT_FSAS_KEY  = '__AUTO_DETECT_FSAS__'
  const isAutoDetect      = selectedAnswerKey === AUTO_DETECT_KEY
  const isAutoDetectFpse3 = selectedAnswerKey === AUTO_DETECT_FPSE3_KEY
  const isAutoDetectFpse4 = selectedAnswerKey === AUTO_DETECT_FPSE4_KEY
  const isAutoDetectFsas  = selectedAnswerKey === AUTO_DETECT_FSAS_KEY

  const defaultAutoDetectKey = React.useMemo(() => {
    if (!user?.faculty || user.is_global_admin) return AUTO_DETECT_KEY
    const fac = (user.faculty || '').toLowerCase()
    if (fac === 'fpse') return AUTO_DETECT_FPSE3_KEY
    if (fac === 'fsgc') return AUTO_DETECT_KEY
    if (fac === 'fsas' || fac === 'ealr') return AUTO_DETECT_FSAS_KEY
    return AUTO_DETECT_KEY
  }, [user])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<{
    statistics: any
    results: BatchResult[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [imageModal, setImageModal] = useState<ImageModalData>({
    isOpen: false,
    studentId: '',
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  const faculty = user?.faculty || 'default'
  const isLight = useThemeStore((s) => s.theme) === 'light'

  React.useEffect(() => {
    setSelectedAnswerKey(defaultAutoDetectKey)
    const fetchAnswerKeys = async () => {
      try {
        const response = await examAPI.getAnswerKeys()
        if (response.data.success && response.data.answer_keys) {
          setAnswerKeys(response.data.answer_keys)
        }
      } catch (error: any) {
        if (error.response?.status === 403) {
          setError(error.response.data?.message || 'Facultatea nu este configurată.')
        } else {
          console.error('Failed to fetch answer keys:', error)
        }
      }
    }
    fetchAnswerKeys()
  }, [defaultAutoDetectKey])

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const newFiles = Array.from(e.dataTransfer.files).slice(0, 250 - files.length)
      addFiles(newFiles)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const newFiles = Array.from(e.target.files).slice(0, 250 - files.length)
      addFiles(newFiles)
    }
  }

  const addFiles = (newFiles: File[]) => {
    const validFiles = newFiles.filter(
      (f) => {
        const ext = f.name.split('.').pop()?.toLowerCase() || ''
        return ['jpg', 'jpeg', 'png', 'bmp', 'tiff'].includes(ext)
      }
    )

    const fileItems: FileItem[] = validFiles.map((f) => ({
      file: f,
      id: Math.random().toString(36),
      preview: URL.createObjectURL(f),
    }))

    setFiles((prev) => [...prev, ...fileItems].slice(0, 250))
    setError(null)
  }

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id)
      if (file?.preview) {
        URL.revokeObjectURL(file.preview)
      }
      return prev.filter((f) => f.id !== id)
    })
  }

  const handleProcessing = async () => {
    if (files.length === 0) {
      setError('Please select at least one file')
      return
    }

    setProcessing(true)
    setError(null)
    setResults(null)

    try {
      const formData = new FormData()
      files.forEach((item) => {
        formData.append('files', item.file)
      })
      formData.append('answer_key', isAutoDetect ? '__AUTO_DETECT__' : selectedAnswerKey)

      let simulatedProgress = 0
      const progressInterval = setInterval(() => {
        simulatedProgress += Math.random() * 30
        if (simulatedProgress > 90) simulatedProgress = 90
        setProgress(Math.floor(simulatedProgress))
      }, 500)

      const response = await fetch('/api/exam/batch-process', {
        method: 'POST',
        body: formData,
      })

      clearInterval(progressInterval)
      setProgress(100)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Batch processing failed')
      }

      const data = await response.json()
      if (data.success) {
        setResults({
          statistics: data.statistics,
          results: data.results,
        })
      } else {
        throw new Error(data.message || 'Batch processing failed')
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred during batch processing')
    } finally {
      setProcessing(false)
      setTimeout(() => setProgress(0), 1000)
    }
  }

  const openImageModal = (result: BatchResult) => {
    
    const correctCount = result.correct_count ?? undefined
    setImageModal({
      isOpen: true,
      studentId: result.student_id,
      imagePath: result.annotated_image,
      grade: result.grade || undefined,
      answerKeyUsed: result.answer_key_used,
      correctCount,
    })
  }

  const closeImageModal = () => {
    setImageModal({ isOpen: false, studentId: '' })
  }

  return (
    <div className="max-w-6xl mx-auto">
      
      <div className="hero-gradient rounded-2xl p-8 relative overflow-hidden animate-float-up mb-6">
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)', animation: 'pulse-ring 4s ease-in-out infinite' }} />
        <div className="absolute -bottom-12 -left-12 w-36 h-36 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #06b6d4, transparent 70%)', animation: 'pulse-ring 5s ease-in-out 1s infinite' }} />
        <div className="relative z-10">
          <h1 className="text-4xl font-extrabold mb-2 text-gradient tracking-tight">
            Batch Processing
          </h1>
          <p className="text-slate-400 text-sm">
            Procesează până la 250 de fișe de examen automat
          </p>
        </div>
      </div>

      <div className="glass-stat rounded-2xl p-6 mb-6 animate-float-up" style={{ animationDelay: '0.06s' }}>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
              Faculty: <span className="font-bold text-indigo-400">{faculty.toUpperCase()}</span>
            </label>
            <p className="text-xs text-slate-600">
              Files will be analyzed with faculty-specific settings
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
              Answer Key
            </label>
            <select
              value={selectedAnswerKey}
              onChange={(e) => setSelectedAnswerKey(e.target.value)}
              className="input"
              disabled={processing}
            >
              
              {(user?.is_global_admin || faculty === 'fsgc' || !user?.faculty) && (
                <option value={AUTO_DETECT_KEY}>🔍 Auto-detect versiune (FSGC)</option>
              )}
              
              {(user?.is_global_admin || faculty === 'fpse' || !user?.faculty) && (
                <option value={AUTO_DETECT_FPSE3_KEY}>🔍 Auto-detect versiune (FPSE 3 răspunsuri)</option>
              )}
              {(user?.is_global_admin || faculty === 'fpse' || !user?.faculty) && (
                <option value={AUTO_DETECT_FPSE4_KEY}>🔍 Auto-detect versiune (FPSE 4 răspunsuri)</option>
              )}
              
              {(user?.is_global_admin || faculty === 'fsas' || faculty === 'ealr' || !user?.faculty) && (
                <option value={AUTO_DETECT_FSAS_KEY}>🔍 Auto-detect versiune (FSAS)</option>
              )}
              <option disabled value="">──────────────────</option>
              {answerKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>

            {isAutoDetect && (
              <div className="mt-3 rounded-xl px-4 py-3 flex items-start gap-3 animate-float-up"
                style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.4)' }}>
                <span className="text-purple-400 text-lg mt-0.5">🔍</span>
                <div>
                  <p className="text-purple-300 text-sm font-semibold">Detectie automata activata (FSGC)</p>
                  <p className="text-purple-400/80 text-xs mt-0.5">
                    Zona marcata cu violet pe fiecare foaie va fi analizata pentru a detecta versiunea
                    (Albastru / Verde / Rosu / Galben) si va selecta automat baremul corespunzator.
                  </p>
                </div>
              </div>
            )}

            {isAutoDetectFpse3 && (
              <div className="mt-3 rounded-xl px-4 py-3 flex items-start gap-3 animate-float-up"
                style={{ background: 'rgba(255,140,0,0.12)', border: '1px solid rgba(255,140,0,0.4)' }}>
                <span className="text-orange-400 text-lg mt-0.5">🔍</span>
                <div>
                  <p className="text-orange-300 text-sm font-semibold">Detectie automata activata (FPSE 3 răspunsuri)</p>
                  <p className="text-orange-400/80 text-xs mt-0.5">
                    Zona marcata cu portocaliu pe fiecare foaie va fi analizata pentru a detecta versiunea
                    (Albastru / Verde) si va selecta automat baremul cu 3 răspunsuri corespunzator.
                  </p>
                </div>
              </div>
            )}

            {isAutoDetectFpse4 && (
              <div className="mt-3 rounded-xl px-4 py-3 flex items-start gap-3 animate-float-up"
                style={{ background: 'rgba(255,140,0,0.12)', border: '1px solid rgba(255,140,0,0.4)' }}>
                <span className="text-orange-400 text-lg mt-0.5">🔍</span>
                <div>
                  <p className="text-orange-300 text-sm font-semibold">Detectie automata activata (FPSE 4 răspunsuri)</p>
                  <p className="text-orange-400/80 text-xs mt-0.5">
                    Zona marcata cu portocaliu pe fiecare foaie va fi analizata pentru a detecta versiunea
                    (Albastru / Verde) si va selecta automat baremul cu 4 răspunsuri corespunzator.
                  </p>
                </div>
              </div>
            )}

            {isAutoDetectFsas && (
              <div className="mt-3 rounded-xl px-4 py-3 flex items-start gap-3 animate-float-up"
                style={{ background: 'rgba(255,140,0,0.12)', border: '1px solid rgba(255,140,0,0.4)' }}>
                <span className="text-orange-400 text-lg mt-0.5">🔍</span>
                <div>
                  <p className="text-orange-300 text-sm font-semibold">Detectie automata activata (FSAS)</p>
                  <p className="text-orange-400/80 text-xs mt-0.5">
                    Zona marcata cu portocaliu pe fiecare foaie va fi analizata pentru a detecta versiunea
                    (Rândul 1 / Rândul 2) si va selecta automat baremul corespunzator.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl p-4 mb-6" style={{ background: isLight ? 'rgba(241,245,249,0.7)' : 'rgba(15,23,42,0.5)', border: isLight ? '1px solid rgba(148,163,184,0.25)' : '1px solid rgba(100,116,139,0.15)' }}>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-slate-400 text-sm">
                Selected Files: <span className="font-bold text-indigo-400">{files.length}</span> / 250
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {files.length === 0 ? 'Drag files or click to select' : `Ready to process ${files.length} file(s)`}
              </p>
            </div>
            {files.length > 0 && (
              <div className="text-right">
                <p className="text-sm text-indigo-400">
                  {(files.reduce((sum, f) => sum + f.file.size, 0) / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        ref={dropZoneRef}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !processing && fileInputRef.current?.click()}
        className={`glass-stat rounded-2xl p-6 dropzone mb-6 animate-float-up ${dragActive ? 'active' : ''}`}
        style={{ animationDelay: '0.12s', cursor: processing ? 'not-allowed' : 'pointer' }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          id="batch-file-input"
          disabled={processing}
        />
        <label htmlFor="batch-file-input" className="flex flex-col items-center justify-center cursor-pointer pb-4">
          <svg
            className={`w-16 h-16 mb-4 transition-colors duration-300 ${
              dragActive ? 'text-blue-400' : 'text-slate-500'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 4v16m8-8H4"
            />
          </svg>
          <p className="text-center mb-2">
            <span className="font-bold text-blue-400 hover:text-blue-300">Click to select</span>
            <span className="text-slate-400"> or </span>
            <span className="font-bold text-blue-400">drag and drop</span>
          </p>
          <p className="text-sm text-slate-500">
            PNG, JPG, BMP, TIFF (up to 250 files)
          </p>
        </label>
      </div>

      {error && (
        <div className="status-error mb-6 animate-slide-in">
          {error}
        </div>
      )}

      {files.length > 0 && (
        <div className="glass-stat rounded-2xl p-6 mb-6 animate-float-up" style={{ animationDelay: '0.15s' }}>
          <h3 className="text-lg font-semibold text-slate-200 mb-4">Selected Files ({files.length})</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-48 overflow-y-auto">
            {files.map((item) => (
              <div key={item.id} className="relative group">
                {item.preview && (
                  <img
                    src={item.preview}
                    alt={item.file.name}
                    className="w-full h-24 object-cover rounded-lg border border-slate-700 group-hover:border-blue-500 transition-colors"
                  />
                )}
                <button
                  onClick={() => removeFile(item.id)}
                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                <p className="text-xs text-slate-400 mt-2 truncate" title={item.file.name}>
                  {item.file.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {processing && (
        <div className="glass-stat rounded-2xl p-6 mb-6 animate-float-up">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-slate-400 font-medium">Processing in progress...</p>
              <p className="text-blue-400 font-bold">{progress}%</p>
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      )}

      {results && (
        <div className="space-y-6">
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-stat rounded-2xl p-5 animate-float-up dash-card-lift" style={{ borderLeft: '3px solid #10b981', animationDelay: '0.08s' }}>
              <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Successful</p>
              <p className="text-3xl font-extrabold text-emerald-400 mt-1 tabular-nums">{results.statistics.successful}</p>
            </div>
            <div className="glass-stat rounded-2xl p-5 animate-float-up dash-card-lift" style={{ borderLeft: '3px solid #ef4444', animationDelay: '0.14s' }}>
              <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Failed</p>
              <p className="text-3xl font-extrabold text-red-400 mt-1 tabular-nums">{results.statistics.failed}</p>
            </div>
            <div className="glass-stat rounded-2xl p-5 animate-float-up dash-card-lift" style={{ borderLeft: '3px solid #f59e0b', animationDelay: '0.20s' }}>
              <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Need Calibration</p>
              <p className="text-3xl font-extrabold text-amber-400 mt-1 tabular-nums">{results.statistics.needs_calibration}</p>
            </div>
            <div className="glass-stat rounded-2xl p-5 animate-float-up dash-card-lift" style={{ borderLeft: '3px solid #6366f1', animationDelay: '0.26s' }}>
              <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Total</p>
              <p className="text-3xl font-extrabold text-indigo-400 mt-1 tabular-nums">{results.statistics.total_files}</p>
            </div>
          </div>

          <div className="glass-stat rounded-2xl p-6 overflow-x-auto animate-float-up" style={{ animationDelay: '0.1s' }}>
            <h3 className="text-lg font-semibold text-slate-200 mb-4">Processing Results</h3>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-700/50">
                <tr>
                  <th className="text-left py-3 px-4 text-slate-500 font-semibold text-xs uppercase tracking-wider">Student ID</th>
                  <th className="text-left py-3 px-4 text-slate-500 font-semibold text-xs uppercase tracking-wider">Grade</th>
                  <th className="text-left py-3 px-4 text-slate-500 font-semibold text-xs uppercase tracking-wider">Status</th>
                  <th className="text-left py-3 px-4 text-slate-500 font-semibold text-xs uppercase tracking-wider">Barem</th>
                  <th className="text-left py-3 px-4 text-slate-500 font-semibold text-xs uppercase tracking-wider">Filename</th>
                  <th className="text-left py-3 px-4 text-slate-500 font-semibold text-xs uppercase tracking-wider">Preview</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {results.results.map((result, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-slate-800/50 table-row-hover cursor-pointer group"
                    onClick={() => result.annotated_image && openImageModal(result)}
                  >
                    <td className="py-3 px-4 text-slate-300 font-medium">{result.student_id || '-'}</td>
                    <td className="py-3 px-4">
                      {result.grade !== null ? (
                        <span className="font-semibold text-blue-400">{result.grade.toFixed(2)}</span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          result.status === 'Success'
                            ? 'badge-success'
                            : result.status === 'Error'
                              ? 'badge-error'
                              : 'badge-warning'
                        }`}
                      >
                        {result.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {result.answer_key_used ? (
                        <span className="px-2 py-1 rounded text-xs font-medium"
                          style={{ background: 'rgba(139,92,246,0.15)', color: '#c084fc', border: '1px solid rgba(139,92,246,0.3)' }}>
                          {result.answer_key_used}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-400 truncate max-w-xs">{result.original_filename}</td>
                    <td className="py-3 px-4 text-right">
                      {result.annotated_image && (
                        <span className="text-indigo-400 group-hover:text-indigo-300 font-medium text-sm transition-colors">View <span className="group-hover:translate-x-1 inline-block transition-transform">→</span></span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setResults(prev => prev ? {
                          ...prev,
                          results: prev.results.filter((_, i) => i !== idx),
                          statistics: {
                            ...prev.statistics,
                            total_files: prev.statistics.total_files - 1,
                            successful: result.status === 'Success' ? prev.statistics.successful - 1 : prev.statistics.successful,
                            failed: result.status === 'Error' ? prev.statistics.failed - 1 : prev.statistics.failed,
                            needs_calibration: result.status === 'NeedCalibration' ? prev.statistics.needs_calibration - 1 : prev.statistics.needs_calibration,
                          }
                        } : prev)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-all"
                        title="Elimina din batch"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="glass-stat rounded-2xl p-6 flex gap-4 animate-float-up" style={{ animationDelay: '0.15s' }}>
            <button onClick={() => { setFiles([]); setResults(null); setProgress(0); setError(null); setExportStatus(null); setProcessing(false); }} className="btn-primary flex-1">
              Start New Batch
            </button>
            <button
              onClick={async () => {
                if (!results) return
                setExportStatus('Exporting...')
                try {
                  const exportKey = isAutoDetect ? '__AUTO_DETECT__' : selectedAnswerKey
                  const resp = await examAPI.exportToNocoDB(results.results, exportKey)
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

      {!results && (
        <div className="glass-stat rounded-2xl p-6 animate-float-up" style={{ animationDelay: '0.18s' }}>
          <button
            onClick={handleProcessing}
            disabled={files.length === 0 || processing}
            className={`w-full py-3 rounded-lg font-bold text-lg transition-all duration-300 ${
              files.length === 0 || processing
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'btn-primary-pulse text-white'
            }`}
          >
            {processing ? `Processing ${progress}%...` : `Process ${files.length} File${files.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {imageModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={closeImageModal}>
          <div className="glass-card rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-auto animate-scale-in" onClick={(e) => e.stopPropagation()}>
            
            <div className="sticky top-0 glass border-b border-slate-700/50 p-6 flex justify-between items-center z-10">
              <div>
                <h3 className="text-2xl font-bold text-gradient">Sheet Analysis</h3>
                <p className="text-slate-400 text-sm mt-1">Student ID: <span className="text-slate-200 font-medium">{imageModal.studentId}</span></p>
                {imageModal.answerKeyUsed && (
                  <p className="text-xs mt-1" style={{ color: '#c084fc' }}>
                    Barem: <span className="font-semibold">{imageModal.answerKeyUsed}</span>
                  </p>
                )}
                {imageModal.correctCount !== undefined && (
                  <p className="font-semibold mt-1" style={{ color: '#6366f1' }}>
                    Correct answers: <span className="font-bold" style={{ color: isLight ? '#1d1d1f' : '#f5f5f7' }}>{imageModal.correctCount}</span>
                  </p>
                )}
              </div>
              <button
                onClick={closeImageModal}
                className="text-slate-400 hover:text-slate-200 transition-colors text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              {imageModal.imagePath ? (
                <div className="space-y-4">
                  <p className="text-slate-400 text-sm">Analyzed exam sheet with detected grid:</p>
                  <img
                    src={imageModal.imagePath}
                    alt="Analyzed sheet"
                    className="w-full rounded-lg border border-slate-700"
                  />
                  <p className="text-xs text-slate-500 text-center">
                    Green boxes: Correct answers | Red boxes: Incorrect answers | Blue boxes: Options detected
                  </p>
                </div>
              ) : (
                <p className="text-slate-400 text-center py-8">No image available for this result</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
