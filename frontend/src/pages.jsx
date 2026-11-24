/**
 * pages.jsx — Marks & CGPA, Habits, Expenses, Career roadmap, Weekly check-in.
 * Figma layouts, wired to the existing backend endpoints (api.js).
 */
import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import {
  Icon, Page, Card, Title, Metric, Progress, Field, Select, Loading, Empty, Toast,
  localDate, gradeOf, inr,
} from './ui'

const arr = (x) => (Array.isArray(x) ? x : [])
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const shortDate = (s) => { const d = new Date(s + 'T00:00:00'); return isNaN(d) ? s : `${d.getDate()} ${MONTHS[d.getMonth()]}` }

/* ═══════════════════════ MARKS & CGPA ═══════════════════════ */
function ScoreChart({ points }) {
  if (points.length === 0) return <div className="chart-empty">Log marks to see your trend</div>
  const W = 600, H = 210
  const xs = points.map((_, i) => (points.length === 1 ? 0 : (i * W) / (points.length - 1)))
  const ys = points.map(p => 185 - (Math.max(0, Math.min(100, p.v)) / 100) * 150)
  const pts = points.length === 1 ? [[0, ys[0]], [W, ys[0]]] : xs.map((x, i) => [x, ys[i]])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const labels = points.length <= 5 ? points : [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]]
  return (
    <>
      <svg className="line-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity=".2" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[35, 80, 125, 170].map(y => <line key={y} x1="0" x2={W} y1={y} y2={y} stroke="#e8e8e2" />)}
        <path d={`${line} L${W} ${H} L0 ${H}Z`} fill="url(#area)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="chart-axis dated">{labels.map((p, i) => <span key={i}>{shortDate(p.date)}</span>)}</div>
    </>
  )
}

