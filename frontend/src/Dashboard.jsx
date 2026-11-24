/**
 * Dashboard.jsx — "Overview" page with the three Figma concepts:
 *   01 Focus (stat cards + schedule + insight + habits)
 *   02 Atlas (academic health + subject performance + weekly activity)
 *   03 Pulse (live rings + streak heatmap)
 * All numbers come from your real backend data.
 */
import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { Icon, Ring, Sparkline, Loading, ErrorBox, localDate } from './ui'

export const DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const greetingFor = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
const dateEyebrow = () => {
  const d = new Date()
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`.toUpperCase()
}

/* ── load everything the dashboard needs, once ── */
function useDashboardData() {
  const [state, setState] = useState({ loading: true })
  const load = async () => {
    const safe = (p, fallback) => p.then(r => (Array.isArray(fallback) ? (Array.isArray(r) ? r : fallback) : (r && !r.detail ? r : fallback))).catch(() => fallback)
    const [subjects, scores, streaks, timetable, cgpa, tasks, study] = await Promise.all([
      safe(api.getSubjects(), []), safe(api.getScores(), []), safe(api.getStreaks(), []),
      safe(api.getTimetable(), []), safe(api.getCgpa(), null), safe(api.getTasks(), []), safe(api.studySummary(), null),
    ])
    setState({ loading: false, subjects, scores, streaks, timetable, cgpa, tasks, study })
  }
  useEffect(() => { load() }, [])
  return { ...state, reload: load }
}

/* ── derived numbers ── */
function derive(dash, d, prefs = {}) {
  const att = dash.attendance || []
  const avgAtt = att.length ? Math.round(att.reduce((s, a) => s + (a.current_pct || 0), 0) / att.length) : null

  // attendance sparkline = daily present-rate for the last 7 days
  const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(); x.setDate(x.getDate() - (6 - i)); return localDate(x) })
  let last = 0
  const attSpark = days.map(day => {
    let p = 0, t = 0
    d.subjects.forEach(s => (s.recent || []).forEach(r => {
      if (r.date !== day) return
      if (r.status === 'present' || (!r.status && r.present)) { p++; t++ }
      else if (r.status === 'absent' || (!r.status && !r.present)) t++
    }))
    if (t) last = Math.round((p / t) * 100)
    return last
  })

  // CGPA/score sparkline = running average of logged marks
  const sorted = [...d.scores].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  let sum = 0
  const scoreSpark = sorted.map((s, i) => { sum += s.percentage; return sum / (i + 1) }).slice(-7)

  // per-subject score averages
  const bySubject = {}
  d.scores.forEach(s => { (bySubject[s.subject] = bySubject[s.subject] || []).push(s.percentage) })
  const subjectScores = Object.entries(bySubject)
    .map(([name, arr]) => [name, Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)])
    .sort((a, b) => b[1] - a[1])

  // habits
  const streaks = d.streaks
  const doneToday = streaks.filter(s => s.done_today).length
  const best = streaks.reduce((m, s) => Math.max(m, s.current || 0), 0)
  const bestStreak = [...streaks].sort((a, b) => (b.current || 0) - (a.current || 0))[0]
  const last7 = (bestStreak?.heatmap || []).slice(-7)
  const heat28 = Array.from({ length: 28 }, (_, i) => streaks.filter(s => s.heatmap?.[i]).length)
  const weekLabels = days.map(day => WEEKDAYS[new Date(day + 'T00:00:00').getDay()][0])
  const focusWeek = days.map(day => Math.round((d.study?.week || []).find(w => w.date === day)?.minutes || 0))
  const weekCounts = focusWeek

  const spent = dash.total_spent || 0
  const budget = dash.budget || 0

  // today's classes
  const todayKey = DAY_KEYS[new Date().getDay()]
  const first = prefs.first_class || '09:00', plen = prefs.period_minutes || 60
  const hm = (mins) => { const t = (parseInt(first.slice(0, 2)) * 60 + parseInt(first.slice(3, 5)) + mins) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }
  const rawSlots = d.timetable
    .filter(t => t.day === todayKey && t.subject_id != null)
    .sort((a, b) => a.period - b.period)
    .map(t => ({ ...t, subject: d.subjects.find(s => s.id === t.subject_id) }))
    .filter(t => t.subject)
  const todaySlots = []
  rawSlots.forEach(t => {
    const lastB = todaySlots[todaySlots.length - 1]
    if (lastB && lastB.subject.id === t.subject.id && lastB.endPeriod === t.period - 1) lastB.endPeriod = t.period
    else todaySlots.push({ ...t, endPeriod: t.period })
  })
  todaySlots.forEach(b => { b.time = hm((b.period - 1) * plen); b.endTime = hm(b.endPeriod * plen) })
  const openTasks = d.tasks.filter(t => !t.done)

  // health score
  const parts = [avgAtt, dash.avg_score || null].filter(v => v != null && v > 0)
  const health = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0

  return { avgAtt, attSpark, scoreSpark, subjectScores, streaks, doneToday, best, last7, heat28, weekCounts, weekLabels, spent, budget, todaySlots, todayKey, health, openTasks }
}

/* ── pieces ── */
function Greeting({ name, eyebrow }) {
  return (
    <div className="greeting">
      <span>{eyebrow || dateEyebrow()}</span>
      <h1>{greetingFor()}, {(name || 'there').split(' ')[0]}.</h1>
      <p>Here’s where your semester stands today.</p>
    </div>
  )
}

function StatCards({ dash, d, x }) {
  const cgpa = d.cgpa?.current_cgpa
  return (
    <div className="stats-grid">
      <article className="stat-card">
        <div className="stat-icon accent-tone"><Icon name="calendar" /></div>
        <div>
          <span>Attendance</span>
          <strong>{x.avgAtt != null ? `${x.avgAtt}%` : '—'}</strong>
          <small className={x.avgAtt >= 75 ? 'up' : ''}>{dash.attendance?.length || 0} subjects tracked</small>
        </div>
        <Sparkline values={x.attSpark} />
      </article>
      <article className="stat-card">
        <div className="stat-icon accent-muted"><Icon name="chart" /></div>
        <div>
          <span>{cgpa ? 'Current CGPA' : 'Average score'}</span>
          <strong>{cgpa || (dash.avg_score ? `${dash.avg_score}%` : '—')}</strong>
          <small>{d.scores.length} assessments logged</small>
        </div>
        <Sparkline color="var(--accent)" values={x.scoreSpark} />
      </article>
      <article className="stat-card">
        <div className="stat-icon accent-soft-tone"><Icon name="flame" /></div>
        <div>
          <span>Habit streak</span>
          <strong>{x.best} day{x.best === 1 ? '' : 's'}</strong>
          <small className={dash.broken_streaks ? '' : 'up'}>{dash.broken_streaks ? `${dash.broken_streaks} broken` : x.streaks.length ? 'All running' : 'No habits yet'}</small>
        </div>
        <div className="mini-days">
          {(x.last7.length ? x.last7 : [0, 0, 0, 0, 0, 0, 0]).map((v, i) => <i className={v ? 'done' : ''} key={i} />)}
        </div>
      </article>
      <article className="stat-card">
        <div className="stat-icon secondary-tone"><Icon name="wallet" /></div>
        <div>
          <span>Monthly spend</span>
          <strong>₹{Math.round(x.spent).toLocaleString('en-IN')}</strong>
          <small>{x.budget > 0 ? `₹${Math.max(0, Math.round(x.budget - x.spent)).toLocaleString('en-IN')} remaining` : 'No budget set'}</small>
        </div>
        <div className="budget-mini"><i style={{ width: `${x.budget > 0 ? Math.min(100, (x.spent / x.budget) * 100) : 0}%` }} /></div>
      </article>
    </div>
  )
}

function Schedule({ x, go }) {
  return (
    <article className="panel schedule">
      <div className="panel-head">
        <div><span>Today · {x.todayKey}</span><h2>Your schedule</h2></div>
        <button onClick={() => go('attendance')}>View timetable <Icon name="arrow" size={16} /></button>
      </div>
      <div className="schedule-list">
        {x.todaySlots.length === 0 && (
          <div className="schedule-row" style={{ gridTemplateColumns: '1fr' }}><div><b>No classes scheduled today</b><small>Enjoy the breathing room — or plan a study block.</small></div></div>
        )}
        {x.todaySlots.map((t, i) => (
          <div className="schedule-row" key={`${t.day}-${t.period}`}>
            <time>{t.time}</time>
            <i className={['accent-tone', 'accent-muted', 'accent-soft-tone'][i % 3]} />
            <div><b>{t.subject.name}</b><small>{t.subject.room || t.subject.professor || `Period ${t.period}${t.endPeriod > t.period ? `–${t.endPeriod}` : ''}`}</small></div>
            <span>{t.endTime}</span>
          </div>
        ))}
      </div>
    </article>
  )
}

function Recommendation({ dash, x, go }) {
  let title = 'Start logging to unlock your insights.'
  let text = 'Add attendance, marks and habits — JARVIS connects them and tells you what to do next.'
  let cta = 'Ask JARVIS'
  const lowest = x.subjectScores[x.subjectScores.length - 1]
  if (dash.burnout && (dash.burnout.level === 'burnout' || dash.burnout.level === 'alert')) {
    title = dash.burnout.level === 'burnout' ? 'Time to slow down and recover.' : 'A few warning signs this week.'
    text = dash.burnout.message || (dash.burnout.signals || []).map(s => s.message).join(' ')
    cta = 'See insights'
  } else if (dash.danger_subjects?.length) {
    title = 'Attendance needs attention.'
    text = `${dash.danger_subjects.join(', ')} ${dash.danger_subjects.length > 1 ? 'are' : 'is'} close to or below the minimum. Check how many classes you can still miss.`
    cta = 'Open attendance'
  } else if (lowest && lowest[1] < 70) {
    title = 'One small shift could lift your marks.'
    text = `${lowest[0]} is your weakest subject at ${lowest[1]}%. A focused revision block today keeps your CGPA on track.`
  } else if (x.avgAtt != null) {
    title = 'You’re building momentum.'
    text = 'Attendance and scores look healthy. Keep the rhythm going — consistency is what compounds.'
  }
  const target = cta === 'Open attendance' ? 'attendance' : cta === 'See insights' ? 'insights' : 'assistant'
  return (
    <article className="panel recommendation">
      <div className="ai-label"><Icon name="sparkles" size={17} /> JARVIS INSIGHT</div>
      <h2>{title}</h2>
      <p>{text}</p>
      <button onClick={() => go(target)}>{cta} <Icon name="arrow" size={16} /></button>
      <div className="orb"><i /><i /><i /></div>
    </article>
  )
}

function Tasks({ tasks, reload, go }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', due_date: '' })
  const today = localDate()
  const tomorrow = (() => { const t = new Date(); t.setDate(t.getDate() + 1); return localDate(t) })()
  const when = (t) => !t.due_date ? 'No deadline' : t.due_date === today ? `Due today${t.due_time ? ` · ${t.due_time}` : ''}` : t.due_date === tomorrow ? 'Due tomorrow' : t.due_date < today ? `Overdue · ${t.due_date}` : `Due ${t.due_date}`
  const toggle = async (t) => { await api.updateTask(t.id, { done: !t.done }); reload() }
  const add = async () => {
    if (!form.title.trim()) return
    await api.addTask({ title: form.title.trim(), due_date: form.due_date || null })
    setForm({ title: '', due_date: '' }); setAdding(false); reload()
  }
  const remove = async (id) => { await api.deleteTask(id); reload() }
  const list = tasks.slice(0, 5)
  return (
    <article className="panel tasks">
      <div className="panel-head">
        <div><span>{tasks.filter(t => !t.done).length} OPEN</span><h2>Priority list</h2></div>
        <button aria-label="Add task" onClick={() => setAdding(a => !a)}><Icon name={adding ? 'x' : 'plus'} size={18} /></button>
      </div>
      {adding && (
        <div className="task-add">
          <input autoFocus placeholder="What needs doing?" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} onKeyDown={e => e.key === 'Enter' && add()} />
          <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
          <button className="small-action solid" onClick={add}>Add</button>
        </div>
      )}
      {list.length === 0 && !adding && (
        <button className="task" onClick={() => setAdding(true)}><i /><div><b>Nothing on your list</b><small>Tap to add an assignment or to-do</small></div></button>
      )}
      {list.map(t => (
        <div className="task-wrap" key={t.id}>
          <button className={`task ${t.done ? 'done' : ''}`} onClick={() => toggle(t)}>
            <i>{t.done && <Icon name="check" size={14} />}</i>
            <div><b>{t.title}</b><small>{t.subject ? `${t.subject} · ` : ''}{when(t)}</small></div>
          </button>
          <button className="icon-btn-sm task-x" aria-label="Delete task" onClick={() => remove(t.id)}><Icon name="x" size={14} /></button>
        </div>
      ))}
    </article>
  )
}

function SubjectBars({ x, dash }) {
  const rows = x.subjectScores.length
    ? x.subjectScores.slice(0, 5)
    : (dash.attendance || []).slice(0, 5).map(a => [a.name, Math.round(a.current_pct || 0)])
  return (
    <article className="panel subject-panel">
      <div className="panel-head">
        <div><span>ACADEMIC PULSE</span><h2>{x.subjectScores.length ? 'Subject performance' : 'Attendance by subject'}</h2></div>
        <button>This semester</button>
      </div>
      <div className="subjects">
        {rows.length === 0 && <div><div><b>Nothing logged yet</b></div></div>}
        {rows.map(s => (
          <div key={s[0]}>
            <div><b>{s[0]}</b><span>{s[1]}%</span></div>
            <i><em style={{ width: `${s[1]}%` }} /></i>
          </div>
        ))}
      </div>
    </article>
  )
}

function WeekChart({ x }) {
  const total = x.weekCounts.reduce((a, b) => a + b, 0)
  const max = Math.max(...x.weekCounts, 1)
  const hrs = total >= 60 ? `${(total / 60).toFixed(1)} hrs` : `${total} min`
  return (
    <article className="panel week-chart">
      <div className="panel-head">
        <div><span>FOCUS TIME</span><h2>{hrs} this week</h2></div>
        <small><i /> from Study with me</small>
      </div>
      <div className="bars">
        {x.weekCounts.map((c, i) => (
          <div key={i} title={`${c} min`}>
            <i style={{ height: `${Math.max(6, (c / max) * 88)}%` }} className={c === max && c > 0 ? 'peak' : ''} />
            <span>{x.weekLabels[i]}</span>
          </div>
        ))}
      </div>
    </article>
  )
}

/* ── the three concepts ── */
function FocusDashboard(p) {
  return (
    <div className="dashboard focus-dashboard">
      <Greeting name={p.name} />
      <StatCards {...p} />
      <div className="main-grid">
        <Schedule x={p.x} go={p.go} />
        <Recommendation dash={p.dash} x={p.x} go={p.go} />
        <Tasks tasks={p.d.tasks} reload={p.reloadAll} go={p.go} />
      </div>
    </div>
  )
}

function AtlasDashboard(p) {
  const { dash, d, x } = p
  const label = x.health >= 80 ? 'Strong & steady' : x.health >= 65 ? 'On track' : x.health > 0 ? 'Needs attention' : 'Getting started'
  return (
    <div className="dashboard atlas-dashboard">
      <Greeting name={p.name} eyebrow="YOUR SEMESTER AT A GLANCE" />
      <div className="atlas-score">
        <div>
          <span>Academic health</span>
          <h2>{label}</h2>
          <p>{x.health > 0 ? 'Based on your attendance and exam scores.' : 'Log attendance and marks to see your score.'}</p>
        </div>
        <Ring value={x.health} size={110} />
        <div className="score-meta">
          <div><b>{d.cgpa?.current_cgpa || '—'}</b><span>CGPA</span></div>
          <div><b>{x.avgAtt != null ? `${x.avgAtt}%` : '—'}</b><span>Attendance</span></div>
          <div><b>{x.best}d</b><span>Best streak</span></div>
        </div>
      </div>
      <div className="atlas-grid">
        <SubjectBars x={x} dash={dash} />
        <WeekChart x={x} />
        <Recommendation dash={dash} x={x} go={p.go} />
        <Schedule x={x} go={p.go} />
      </div>
    </div>
  )
}

function PulseDashboard(p) {
  const { dash, x } = p
  const habitPct = x.streaks.length ? Math.round((x.doneToday / x.streaks.length) * 100) : 0
  const budgetPct = x.budget > 0 ? Math.min(100, Math.round((x.spent / x.budget) * 100)) : 0
  const level = (c) => (x.streaks.length === 0 || c === 0 ? 0 : Math.min(4, Math.ceil((c / x.streaks.length) * 4)))
  return (
    <div className="dashboard pulse-dashboard">
      <div className="pulse-hero">
        <Greeting name={p.name} eyebrow="LIVE STUDENT OS" />
        <div className="pulse-actions">
          <button onClick={() => p.go('assistant')}><Icon name="sparkles" size={17} /> Ask JARVIS</button>
          <button onClick={() => p.go('habits')}><Icon name="plus" size={17} /> Quick add</button>
        </div>
      </div>
      <div className="pulse-layout">
        <div className="command-card">
          <div className="command-top"><span>YOUR DAILY PULSE</span><div><i className="live" /> LIVE</div></div>
          <h2>{dash.danger_subjects?.length ? 'A few things need a look.' : 'Everything is under control.'}</h2>
          <p>{x.todaySlots.length} class{x.todaySlots.length === 1 ? '' : 'es'} today · {x.streaks.length - x.doneToday} habit{x.streaks.length - x.doneToday === 1 ? '' : 's'} left to check in.</p>
          <div className="pulse-rings">
            <div><Ring value={x.avgAtt || 0} size={104} /><span>Attendance</span></div>
            <div><Ring value={habitPct} color="var(--accent)" size={104} /><span>Habits today</span></div>
            <div><Ring value={budgetPct} color="var(--accent)" size={104} /><span>Budget used</span></div>
          </div>
        </div>
        <Recommendation dash={dash} x={x} go={p.go} />
        <article className="panel streak-panel">
          <div className="panel-head">
            <div><span>CONSISTENCY</span><h2>{x.best} day streak</h2></div>
            <div className="flame"><Icon name="flame" /></div>
          </div>
          <div className="heatmap">
            {x.heat28.map((c, i) => <i key={i} className={`level-${level(c)}`} />)}
          </div>
          <div className="heat-legend">
            <span>{x.doneToday} habit{x.doneToday === 1 ? '' : 's'} completed today</span>
            <small>Less <i /><i /><i /> More</small>
          </div>
        </article>
        <Tasks tasks={p.d.tasks} reload={p.reloadAll} go={p.go} />
        <WeekChart x={x} />
      </div>
    </div>
  )
}

/* ── page ── */
export default function Dashboard({ name, dash, dashError, concept, go, refreshDash, me }) {
  const d = useDashboardData()
  const x = useMemo(() => (dash && !d.loading ? derive(dash, d, me?.prefs || {}) : null), [dash, d.loading, d.subjects, d.scores, d.streaks, d.timetable, d.tasks, d.study, me?.prefs])

  const reloadAll = async () => { await d.reload(); refreshDash() }

  if (dashError) return <main><ErrorBox>{dashError}</ErrorBox></main>
  if (!dash || d.loading || !x) return <main><Loading text="Loading your dashboard…" /></main>

  const props = { name, dash, d, x, go, reloadAll }
  return (
    <main>
      {concept === 1 ? <FocusDashboard {...props} /> : concept === 2 ? <AtlasDashboard {...props} /> : <PulseDashboard {...props} />}
    </main>
  )
}
