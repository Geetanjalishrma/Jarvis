/**
 * app.jsx — App shell (sidebar, top bar, palette switcher, mobile nav) and the sign-in screen.
 * Layout and visuals follow the Figma file; data and logic come from your backend.
 */
import { useState, useEffect, useRef } from 'react'
import { api } from './api'
import { Icon, Logo, Field, Select, PasswordInput, initialsOf, localDate } from './ui'
import { PALETTES, applyPalette, getStoredPalette } from './palette'
import Dashboard from './Dashboard'
import AttendancePage from './AttendancePage'
import ChatPage from './ChatPage'
import InsightsPage from './insightspage'
import ProfilePage from './profile'
import StudyPage, { StudyMiniBar } from './StudyPage'
import Onboarding from './Onboarding'
import { MarksPage, HabitsPage, ExpensesPage, CareerPage, CheckinPage } from './pages'

/* ───────────── navigation ───────────── */
const NAV = [
  { label: 'Overview',        icon: 'grid',     page: 'overview' },
  { label: 'Attendance',      icon: 'calendar', page: 'attendance' },
  { label: 'Marks & CGPA',    icon: 'chart',    page: 'marks' },
  { label: 'Habits',          icon: 'habit',    page: 'habits' },
  { label: 'Expenses',        icon: 'wallet',   page: 'expenses' },
  { label: 'Insights',        icon: 'sparkles', page: 'insights' },
  { label: 'AI Assistant',    icon: 'book',     page: 'assistant' },
  { label: 'Study with me',   icon: 'clock',    page: 'study' },
  { label: 'Career roadmap',  icon: 'target',   page: 'career' },
  { label: 'Weekly check-in', icon: 'heart',    page: 'checkin' },
]

/* ───────────── sign in / create account ───────────── */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const errorText = (res, fallback) => {
  const d = res?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg).replace(/^Value error, /, '')
  return fallback
}