export function MarksPage({ onChange, go, prefs = {} }) {
  const blank = () => ({ subject: '', exam_type: 'mid-sem', score: '', total: '', date: localDate() })
  const [scores, setScores] = useState(null)
  const [cgpa, setCgpa] = useState(null)
  const [plan, setPlan] = useState(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(blank())
  const [toast, setToast] = useState(null)

  const load = () => Promise.all([api.getScores().catch(() => []), api.getCgpa().catch(() => null), api.cgpaPlan().catch(() => null)])
    .then(([s, c, p]) => { setScores(arr(s)); setCgpa(c && !c.detail ? c : null); setPlan(p && !p.detail ? p : null) })
  useEffect(() => { load() }, [])

  const submit = async () => {
    if (!form.subject.trim() || form.score === '' || !form.total) return
    const res = await api.addScore({ ...form, subject: form.subject.trim(), score: parseFloat(form.score), total: parseFloat(form.total) })
    if (res?.detail) { setToast({ msg: 'Could not save — check the values', bad: true }); return }
    setForm(blank()); setAdding(false); setToast({ msg: 'Marks saved' }); load(); onChange?.()
  }
  const remove = async (id) => { await api.deleteScore(id); load(); onChange?.() }

  const bySubject = useMemo(() => {
    const m = {}
    arr(scores).forEach(s => { (m[s.subject] = m[s.subject] || []).push(s) })
    return Object.entries(m).map(([subject, list]) => ({ subject, list, avg: Math.round(list.reduce((a, x) => a + x.percentage, 0) / list.length) }))
      .sort((a, b) => b.avg - a.avg)
  }, [scores])

  const trend = useMemo(() => {
    const sorted = [...arr(scores)].sort((a, b) => String(a.date).localeCompare(String(b.date)))
    let sum = 0
    return sorted.map((s, i) => { sum += s.percentage; return { v: sum / (i + 1), date: String(s.date) } })
  }, [scores])

  if (scores === null) return <Page id="marks" eyebrow="Marks & CGPA" title="Your academic trajectory."><Loading /></Page>

  const best = bySubject[0], worst = bySubject[bySubject.length - 1]
  const credits = Object.values(cgpa?.grade_points || {}).reduce((s, g) => s + (g.credits || 0), 0)
  const totalCredits = prefs.total_credits || 120
  const target = prefs.target_cgpa || 9
  const current = cgpa?.current_cgpa || 0
  const report = async () => { try { await api.download('/reports/academic.csv', 'jarvis-academic-report.csv'); setToast({ msg: 'Report downloaded' }) } catch (e) { setToast({ msg: e.message, bad: true }) } }
  const predicted = cgpa?.predicted_cgpa || 0
  const delta = trend.length > 1 ? Math.round(trend[trend.length - 1].v - trend[0].v) : 0

  return (
    <Page id="marks" eyebrow="Marks & CGPA" title="Your academic trajectory."
      description="Every test you log sharpens your CGPA prediction."
      action={<div style={{ display: 'flex', gap: 8 }}>
        <button className="outline-action" onClick={report}><Icon name="download" size={15} /> Download report</button>
        <button className="primary-action" onClick={() => setAdding(a => !a)}>{adding ? 'Cancel' : <><Icon name="plus" size={16} /> Add marks</>}</button>
      </div>}>
      <div className="metric-row">
        <Metric icon="trend" label="Current CGPA" value={cgpa?.current_cgpa || '—'} note={`${scores.length} assessment${scores.length === 1 ? '' : 's'} logged`} />
        <Metric icon="target" label="Predicted CGPA" value={predicted || '—'} note={cgpa?.ml_used ? 'ML forecast' : 'Log more marks to unlock'} tone="accent-muted" />
        <Metric icon="book" label="Credits earned" value={`${credits || 0} / ${totalCredits}`} note={`${Math.min(100, Math.round(((credits || 0) / totalCredits) * 100))}% complete`} tone="accent-soft-tone" />
      </div>

      {adding && (
        <Card className="form-card">
          <Title eyebrow="NEW ASSESSMENT" title="Add marks" />
          <div className="form-row">
            <Field label="Subject"><input placeholder="e.g. DBMS" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></Field>
            <Field label="Exam type"><Select value={form.exam_type} onChange={v => setForm({ ...form, exam_type: v })} options={['mid-sem', 'end-sem', 'quiz', 'assignment', 'lab']} /></Field>
            <Field label="Score"><input type="number" placeholder="45" value={form.score} onChange={e => setForm({ ...form, score: e.target.value })} /></Field>
            <Field label="Out of"><input type="number" placeholder="100" value={form.total} onChange={e => setForm({ ...form, total: e.target.value })} /></Field>
            <Field label="Date"><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
          </div>
          <div className="form-actions"><button className="primary-action" onClick={submit}>Save marks</button></div>
        </Card>
      )}

      {scores.length === 0 && !adding ? (
        <Card><Empty icon="chart" title="No marks logged yet" action={<button className="primary-action" onClick={() => setAdding(true)}>Add your first marks</button>}>
          Log a test or assignment and JARVIS will calculate your CGPA and forecast.
        </Empty></Card>
      ) : (
        <div className="product-grid marks-grid">
          <Card className="performance-chart">
            <Title eyebrow="SCORE TREND" title="Running average"
              action={<span className="positive">{delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}% overall</span>} />
            <ScoreChart points={trend} />
          </Card>
          <Card className="dark-card prediction-card">
            <Title eyebrow="JARVIS FORECAST" title={`Path to ${target}`} />
            <b>{predicted || current || '—'}</b>
            <p>{!plan || plan.assessments === 0
              ? 'Log your first marks and JARVIS will show what you need to reach your target.'
              : !plan.feasible
                ? `Reaching a ${target} CGPA needs more than 100% in your next ${plan.upcoming} assessments — try a lower target in Settings.`
                : plan.required <= 0
                  ? `You’re already on track for a ${target} CGPA — keep your average above ${plan.target_percentage}%.`
                  : `Score ${Math.ceil(plan.required)}% or higher in your next ${plan.upcoming === 2 ? 'two' : plan.upcoming} assessments to reach a ${target} CGPA.`}</p>
            <Progress value={target ? ((predicted || current || 0) / target) * 100 : 0} tone="accent-soft-tone" />
            <button onClick={() => go?.('assistant')}>View improvement plan <Icon name="arrow" size={16} /></button>
          </Card>
          <Card className="score-table">
            <Title eyebrow="BY SUBJECT" title="Course performance"
              action={best && <span className="positive">Best: {best.subject}</span>} />
            {bySubject.map(s => (
              <div className="score-line" key={s.subject}>
                <div><b>{s.subject}</b><small>{s.list.length} assessment{s.list.length === 1 ? '' : 's'}</small></div>
                <span>{s.avg}<small>/100</small></span>
                <em>{gradeOf(s.avg)}</em>
                <Progress value={s.avg} tone={s.avg < 60 ? 'accent-muted' : ''} />
              </div>
            ))}
          </Card>
          <Card>
            <Title eyebrow="ALL ASSESSMENTS" title="Latest results" />
            <div style={{ marginTop: 10 }}>
              {scores.slice(0, 12).map(s => (
                <div className="assess-line" key={s.id}>
                  <div><b>{s.subject} · {s.exam_type}</b><small>{shortDate(String(s.date))}</small></div>
                  <div className="sc">{s.score}/{s.total} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>({s.percentage}%)</span></div>
                  <button className="icon-btn-sm" aria-label="Delete" onClick={() => remove(s.id)}><Icon name="trash" size={16} /></button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
      <Toast toast={toast} onDone={() => setToast(null)} />
    </Page>
  )
}

/* ═══════════════════════ HABITS ═══════════════════════ */
const HABIT_COLORS = ['#e05a3f', '#d85f78', '#e39a24', '#f06d52', '#6b3a2e', '#59364e']

export function HabitsPage({ onChange }) {
  const [streaks, setStreaks] = useState(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', color: HABIT_COLORS[0] })
  const [toast, setToast] = useState(null)

  const load = () => api.getStreaks().then(r => setStreaks(arr(r))).catch(() => setStreaks([]))
  useEffect(() => { load() }, [])

  const submit = async () => {
    if (!form.name.trim()) return
    await api.addStreak({ ...form, name: form.name.trim() })
    setForm({ name: '', description: '', color: HABIT_COLORS[0] }); setAdding(false)
    setToast({ msg: 'Habit added' }); load(); onChange?.()
  }
  const toggle = async (id) => { await api.checkIn(id, localDate()); load(); onChange?.() }
  const remove = async (s) => {
    if (!window.confirm(`Remove "${s.name}"?`)) return
    await api.deleteStreak(s.id); setToast({ msg: `${s.name} removed` }); load(); onChange?.()
  }

  if (streaks === null) return <Page id="habits" eyebrow="Habits" title="Small actions, compounding."><Loading /></Page>

  const n = streaks.length
  const done = streaks.filter(s => s.done_today).length
  const best = streaks.reduce((m, s) => Math.max(m, s.current || 0), 0)
  const last7 = streaks.reduce((sum, s) => sum + (s.heatmap || []).slice(-7).filter(Boolean).length, 0)
  const weekly = n ? Math.round((last7 / (n * 7)) * 100) : 0
  const heat = Array.from({ length: 84 }, (_, i) => streaks.filter(s => (s.history || [])[i]).length)
  const prev7 = streaks.reduce((sum, s) => sum + (s.history || []).slice(-14, -7).filter(Boolean).length, 0)
  const prevPct = n ? Math.round((prev7 / (n * 7)) * 100) : 0
  const level = (c) => (n === 0 || c === 0 ? 0 : Math.min(4, Math.ceil((c / n) * 4)))
  const activeDays = heat.filter(c => c > 0).length
  const star = [...streaks].sort((a, b) => (b.consistency || 0) - (a.consistency || 0))[0]
  const now = new Date()

  return (
    <Page id="habits" eyebrow="Habits" title="Small actions, compounding."
      description="Build a reliable routine around study, health and recovery."
      action={<button className="primary-action" onClick={() => setAdding(a => !a)}>{adding ? 'Cancel' : <><Icon name="plus" size={16} /> Add habit</>}</button>}>
      <div className="metric-row">
        <Metric icon="flame" label="Current streak" value={`${best} day${best === 1 ? '' : 's'}`} note={n ? 'Longest running habit' : 'Add a habit to start'} />
        <Metric icon="check" label="Today" value={`${done} / ${n}`} note={n && done === n ? 'All done — great work' : 'Keep the rhythm'} tone="accent-muted" />
        <Metric icon="trend" label="Weekly completion" value={`${weekly}%`} note={`${weekly - prevPct >= 0 ? '+' : ''}${weekly - prevPct}% vs last week`} tone="accent-soft-tone" />
      </div>

      {adding && (
        <Card className="form-card">
          <Title eyebrow="NEW HABIT" title="What do you want to keep up?" />
          <div className="form-row">
            <Field label="Habit name"><input placeholder="e.g. LeetCode" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Goal (optional)"><input placeholder="1 problem per day" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
          </div>
          <Field label="Colour">
            <div className="color-dots">
              {HABIT_COLORS.map(c => <button key={c} aria-label={c} className={form.color === c ? 'selected' : ''} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} />)}
            </div>
          </Field>
          <div className="form-actions" style={{ marginTop: 18 }}><button className="primary-action" onClick={submit}>Add habit</button></div>
        </Card>
      )}

      {n === 0 && !adding ? (
        <Card><Empty icon="flame" title="No habits tracked yet" action={<button className="primary-action" onClick={() => setAdding(true)}>Add your first habit</button>}>
          Pick one small thing you want to do every day and check in as you go.
        </Empty></Card>
      ) : (
        <div className="product-grid habit-grid">
          <Card className="habit-list">
            <Title eyebrow={`${WEEKDAYS[now.getDay()].toUpperCase()} · ${now.getDate()} ${MONTHS[now.getMonth()].toUpperCase()}`} title="Today’s rhythm"
              action={<span>{n ? Math.round((done / n) * 100) : 0}% done</span>} />
            {streaks.map(s => (
              <div key={s.id} style={{ position: 'relative' }}>
                <button className={`habit-row ${s.done_today ? 'complete' : ''}`} onClick={() => toggle(s.id)} style={{ width: '100%' }}>
                  <i>{s.done_today && <Icon name="check" size={15} />}</i>
                  <div>
                    <b><span className="habit-dot" style={{ background: s.color }} />{s.name}</b>
                    <small>{s.description || `Best ${s.best || 0} days · ${s.consistency || 0}% consistent`}</small>
                  </div>
                  <span><Icon name="flame" size={14} />{s.current || 0}</span>
                </button>
              </div>
            ))}
            <div className="add-line">
              {streaks.map(s => <button key={s.id} className="small-action" onClick={() => remove(s)} title={`Remove ${s.name}`}><Icon name="trash" size={14} /> {s.name}</button>)}
            </div>
          </Card>
          <Card>
            <Title eyebrow="LAST 12 WEEKS" title="Consistency heatmap" />
            <div className="large-heatmap">{heat.map((c, i) => <i key={i} className={`heat-${level(c)}`} />)}</div>
            <div className="heat-note">
              <b>{activeDays}</b><span>successful days</span>
              <small>Less <i /><i /><i /> More</small>
            </div>
          </Card>
          <Card className="dark-card habit-insight">
            <Icon name="sparkles" />
            <div>
              <span>JARVIS PATTERN</span>
              <h2>{star ? `${star.name} is your steadiest habit.` : 'Patterns appear as you check in.'}</h2>
              <p>{star ? `You’ve been ${star.consistency || 0}% consistent over the last 28 days, with a best streak of ${star.best || 0} days.` : 'Check in for a few days and JARVIS will point out what’s working.'}</p>
            </div>
          </Card>
        </div>
      )}
      <Toast toast={toast} onDone={() => setToast(null)} />
    </Page>
  )
}

/* ═══════════════════════ EXPENSES ═══════════════════════ */
const CATS = ['food', 'education', 'transport', 'subscription', 'outing', 'other']
const CAT_LABEL = { food: 'Food & dining', education: 'Education', books: 'Education', transport: 'Transport', subscription: 'Subscriptions', outing: 'Outing', misc: 'Other', other: 'Other', income: 'Income' }
const normCat = (c) => (c === 'books' ? 'education' : c === 'misc' ? 'other' : c || 'other')
const catLabel = (c) => CAT_LABEL[c] || (c ? c[0].toUpperCase() + c.slice(1) : 'Other')
const CAT_COLORS = ['var(--accent)', 'var(--secondary)', 'color-mix(in srgb, var(--accent) 50%, var(--secondary))', 'color-mix(in srgb, var(--accent) 35%, var(--card))', 'color-mix(in srgb, var(--secondary) 45%, var(--card))', 'color-mix(in srgb, var(--accent) 70%, #fff)']
const isIncome = (e) => e.kind === 'income'
const whenLabel = (dateStr) => {
  const t = localDate(), y = new Date(); y.setDate(y.getDate() - 1)
  return dateStr === t ? 'Today' : dateStr === localDate(y) ? 'Yesterday' : shortDate(dateStr)
}

export function ExpensesPage({ budget: budgetProp, onChange }) {
  const blank = () => ({ kind: 'expense', category: 'food', amount: '', note: '', date: localDate() })
  const [expenses, setExpenses] = useState(null)
  const [recurring, setRecurring] = useState([])
  const [budget, setBudget] = useState(budgetProp || 0)
  const [adding, setAdding] = useState(false)
  const [editBudget, setEditBudget] = useState(false)
  const [addingBill, setAddingBill] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [budgetInput, setBudgetInput] = useState('')
  const [form, setForm] = useState(blank())
  const [bill, setBill] = useState({ name: '', amount: '', due_day: '1' })
  const [toast, setToast] = useState(null)

  useEffect(() => { setBudget(budgetProp || 0) }, [budgetProp])
  const load = () => Promise.all([api.getExpenses().catch(() => []), api.getRecurring().catch(() => [])])
    .then(([e, r]) => { setExpenses(arr(e)); setRecurring(arr(r)) })
  useEffect(() => { load() }, [])

  const submit = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) return
    const res = await api.addExpense({ ...form, amount: parseFloat(form.amount) })
    if (res?.detail) return setToast({ msg: String(res.detail), bad: true })
    setForm(blank()); setAdding(false); setToast({ msg: form.kind === 'income' ? 'Income added' : 'Expense added' }); load(); onChange?.()
  }
  const saveBudget = async () => {
    const v = parseFloat(budgetInput); if (!v) return
    const now = new Date()
    await api.setBudget({ month: now.getMonth() + 1, year: now.getFullYear(), amount: v })
    setBudget(v); setEditBudget(false); setToast({ msg: 'Budget saved' }); onChange?.()
  }
  const remove = async (id) => { await api.deleteExpense(id); load(); onChange?.() }
  const addBill = async () => {
    if (!bill.name.trim() || !bill.amount) return
    const res = await api.addRecurring({ name: bill.name.trim(), amount: parseFloat(bill.amount), due_day: parseInt(bill.due_day) || 1 })
    if (res?.detail) return setToast({ msg: String(res.detail), bad: true })
    setBill({ name: '', amount: '', due_day: '1' }); setAddingBill(false); setToast({ msg: 'Payment saved' }); load()
  }
  const removeBill = async (id) => { await api.deleteRecurring(id); load() }

  const now = new Date()
  const ym = localDate(now).slice(0, 7)
  const data = useMemo(() => {
    const all = arr(expenses)
    const month = all.filter(e => String(e.date).slice(0, 7) === ym)
    const spend = month.filter(e => !isIncome(e))
    const total = spend.reduce((s, e) => s + e.amount, 0)
    const byCat = {}
    spend.forEach(e => { const c = normCat(e.category); byCat[c] = (byCat[c] || 0) + e.amount })
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1])
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d })
    const week = days.map(d => all.filter(e => !isIncome(e) && String(e.date) === localDate(d)).reduce((s, e) => s + e.amount, 0))
    return { all, total, cats, days, week }
  }, [expenses])

  if (expenses === null) return <Page id="expenses" eyebrow="Expenses" title="Spend with intention."><Loading /></Page>

  const { total, cats, days, week } = data
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const pct = budget > 0 ? Math.min(100, Math.round((total / budget) * 100)) : 0
  // Figma legend: top 3 categories + "Other"
  const top3 = cats.slice(0, 3), rest = cats.slice(3).reduce((s, c) => s + c[1], 0)
  const legend = [...top3, ...(rest > 0 ? [['other_rest', rest]] : [])]
  let acc = 0
  const stops = legend.map(([, v], i) => { const from = acc; acc += (v / (total || 1)) * 100; return `${CAT_COLORS[i]} ${from}% ${acc}%` })
  const donutBg = legend.length ? `conic-gradient(${stops.join(',')})` : 'conic-gradient(var(--ring-track) 0 100%)'
  const maxDay = Math.max(...week, 1)
  const weekTotal = week.reduce((a, b) => a + b, 0)
  const dailyAvg = total / Math.max(1, now.getDate())
  const dailyTarget = budget > 0 ? budget / dim : 0
  const weekTarget = dailyTarget * 7
  const trendNote = budget > 0
    ? (weekTotal <= weekTarget ? `${Math.round((1 - weekTotal / weekTarget) * 100)}% under budget` : `${Math.round((weekTotal / weekTarget - 1) * 100)}% over budget`)
    : `${inr(weekTotal)} total`
  const nextBill = recurring[0]
  const txns = showAll ? data.all : data.all.slice(0, 6)

  return (
    <Page id="expenses" eyebrow="Expenses" title="Spend with intention."
      description="A clear view of your monthly budget, categories and transactions."
      action={<div style={{ display: 'flex', gap: 8 }}>
        <button className="outline-action" onClick={() => setEditBudget(v => !v)}>Set budget</button>
        <button className="primary-action" onClick={() => setAdding(a => !a)}>{adding ? 'Cancel' : <><Icon name="plus" size={16} /> Add transaction</>}</button>
      </div>}>
      <div className="metric-row">
        <Metric icon="wallet" label="Spent this month" value={inr(total)} note={budget > 0 ? `${inr(Math.max(0, budget - total))} remaining` : 'No budget set'} />
        <Metric icon="trend" label="Daily average" value={inr(dailyAvg)} note={budget > 0 ? `${inr(Math.abs(dailyTarget - dailyAvg))} ${dailyAvg <= dailyTarget ? 'below' : 'above'} target` : 'This month so far'} tone="accent-muted" />
        <Metric icon="calendar" label="Next payment" value={nextBill ? inr(nextBill.amount) : '—'}
          note={nextBill ? `${nextBill.name} · ${shortDate(nextBill.next_due)}` : 'Add a bill or subscription'} tone="accent-soft-tone" />
      </div>

      {editBudget && (
        <Card className="form-card">
          <Title eyebrow={`${MONTHS_LONG[now.getMonth()].toUpperCase()} BUDGET`} title="Set your monthly budget" />
          <div className="form-row" style={{ gridTemplateColumns: 'minmax(180px, 320px)' }}>
            <Field label="Monthly budget (₹)"><input type="number" placeholder="10000" value={budgetInput} onChange={e => setBudgetInput(e.target.value)} /></Field>
          </div>
          <div className="form-actions"><button className="primary-action" onClick={saveBudget}>Save budget</button></div>
        </Card>
      )}
      {adding && (
        <Card className="form-card">
          <Title eyebrow="NEW TRANSACTION" title="Add a transaction" />
          <div className="form-row">
            <Field label="Type"><Select value={form.kind} onChange={v => setForm({ ...form, kind: v, category: v === 'income' ? 'income' : 'food' })} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} /></Field>
            {form.kind === 'expense' && <Field label="Category"><Select value={form.category} onChange={v => setForm({ ...form, category: v })} options={CATS.map(c => ({ value: c, label: catLabel(c) }))} /></Field>}
            <Field label="Amount (₹)"><input type="number" placeholder="150" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="Note"><input placeholder="What was it for?" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></Field>
            <Field label="Date"><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
          </div>
          <div className="form-actions"><button className="primary-action" onClick={submit}>Save</button></div>
        </Card>
      )}

      {data.all.length === 0 && !adding ? (
        <Card><Empty icon="wallet" title="No transactions yet" action={<button className="primary-action" onClick={() => setAdding(true)}>Add your first transaction</button>}>
          Track where your money goes and JARVIS will flag spending spikes.
        </Empty></Card>
      ) : (
        <div className="product-grid expense-grid">
          <Card>
            <Title eyebrow={`${MONTHS_LONG[now.getMonth()].toUpperCase()} ${budget > 0 ? 'BUDGET' : 'SPENDING'}`}
              title={budget > 0 ? `${inr(total)} of ${inr(budget)}` : `${inr(total)} spent`} />
            <div className="budget-visual">
              <div className="donut" style={{ background: donutBg }}>
                <span><b>{budget > 0 ? `${pct}%` : cats.length}</b><small>{budget > 0 ? 'used' : 'categories'}</small></span>
              </div>
              <div className="budget-legend">
                {legend.length === 0 && <div><span>No spending this month</span></div>}
                {legend.map(([c, v], i) => (
                  <div key={c}><i style={{ background: CAT_COLORS[i] }} /><span>{c === 'other_rest' ? 'Other' : catLabel(c)}</span><b>{inr(v)}</b></div>
                ))}
              </div>
            </div>
          </Card>
          <Card>
            <Title eyebrow="SPENDING TREND" title="Last 7 days" action={<span className="positive">{trendNote}</span>} />
            <div className="expense-bars">
              {week.map((v, i) => (
                <div key={i}>
                  <i style={{ height: `${Math.max(6, (v / maxDay) * 85)}%` }} className={v === maxDay && v > 0 ? 'high' : ''} title={inr(v)} />
                  <small>{WEEKDAYS[days[i].getDay()][0]}</small>
                </div>
              ))}
            </div>
          </Card>
          <Card className="transactions">
            <Title eyebrow="RECENT ACTIVITY" title="Transactions" action={data.all.length > 6 && <button onClick={() => setShowAll(v => !v)}>{showAll ? 'Show less' : 'View all'}</button>} />
            {txns.map(e => {
              const inc = isIncome(e)
              const ci = inc ? 2 : Math.max(0, CATS.indexOf(normCat(e.category))) % 4
              return (
                <div className="transaction-row" key={e.id}>
                  <div className={`transaction-icon c${ci}`}><Icon name={inc ? 'trend' : 'wallet'} size={17} /></div>
                  <div><b>{e.note || catLabel(normCat(e.category))}</b><small>{inc ? 'Income' : catLabel(normCat(e.category))} · {whenLabel(String(e.date))}</small></div>
                  <strong className={inc ? 'income' : ''}>{inc ? '+' : '−'} {inr(e.amount)}</strong>
                  <button className="icon-btn-sm del" aria-label="Delete" onClick={() => remove(e.id)}><Icon name="trash" size={16} /></button>
                </div>
              )
            })}
          </Card>
          <Card>
            <Title eyebrow="UPCOMING" title="Bills & subscriptions"
              action={<button onClick={() => setAddingBill(v => !v)}>{addingBill ? 'Cancel' : '+ Add'}</button>} />
            {addingBill && (
              <div className="form-row" style={{ margin: '14px 0' }}>
                <Field label="Name"><input placeholder="Internet" value={bill.name} onChange={e => setBill({ ...bill, name: e.target.value })} /></Field>
                <Field label="Amount (₹)"><input type="number" placeholder="799" value={bill.amount} onChange={e => setBill({ ...bill, amount: e.target.value })} /></Field>
                <Field label="Day of month"><input type="number" min="1" max="28" value={bill.due_day} onChange={e => setBill({ ...bill, due_day: e.target.value })} /></Field>
                <div style={{ alignSelf: 'end' }}><button className="primary-action" onClick={addBill}>Save</button></div>
              </div>
            )}
            {recurring.length === 0 && !addingBill && <p className="mini-note">Add rent, internet or a subscription and JARVIS will show what’s due next.</p>}
            {recurring.map(r => (
              <div className="transaction-row" key={r.id}>
                <div className="transaction-icon c3"><Icon name="calendar" size={17} /></div>
                <div><b>{r.name}</b><small>{shortDate(r.next_due)} · {r.days_until === 0 ? 'today' : `in ${r.days_until} day${r.days_until === 1 ? '' : 's'}`}</small></div>
                <strong>{inr(r.amount)}</strong>
                <button className="icon-btn-sm del" aria-label="Remove" onClick={() => removeBill(r.id)}><Icon name="trash" size={16} /></button>
              </div>
            ))}
          </Card>
        </div>
      )}
      <Toast toast={toast} onDone={() => setToast(null)} />
    </Page>
  )
}

