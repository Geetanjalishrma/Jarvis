/**
 * insightspage.jsx — "Insights" in the Figma layout.
 * Shows the 6 cross-module insights from the backend: attendance × marks, streaks × marks,
 * spending × exam stress, placement readiness, mood × performance and burnout.
 */
import { useState, useEffect } from 'react'
import { api } from './api'
import { Icon, Page, Card, Title, Progress, Loading, ErrorBox, Alert } from './ui'

const STORY_ICONS = ['trend', 'check', 'wallet', 'heart']
const LABELS = { dsa: 'DSA / LeetCode', marks: 'Marks / CGPA', attendance: 'Attendance discipline', career: 'Career checklist', consistency: 'Overall consistency' }

function Story({ i, label, headline, insight, hasInsight, dataPoints }) {
  const n = dataPoints?.length || 0
  return (
    <Card className={`trend-story s${i % 2}`}>
      <div className="story-icon"><Icon name={STORY_ICONS[i] || 'sparkles'} /></div>
      <span>{label.toUpperCase()}</span>
      <h2>{headline}</h2>
      <p>{insight || 'Keep logging data across modules — this insight will appear automatically.'}</p>
      <div className="story-meta">
        <span className={`badge ${hasInsight ? 'ok' : 'gray'}`}>{hasInsight ? 'Insight ready' : n > 0 ? 'Building…' : 'Need more data'}</span>
        {n > 0 && <small style={{ color: 'var(--muted)', fontSize: 12.5 }}>Based on {n} data point{n === 1 ? '' : 's'}</small>}
      </div>
    </Card>
  )
}

export default function InsightsPage({ go }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.insights().then(d => (d && !d.detail ? setData(d) : setError('Could not load insights.'))).catch(() => setError('Could not load insights. Is the backend running?'))
  }, [])

  const head = { eyebrow: 'Insights', title: 'Signals worth noticing.', description: 'JARVIS connects academic progress with focus, money and wellbeing.' }
  if (error) return <Page id="insights" {...head}><ErrorBox title="Couldn’t load insights">{error}</ErrorBox></Page>
  if (!data) return <Page id="insights" {...head}><Loading text="Analysing your patterns across all modules…" /></Page>

  const { burnout, attendance_marks, streak_marks, stress_spending, placement, mood_performance, ready_count } = data
  const level = burnout?.level
  const breakdown = Object.entries(placement?.breakdown || {})
  const heroTitle = level === 'burnout' ? 'Burnout signals need your attention.'
    : level === 'alert' ? 'You’re doing well, but recovery needs attention.'
    : (ready_count || 0) > 0 ? 'Your patterns are starting to show.' : 'Keep logging — insights unlock automatically.'
  const heroText = level === 'burnout' || level === 'alert'
    ? burnout.message
    : placement?.summary || `${ready_count || 0} of 6 insights are ready. Log attendance, marks, habits and spending to unlock the rest.`
  const score = placement?.score ?? 0

  return (
    <Page id="insights" {...head}>
      {level === 'burnout' && <Alert type="danger" title="Burnout signal — please take this seriously">{[burnout.message, ...(burnout.signals || []).map(s => `· ${s.message}`)].join('  ')}</Alert>}
      {level === 'alert' && <Alert type="warning" title="Several warning signs this week">{(burnout.signals || []).map(s => s.message).join('  ')}</Alert>}

      <div className="insight-summary">
        <div>
          <span>JARVIS MONTHLY READ</span>
          <h2>{heroTitle}</h2>
          <p>{heroText}</p>
        </div>
        <div className="health-score">
          <i style={{ background: `conic-gradient(var(--accent) ${score}%, color-mix(in srgb, var(--on-secondary) 14%, transparent) 0)` }}><b>{score}</b></i>
          <span>Placement readiness</span>
        </div>
      </div>

      <div className="insight-grid insights-live">
        <Story i={0} label="Attendance × Marks" headline="How showing up shapes your scores." {...pick(attendance_marks)} />
        <Story i={1} label="Streaks × Exam performance" headline="Do your habits show in your marks?" {...pick(streak_marks)} />
        <Story i={2} label="Expenses × Exam stress" headline="What stress does to your spending." {...pick(stress_spending)} />
        <Story i={3} label="Mood × Performance" headline="How you feel and how you score." {...pick(mood_performance)} />

        {placement && (
          <Card className="wide">
            <Title eyebrow="PATTERN DETECTED" title="What moves your placement readiness"
              action={<span className={`badge ${score >= 80 ? 'ok' : score >= 60 ? 'mid' : 'bad'}`}>{placement.label}</span>} />
            <div className="breakdown">
              {breakdown.map(([k, v]) => {
                const p = Math.round((v.score / v.max) * 100)
                return (
                  <div key={k}>
                    <div className="bd-top"><span>{LABELS[k] || k}</span><span>{v.score}/{v.max}</span></div>
                    <div className="bd-note">{v.note}</div>
                    <Progress value={p} tone={p < 50 ? 'accent-muted' : ''} />
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        <Card className="dark-card assistant-cta">
          <Icon name="sparkles" />
          <span>ASK JARVIS</span>
          <h2>Want the full picture?</h2>
          <p>Explore what’s driving your trends and build a balanced plan.</p>
          <button onClick={() => go?.('assistant')}>Discuss my insights <Icon name="arrow" size={16} /></button>
        </Card>

        <Card className={level === 'burnout' ? 'bad-tone' : ''}>
          <Title eyebrow="BURNOUT WATCH" title="Wellbeing check"
            action={<span className={`badge ${level === 'fine' ? 'ok' : level === 'burnout' ? 'bad' : 'mid'}`}>{level === 'fine' ? 'All clear' : level}</span>} />
          <p className="mini-note" style={{ fontSize: 14 }}>
            {level === 'fine' ? 'No stress signals across any module. Everything looks balanced right now.' : burnout?.message}
          </p>
          {burnout?.signals?.map((s, i) => <p className="mini-note" style={{ margin: '6px 0 0' }} key={i}>· {s.message}</p>)}
          <p className="mini-note" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            Watches attendance drops, streak breaks, spending spikes, mood and score decline together.
          </p>
        </Card>
      </div>
    </Page>
  )
}

function pick(x) { return { insight: x?.insight, hasInsight: x?.has_insight, dataPoints: x?.data_points } }
