/**
 * ui.jsx — shared building blocks for the new JARVIS design (from Figma).
 * Icons, cards, headings, progress bars, rings, sparklines and a few form helpers.
 * Every page imports from here so the whole app stays visually consistent.
 */
import { useEffect } from 'react'

/* ───────────── ICONS ───────────── */
const paths = {
  grid: (<>
    <rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" />
  </>),
  calendar: (<>
    <rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 10h18" />
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
  </>),
  chart: <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />,
  habit: (<>
    <path d="M12 22a9 9 0 1 0-9-9" /><path d="M12 17a4 4 0 1 0-4-4M3 13H1M4.2 6.6 2.7 5.2" />
  </>),
  wallet: (<>
    <path d="M4 6.5h14a3 3 0 0 1 3 3V18a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12" />
    <path d="M16 12h5v5h-5a2.5 2.5 0 0 1 0-5Z" />
  </>),
  sparkles: <path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3ZM5 14l.9 2.1L8 17l-2.1.9L5 20l-.9-2.1L2 17l2.1-.9L5 14ZM19 13l.7 1.3 1.3.7-1.3.7L19 17l-.7-1.3L17 15l1.3-.7L19 13Z" />,
  target: (<>
    <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" />
  </>),
  heart: <path d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 22l7.8-7.3 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
  settings: (<>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
  </>),
  search: (<><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>),
  bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM14 21h-4" />,
  arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
  book: (<>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13Z" /><path d="M8 7h8M8 11h6" />
  </>),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  check: <path d="m5 12 4 4L19 6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  flame: <path d="M12 22c4 0 7-2.8 7-7 0-3.4-2-6.4-5.8-9.4.2 2.3-.7 4-2.2 5.2.1-3.7-1.7-6.3-4.2-8.8.2 4.2-2 6.5-2 10.5C4.8 18 8 22 12 22Z" />,
  trend: (<><path d="m3 17 6-6 4 4 8-9" /><path d="M15 6h6v6" /></>),
  mic: (<><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></>),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  send: (<><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>),
  logout: (<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>),
  trash: (<><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /><path d="M10 11v6M14 11v6" /></>),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 6.7A16.6 16.6 0 0 0 2 12s3.6 6 10 6c1.7 0 3.2-.4 4.5-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 20h16" /></>,
  upload: <><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 20h16" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
}

export function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || null}
    </svg>
  )
}

/* ───────────── LAYOUT PIECES ───────────── */
export function Logo({ compact = false }) {
  return (
    <div className="logo">
      <span className="logo-mark"><span /></span>
      {!compact && <strong>JARVIS</strong>}
    </div>
  )
}

/** Page heading used at the top of every inner page */
export function Heading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        <span>{String(eyebrow || '').toUpperCase()}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-actions">{action}</div>}
    </div>
  )
}

/** Standard page wrapper: <main class="product-page xyz-page"> */
export function Page({ id, eyebrow, title, description, action, children }) {
  return (
    <main className={`product-page ${id}-page`}>
      <div className="product-wrap">
        <Heading eyebrow={eyebrow} title={title} description={description} action={action} />
        {children}
      </div>
    </main>
  )
}

export function Card({ children, className = '', ...rest }) {
  return <section className={`product-card ${className}`} {...rest}>{children}</section>
}

export function Title({ eyebrow, title, action }) {
  return (
    <div className="card-title">
      <div><span>{eyebrow}</span><h2>{title}</h2></div>
      {action}
    </div>
  )
}

export function Progress({ value, tone = '' }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  return <div className="progress-track"><i className={tone} style={{ width: `${v}%` }} /></div>
}

export function Metric({ icon, label, value, note, tone = '' }) {
  return (
    <Card className="product-metric">
      <div className={`metric-symbol ${tone}`}><Icon name={icon} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </Card>
  )
}

export function Ring({ value, color = 'var(--accent)', size = 82 }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div className="ring" style={{ width: size, height: size, background: `conic-gradient(${color} ${v * 3.6}deg, var(--ring-track) 0)` }}>
      <span>{Math.round(v)}<small>%</small></span>
    </div>
  )
}

export function Sparkline({ color = 'var(--accent)', values = [] }) {
  const vals = values.length > 1 ? values : [40, 40, 40, 40, 40, 40, 40]
  const max = Math.max(...vals, 1)
  const min = Math.min(...vals, 0)
  const span = Math.max(max - min, 1)
  const pts = vals.map((v, i) => `${i * (120 / (vals.length - 1))},${62 - ((v - min) / span) * 50}`).join(' ')
  return (
    <svg className="sparkline" viewBox="0 0 120 70" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ───────────── STATES ───────────── */
export function Loading({ text = 'Loading…' }) {
  return <div className="state-box"><div className="spinner" /><p>{text}</p></div>
}

export function ErrorBox({ title = 'Backend not connected', children }) {
  return (
    <div className="state-box error">
      <b>{title}</b>
      <p>{children}</p>
      <pre>{'cd backend\nvenv\\Scripts\\activate\nuvicorn main:app --reload'}</pre>
    </div>
  )
}

export function Empty({ icon = 'sparkles', title, children, action }) {
  return (
    <div className="empty-box">
      <div className="empty-icon"><Icon name={icon} size={22} /></div>
      <b>{title}</b>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Alert({ type = 'warning', title, children }) {
  return (
    <div className={`alert-banner ${type}`}>
      <b>{title}</b>
      <p>{children}</p>
    </div>
  )
}

export function Toast({ toast, onDone }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDone, 3200)
    return () => clearTimeout(t)
  }, [toast])
  if (!toast) return null
  return <div className={`toast ${toast.bad ? 'bad' : ''}`}>{toast.msg}</div>
}

/* ───────────── FORM HELPERS ───────────── */
export function Field({ label, children, className = '' }) {
  return <label className={`field ${className}`}><span>{label}</span>{children}</label>
}

export function Select({ value, onChange, options, placeholder }) {
  return (
    <select className="select" value={value} onChange={e => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => (
        <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>
          {typeof o === 'string' ? o : o.label}
        </option>
      ))}
    </select>
  )
}

/** Segmented pill tabs (Figma "settings-tabs" style) */
export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={`settings-tabs ${className}`} role="tablist">
      {tabs.map(t => (
        <button key={t.id} role="tab" aria-selected={value === t.id}
          className={value === t.id ? 'active' : ''} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

/* ───────────── SMALL HELPERS ───────────── */
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const gradeOf = (pct) =>
  pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B+' : pct >= 60 ? 'B' : pct >= 50 ? 'C' : 'D'

export const inr = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN')

export const initialsOf = (name) =>
  name ? name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?'

/** password input with the "show / hide" eye button */
import { useState } from 'react'
export function PasswordInput({ value, onChange, placeholder = '••••••••', autoComplete = 'current-password', id }) {
  const [show, setShow] = useState(false)
  return (
    <div className="pw-wrap">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange}
        placeholder={placeholder} autoComplete={autoComplete} />
      <button type="button" className="pw-eye" onClick={() => setShow(s => !s)}
        aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} title={show ? 'Hide password' : 'Show password'}>
        <Icon name={show ? 'eyeOff' : 'eye'} size={19} />
      </button>
    </div>
  )
}
