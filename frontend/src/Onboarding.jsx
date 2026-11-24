/**
 * Onboarding.jsx — the walkthrough shown once, right after a new account is created.
 * One screen per feature: what it is, how to add data (numbered steps), and a small preview of the real UI.
 * It can be replayed any time from Settings → "Replay the tour".
 */
import { useState, useEffect } from 'react'
import { Icon } from './ui'
import './onboarding.css'

const Seg = ({ on }) => (
  <div className="ob-seg">
    {['Present', 'Absent', 'Cancelled'].map(l => <span key={l} className={on === l ? `on-${l.toLowerCase()}` : ''}>{l}</span>)}
  </div>
)

const PREVIEWS = {
  welcome: () => (
    <div className="ob-welcome">
      {[['calendar', 'Attendance'], ['chart', 'Marks & CGPA'], ['habit', 'Habits'], ['wallet', 'Expenses'], ['target', 'Career roadmap'], ['heart', 'Weekly check-in']].map(([i, l]) => (
        <div key={l}><i><Icon name={i} size={20} /></i><b>{l}</b></div>
      ))}
    </div>
  ),
  attendance: () => (
    <div className="ob-mock">
      <div className="ob-tabs"><span>Overview</span><span className="on">Mark attendance</span><span>Subjects</span><span>Edit setup</span></div>
      <div className="ob-row"><div><b>DBMS</b><small>P1</small></div><Seg on="Present" /></div>
      <div className="ob-row"><div><b>DBMS</b><small>P4</small></div><Seg on="Absent" /></div>
      <div className="ob-row"><div><b>Maths</b><small>P2</small></div><Seg /></div>
      <button className="ob-fake-btn">Save Monday’s attendance</button>
    </div>
  ),
  marks: () => (
    <div className="ob-mock">
      <div className="ob-eyebrow">NEW ASSESSMENT</div>
      <div className="ob-fields">
        <label>Subject<span>DBMS</span></label>
        <label>Exam type<span>Mid-term</span></label>
        <label>Score<span>45</span></label>
        <label>Out of<span>50</span></label>
      </div>
      <button className="ob-fake-btn">Save marks</button>
      <div className="ob-stat"><small>PREDICTED CGPA</small><b>8.6</b><em>ML forecast</em></div>
    </div>
  ),
  habits: () => (
    <div className="ob-mock">
      <div className="ob-eyebrow">TODAY’S RHYTHM</div>
      {[['LeetCode', '1 problem a day', 12, true], ['Gym', '4 times a week', 5, true], ['Reading', '20 pages', 0, false]].map(([n, g, d, done]) => (
        <div className="ob-habit" key={n}>
          <div><b>{n}</b><small>{g}</small></div>
          <span className="ob-streak"><Icon name="flame" size={14} />{d}</span>
          <i className={done ? 'done' : ''}>{done && <Icon name="check" size={14} />}</i>
        </div>
      ))}
    </div>
  ),
  expenses: () => (
    <div className="ob-mock">
      <div className="ob-eyebrow">NOVEMBER BUDGET</div>
      <div className="ob-budget"><b>₹6,200</b><small>of ₹10,000 spent</small><div><i style={{ width: '62%' }} /></div></div>
      {[['Canteen', 'Food', '₹150'], ['Metro card', 'Travel', '₹500'], ['Notebooks', 'Study', '₹240']].map(([n, c, a]) => (
        <div className="ob-tx" key={n}><div><b>{n}</b><small>{c}</small></div><b>{a}</b></div>
      ))}
    </div>
  ),
  career: () => (
    <div className="ob-mock">
      <div className="ob-eyebrow">YOUR GOAL</div>
      <div className="ob-goal">Land a Data Science internship</div>
      {[['Finish SQL + Python basics', 'Nov – Dec', true], ['Build 2 portfolio projects', 'Jan – Feb', false], ['Apply to 30 companies', 'Mar', false]].map(([t, w, d]) => (
        <div className="ob-miles" key={t}><i className={d ? 'done' : ''}>{d && <Icon name="check" size={13} />}</i><div><b>{t}</b><small>{w}</small></div></div>
      ))}
    </div>
  ),
  checkin: () => (
    <div className="ob-mock">
      <div className="ob-eyebrow">01 · MOOD</div>
      <div className="ob-moods">{['😞', '😕', '🙂', '😄'].map((m, i) => <span key={m} className={i === 2 ? 'on' : ''}>{m}</span>)}</div>
      <div className="ob-eyebrow" style={{ marginTop: 14 }}>02 · ENERGY</div>
      <div className="ob-slider"><i style={{ width: '70%' }} /><b /></div>
      <div className="ob-eyebrow" style={{ marginTop: 14 }}>03 · REFLECTION</div>
      <div className="ob-text">Busy week, but the DBMS test went well…</div>
    </div>
  ),
  done: () => (
    <div className="ob-done">
      <i><Icon name="sparkles" size={28} /></i>
      <b>Insights unlock as you log</b>
      <small>After a few weeks of data, JARVIS connects attendance, marks, habits, money and mood.</small>
    </div>
  ),
}

