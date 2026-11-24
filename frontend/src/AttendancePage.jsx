/**
 * AttendancePage.jsx — Attendance, redesigned to the Figma layout.
 *
 *  Overview        Figma overview: subject health, class calendar / weekly timetable, next class
 *  Mark attendance mark Present / Absent / Cancelled for a day
 *  Subjects        per-subject stats + calendar
 *  Edit setup      change subjects, periods per day or the timetable without starting over
 *
 * First-time users get the 3-step onboarding wizard (subjects → classes per day → timetable).
 */
import { useState, useEffect, useMemo } from 'react'
import { api } from './api'
import { Icon, Page, Card, Title, Metric, Progress, Tabs, Toast, Loading, Empty, localDate } from './ui'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const TODAY_DAY = DAYS[Math.min(new Date().getDay() - 1, 5)] || 'Mon'
const SUBJECT_COLORS = ['#D1FAE5', '#DBEAFE', '#FEF3C7', '#FCE7F3', '#E0E7FF', '#FEE2E2', '#ECFDF5', '#FFF7ED']

const tone = (status) => (status === 'great' || status === 'safe' ? 'ok' : status === 'careful' ? 'mid' : 'bad')

/** date (YYYY-MM-DD) of the most recent given weekday, counting today */
const dateForDay = (dayKey) => {
  const target = DAYS.indexOf(dayKey) + 1           // Mon=1 … Sat=6
  const now = new Date()
  const back = (now.getDay() - target + 7) % 7
  const d = new Date(now); d.setDate(now.getDate() - back)
  return localDate(d)
}

const blankSubject = () => ({ name: '', professor: '', room: '', min_percentage: 75, credits: 4, total_planned: 60 })
/** numbers typed into the form may be blank while editing; fall back to sensible defaults when saving */
const cleanSubject = d => ({ ...d, name: (d.name || '').trim(), min_percentage: Number(d.min_percentage) || 75, credits: Number(d.credits) || 4, total_planned: parseInt(d.total_planned) || 60 })

/** One subject's fields. Every field has a visible label + a one-line hint, so nobody has to guess what 75, 4 or 60 mean. */
function SubjectFields({ d, set, namePlaceholder = 'e.g. Database Management' }) {
  const num = k => e => set(k, e.target.value === '' ? '' : parseFloat(e.target.value))
  return (
    <div className="sub-fields">
      <label className="wide"><span>Subject name</span>
        <input value={d.name} placeholder={namePlaceholder} onChange={e => set('name', e.target.value)} /></label>
      <label className="wide"><span>Professor <em>optional</em></span>
        <input value={d.professor} placeholder="e.g. Prof. Sharma" onChange={e => set('professor', e.target.value)} /></label>
      <label><span>Room <em>optional</em></span>
        <input value={d.room} placeholder="e.g. 302" onChange={e => set('room', e.target.value)} /></label>
      <label><span>Min. attendance %</span>
        <input type="number" inputMode="decimal" min="0" max="100" value={d.min_percentage} onChange={num('min_percentage')} />
        <small>What your college requires, usually 75</small></label>
      <label><span>Credits</span>
        <input type="number" inputMode="decimal" step="0.5" min="0" value={d.credits} onChange={num('credits')} />
        <small>Weight of this subject in your CGPA</small></label>
      <label><span>Total classes planned</span>
        <input type="number" inputMode="numeric" min="1" value={d.total_planned} onChange={num('total_planned')} />
        <small>Classes you expect in the whole semester</small></label>
    </div>
  )
}

