/**
 * api.js — All API calls in one place
 */

// Backend address. Override with frontend/.env  ->  VITE_API_URL=http://localhost:8000
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const token  = () => localStorage.getItem('token') || ''
const headers = () => ({
  'Content-Type' : 'application/json',
  'Authorization': `Bearer ${token()}`
})

/**
 * One place for every request:
 *  - network failure  -> throws (components already show "Cannot connect...")
 *  - expired token / deleted user -> logs out and returns to the login screen
 *    (previously the error object was treated as data and the page crashed)
 */
async function request(url, options = {}) {
  let res
  try {
    res = await fetch(BASE + url, options)
  } catch (e) {
    throw new Error('Cannot reach the backend. Is uvicorn running on port 8000?')
  }

  let body = null
  try { body = await res.json() } catch { body = null }

  const isAuthCall = url.startsWith('/auth/login') || url.startsWith('/auth/register')
  const tokenDead  = res.status === 401 ||
                     (res.status === 404 && body && body.detail === 'User not found')
  if (!isAuthCall && tokenDead && token()) {
    localStorage.clear()
    window.location.reload()
    throw new Error('Session expired')
  }
  return body
}

const get  = (url)        => request(url, {headers:headers()})
const post = (url, body)  => request(url, {method:'POST', headers:headers(), body:JSON.stringify(body)})
const put  = (url)        => request(url, {method:'PUT',  headers:headers()})
const putBody = (url, body) => request(url, {method:'PUT', headers:headers(), body:JSON.stringify(body)})
const del  = (url)        => request(url, {method:'DELETE',headers:headers()})

export const api = {
  // Auth
  register : (data)           => post('/auth/register', data),
  login    : (email, password) => {
    const form = new URLSearchParams()
    form.append('username', email)
    form.append('password', password)
    return request('/auth/login', {method:'POST', body:form})
  },
  me : () => get('/auth/me'),
  updateProfile  : (data) => putBody('/auth/me', data),
  changePassword : (data) => post('/auth/change-password', data),
  getPrefs  : ()     => get('/preferences'),
  savePrefs : (data) => putBody('/preferences', data),

  // Tasks (dashboard priority list)
  getTasks   : ()         => get('/tasks').then(r => Array.isArray(r) ? r : []),
  addTask    : (data)     => post('/tasks', data),
  updateTask : (id, data) => putBody(`/tasks/${id}`, data),
  deleteTask : (id)       => del(`/tasks/${id}`),

  // Career skills
  getSkills   : ()         => get('/skills').then(r => Array.isArray(r) ? r : []),
  addSkill    : (data)     => post('/skills', data),
  updateSkill : (id, data) => putBody(`/skills/${id}`, data),
  deleteSkill : (id)       => del(`/skills/${id}`),

  // Recurring payments (Expenses -> Next payment)
  getRecurring    : ()     => get('/recurring').then(r => Array.isArray(r) ? r : []),
  addRecurring    : (data) => post('/recurring', data),
  deleteRecurring : (id)   => del(`/recurring/${id}`),

  // Study with me
  logStudy     : (minutes, label) => post('/study/sessions', {minutes, label}),
  studySummary : ()               => get('/study/summary'),

  // Marks extras
  cgpaPlan      : (target) => get(`/cgpa/plan${target ? `?target=${target}` : ''}`),
  importMarks   : (csv)         => post('/import/marks', {csv}),
  importExpenses: (csv, signed) => post('/import/expenses', {csv, signed: !!signed}),

  // Download a file from the backend (report / calendar) with the login token
  download : async (url, filename) => {
    let res
    try { res = await fetch(BASE + url, {headers: {'Authorization': `Bearer ${token()}`}}) }
    catch { throw new Error('Cannot reach the backend. Is uvicorn running on port 8000?') }
    if (!res.ok) throw new Error('Download failed')
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = filename
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  },

  // Dashboard + Insights
  dashboard : () => get('/dashboard'),
  insights  : () => get('/insights'),

  // Attendance
  getSubjects    : ()     => get('/attendance/subjects'),
  addSubject     : (data) => post('/attendance/subjects', data),
  deleteSubject  : (id)   => del(`/attendance/subjects/${id}`),
  updateSubject  : (id, data) => putBody(`/attendance/subjects/${id}`, data),   // edit one subject in place
  markAttendance : (data) => post('/attendance/mark', data),

  // Timetable
  getTimetable      : ()      => get('/timetable'),
  saveTimetable     : (slots) => post('/timetable', {slots}),

  // Daily schedule
  getDailySchedule  : ()      => get('/daily-schedule'),
  saveDailySchedule : (data)  => post('/daily-schedule', data),

  // Scores
  getScores   : ()     => get('/scores'),
  addScore    : (data) => post('/scores', data),
  deleteScore : (id)   => del(`/scores/${id}`),
  getCgpa     : ()     => get('/scores/cgpa'),

  // Streaks
  getStreaks   : ()         => get('/streaks'),
  addStreak    : (data)     => post('/streaks', data),
  checkIn      : (id, date) => post(`/streaks/${id}/checkin`, {date}),
  deleteStreak : (id)       => del(`/streaks/${id}`),

  // Expenses
  getExpenses  : ()     => get('/expenses'),
  addExpense   : (data) => post('/expenses', data),
  deleteExpense: (id)   => del(`/expenses/${id}`),
  setBudget    : (data) => post('/expenses/budget', data),

  // Career
  getCareer        : ()            => get('/career'),
  addCareerGoal    : (data)        => post('/career', data),
  updateCareerGoal : (id, status)  => put(`/career/${id}?status=${status}`),
  deleteCareerGoal : (id)          => del(`/career/${id}`),

  // Weekly check-in
  getCheckIns : ()     => get('/weekly-checkin'),
  addCheckIn  : (data) => post('/weekly-checkin', data),

  // ML predictions
  getPredictions : () => get('/predict'),
  trainModels    : () => post('/predict/train', {}),
  modelStatus    : () => get('/predict/status'),

  // Chat sessions
  getChatSessions   : ()              => get('/chat/sessions').then(r => Array.isArray(r) ? r : []),
  createChatSession : (title)         => post('/chat/sessions', {title}),
  getChatMessages   : (id)            => get(`/chat/sessions/${id}/messages`).then(r => Array.isArray(r) ? r : []),
  sendChatMessage   : (id, content)   => post(`/chat/sessions/${id}/messages`, {content}),
  deleteChatSession : (id)            => del(`/chat/sessions/${id}`),
}

export const aiApi = {
  // Gemini chat (direct, no session)
  chat : (question) => post('/chat', {question}),

  // Voice logging
  voiceLog : async (audioBlob, filename='recording.webm') => {
    const form = new FormData()
    form.append('file', audioBlob, filename)
    return request('/voice-log', {
      method : 'POST',
      headers: {'Authorization': `Bearer ${token()}`},   // no Content-Type: browser sets the multipart boundary
      body   : form
    })
  },

  // Sentiment analysis
  analyzeCheckin : (win, improve) => {
    const params = new URLSearchParams({win:win||'', improve:improve||''})
    return post(`/analyze-checkin?${params}`, {})
  },

  // AI tools status
  status : () => get('/ai-status').catch(() => ({claude:{available:false}, whisper:{available:false}, sentiment:{available:false}})),
}