function AuthPage({ onLogin }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', semester: '1', branch: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = k => e => setForm({ ...form, [k]: e.target.value })
  const register = mode === 'register'

  const switchMode = (m) => { setMode(m); setError('') }

  const submit = async (e) => {
    e.preventDefault()
    const email = form.email.trim()
    if (register && !form.name.trim()) return setError('Please enter your name')
    if (!EMAIL_RE.test(email)) return setError('Please enter a valid email address')
    if (!form.password) return setError('Please enter your password')
    if (register && form.password.length < 6) return setError('Password must be at least 6 characters')
    if (register && form.password !== form.confirm) return setError('Passwords don’t match')

    setLoading(true); setError('')
    try {
      if (!register) {
        const res = await api.login(email, form.password)
        if (res?.access_token) { localStorage.setItem('token', res.access_token); localStorage.setItem('name', res.name); onLogin(res.name) }
        else setError(errorText(res, 'Wrong email or password'))
      } else {
        const res = await api.register({ name: form.name.trim(), email, password: form.password, semester: parseInt(form.semester) || 1, branch: form.branch.trim() })
        if (res?.token) { localStorage.setItem('token', res.token); localStorage.setItem('name', res.name); localStorage.setItem('jarvis_tour', '1'); onLogin(res.name) }
        else setError(errorText(res, 'Could not create the account. Please try again.'))
      }
    } catch (err) {
      setError(err?.message?.includes('Cannot reach') ? 'Cannot connect to the server. Is the backend running on port 8000?' : 'Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div className="auth-shell">
      <div className="auth-hero">
        <Logo />
        <div>
          <h1>Your whole student life, in one calm place.</h1>
          <p>Attendance, marks, habits, money and goals — connected, so JARVIS can tell you what actually matters today.</p>
          <div className="auth-points">
            <div><i><Icon name="calendar" size={16} /></i> Never fall below your attendance minimum</div>
            <div><i><Icon name="trend" size={16} /></i> Predict your CGPA from real marks</div>
            <div><i><Icon name="sparkles" size={16} /></i> Insights across every part of your week</div>
          </div>
        </div>
        <span className="auth-foot">JARVIS · Student life intelligence</span>
      </div>

      <div className="auth-panel">
        <form className="auth-card" onSubmit={submit} noValidate>
          <div className="auth-mode" role="tablist" aria-label="Sign in or create an account">
            <button type="button" role="tab" aria-selected={!register} className={!register ? 'on' : ''} onClick={() => switchMode('login')}>Sign in</button>
            <button type="button" role="tab" aria-selected={register} className={register ? 'on' : ''} onClick={() => switchMode('register')}>Create account</button>
          </div>
          <h2>{register ? 'Create your account' : 'Welcome back'}</h2>
          <p className="sub">{register ? 'It takes less than a minute. Your account is saved securely in your JARVIS database.' : 'Sign in to pick up right where you left off.'}</p>

          <div className="auth-form">
            {register && <Field label="Your name"><input placeholder="your name" autoComplete="name" value={form.name} onChange={set('name')} /></Field>}
            <Field label="Email"><input type="email" placeholder="mail" autoComplete="email" value={form.email} onChange={set('email')} /></Field>
            <Field label="Password"><PasswordInput value={form.password} onChange={set('password')} autoComplete={register ? 'new-password' : 'current-password'} /></Field>
            {register && <Field label="Confirm password"><PasswordInput value={form.confirm} onChange={set('confirm')} autoComplete="new-password" placeholder="Repeat your password" /></Field>}
            {register && (
              <div className="two">
                <Field label="Semester"><Select value={form.semester} onChange={v => setForm({ ...form, semester: v })} options={['1', '2', '3', '4', '5', '6', '7', '8']} /></Field>
                <Field label="Branch"><input placeholder="e.g. CSE" value={form.branch} onChange={set('branch')} /></Field>
              </div>
            )}
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
          </div>
          <div className="auth-switch">
            {register ? 'Already have an account? ' : 'New to JARVIS? '}
            <button type="button" onClick={() => switchMode(register ? 'login' : 'register')}>{register ? 'Sign in' : 'Create an account'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ───────────── shell pieces ───────────── */
function Sidebar({ collapsed, onCollapse, page, setPage, me, dash, alertCount }) {
  const avg = dash?.attendance?.length ? Math.round(dash.attendance.reduce((s, a) => s + (a.current_pct || 0), 0) / dash.attendance.length) : null
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="side-head">
        <Logo compact={collapsed} />
        <button className="collapse" onClick={onCollapse} aria-label="Toggle sidebar"><Icon name="menu" size={19} /></button>
      </div>
      <nav aria-label="Primary navigation">
        {NAV.map(item => (
          <button className={page === item.page ? 'active' : ''} key={item.page} title={item.label} onClick={() => setPage(item.page)}>
            <Icon name={item.icon} />
            {!collapsed && <span>{item.label}</span>}
            {item.page === 'insights' && alertCount > 0 && !collapsed && <em>{alertCount}</em>}
          </button>
        ))}
      </nav>
      <div className="side-bottom">
        <button className={page === 'profile' ? 'active' : ''} onClick={() => setPage('profile')}>
          <Icon name="settings" />{!collapsed && <span>Settings</span>}
        </button>
        {!collapsed && (
          <div className="semester">
            <span>{me?.branch ? `${me.branch} · ` : ''}Semester {me?.semester ?? '—'}</span>
            <b>{avg != null ? `${avg}%` : '—'}</b>
            <div><i style={{ width: `${avg || 0}%` }} /></div>
            <small>Average attendance</small>
          </div>
        )}
      </div>
    </aside>
  )
}

function PaletteControl({ palette, setPalette }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const current = PALETTES.find(p => p.key === palette) || PALETTES[0]
  return (
    <div className="palette-control" ref={ref}>
      <button className="palette-trigger" aria-label="Choose app color palette" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="palette-dots" aria-hidden="true">{current.colors.map(c => <i key={c.hex} style={{ background: c.hex }} />)}</span>
        <b>{current.name}</b>
      </button>
      {open && (
        <div className="palette-menu" role="dialog" aria-label="Color palette examples">
          <div className="palette-menu-head"><span>50 / 40 / 10</span><b>Choose a palette</b></div>
          <div className="palette-options">
            {PALETTES.map(option => (
              <button className={palette === option.key ? 'selected' : ''} key={option.key} onClick={() => { setPalette(option.key); setOpen(false) }}>
                <strong>{option.name}</strong>
                <span className="palette-swatches">
                  {option.colors.map(c => (
                    <span key={c.hex}><i style={{ background: c.hex }} /><small>{c.role}</small><b>{c.name}</b><em>{c.hex}</em></span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Header({ concept, setConcept, page, setPage, name, me, alerts, onLogout, palette, setPalette }) {
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [q, setQ] = useState('')
  const popRef = useRef(null)

  useEffect(() => {
    const h = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const runSearch = (e) => {
    if (e.key !== 'Enter' || !q.trim()) return
    const t = q.trim().toLowerCase()
    const alias = { cgpa: 'marks', score: 'marks', grades: 'marks', streak: 'habits', money: 'expenses', spend: 'expenses', chat: 'assistant', ai: 'assistant', job: 'career', placement: 'career', settings: 'profile', profile: 'profile', home: 'overview', dashboard: 'overview', focus: 'study', pomodoro: 'study', timer: 'study', music: 'study' }
    const hit = NAV.find(n => n.label.toLowerCase().includes(t) || n.page.includes(t)) || (alias[t] && { page: alias[t] })
    if (hit) { setPage(hit.page); setQ('') }
  }
  const ctxLabel = page === 'profile' ? 'Profile & settings' : NAV.find(n => n.page === page)?.label

  return (
    <header className="topbar">
      <div className="mobile-logo"><Logo /></div>
      {page === 'overview' ? (
        <div className="concept-tabs" role="tablist" aria-label="Dashboard concepts">
          {[1, 2, 3].map(n => (
            <button role="tab" aria-selected={concept === n} className={concept === n ? 'selected' : ''} onClick={() => setConcept(n)} key={n}>
              <span>0{n}</span> {n === 1 ? 'Focus' : n === 2 ? 'Atlas' : 'Pulse'}
            </button>
          ))}
        </div>
      ) : (
        <div className="top-context"><span>JARVIS</span><b>{ctxLabel}</b></div>
      )}
      <div className="top-actions">
        <PaletteControl palette={palette} setPalette={setPalette} />
        <div className={`search ${searching ? 'open' : ''}`}>
          <Icon name="search" size={18} />
          <input aria-label="Search" placeholder="Search anything..." value={q}
            onChange={e => setQ(e.target.value)} onKeyDown={runSearch}
            onFocus={() => setSearching(true)} onBlur={() => setSearching(false)} />
          <kbd>⏎</kbd>
        </div>
        <div className="notify-wrap" ref={popRef}>
          <button className="icon-btn notification" aria-label="Notifications" onClick={() => setOpen(o => !o)}>
            <Icon name="bell" size={19} />{alerts.length > 0 && <i />}
          </button>
          {open && (
            <div className="notify-pop">
              <h4>NOTIFICATIONS</h4>
              {alerts.length === 0 && <div className="item"><b>You’re all caught up</b><span>No warnings right now.</span></div>}
              {alerts.map((a, i) => <div className="item" key={i}><b>{a.title}</b><span>{a.text}</span></div>)}
            </div>
          )}
        </div>
        <button className="profile" onClick={() => setPage('profile')}>
          {me?.avatar ? <img className="avatar-img" src={me.avatar} alt="" /> : <span>{initialsOf(me?.name || name)}</span>}
          <div><b>{me?.name || name}</b><small>{me?.course || me?.branch || 'Student'}</small></div>
        </button>
        <button className="logout" aria-label="Sign out" title="Sign out" onClick={onLogout}><Icon name="logout" size={18} /></button>
      </div>
    </header>
  )
}

function BottomNav({ page, setPage, onLogout }) {
  const [open, setOpen] = useState(false)
  const main = NAV.slice(0, 4)
  return (
    <>
      {open && (
        <div className="mobile-more" role="dialog" aria-label="All pages">
          <div className="mobile-more-head">
            <div><span>EXPLORE JARVIS</span><h2>All spaces</h2></div>
            <button onClick={() => setOpen(false)}>Close</button>
          </div>
          <div>
            {NAV.slice(4).map(item => (
              <button className={page === item.page ? 'active' : ''} key={item.page} onClick={() => { setPage(item.page); setOpen(false) }}>
                <Icon name={item.icon} /><span>{item.label}</span><Icon name="arrow" size={16} />
              </button>
            ))}
            <button className={page === 'profile' ? 'active' : ''} onClick={() => { setPage('profile'); setOpen(false) }}>
              <Icon name="settings" /><span>Profile & settings</span><Icon name="arrow" size={16} />
            </button>
            <button onClick={() => { setOpen(false); onLogout() }}>
              <Icon name="logout" /><span>Sign out</span><Icon name="arrow" size={16} />
            </button>
          </div>
        </div>
      )}
      <nav className="bottom-nav">
        {main.map(item => (
          <button className={page === item.page ? 'active' : ''} key={item.page} onClick={() => setPage(item.page)}>
            <Icon name={item.icon} /><span>{item.label.replace('Marks & CGPA', 'Marks')}</span>
          </button>
        ))}
        <button className={open || !main.some(i => i.page === page) ? 'active' : ''} onClick={() => setOpen(v => !v)}>
          <Icon name="menu" /><span>More</span>
        </button>
      </nav>
    </>
  )
}

/* ───────────── layout ───────────── */
function Layout({ name, onLogout }) {
  const [concept, setConcept] = useState(1)
  const [collapsed, setCollapsed] = useState(false)
  const [page, setPageState] = useState('overview')
  const [dash, setDash] = useState(null)
  const [dashError, setDashError] = useState(null)
  const [me, setMe] = useState(null)
  const [tasks, setTasks] = useState([])
  const [palette, setPaletteState] = useState(getStoredPalette())
  const [tour, setTour] = useState(() => localStorage.getItem('jarvis_tour') === '1')   // set once, right after sign-up
  const closeTour = () => { localStorage.removeItem('jarvis_tour'); setTour(false) }

  useEffect(() => { applyPalette(palette) }, [palette])
  const setPalette = (key) => {
    setPaletteState(key)
    api.savePrefs({ palette: key }).catch(() => {})
    setMe(m => (m ? { ...m, prefs: { ...(m.prefs || {}), palette: key } } : m))
  }

  const refreshDash = () => {
    api.getTasks().then(setTasks).catch(() => {})
    return api.dashboard()
      .then(d => { if (d && d.attendance) { setDash(d); setDashError(null) } else setDashError('Could not load your data. Try signing in again.') })
      .catch(() => setDashError('Cannot connect to the backend. Make sure uvicorn is running on port 8000.'))
  }
  const refreshMe = () => api.me().then(m => { if (m && !m.detail) { setMe(m); if (m.prefs?.palette) { setPaletteState(applyPalette(m.prefs.palette)) } } }).catch(() => {})

  useEffect(() => { refreshDash(); refreshMe() }, [])

  const setPage = (next) => { setPageState(next); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const prefs = me?.prefs || {}

  const alerts = []
  if (dash) {
    if (dash.danger_subjects?.length) alerts.push({ title: 'Attendance warning', text: `${dash.danger_subjects.join(', ')} — check the Attendance page.` })
    if (dash.burnout?.level === 'burnout' || dash.burnout?.level === 'alert')
      alerts.push({ title: dash.burnout.level === 'burnout' ? 'Burnout signal' : 'Warning signs this week', text: dash.burnout.message || (dash.burnout.signals || []).map(s => s.message).join(' ') })
    if (dash.broken_streaks > 0) alerts.push({ title: 'Streak broken', text: `${dash.broken_streaks} habit streak${dash.broken_streaks > 1 ? 's are' : ' is'} broken. Start again today.` })
    if (dash.budget > 0 && dash.total_spent > dash.budget) alerts.push({ title: 'Over budget', text: `You’ve spent ₹${Math.round(dash.total_spent)} of ₹${dash.budget}.` })
    if (prefs.habit_nudges && (dash.streaks || []).some(s => !s.done_today)) alerts.push({ title: 'Habits waiting', text: `${dash.streaks.filter(s => !s.done_today).length} habit(s) not checked in today.` })
  }
  if (prefs.assignment_deadlines !== false) {
    const soon = new Date(); soon.setDate(soon.getDate() + 2)
    tasks.filter(t => !t.done && t.due_date && t.due_date <= localDate(soon)).slice(0, 3)
      .forEach(t => alerts.push({ title: t.due_date < localDate() ? 'Overdue task' : 'Deadline coming up', text: `${t.title}${t.subject ? ` (${t.subject})` : ''} — due ${t.due_date}` }))
  }

  let content
  if (page === 'overview') content = <Dashboard name={me?.name || name} dash={dash} dashError={dashError} concept={concept} go={setPage} refreshDash={refreshDash} me={me} />
  else if (page === 'attendance') content = <AttendancePage onChange={refreshDash} prefs={prefs} />
  else if (page === 'marks') content = <MarksPage onChange={refreshDash} go={setPage} prefs={prefs} refreshMe={refreshMe} />
  else if (page === 'habits') content = <HabitsPage onChange={refreshDash} />
  else if (page === 'expenses') content = <ExpensesPage budget={dash?.budget || 0} onChange={refreshDash} />
  else if (page === 'insights') content = <InsightsPage go={setPage} />
  else if (page === 'assistant') content = <ChatPage />
  else if (page === 'study') content = <StudyPage />
  else if (page === 'career') content = <CareerPage prefs={prefs} refreshMe={refreshMe} />
  else if (page === 'checkin') content = <CheckinPage />
  else content = <ProfilePage me={me} name={name} onLogout={onLogout} refreshMe={refreshMe} palette={palette} setPalette={setPalette} onReplayTour={() => setTour(true)} />

  return (
    <div className={`app concept-${concept}`} data-palette={palette}>
      <Sidebar collapsed={collapsed} onCollapse={() => setCollapsed(x => !x)} page={page} setPage={setPage} me={me} dash={dash} alertCount={alerts.length} />
      <div className="app-main">
        <Header concept={concept} setConcept={setConcept} page={page} setPage={setPage} name={name} me={me} alerts={alerts} onLogout={onLogout} palette={palette} setPalette={setPalette} />
        {content}
      </div>
      <BottomNav page={page} setPage={setPage} onLogout={onLogout} />
      <StudyMiniBar page={page} setPage={setPage} />
      {tour && <Onboarding name={me?.name || name} go={setPage} onClose={closeTour} />}
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(localStorage.getItem('name'))
  useEffect(() => { applyPalette(getStoredPalette()) }, [])
  const onLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('name'); localStorage.removeItem('jarvis_tour'); setUser(null) }
  return user ? <Layout name={user} onLogout={onLogout} /> : <AuthPage onLogin={setUser} />
}
