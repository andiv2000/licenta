import axios from 'axios'

const API_BASE_URL = '/api'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const authAPI = {
  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }),
  logout: () =>
    apiClient.post('/auth/logout'),
  getCurrentUser: () =>
    apiClient.get('/auth/user'),
  register: (email: string, password: string, faculty: string) =>
    apiClient.post('/auth/register', { email, password, faculty }),
  getUsers: () =>
    apiClient.get('/auth/users'),
  getPendingUsers: () =>
    apiClient.get('/auth/pending-users'),
  approveUser: (userId: string, role?: string, faculty?: string) =>
    apiClient.patch(`/auth/users/${encodeURIComponent(userId)}/approve`, { role, faculty }),
  rejectUser: (userId: string) =>
    apiClient.delete(`/auth/users/${encodeURIComponent(userId)}/reject`),
}

export const examAPI = {
  getAnswerKeys: () =>
    apiClient.get('/exam/answer-keys'),
  analyzeExam: (formData: FormData) =>
    apiClient.post('/exam/analyze', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  batchProcess: (formData: FormData) =>
    apiClient.post('/exam/batch-process', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  exportToNocoDB: (results: any[], answerKey: string) =>
    apiClient.post('/exam/export-nocodb', { results, answer_key: answerKey }),
  getStats: (faculty: string) =>
    apiClient.get('/exam/stats', { params: { faculty } }),
  getDashboardStats: () =>
    apiClient.get('/exam/dashboard-stats'),
  getQuestionStats: (faculty: string, questions?: string[], answerKey?: string) =>
    apiClient.get('/exam/question-stats', {
      params: {
        faculty,
        questions: questions?.join(',') || '',
        answer_key: answerKey || '',
      },
    }),
}

export const uploadAPI = {
  uploadExamSheet: (file: File, faculty: string, answerKey: string = 'DefaultKey') => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('faculty', faculty)
    formData.append('answer_key', answerKey)
    return apiClient.post('/upload/exam-sheet', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

export default apiClient