/* ══════════════ ONBOARDING WIZARD ══════════════ */
function OnboardingWizard({ onDone }) {
  const [step, setStep] = useState(1)
  const [subjects, setSubjects] = useState([blankSubject(), blankSubject(), blankSubject(), blankSubject()])
  const [daily, setDaily] = useState({ Mon: 6, Tue: 6, Wed: 6, Thu: 6, Fri: 6, Sat: 4 })
  const [grid, setGrid] = useState({})
  const [saved, setSaved] = useState([])
  const [saving, setSaving] = useState(false)

  const upd = (i, k, v) => setSubjects(s => s.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  const saveSubjects = async () => {
    setSaving(true)
    const out = []
    for (const s of subjects.filter(s => s.name.trim())) {
      const res = await api.addSubject(cleanSubject(s))
      if (res && res.id) out.push(res)
    }
    setSaved(out); setSaving(false); setStep(2)
  }
  const saveDaily = async () => { setSaving(true); await api.saveDailySchedule(daily); setSaving(false); setStep(3) }
  const saveTimetable = async () => {
    setSaving(true)
    const slots = []
    DAYS.forEach(day => {
      for (let p = 1; p <= (daily[day] || 0); p++) {
        const v = grid[day]?.[p]
        if (v) slots.push({ day, period: p, subject_id: v === 'free' ? null : parseInt(v) })
      }
    })
    await api.saveTimetable(slots)
    setSaving(false); onDone()
  }
  const setCell = (day, p, v) => setGrid(g => ({ ...g, [day]: { ...(g[day] || {}), [p]: v } }))
  const colorOf = (v) => {
    if (!v || v === 'free') return undefined
    const i = saved.findIndex(s => s.id === parseInt(v))
    return i < 0 ? undefined : SUBJECT_COLORS[i % SUBJECT_COLORS.length]
  }
  const labels = ['Add subjects', 'Classes per day', 'Timetable']
  const maxP = Math.max(...Object.values(daily), 1)

  return (
    <div>
      <div className="wizard-steps">
        {labels.map((l, i) => {
          const n = i + 1
          return (
            <span key={n} style={{ display: 'contents' }}>
              <div className={`st ${step === n ? 'now' : step > n ? 'done' : ''}`}><i>{step > n ? '✓' : n}</i>{l}</div>
              {n < 3 && <div className="bar" />}
            </span>
          )
        })}
      </div>

      {step === 1 && (
        <Card>
          <Title eyebrow="STEP 1 OF 3" title="Add your subjects" />
          <p className="mini-note" style={{ marginTop: 6 }}>Enter every subject you have this semester. Leave extra rows empty.</p>
          <div style={{ marginTop: 18 }}>
            {subjects.map((s, i) => (
              <div className="sub-block" key={i}>
                <div className="sub-block-title">Subject {i + 1}</div>
                <SubjectFields d={s} set={(k, v) => upd(i, k, v)} />
              </div>
            ))}
          </div>
          <div className="form-actions" style={{ marginTop: 14 }}>
            <button className="outline-action" onClick={() => setSubjects(s => [...s, blankSubject()])}>+ Add row</button>
            <button className="primary-action" disabled={saving || !subjects.some(s => s.name.trim())} onClick={saveSubjects}>{saving ? 'Saving…' : <>Save subjects <Icon name="arrow" size={16} /></>}</button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <Title eyebrow="STEP 2 OF 3" title="How many classes per day?" />
          <p className="mini-note" style={{ marginTop: 6 }}>Total number of periods each day — used to calculate your attendance automatically.</p>
          <div className="period-grid">
            {DAYS.map(day => (
              <div key={day}><label>{day}</label>
                <input type="number" min="0" max="10" value={daily[day]} onChange={e => setDaily(p => ({ ...p, [day]: parseInt(e.target.value) || 0 }))} />
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button className="outline-action" onClick={() => setStep(1)}>← Back</button>
            <button className="primary-action" disabled={saving} onClick={saveDaily}>{saving ? 'Saving…' : <>Set timetable <Icon name="arrow" size={16} /></>}</button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <Title eyebrow="STEP 3 OF 3" title="Build your timetable" />
          <p className="mini-note" style={{ marginTop: 6, marginBottom: 14 }}>Assign a subject to each period. Use “Free” for free periods.</p>
          <div className="pill-row">{saved.map((s, i) => <span className="pill" key={s.id} style={{ background: SUBJECT_COLORS[i % 8] }}>{s.name}</span>)}</div>
          <div className="tt-wrap">
            <table className="tt-table">
              <thead><tr><th style={{ width: 44 }} />{DAYS.map(d => <th key={d} className={d === TODAY_DAY ? 'today' : ''}>{d}<br /><small style={{ color: 'var(--muted)', fontWeight: 600 }}>{daily[d]}p</small></th>)}</tr></thead>
              <tbody>
                {Array.from({ length: maxP }, (_, i) => i + 1).map(p => (
                  <tr key={p}>
                    <td className="pl">P{p}</td>
                    {DAYS.map(day => p > (daily[day] || 0)
                      ? <td key={day}><div className="tt-off" /></td>
                      : (
                        <td key={day}>
                          <select value={grid[day]?.[p] || ''} onChange={e => setCell(day, p, e.target.value)} style={{ background: colorOf(grid[day]?.[p]) }}>
                            <option value="">—</option><option value="free">Free</option>
                            {saved.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button className="outline-action" onClick={() => setStep(2)}>← Back</button>
            <button className="primary-action" disabled={saving} onClick={saveTimetable}>{saving ? 'Saving…' : '✓ Done — start tracking'}</button>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ══════════════ OVERVIEW (Figma layout) ══════════════ */
const recStatus = r => r.status || (r.present ? 'present' : 'absent')
/** status already saved for ONE period of a subject on a date (old rows saved without a period count for every period) */
const periodStatus = (subject, date, period) => {
  const recs = (subject.recent || []).filter(r => r.date === date)
  const hit = recs.find(r => r.period === period) || recs.find(r => r.period == null)
  return hit ? recStatus(hit) : undefined
}
/** one row per timetable slot, so P1 and P4 of the same subject are shown and marked separately */
const slotRows = (timetable, subjects, day) => timetable
  .filter(t => t.day === day && t.subject_id != null)
  .sort((a, b) => a.period - b.period)
  .map(t => ({ key: `${t.subject_id}:${t.period}`, subject: subjects.find(s => s.id === t.subject_id), period: t.period }))
  .filter(r => r.subject)
const saveRows = (rows, marks, date) => Promise.all(rows.filter(r => marks[r.key]).map(r =>
  api.markAttendance({ subject_id: r.subject.id, date, period: r.period, present: marks[r.key] === 'present', status: marks[r.key] })))

function MonthCalendar({ records, selected, onPick }) {
  const now = new Date()
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() })
  // day -> {present, absent}
  const map = useMemo(() => {
    const m = {}
    records.forEach(r => {
      const st = r.status || (r.present ? 'present' : 'absent')
      const e = (m[r.date] = m[r.date] || { present: 0, absent: 0, cancelled: 0 })
      if (st === 'present') e.present++
      else if (st === 'absent') e.absent++
      else e.cancelled++
    })
    return m
  }, [records])

  const first = (new Date(view.y, view.m, 1).getDay() + 6) % 7           // Monday-first
  const dim = new Date(view.y, view.m + 1, 0).getDate()
  const prevDim = new Date(view.y, view.m, 0).getDate()
  const cells = Array.from({ length: Math.ceil((first + dim) / 7) * 7 }, (_, i) => {
    const day = i - first + 1
    if (day < 1) return { n: prevDim + day, muted: true }
    if (day > dim) return { n: day - dim, muted: true }
    return { n: day, key: localDate(new Date(view.y, view.m, day)) }
  })
  const atNow = view.y === now.getFullYear() && view.m === now.getMonth()
  const go = (d) => setView(v => { const x = new Date(v.y, v.m + d, 1); return { y: x.getFullYear(), m: x.getMonth() } })

  return (
    <div className="month-calendar">
      <div className="cal-head">
        <button onClick={() => go(-1)} aria-label="Previous month"><Icon name="chevronLeft" size={16} /></button>
        <b>{MONTHS[view.m]} {view.y}</b>
        <button onClick={() => go(1)} disabled={atNow} aria-label="Next month"><Icon name="chevronRight" size={16} /></button>
      </div>
      <div className="weekday">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <span key={i}>{x}</span>)}</div>
      <div className="calendar-days">
        {cells.map((c, i) => {
          const e = c.key && map[c.key]
          const isToday = c.key === localDate(now)
          return (
            <button key={i} type="button" disabled={c.muted || c.key > localDate(now)} aria-label={c.key ? `Select ${c.key}` : undefined}
              className={`${c.muted ? 'muted' : ''} ${isToday ? 'today' : ''} ${c.key && c.key === selected ? 'sel' : ''}`}
              onClick={() => c.key && onPick?.(c.key)}>
              <span>{c.n}</span>
              {e && (e.absent > 0 ? <i className="absent" /> : e.present > 0 ? <i /> : e.cancelled > 0 ? <i className="cancelled" /> : null)}
            </button>
          )
        })}
      </div>
      <div className="calendar-legend">
        <span><i />Present</span><span><i className="absent" />Absent</span><span><i className="cancelled" />Cancelled</span>
      </div>
    </div>
  )
}

/* click a date in the calendar → see that day's classes and mark / change them */
function DayPanel({ date, subjects, timetable, onRefresh, flash }) {
  const d = new Date(date + 'T00:00:00')
  const dayKey = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
  const rows = slotRows(timetable, subjects, dayKey)
  const existing = () => Object.fromEntries(rows.map(r => [r.key, periodStatus(r.subject, date, r.period)]).filter(([, v]) => v))
  const [marks, setMarks] = useState(existing)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setMarks(existing()) }, [date, subjects])
  const label = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
  const save = async () => {
    setBusy(true)
    await saveRows(rows, marks, date)
    setBusy(false); flash(`Saved attendance for ${label}`); onRefresh()
  }
  return (
    <div className="day-panel">
      <div className="day-head"><b>{label}</b><small>{date === localDate() ? 'Today' : ''}</small></div>
      {rows.length === 0 && <p className="mini-note" style={{ margin: 0 }}>{dayKey === 'Sun' ? 'Sunday — no classes.' : 'No classes in your timetable for this day.'}</p>}
      {rows.map(r => (
        <div className="day-row" key={r.key}>
          <div><b>{r.subject.name}</b><small>P{r.period}</small></div>
          <div className="seg">
            {[['present', 'Present'], ['absent', 'Absent'], ['cancelled', 'Cancelled']].map(([k, l]) => (
              <button key={k} className={marks[r.key] === k ? `on-${k}` : ''} onClick={() => setMarks(m => ({ ...m, [r.key]: k }))}>{l}</button>
            ))}
          </div>
        </div>
      ))}
      {rows.length > 0 && <button className="primary-action" disabled={busy || Object.keys(marks).length === 0} onClick={save}>{busy ? 'Saving…' : 'Save this day'}</button>}
    </div>
  )
}

function OverviewTab({ subjects, timetable, allRecords, openSubject, goMark, prefs = {}, onRefresh, flash }) {
  const [month, setMonth] = useState(true)
  const [picked, setPicked] = useState(localDate())
  const attended = subjects.reduce((s, x) => s + (x.attended || 0), 0)
  const held = subjects.reduce((s, x) => s + (x.total_held || 0), 0)
  const overall = held ? Math.round((attended / held) * 1000) / 10 : null
  const safe = subjects.reduce((s, x) => s + (x.safe_bunks || 0), 0)
  const safeSubjects = subjects.filter(x => (x.safe_bunks || 0) > 0).length

  // next class: first unmarked period today, else the first one today, else the next day with classes
  const today = localDate()
  const slotsOf = (day) => timetable.filter(t => t.day === day && t.subject_id != null).sort((a, b) => a.period - b.period)
    .map(t => ({ ...t, subject: subjects.find(s => s.id === t.subject_id) })).filter(t => t.subject)
  let next = null, nextLabel = ''
  const todaySlots = slotsOf(TODAY_DAY)
  const unmarked = todaySlots.filter(t => !periodStatus(t.subject, today, t.period))
  if (new Date().getDay() !== 0 && (unmarked[0] || todaySlots[0])) { next = unmarked[0] || todaySlots[0]; nextLabel = `TODAY · P${next.period}` }
  else {
    for (let i = 1; i <= 6 && !next; i++) {
      const dayKey = DAYS[(DAYS.indexOf(TODAY_DAY) + i) % 6]
      const s = slotsOf(dayKey)
      if (s[0]) { next = s[0]; nextLabel = `${dayKey.toUpperCase()} · P${next.period}` }
    }
  }

  return (
    <>
      <div className="metric-row">
        <Metric icon="calendar" label="Overall attendance" value={overall != null ? `${overall}%` : '—'} note={`${subjects.length} subject${subjects.length === 1 ? '' : 's'}`} />
        <Metric icon="check" label="Classes attended" value={`${attended} / ${held}`} note={`${Math.max(0, held - attended)} classes missed`} tone="accent-muted" />
        <Metric icon="clock" label="Safe to miss" value={`${safe} class${safe === 1 ? '' : 'es'}`} note={`Across ${safeSubjects} subject${safeSubjects === 1 ? '' : 's'}`} tone="accent-soft-tone" />
      </div>
      <div className="product-grid attendance-grid">
        <Card className="subject-attendance">
          <Title eyebrow="SUBJECT HEALTH" title="Attendance by subject" action={<button>Tap a subject for its calendar</button>} />
          <div className="subject-table">
            {subjects.map(s => {
              const pct = Math.round(s.current_pct || 0)
              const low = s.status === 'danger' || s.status === 'careful' || pct < (s.min_pct || 75)
              return (
                <div className="subject-line clickable" key={s.id} onClick={() => openSubject(s.id)}>
                  <div className="subject-name">
                    <i className={low ? 'warning' : ''} />
                    <div><b>{s.name}</b><small>{s.professor || 'Professor not set'}</small></div>
                  </div>
                  <Progress value={pct} tone={low ? 'accent-muted' : ''} />
                  <strong>{pct}%</strong>
                  <span>{s.attended || 0} / {s.total_held || 0}</span>
                  <em className={low ? 'watch' : ''}>{low ? 'Watch' : 'Safe'}</em>
                </div>
              )
            })}
          </div>
        </Card>
        <Card className="calendar-card">
          <Title eyebrow={month ? 'ALL SUBJECTS' : `${DAYS.length}-DAY WEEK`} title={month ? 'Class calendar' : 'Weekly timetable'}
            action={<div className="mini-switch">
              <button className={month ? 'active' : ''} onClick={() => setMonth(true)}>Month</button>
              <button className={!month ? 'active' : ''} onClick={() => setMonth(false)}>Week</button>
            </div>} />
          {month ? (<><MonthCalendar records={allRecords} selected={picked} onPick={setPicked} /><DayPanel date={picked} subjects={subjects} timetable={timetable} onRefresh={onRefresh} flash={flash} /></>) : (
            <div className="timetable six">
              {DAYS.map(d => (
                <div key={d}>
                  <b style={d === TODAY_DAY ? { color: 'var(--accent)' } : undefined}>{d.toUpperCase()}</b>
                  {slotsOf(d).length === 0 && <span style={{ color: 'var(--muted)', background: '#f3f3ee' }}>No class</span>}
                  {slotsOf(d).map((t, i) => <span key={t.period} className={i % 2 ? 'accent-muted' : ''}>{t.subject.name}<small>P{t.period}</small></span>)}
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="dark-card next-class">
          <span>NEXT CLASS{next ? ` · ${nextLabel}` : ''}</span>
          {next ? (
            <div>
              <b>{(() => { const f = prefs.first_class || '09:00', len = prefs.period_minutes || 60; const t = parseInt(f.slice(0, 2)) * 60 + parseInt(f.slice(3, 5)) + (next.period - 1) * len; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` })()}</b>
              <section><h2>{next.subject.name}</h2><p>{[next.subject.room, next.subject.professor].filter(Boolean).join(' · ') || 'Professor not set'} · {Math.round(next.subject.current_pct || 0)}% attendance</p></section>
            </div>
          ) : <p className="nc-none">No upcoming classes in your timetable.</p>}
          <button onClick={goMark}>Mark attendance <Icon name="arrow" size={16} /></button>
        </Card>
      </div>
    </>
  )
}

/* ══════════════ MARK ATTENDANCE ══════════════ */
function TodayTab({ subjects, timetable, onRefresh, flash }) {
  const [selectedDay, setSelectedDay] = useState(TODAY_DAY)
  const date = dateForDay(selectedDay)
  const rows = slotRows(timetable, subjects, selectedDay)
  const existingFor = (d) => Object.fromEntries(rows.map(r => [r.key, periodStatus(r.subject, d, r.period)]).filter(([, v]) => v))
  const [marks, setMarks] = useState(() => existingFor(date))
  const [saving, setSaving] = useState(false)

  useEffect(() => { setMarks(existingFor(date)) }, [selectedDay, subjects])

  const save = async () => {
    setSaving(true)
    await saveRows(rows, marks, date)
    setSaving(false)
    flash(`${selectedDay}’s attendance saved`)
    onRefresh()
  }
  const setAll = (status) => setMarks(Object.fromEntries(rows.map(r => [r.key, status])))

  return (
    <div>
      <div className="att-days">
        {DAYS.map(d => (
          <button key={d} className={`${selectedDay === d ? 'active' : ''} ${d === TODAY_DAY ? 'today' : ''}`} onClick={() => setSelectedDay(d)}>
            {d}{d === TODAY_DAY ? ' · Today' : ''}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <Card><Empty icon="calendar" title={`No classes on ${selectedDay}`}>Pick another day, or edit your timetable in “Edit setup”.</Empty></Card>
      ) : (
        <>
          <div className="form-actions" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
            <span className="today-pill">{date}</span>
            <button className="small-action" onClick={() => setAll('present')}>Mark all present</button>
          </div>
          <div className="att-list">
            {rows.map(r => {
              const mark = marks[r.key]
              return (
                <div className={`att-row ${mark || ''}`} key={r.key}>
                  <div><b>{r.subject.name}</b><small>{r.subject.professor ? `${r.subject.professor} · ` : ''}P{r.period}</small></div>
                  <div className="seg">
                    {[['present', 'Present'], ['absent', 'Absent'], ['cancelled', 'Cancelled']].map(([k, l]) => (
                      <button key={k} className={mark === k ? `on-${k}` : ''} onClick={() => setMarks(m => ({ ...m, [r.key]: k }))}>{l}</button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button className="primary-action" disabled={saving || Object.keys(marks).length === 0} onClick={save}>{saving ? 'Saving…' : `Save ${selectedDay}’s attendance`}</button>
          </div>
        </>
      )}
    </div>
  )
}

/* ══════════════ SUBJECTS: stats + calendar ══════════════ */
function SubjectCalendar({ subject, records, onClose }) {
  const today = new Date()
  const [vm, setVm] = useState(today.getMonth())
  const [vy, setVy] = useState(today.getFullYear())
  const map = {}
  const rank = { absent: 3, present: 2, cancelled: 1 }
  records.forEach(r => { const st = r.status || (r.present ? 'present' : 'absent'); if (!map[r.date] || rank[st] > rank[map[r.date]]) map[r.date] = st })

  const first = new Date(vy, vm, 1).getDay()
  const dim = new Date(vy, vm + 1, 0).getDate()
  const atNow = vm === today.getMonth() && vy === today.getFullYear()
  const prev = () => (vm === 0 ? (setVm(11), setVy(y => y - 1)) : setVm(m => m - 1))
  const next = () => (vm === 11 ? (setVm(0), setVy(y => y + 1)) : setVm(m => m + 1))

  const present = records.filter(r => (r.status || (r.present ? 'present' : 'absent')) === 'present').length
  const absent = records.filter(r => (r.status || (r.present ? 'present' : 'absent')) === 'absent').length
  const cancelled = records.filter(r => r.status === 'cancelled').length
  const counted = present + absent
  const pct = counted ? Math.round((present / counted) * 100) : 0

  return (
    <Card style={{ marginBottom: 13 }}>
      <div className="card-title">
        <div><span>SUBJECT CALENDAR</span><h2>{subject.name}</h2></div>
        <button className="icon-btn-sm" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
      </div>
      {subject.professor && <p className="mini-note" style={{ marginTop: 4 }}>{subject.professor}</p>}
      <div className="stat-tiles">
        {[['Attendance', `${pct}%`], ['Present', present], ['Absent', absent], ['Cancelled', cancelled]].map(([l, v]) => (
          <div key={l}><small>{l}</small><b>{v}</b></div>
        ))}
      </div>
      <div className="cal-head">
        <button onClick={prev} aria-label="Previous month"><Icon name="chevronLeft" size={16} /></button>
        <b>{MONTHS[vm]} {vy}</b>
        <button onClick={next} disabled={atNow} aria-label="Next month"><Icon name="chevronRight" size={16} /></button>
      </div>
      <div className="cal-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div className="dow" key={i}>{d}</div>)}
        {Array.from({ length: first }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: dim }, (_, i) => i + 1).map(day => {
          const st = map[localDate(new Date(vy, vm, day))]
          const isToday = atNow && day === today.getDate()
          return <div key={day} title={st || ''} className={`cal-cell ${st || ''} ${isToday ? 'today' : ''}`}>{day}</div>
        })}
      </div>
      <div className="cal-legend">
        <span><i style={{ background: 'var(--accent)' }} />Present</span>
        <span><i style={{ background: '#d9534f' }} />Absent</span>
        <span><i style={{ background: '#9aa1ab' }} />Cancelled</span>
      </div>
    </Card>
  )
}

function SubjectsTab({ subjects, allRecords, initialOpen }) {
  const [open, setOpen] = useState(initialOpen)
  if (!subjects.length) return <Card><Empty icon="book" title="No subjects added yet" /></Card>
  return (
    <div>
      {subjects.map(s => {
        const recs = allRecords.filter(r => r.subject_id === s.id)
        if (open === s.id) return <SubjectCalendar key={s.id} subject={s} records={recs} onClose={() => setOpen(null)} />
        const pct = Math.round(s.current_pct || 0)
        const safe = s.safe_bunks || 0
        return (
          <Card className="subject-card" key={s.id} onClick={() => setOpen(s.id)}>
            <div className="row">
              <div>
                <h3>{s.name}</h3>
                {s.professor && <p className="mini-note" style={{ margin: '2px 0 0' }}>{s.professor}</p>}
                <p className="mini-note" style={{ margin: '4px 0 0' }}>Tap to see calendar →</p>
              </div>
              <div><div className="big">{pct}%</div><span className={`status-chip ${tone(s.status)}`}>{s.status || 'safe'}</span></div>
            </div>
            <div className="stat-tiles">
              {[['Attended', s.attended || 0], ['Total held', s.total_held || 0], ['Cancelled', s.cancelled || 0], ['Safe leaves', safe]].map(([l, v]) => (
                <div key={l}><small>{l}</small><b style={l === 'Safe leaves' ? { color: safe === 0 ? '#b4302b' : safe <= 2 ? '#a67812' : 'var(--accent)' } : undefined}>{v}</b></div>
              ))}
            </div>
            <Progress value={pct} tone={tone(s.status) === 'ok' ? '' : 'accent-muted'} />
            {s.message && <p className="mini-note" style={{ marginTop: 10 }}>{s.message}</p>}
          </Card>
        )
      })}
    </div>
  )
}

/* ══════════════ EDIT SETUP ══════════════ */
function SubjectsEditor({ subjects, onRefresh, flash }) {
  const fromSubject = s => ({ name: s.name || '', professor: s.professor || '', room: s.room || '', min_percentage: s.min_pct ?? 75, total_planned: s.total_planned ?? 60, credits: s.credits ?? 4 })
  const [drafts, setDrafts] = useState(() => Object.fromEntries(subjects.map(s => [s.id, fromSubject(s)])))
  const [busy, setBusy] = useState(null)
  const [fresh, setFresh] = useState(blankSubject())
  const setField = (id, k, v) => setDrafts(p => ({ ...p, [id]: { ...p[id], [k]: v } }))
  const dirty = s => JSON.stringify(drafts[s.id]) !== JSON.stringify(fromSubject(s))

  const saveOne = async (s) => {
    setBusy(s.id)
    const d = cleanSubject(drafts[s.id]), orig = fromSubject(s), changes = {}
    Object.keys(d).forEach(k => { if (d[k] !== orig[k]) changes[k] = d[k] })
    const res = await api.updateSubject(s.id, changes)
    setBusy(null)
    if (res && res.detail) return flash(typeof res.detail === 'string' ? res.detail : 'Check the values and try again', true)
    flash(`${d.name} updated`); onRefresh()
  }
  const removeOne = async (s) => {
    if (!window.confirm(`Delete "${s.name}"?\nIts attendance history will be removed too.`)) return
    setBusy(s.id); await api.deleteSubject(s.id); setBusy(null); flash(`${s.name} deleted`); onRefresh()
  }
  const addOne = async () => {
    if (!fresh.name.trim()) return
    setBusy('new')
    const res = await api.addSubject(cleanSubject(fresh))
    setBusy(null)
    if (res && res.detail) return flash('Could not add subject', true)
    setFresh(blankSubject()); flash(`${res.name} added — assign it in the Timetable section`); onRefresh()
  }
  return (
    <Card>
      <Title eyebrow="SUBJECTS & CLASSES" title="Your subjects" />
      <div style={{ marginTop: 18 }}>
      {subjects.map(s => {
        const d = drafts[s.id] || fromSubject(s)
        return (
          <div className="sub-block" key={s.id}>
            <SubjectFields d={d} set={(k, v) => setField(s.id, k, v)} />
            <div className="edit-foot">
              <small>{s.attended || 0} attended of {s.total_held || 0} held so far</small>
              <button className="small-action solid" disabled={!dirty(s) || busy === s.id} onClick={() => saveOne(s)}>{busy === s.id ? 'Saving…' : dirty(s) ? 'Save changes' : 'Saved'}</button>
              <button className="small-action" style={{ color: '#b4302b' }} disabled={busy === s.id} onClick={() => removeOne(s)}>Delete</button>
            </div>
          </div>
        )
      })}
      </div>
      <div className="sub-label">Add another subject</div>
      <div className="sub-block"><SubjectFields d={fresh} set={(k, v) => setFresh(f => ({ ...f, [k]: v }))} /></div>
      <button className="outline-action" disabled={!fresh.name.trim() || busy === 'new'} onClick={addOne}>+ Add subject</button>
    </Card>
  )
}

function PeriodsEditor({ daily, setDaily, timetable, onRefresh, flash }) {
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    await api.saveDailySchedule(daily)
    const kept = timetable.filter(t => t.period <= (daily[t.day] || 0)).map(t => ({ day: t.day, period: t.period, subject_id: t.subject_id }))
    if (kept.length !== timetable.length) await api.saveTimetable(kept)
    setSaving(false); flash('Periods per day saved'); onRefresh()
  }
  return (
    <Card>
      <Title eyebrow="SCHEDULE" title="Periods per day" />
      <p className="mini-note" style={{ marginTop: 6 }}>Your timetable assignments stay as they are. If you reduce a day, only the removed periods are dropped.</p>
      <div className="period-grid">
        {DAYS.map(day => (
          <div key={day}><label>{day}</label>
            <input type="number" min="0" max="10" value={daily[day]} onChange={e => setDaily(p => ({ ...p, [day]: Math.max(0, Math.min(10, parseInt(e.target.value) || 0)) }))} />
          </div>
        ))}
      </div>
      <button className="primary-action" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save periods'}</button>
    </Card>
  )
}

function TimetableEditor({ daily, subjects, timetable, onRefresh, flash }) {
  const [grid, setGrid] = useState(() => {
    const g = {}
    timetable.forEach(t => { g[t.day] = { ...(g[t.day] || {}), [t.period]: t.subject_id == null ? 'free' : String(t.subject_id) } })
    return g
  })
  const [saving, setSaving] = useState(false)
  const setCell = (day, p, v) => setGrid(g => ({ ...g, [day]: { ...(g[day] || {}), [p]: v } }))
  const colorOf = (v) => {
    if (!v || v === 'free') return undefined
    const i = subjects.findIndex(s => s.id === parseInt(v))
    return i < 0 ? undefined : SUBJECT_COLORS[i % 8]
  }
  const save = async () => {
    setSaving(true)
    const slots = []
    DAYS.forEach(day => {
      for (let p = 1; p <= (daily[day] || 0); p++) {
        const v = grid[day]?.[p]
        if (v) slots.push({ day, period: p, subject_id: v === 'free' ? null : parseInt(v) })
      }
    })
    await api.saveTimetable(slots)
    setSaving(false); flash('Timetable saved'); onRefresh()
  }
  const maxP = Math.max(...Object.values(daily), 1)
  return (
    <Card>
      <Title eyebrow="WEEKLY GRID" title="Timetable" />
      <p className="mini-note" style={{ marginTop: 6, marginBottom: 14 }}>Change any period — the rest stays as saved.</p>
      <div className="pill-row">{subjects.map((s, i) => <span className="pill" key={s.id} style={{ background: SUBJECT_COLORS[i % 8] }}>{s.name}</span>)}</div>
      <div className="tt-wrap">
        <table className="tt-table">
          <thead><tr><th style={{ width: 44 }} />{DAYS.map(d => <th key={d} className={d === TODAY_DAY ? 'today' : ''}>{d}</th>)}</tr></thead>
          <tbody>
            {Array.from({ length: maxP }, (_, i) => i + 1).map(p => (
              <tr key={p}>
                <td className="pl">P{p}</td>
                {DAYS.map(day => p > (daily[day] || 0)
                  ? <td key={day}><div className="tt-off" /></td>
                  : (
                    <td key={day}>
                      <select value={grid[day]?.[p] || ''} onChange={e => setCell(day, p, e.target.value)} style={{ background: colorOf(grid[day]?.[p]) }}>
                        <option value="">—</option><option value="free">Free</option>
                        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 16 }}><button className="primary-action" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save timetable'}</button></div>
    </Card>
  )
}

function SetupEditor({ subjects, timetable, onRefresh, flash }) {
  const [section, setSection] = useState('subjects')
  const [daily, setDaily] = useState(null)

  useEffect(() => {
    api.getDailySchedule().then(d => {
      let merged = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, ...(d && !d.detail ? d : {}) }
      if (Object.values(merged).every(v => !v)) DAYS.forEach(day => { merged[day] = Math.max(0, ...timetable.filter(t => t.day === day).map(t => t.period)) })
      setDaily(merged)
    }).catch(() => setDaily({ Mon: 6, Tue: 6, Wed: 6, Thu: 6, Fri: 6, Sat: 4 }))
  }, [])

  return (
    <div>
      <p className="mini-note" style={{ margin: '0 0 12px' }}>Everything below is already filled with your saved data. Change what you need and save — nothing else is touched.</p>
      <Tabs className="page-tabs" value={section} onChange={setSection}
        tabs={[{ id: 'subjects', label: 'Subjects & classes' }, { id: 'periods', label: 'Periods per day' }, { id: 'timetable', label: 'Timetable' }]} />
      {section === 'subjects' && <SubjectsEditor key={subjects.map(s => s.id).join(',')} subjects={subjects} onRefresh={onRefresh} flash={flash} />}
      {section === 'periods' && daily && <PeriodsEditor daily={daily} setDaily={setDaily} timetable={timetable} onRefresh={onRefresh} flash={flash} />}
      {section === 'timetable' && daily && <TimetableEditor daily={daily} subjects={subjects} timetable={timetable} onRefresh={onRefresh} flash={flash} />}
    </div>
  )
}

/* ══════════════ MAIN PAGE ══════════════ */
export default function AttendancePage({ onChange, prefs = {} }) {
  const [tab, setTab] = useState('overview')
  const [subjects, setSubjects] = useState([])
  const [timetable, setTimetable] = useState([])
  const [setupDone, setSetupDone] = useState(null)
  const [focusSubject, setFocusSubject] = useState(null)
  const [toast, setToast] = useState(null)

  const load = async () => {
    const subs = await api.getSubjects().catch(() => [])
    const tt = await api.getTimetable().catch(() => [])
    const S = Array.isArray(subs) ? subs : [], T = Array.isArray(tt) ? tt : []
    setSubjects(S); setTimetable(T); setSetupDone(S.length > 0 && T.length > 0)
    onChange?.()
  }
  useEffect(() => { load() }, [])

  const allRecords = useMemo(() => subjects.flatMap(s => (s.recent || []).map(r => ({ ...r, subject_id: s.id }))), [subjects])
  const flash = (msg, bad = false) => setToast({ msg, bad })

  if (setupDone === null) return <Page id="attendance" eyebrow="Attendance" title="Stay above every threshold."><Loading /></Page>

  if (!setupDone) {
    return (
      <Page id="attendance" eyebrow="Attendance" title="Let’s set up your tracker." description="Takes about two minutes — subjects, classes per day and your timetable.">
        <OnboardingWizard onDone={() => { load(); setSetupDone(true) }} />
      </Page>
    )
  }

  return (
    <Page id="attendance" eyebrow="Attendance" title="Stay above every threshold."
      description="Track subjects, classes and your semester calendar in one place. Cancelled classes don’t count against you."
      action={<button className="primary-action" onClick={() => setTab('today')}>Mark attendance <Icon name="arrow" size={16} /></button>}>
      <Tabs className="page-tabs" value={tab} onChange={(t) => { setTab(t); if (t !== 'subjects') setFocusSubject(null) }}
        tabs={[{ id: 'overview', label: 'Overview' }, { id: 'today', label: 'Mark attendance' }, { id: 'subjects', label: 'Subjects' }, { id: 'setup', label: 'Edit setup' }]} />
      {tab === 'overview' && <OverviewTab onRefresh={load} flash={flash} prefs={prefs} subjects={subjects} timetable={timetable} allRecords={allRecords} openSubject={(id) => { setFocusSubject(id); setTab('subjects') }} goMark={() => setTab('today')} />}
      {tab === 'today' && <TodayTab subjects={subjects} timetable={timetable} onRefresh={load} flash={flash} />}
      {tab === 'subjects' && <SubjectsTab key={focusSubject || 'all'} subjects={subjects} allRecords={allRecords} initialOpen={focusSubject} />}
      {tab === 'setup' && <SetupEditor subjects={subjects} timetable={timetable} onRefresh={load} flash={flash} />}
      <Toast toast={toast} onDone={() => setToast(null)} />
    </Page>
  )
}