/* ═══════════════════════ CAREER ROADMAP ═══════════════════════ */
const DIRECTIONS = [{ value: 'placement', label: 'Placement' }, { value: 'gate', label: 'GATE' }, { value: 'startup', label: 'Startup' }, { value: 'mba', label: 'MBA/CAT' }]
const DEFAULT_GOALS = {
  placement: ['CGPA above 7.5', '100+ LeetCode problems', '2+ projects on GitHub', '1 internship', 'Core CS subjects strong', 'Resume ready'],
  gate: ['Strong in DBMS, OS, CN', 'Daily practice problems', '3 full mock tests done', 'Revision notes ready'],
  startup: ['Side project live', '5+ skills built', 'Network of 20+ people'],
  mba: ['CAT score above 95 percentile', 'Work experience', 'Essays drafted'],
}
const GOAL_TITLES = { placement: 'Become placement-ready', gate: 'Crack GATE', startup: 'Launch your startup', mba: 'Get into a top MBA' }
const SKILL_LABELS = { dsa: 'DSA / LeetCode', marks: 'Marks / CGPA', attendance: 'Attendance discipline', career: 'Career checklist', consistency: 'Overall consistency' }

export function CareerPage({ prefs = {}, refreshMe }) {
  const [data, setData] = useState(null)
  const [skills, setSkills] = useState([])
  const [adding, setAdding] = useState(false)
  const [editGoal, setEditGoal] = useState(false)
  const [manage, setManage] = useState(false)
  const [form, setForm] = useState({ direction: 'placement', item: '', note: '', due_label: '' })
  const [goal, setGoal] = useState({ title: '', desc: '', target: '' })
  const [skillForm, setSkillForm] = useState({ name: '', level: 50 })
  const [toast, setToast] = useState(null)

  const load = () => Promise.all([api.getCareer().catch(() => null), api.getSkills().catch(() => [])])
    .then(([c, s]) => { setData(c && !c.detail ? c : { goals: [], readiness: 0 }); setSkills(arr(s)) })
  useEffect(() => { load() }, [])
  useEffect(() => { setGoal({ title: prefs.career_goal_title || '', desc: prefs.career_goal_desc || '', target: prefs.career_target || '' }) }, [prefs.career_goal_title, prefs.career_goal_desc, prefs.career_target])

  const addDefaults = async (dir) => { for (const item of DEFAULT_GOALS[dir] || []) await api.addCareerGoal({ direction: dir, item, note: '' }); setToast({ msg: 'Checklist loaded' }); load() }
  const submit = async () => { if (!form.item.trim()) return; await api.addCareerGoal(form); setForm({ direction: 'placement', item: '', note: '', due_label: '' }); setAdding(false); load() }
  const update = async (id, status) => { await api.updateCareerGoal(id, status); load() }
  const remove = async (id) => { await api.deleteCareerGoal(id); load() }
  const saveGoal = async () => {
    const res = await api.savePrefs({ career_goal_title: goal.title, career_goal_desc: goal.desc, career_target: goal.target })
    if (res?.detail) return setToast({ msg: 'Could not save', bad: true })
    setEditGoal(false); setToast({ msg: 'Goal saved' }); refreshMe?.()
  }
  const addSkill = async () => {
    if (!skillForm.name.trim()) return
    await api.addSkill({ name: skillForm.name.trim(), level: Number(skillForm.level) })
    setSkillForm({ name: '', level: 50 }); load()
  }
  const setLevelLocal = (id, level) => setSkills(s => s.map(x => (x.id === id ? { ...x, level } : x)))
  const saveLevel = async (id, level) => { await api.updateSkill(id, { level }) }
  const removeSkill = async (id) => { await api.deleteSkill(id); load() }

  if (!data) return <Page id="career" eyebrow="Career Roadmap" title="From ambition to action."><Loading /></Page>

  const goals = arr(data.goals)
  const done = goals.filter(g => g.status === 'done').length
  const dirCount = {}; goals.forEach(g => { dirCount[g.direction] = (dirCount[g.direction] || 0) + 1 })
  const mainDir = Object.entries(dirCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'placement'
  const next = goals.find(g => g.status === 'in-progress') || goals.find(g => g.status === 'pending')
  const pr = data.placement_readiness
  const breakdown = Object.entries(pr?.breakdown || {})
  const state = (g) => (g.status === 'done' ? 'done' : g.status === 'in-progress' ? 'current' : '')
  const label = { done: 'Complete', 'in-progress': 'In progress', pending: 'Upcoming' }
  const title = prefs.career_goal_title || GOAL_TITLES[mainDir]
  const targetDate = prefs.career_target ? new Date(prefs.career_target + 'T00:00:00') : null
  const monthsLeft = targetDate ? Math.max(0, Math.round((targetDate - new Date()) / (1000 * 60 * 60 * 24 * 30.4))) : null
  const targetLabel = targetDate ? `${MONTHS[targetDate.getMonth()]} ’${String(targetDate.getFullYear()).slice(2)}` : 'Not set'

  return (
    <Page id="career" eyebrow="Career Roadmap" title="From ambition to action."
      description="Turn your goal into achievable milestones."
      action={<div style={{ display: 'flex', gap: 8 }}>
        {goals.length === 0 && <button className="outline-action" onClick={() => addDefaults('placement')}>Load placement checklist</button>}
        <button className="primary-action" onClick={() => setAdding(a => !a)}>{adding ? 'Cancel' : <><Icon name="plus" size={16} /> Add milestone</>}</button>
      </div>}>
      {adding && (
        <Card className="form-card">
          <Title eyebrow="NEW MILESTONE" title="What do you want to achieve?" />
          <div className="form-row">
            <Field label="Direction"><Select value={form.direction} onChange={v => setForm({ ...form, direction: v })} options={DIRECTIONS} /></Field>
            <Field label="Goal"><input placeholder="e.g. Ship two production projects" value={form.item} onChange={e => setForm({ ...form, item: e.target.value })} /></Field>
            <Field label="When"><input placeholder="e.g. Feb – Apr" value={form.due_label} onChange={e => setForm({ ...form, due_label: e.target.value })} /></Field>
            <Field label="Note"><input placeholder="Where you stand" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></Field>
          </div>
          <div className="form-actions"><button className="primary-action" onClick={submit}>Add milestone</button></div>
        </Card>
      )}

      <Card className="dark-card career-hero">
        <div>
          <span>PRIMARY GOAL</span>
          <h2>{title}</h2>
          <p>{prefs.career_goal_desc || `${done} of ${goals.length} milestones complete${pr?.summary ? ` — ${pr.summary}` : '.'}`}</p>
          <div className="goal-meta">
            <span><b>{data.readiness}%</b> roadmap complete</span>
            <span><b>{monthsLeft == null ? '—' : `${monthsLeft} month${monthsLeft === 1 ? '' : 's'}`}</b> remaining</span>
          </div>
          <Progress value={data.readiness} tone="accent-soft-tone" />
          <button className="link-btn" style={{ marginTop: 14, color: 'var(--on-secondary-muted)' }} onClick={() => setEditGoal(v => !v)}><Icon name="edit" size={14} /> {editGoal ? 'Close' : 'Edit goal & target date'}</button>
        </div>
        <div className="goal-target">
          <Icon name="target" size={40} />
          <span>Target</span>
          <b>{targetLabel}</b>
        </div>
      </Card>
      {editGoal && (
        <Card className="form-card">
          <Title eyebrow="YOUR GOAL" title="Define your primary goal" />
          <div className="form-row">
            <Field label="Goal"><input placeholder="Become a product engineer" value={goal.title} onChange={e => setGoal({ ...goal, title: e.target.value })} /></Field>
            <Field label="Target date"><input type="date" value={goal.target} onChange={e => setGoal({ ...goal, target: e.target.value })} /></Field>
          </div>
          <Field label="Description"><textarea placeholder="Build the technical depth and product thinking to secure a top-tier internship…" value={goal.desc} onChange={e => setGoal({ ...goal, desc: e.target.value })} /></Field>
          <div className="form-actions" style={{ marginTop: 14 }}><button className="primary-action" onClick={saveGoal}>Save goal</button></div>
        </Card>
      )}

      {goals.length === 0 && !adding ? (
        <Card><Empty icon="target" title="Your roadmap is empty"
          action={<button className="primary-action" onClick={() => addDefaults('placement')}>Load placement checklist</button>}>
          Start with a ready-made checklist, or add your own milestones.
        </Empty></Card>
      ) : (
        <div className="product-grid career-grid">
          <Card className="roadmap-card">
            <Title eyebrow="YOUR ROADMAP" title="Milestones" />
            <div className="roadmap">
              {goals.map((g, i) => (
                <div className={`roadmap-step ${state(g)}`} key={g.id}>
                  <i>{g.status === 'done' ? <Icon name="check" size={14} /> : i + 1}</i>
                  <div className="rm-body">
                    <div><b>{g.item}</b><small>{g.note || DIRECTIONS.find(d => d.value === g.direction)?.label}</small></div>
                    <div className="roadmap-actions">
                      {g.status !== 'done' && <button className="small-action good" onClick={() => update(g.id, 'done')}>Mark done</button>}
                      {g.status === 'pending' && <button className="small-action" onClick={() => update(g.id, 'in-progress')}>Start</button>}
                      {g.status === 'done' && <button className="small-action" onClick={() => update(g.id, 'pending')}>Reopen</button>}
                      <button className="icon-btn-sm" aria-label="Remove" onClick={() => remove(g.id)}><Icon name="trash" size={15} /></button>
                    </div>
                  </div>
                  <span>{g.due_label || label[g.status] || g.status}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <Title eyebrow="SKILL PROFILE" title="Readiness" action={<button onClick={() => setManage(v => !v)}>{manage ? 'Done' : 'Manage'}</button>} />
            {skills.length === 0 && breakdown.length === 0 && <p className="mini-note">Add your skills with “Manage” to build your readiness profile.</p>}
            {(skills.length > 0 ? skills.map(s => [s.id, s.name, s.level]) : breakdown.map(([k, v]) => [k, SKILL_LABELS[k] || k, Math.round((v.score / v.max) * 100)])).map(([id, name, p]) => (
              <div className="skill-row" key={id}>
                <div><b>{name}</b><span>{p}%</span></div>
                {manage && skills.length > 0
                  ? <div className="skill-edit">
                      <input type="range" min="0" max="100" value={p} onChange={e => setLevelLocal(id, Number(e.target.value))}
                        onPointerUp={e => saveLevel(id, Number(e.target.value))} onKeyUp={e => saveLevel(id, Number(e.target.value))} />
                      <button className="icon-btn-sm" aria-label="Remove skill" onClick={() => removeSkill(id)}><Icon name="trash" size={15} /></button>
                    </div>
                  : <Progress value={p} tone={p < 55 ? 'accent-muted' : ''} />}
              </div>
            ))}
            {skills.length === 0 && breakdown.length > 0 && <p className="mini-note">These bars come from your marks, habits and attendance. Use “Manage” to add your own skills.</p>}
            {manage && (
              <div className="skill-add">
                <input placeholder="Add a skill, e.g. React" value={skillForm.name} onChange={e => setSkillForm({ ...skillForm, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && addSkill()} />
                <input type="range" min="0" max="100" value={skillForm.level} onChange={e => setSkillForm({ ...skillForm, level: e.target.value })} />
                <b>{skillForm.level}%</b>
                <button className="small-action solid" onClick={addSkill}>Add</button>
              </div>
            )}
          </Card>
          {next && (
            <Card className="dark-card career-next">
              <span>NEXT BEST ACTION</span>
              <h2>{next.item}</h2>
              <p>{next.note || 'Pick this up next to keep your roadmap moving.'}</p>
              <button onClick={() => update(next.id, next.status === 'pending' ? 'in-progress' : 'done')}>
                {next.status === 'pending' ? 'Start this milestone' : 'Mark as done'} <Icon name="arrow" size={16} />
              </button>
            </Card>
          )}
        </div>
      )}
      <Toast toast={toast} onDone={() => setToast(null)} />
    </Page>
  )
}

/* ═══════════════════════ WEEKLY CHECK-IN ═══════════════════════ */
const MOODS = [
  { value: 1, label: 'Very low', sub: 'Drained' }, { value: 2, label: 'Low', sub: 'Heavy' },
  { value: 3, label: 'Okay', sub: 'Steady' }, { value: 4, label: 'Good', sub: 'Positive' }, { value: 5, label: 'Great', sub: 'Energized' },
]
const weekNumber = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7)
}
const thisMonday = () => { const m = new Date(); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return localDate(m) }

export function CheckinPage() {
  const [past, setPast] = useState([])
  const [form, setForm] = useState({ mood: 3, energy: 6, reflection: '' })
  const [touched, setTouched] = useState({ mood: false, energy: false })
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const loadPast = () => api.getCheckIns().then(r => {
    const list = arr(r); setPast(list)
    const cur = list.find(c => String(c.week_start) === thisMonday())
    if (cur) { setForm({ mood: cur.mood || 3, energy: cur.energy || 6, reflection: cur.reflection || cur.win || '' }); setTouched({ mood: true, energy: true }) }
  }).catch(() => {})
  useEffect(() => { loadPast() }, [])

  const submit = async () => {
    setBusy(true)
    const res = await api.addCheckIn({ week_start: thisMonday(), mood: form.mood, energy: form.energy, reflection: form.reflection.trim() || null })
    setBusy(false)
    if (res?.detail) return setToast({ msg: 'Could not save your check-in', bad: true })
    setSubmitted(true); loadPast()
  }

  const answered = (touched.mood ? 1 : 0) + (touched.energy ? 1 : 0) + (form.reflection.trim() ? 1 : 0)

  return (
    <Page id="checkin" eyebrow="Weekly Check-in" title="How are you, really?"
      description="A two-minute reflection to help JARVIS support your week.">
      <div className="checkin-shell">
        {submitted ? (
          <Card className="mood-card">
            <span>SAVED</span>
            <h2>Thanks — see you next week.</h2>
            <p>Your check-in is saved. JARVIS will use it to spot patterns between your mood, energy, marks and habits.</p>
            <div className="form-actions" style={{ marginTop: 18 }}><button className="outline-action" onClick={() => setSubmitted(false)}>Edit this check-in</button></div>
          </Card>
        ) : (
          <>
            <div className="checkin-progress">
              <span>WEEK {String(weekNumber(new Date())).padStart(2, '0')} · 2 MINUTES</span>
              <Progress value={(answered / 3) * 100} />
              <b>{answered} of 3 answered</b>
            </div>
            <Card className="mood-card">
              <span>01 · MOOD</span>
              <h2>How did this week feel overall?</h2>
              <p>Choose the response that feels closest. There’s no right answer.</p>
              <div className="mood-options">
                {MOODS.map((m, i) => (
                  <button className={touched.mood && form.mood === m.value ? 'selected' : ''} onClick={() => { setForm({ ...form, mood: m.value }); setTouched(t => ({ ...t, mood: true })) }} key={m.value}>
                    <i><span className={`face f${i}`} /></i>
                    <b>{m.label}</b><small>{m.sub}</small>
                  </button>
                ))}
              </div>
            </Card>
            <Card className="energy-card">
              <span>02 · ENERGY</span>
              <h2>Where is your energy today?</h2>
              <input type="range" min="1" max="10" value={form.energy}
                onChange={e => { setForm({ ...form, energy: Number(e.target.value) }); setTouched(t => ({ ...t, energy: true })) }} />
              <div><span>Depleted</span><b>{form.energy} / 10</b><span>Fully charged</span></div>
            </Card>
            <Card className="reflection-card">
              <span>03 · REFLECTION</span>
              <h2>What’s taking up the most space in your mind?</h2>
              <textarea placeholder="Classes, relationships, uncertainty, something you’re proud of..." value={form.reflection} onChange={e => setForm({ ...form, reflection: e.target.value })} />
              <div>
                <small>Only you can see this reflection.</small>
                <button className="primary-action" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Complete check-in'} <Icon name="arrow" size={16} /></button>
              </div>
            </Card>
          </>
        )}
        {past.length > 0 && (
          <Card>
            <Title eyebrow="HISTORY" title="Past check-ins" />
            <div style={{ marginTop: 10 }}>
              {past.slice(0, 6).map((c, i) => (
                <div className="assess-line" key={i} style={{ gridTemplateColumns: '1fr auto' }}>
                  <div><b>Week of {shortDate(String(c.week_start))}</b>{(c.reflection || c.win) && <small>{c.reflection || c.win}</small>}</div>
                  <div className="sc">{MOODS[(c.mood || 3) - 1]?.label}{c.energy ? ` · ⚡ ${c.energy}/10` : ''}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
      <Toast toast={toast} onDone={() => setToast(null)} />
    </Page>
  )
}