const STEPS = [
  { key: 'welcome', icon: 'sparkles', title: 'Welcome to JARVIS', lead: 'A 1-minute tour of how to put your student life in one place. You can skip it any time and replay it later from Settings.',
    how: ['Add your classes once, then mark attendance in seconds', 'Log marks, habits, money and your weekly mood', 'JARVIS connects it all into insights and a CGPA forecast'] },
  { key: 'attendance', icon: 'calendar', page: 'attendance', label: 'Attendance', title: 'Track attendance, period by period', lead: 'Add your subjects and timetable once. Every period gets its own row, so P1 and P4 of the same subject are marked separately.',
    how: ['Open Attendance → Edit setup. Add your subjects, periods per day and timetable', 'Go to the Mark attendance tab and pick the day', 'Tap Present, Absent or Cancelled for each period', 'Save the day. Cancelled classes never count against you'] },
  { key: 'marks', icon: 'chart', page: 'marks', label: 'Marks & CGPA', title: 'Log marks and forecast your CGPA', lead: 'Every test or assignment you add feeds a running average and a CGPA forecast.',
    how: ['Open Marks & CGPA and tap Add marks', 'Enter the subject, exam type, your score and the total marks', 'Save. Your trend and predicted CGPA update instantly', 'Set a target CGPA in Settings → Preferences to see what you need to reach it'] },
  { key: 'habits', icon: 'habit', page: 'habits', label: 'Habits', title: 'Build streaks that stick', lead: 'Pick a few habits, check them off daily and watch the streak and heatmap grow.',
    how: ['Open Habits and tap Add habit', 'Give it a name and an optional goal, like “1 problem per day”', 'Tap the circle each day you do it', 'Keep the streak alive. JARVIS nudges you when one breaks'] },
  { key: 'expenses', icon: 'wallet', page: 'expenses', label: 'Expenses', title: 'Know where your money goes', lead: 'Set a monthly budget, log spending in a few taps and keep an eye on bills and subscriptions.',
    how: ['Open Expenses and set your monthly budget', 'Tap Add transaction. Enter the amount, category and a note', 'Add rent, internet or subscriptions under Bills & subscriptions', 'Watch the budget bar and 7-day trend'] },
  { key: 'career', icon: 'target', page: 'career', label: 'Career roadmap', title: 'Turn your goal into a roadmap', lead: 'Write your goal, break it into milestones and track the skills you need.',
    how: ['Open Career roadmap and define your primary goal', 'Tap Load placement checklist, or Add milestone for your own steps', 'Use Manage under Skill profile to add skills like Python or SQL', 'Tick milestones off as you finish them'] },
  { key: 'checkin', icon: 'heart', page: 'checkin', label: 'Weekly check-in', title: 'A two-minute weekly reflection', lead: 'Once a week, tell JARVIS how you feel. It looks for links between your mood, energy, marks and habits.',
    how: ['Open Weekly check-in', 'Pick the mood that fits your week', 'Slide your energy from 1 to 10', 'Add a short reflection and tap Complete check-in'] },
  { key: 'done', icon: 'check', page: 'attendance', label: 'Attendance', title: 'You’re all set', lead: 'Start with your attendance setup, since most of JARVIS builds on it. Everything else can wait until you need it.',
    how: ['Add your subjects and timetable', 'Log a few marks and habits this week', 'Come back to Insights after a couple of weeks for your first patterns'] },
]

export default function Onboarding({ name, go, onClose }) {
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const last = i === STEPS.length - 1
  const Preview = PREVIEWS[step.key]

  const finish = (page) => { onClose(); if (page) go(page) }
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') setI(x => Math.min(STEPS.length - 1, x + 1))
      else if (e.key === 'ArrowLeft') setI(x => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <div className="ob-overlay" role="dialog" aria-modal="true" aria-label="JARVIS tour">
      <div className="ob-card">
        <div className="ob-head">
          <span>{i === 0 ? 'GETTING STARTED' : `STEP ${i} OF ${STEPS.length - 1}`}</span>
          <button onClick={() => onClose()}>Skip tour</button>
        </div>
        <div className="ob-body">
          <div className="ob-text-col">
            <i className="ob-icon"><Icon name={step.icon} size={22} /></i>
            <h2>{i === 0 && name ? `Welcome, ${name.split(' ')[0]}` : step.title}</h2>
            <p>{step.lead}</p>
            <ol>{step.how.map(h => <li key={h}>{h}</li>)}</ol>
          </div>
          <div className="ob-preview" aria-hidden="true"><Preview /></div>
        </div>
        <div className="ob-foot">
          <div className="ob-dots">{STEPS.map((s, n) => <button key={s.key} className={n === i ? 'on' : n < i ? 'seen' : ''} onClick={() => setI(n)} aria-label={`Go to step ${n + 1}`} />)}</div>
          <div className="ob-actions">
            {i > 0 && <button className="ob-back" onClick={() => setI(i - 1)}>Back</button>}
            {step.page && !last && <button className="ob-link" onClick={() => finish(step.page)}>Open {step.label}</button>}
            {last
              ? <button className="ob-next" onClick={() => finish(step.page)}>Set up attendance <Icon name="arrow" size={16} /></button>
              : <button className="ob-next" onClick={() => setI(i + 1)}>{i === 0 ? 'Start the tour' : 'Next'} <Icon name="arrow" size={16} /></button>}
          </div>
        </div>
      </div>
    </div>
  )
}
