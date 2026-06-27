import React, { useState, useEffect } from 'react'
import { useAuthStore } from '../store'
import { uploadAPI, examAPI } from '../api/client'

interface AnalysisResult {
  student_id: string
  grade: number
  answers: any
  output_image: string
  output_csv: string
}

export const UploadPage: React.FC = () => {
  const user = useAuthStore((state) => state.user)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [answerKeys, setAnswerKeys] = useState<string[]>(['TestKey', 'DefaultKey'])
  const [selectedAnswerKey, setSelectedAnswerKey] = useState('TestKey')
  const [uploadStatus, setUploadStatus] = useState<{
    type: 'success' | 'error' | null
    message: string
  }>({ type: null, message: '' })
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)

  const faculty = user?.faculty || 'default'

  useEffect(() => {
    
    const fetchAnswerKeys = async () => {
      try {
        const response = await examAPI.getAnswerKeys()
        if (response.data.success && response.data.answer_keys) {
          setAnswerKeys(response.data.answer_keys)
        }
      } catch (error: any) {
        if (error.response?.status === 403) {
          setUploadStatus({ type: 'error', message: error.response.data?.message || 'Facultatea nu este configurată.' })
        } else {
          console.error('Failed to fetch answer keys:', error)
        }
      }
    }
    fetchAnswerKeys()
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setUploadStatus({ type: null, message: '' })
      setAnalysisResult(null)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      setUploadStatus({ type: 'error', message: 'Please select a file' })
      return
    }

    setUploading(true)
    setAnalysisResult(null)
    try {
      const response = await uploadAPI.uploadExamSheet(file, faculty, selectedAnswerKey)
      if (response.data.success) {
        setUploadStatus({
          type: 'success',
          message: 'File uploaded and analyzed successfully!',
        })
        if (response.data.analysis) {
          setAnalysisResult(response.data.analysis)
        }
        setFile(null)
      } else {
        setUploadStatus({
          type: 'error',
          message: response.data.message || 'Upload failed',
        })
      }
    } catch (error: any) {
      setUploadStatus({
        type: 'error',
        message: error.response?.data?.message || 'An error occurred',
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      
      <div className="hero-gradient rounded-2xl p-8 relative overflow-hidden animate-float-up mb-6">
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)', animation: 'pulse-ring 4s ease-in-out infinite' }} />
        <div className="relative z-10">
          <h1 className="text-3xl font-extrabold mb-2 text-gradient tracking-tight">Upload Exam Sheet</h1>
          <p className="text-slate-400 text-sm">
            Încarcă imagini cu fișe de examen pentru analiză și notare automată
          </p>
        </div>
      </div>

      <div className="glass-stat rounded-2xl p-6 mb-6 animate-float-up" style={{ animationDelay: '0.06s' }}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                Faculty: <span className="font-bold text-indigo-400">{faculty.toUpperCase()}</span>
              </label>
              <p className="text-xs text-slate-500">
                Files will be uploaded to the appropriate faculty folder
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
                disabled={uploading}
              >
                {answerKeys.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-2 border-dashed border-slate-700/30 hover:border-violet-400/50 rounded-2xl p-6 transition-all duration-300">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              id="file-input"
              disabled={uploading}
            />
            <label
              htmlFor="file-input"
              className="flex flex-col items-center justify-center cursor-pointer"
            >
              <svg
                className="w-12 h-12 text-slate-500 mb-2"
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
              <p className="text-center">
                <span className="font-bold text-violet-400">Click to select</span>
                <span className="text-slate-400"> or drag and drop</span>
              </p>
              <p className="text-sm text-slate-500 mt-1">
                PNG, JPG, BMP, or TIFF
              </p>
            </label>
          </div>

          {file && (
            <div className="glass rounded-xl p-4">
              <p className="text-sm text-slate-300">
                Selected: <span className="font-semibold text-indigo-400">{file.name}</span>
              </p>
              <p className="text-xs text-slate-500">
                Size: {(file.size / 1024).toFixed(2)} KB
              </p>
            </div>
          )}

          {uploadStatus.type && (
            <div className={uploadStatus.type === 'success' ? 'status-success' : 'status-error'}>
              {uploadStatus.message}
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className={`w-full py-3 rounded-lg font-bold text-lg transition-all duration-300 ${
              !file || uploading
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'btn-primary-pulse text-white'
            }`}
          >
            {uploading ? 'Uploading & Analyzing...' : 'Upload & Analyze'}
          </button>
        </div>
      </div>

      {analysisResult && (
        <div className="space-y-4 animate-float-up">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-stat rounded-2xl p-5 dash-card-lift" style={{ borderLeft: '3px solid #6366f1' }}>
              <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Student ID</p>
              <p className="text-2xl font-extrabold text-indigo-400 mt-1 tabular-nums">{analysisResult.student_id}</p>
            </div>

            <div className="glass-stat rounded-2xl p-5 dash-card-lift" style={{ borderLeft: '3px solid #10b981' }}>
              <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Grade</p>
              <p className="text-2xl font-extrabold text-emerald-400 mt-1 tabular-nums">{analysisResult.grade}/10.0</p>
            </div>
          </div>

          {analysisResult.output_image && (
            <div className="glass-stat rounded-2xl p-6">
              <h3 className="font-bold text-gradient mb-3">Analyzed Image</h3>
              <div className="rounded-xl overflow-hidden border border-slate-700/30">
                <img
                  src={analysisResult.output_image}
                  alt="Analyzed exam sheet"
                  className="max-w-full h-auto rounded"
                />
              </div>
            </div>
          )}

          {analysisResult.output_csv && (
            <div className="glass-stat rounded-2xl p-6">
              <h3 className="font-bold text-gradient mb-3">Results File</h3>
              <a
                href={analysisResult.output_csv}
                download
                className="btn-primary inline-block"
              >
                Download CSV Results
              </a>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 glass-stat rounded-2xl p-6 animate-float-up" style={{ animationDelay: '0.12s' }}>
        <h3 className="font-bold text-indigo-300 mb-2">Tips</h3>
        <ul className="text-sm text-slate-400 space-y-1">
          <li>• Ensure the exam sheet is well-lit and in focus</li>
          <li>• All four corners should be visible in the image</li>
          <li>• Answers should be marked clearly in blue ink</li>
          <li>• QR code (if present) will be used for student ID</li>
        </ul>
      </div>
    </div>
  )
}
