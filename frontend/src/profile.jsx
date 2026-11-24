/**
 * profile.jsx — Profile & Settings (Figma layout, all saved to the backend)
 *   Account        edit name / email / university / course / student ID / photo + change password
 *   Preferences    palette, target CGPA, required credits, class start time + period length
 *   Notifications  class reminders, deadlines, habit nudges, weekly summary
 *   Connections    calendar export (.ics), marks import (CSV), bank-statement import (CSV)
 */
import { useRef, useState, useEffect } from 'react'
import { api } from './api'
import { Icon, Page, Card, Title, Field, Select, PasswordInput, Toast, initialsOf } from './ui'
import { PALETTES } from './palette'

const Toggle = ({ on, onClick }) => <button className={`toggle ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on}><i /></button>

/** shrink a chosen photo to 256px so it stays small in the database */
const toAvatar = (file) => new Promise((resolve, reject) => {
  const img = new Image()
  img.onload = () => {
    const size = 256, s = Math.min(img.width, img.height)
    const c = document.createElement('canvas'); c.width = c.height = size
    c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size)
    resolve(c.toDataURL('image/jpeg', 0.85))
  }
  img.onerror = () => reject(new Error('That file isn’t an image'))
  img.src = URL.createObjectURL(file)
})
const readText = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(file) })

export default function ProfilePage({ me, name, onLogout, refreshMe, palette, setPalette, onReplayTour }) {
  const [tab, setTab] = useState('Account')
  const [toast, setToast] = useState(null)
  const flash = (msg, bad = false) => setToast({ msg, bad })
  const [f, setF] = useState({ name: '', email: '', university: '', course: '', student_id: '', semester: '1' })
  const [pw, setPw] = useState({ current: '', next: '' })
  const [prefs, setPrefs] = useState(me?.prefs || {})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState({})
  const fileRef = useRef(null)

  useEffect(() => {
    if (!me) return
    setF({ name: me.name || '', email: me.email || '', university: me.university || '', course: me.course || '', student_id: me.student_id || '', semester: String(me.semester || 1) })
    setPrefs(me.prefs || {})
  }, [me?.id, me?.name, me?.email, me?.university, me?.course, me?.student_id, me?.semester])

  const setField = k => e => setF({ ...f, [k]: e.target.value })

  const saveProfile = async () => {
    setBusy(true)
    const res = await api.updateProfile({ ...f, semester: parseInt(f.semester) || 1 })
    setBusy(false)
    if (res?.detail) return flash(typeof res.detail === 'string' ? res.detail : 'Check the details and try again', true)
    localStorage.setItem('name', res.name)
    flash('Profile saved'); refreshMe()
  }
  const pickPhoto = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    try {
      const avatar = await toAvatar(file)
      const res = await api.updateProfile({ avatar })
      if (res?.detail) return flash(res.detail, true)
      flash('Photo updated'); refreshMe()
    } catch (err) { flash(err.message, true) }
  }
  const removePhoto = async () => { await api.updateProfile({ avatar: '' }); flash('Photo removed'); refreshMe() }
  const changePassword = async () => {
    if (!pw.current || !pw.next) return flash('Fill in both password fields', true)
    const res = await api.changePassword({ current: pw.current, new: pw.next })
    if (res?.detail) return flash(typeof res.detail === 'string' ? res.detail : 'Could not change password', true)
    setPw({ current: '', next: '' }); flash('Password changed')
  }
  const savePref = async (patch, msg = 'Saved') => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    const res = await api.savePrefs(patch)
    if (res?.detail) return flash('Could not save', true)
    flash(msg); refreshMe()
  }

  const importCsv = async (kind, file, signed) => {
    if (!file) return
    try {
      const text = await readText(file)
      const res = kind === 'marks' ? await api.importMarks(text) : await api.importExpenses(text, signed)
      if (res?.detail) return setResult(r => ({ ...r, [kind]: { bad: true, msg: String(res.detail) } }))
      setResult(r => ({ ...r, [kind]: { msg: `Imported ${res.imported} row${res.imported === 1 ? '' : 's'}${res.skipped ? ` · skipped ${res.skipped}` : ''}${res.errors?.length ? ` (${res.errors[0]})` : ''}` } }))
      refreshMe()
    } catch { setResult(r => ({ ...r, [kind]: { bad: true, msg: 'Could not read that file' } })) }
  }
  const downloadIcs = async () => { try { await api.download('/calendar.ics', 'jarvis-timetable.ics'); flash('Calendar file downloaded') } catch (e) { flash(e.message, true) } }

  const csvRef = { marks: useRef(null), bank: useRef(null) }
  const name2 = me?.name || name

  return (
    <Page id="profile" eyebrow="Profile & Settings" title="Make JARVIS yours." description="Manage your identity, preferences and connected services.">
      <div className="settings-tabs">
        {['Account', 'Preferences', 'Notifications', 'Connections'].map(x => <button key={x} className={tab === x ? 'active' : ''} onClick={() => setTab(x)}>{x}</button>)}
      </div>

      {tab === 'Account' && (
        <div className="settings-grid">
          <Card className="profile-card">
            <div className={`large-avatar ${me?.avatar ? 'has-img' : ''}`}>{me?.avatar ? <img src={me.avatar} alt="" /> : initialsOf(name2)}</div>
            <h2>{name2}</h2>
            <p>{[me?.course || me?.branch, me?.semester ? `Semester ${me.semester}` : ''].filter(Boolean).join(' · ') || 'Student'}</p>
            <span>{me?.student_id ? `Student ID · ${me.student_id}` : me?.email}</span>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
            <button className="outline-action" onClick={() => fileRef.current?.click()}><Icon name="camera" size={16} /> Change photo</button>
            {me?.avatar && <button className="link-btn" onClick={removePhoto}>Remove photo</button>}
            {onReplayTour && <button className="link-btn" onClick={onReplayTour}><Icon name="sparkles" size={15} /> Replay the tour</button>}
            <button className="link-btn" onClick={onLogout}><Icon name="logout" size={15} /> Sign out</button>
          </Card>
          <div style={{ display: 'grid', gap: 13 }}>
            <Card>
              <Title eyebrow="PERSONAL INFORMATION" title="Account details" />
              <div className="form-grid">
                <label>Full name<input value={f.name} onChange={setField('name')} /></label>
                <label>Email address<input type="email" value={f.email} onChange={setField('email')} /></label>
                <label>University<input value={f.university} onChange={setField('university')} placeholder="e.g. National Institute of Technology" /></label>
                <label>Course<input value={f.course} onChange={setField('course')} placeholder="e.g. B.Tech · Computer Science" /></label>
                <label>Student ID<input value={f.student_id} onChange={setField('student_id')} placeholder="e.g. CS2023042" /></label>
                <label>Semester<select value={f.semester} onChange={setField('semester')}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
              </div>
              <button className="primary-action" disabled={busy} onClick={saveProfile}>{busy ? 'Saving…' : 'Save changes'}</button>
            </Card>
            <Card>
              <Title eyebrow="SECURITY" title="Change password" />
              <div className="form-grid">
                <label>Current password<PasswordInput value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} /></label>
                <label>New password<PasswordInput value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" placeholder="At least 6 characters" /></label>
              </div>
              <button className="outline-action" onClick={changePassword}>Update password</button>
            </Card>
          </div>
        </div>
      )}

      {tab === 'Preferences' && (
        <Card className="settings-list">
          <Title eyebrow="PERSONALIZE JARVIS" title="Preferences" />
          <div className="setting-row">
            <div><b>Colour palette</b><small>Applies everywhere, including Study with me</small></div>
            <div className="pref-palettes">
              {PALETTES.map(p => (
                <button key={p.key} className={palette === p.key ? 'on' : ''} title={p.name} onClick={() => setPalette(p.key)}>
                  {p.colors.slice(0, 3).map(c => <i key={c.hex} style={{ background: c.hex }} />)}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div><b>Target CGPA</b><small>Used for “Path to your goal” on Marks</small></div>
            <input className="pref-input" type="number" min="1" max="10" step="0.1" defaultValue={prefs.target_cgpa ?? 9} key={`t${prefs.target_cgpa}`}
              onBlur={e => { const v = parseFloat(e.target.value); if (v && v !== prefs.target_cgpa) savePref({ target_cgpa: v }, 'Target CGPA saved') }} />
          </div>
          <div className="setting-row">
            <div><b>Credits needed to graduate</b><small>Shown as “Credits earned x / total” on Marks</small></div>
            <input className="pref-input" type="number" min="1" max="400" defaultValue={prefs.total_credits ?? 120} key={`c${prefs.total_credits}`}
              onBlur={e => { const v = parseInt(e.target.value); if (v && v !== prefs.total_credits) savePref({ total_credits: v }, 'Credits saved') }} />
          </div>
          <div className="setting-row">
            <div><b>First class starts at</b><small>Gives every period a real time in your schedule</small></div>
            <input className="pref-input" type="time" value={prefs.first_class || '09:00'} onChange={e => e.target.value && savePref({ first_class: e.target.value }, 'Class time saved')} />
          </div>
          <div className="setting-row">
            <div><b>Length of one period</b><small>In minutes</small></div>
            <input className="pref-input" type="number" min="20" max="180" step="5" defaultValue={prefs.period_minutes ?? 60} key={`p${prefs.period_minutes}`}
              onBlur={e => { const v = parseInt(e.target.value); if (v && v !== prefs.period_minutes) savePref({ period_minutes: v }, 'Period length saved') }} />
          </div>
        </Card>
      )}

      {tab === 'Notifications' && (
        <Card className="settings-list">
          <Title eyebrow="PERSONALIZE JARVIS" title="Notifications" />
          {[['class_reminders', 'Class reminders', 'Show an alert for classes you haven’t marked'], ['assignment_deadlines', 'Assignment deadlines', 'Alert me about tasks due in the next 2 days'], ['habit_nudges', 'Habit nudges', 'Remind me about habits I haven’t checked in'], ['weekly_summary', 'Weekly JARVIS summary', 'Include a weekly recap in my alerts']].map(([k, label, desc]) => (
            <div className="setting-row" key={k}>
              <div><b>{label}</b><small>{desc} · you can change this anytime</small></div>
              <Toggle on={!!prefs[k]} onClick={() => savePref({ [k]: !prefs[k] })} />
            </div>
          ))}
        </Card>
      )}

      {tab === 'Connections' && (
        <Card className="settings-list">
          <Title eyebrow="CONNECTED SERVICES" title="Your integrations" />
          <input ref={csvRef.marks} type="file" accept=".csv,text/csv" hidden onChange={e => { importCsv('marks', e.target.files?.[0]); e.target.value = '' }} />
          <input ref={csvRef.bank} type="file" accept=".csv,text/csv" hidden onChange={e => { importCsv('bank', e.target.files?.[0]); e.target.value = '' }} />
          {[
            ['Google Calendar', 'Download your timetable and deadlines as a calendar file (.ics) and import it into Google, Apple or Outlook Calendar', 'calendar', <button key="b" className="connected" onClick={downloadIcs}><Icon name="download" size={14} /> Export .ics</button>],
            ['University LMS', 'Import marks from a CSV export (columns: subject, score, total, date)', 'book', <button key="b" onClick={() => csvRef.marks.current?.click()}><Icon name="upload" size={14} /> Import CSV</button>, 'marks'],
            ['Google Fit', 'Sleep and activity sync isn’t available yet', 'heart', <button key="b" disabled style={{ opacity: .5, cursor: 'default' }}>Coming soon</button>],
            ['Bank account', 'Import a bank statement CSV — spending is categorized automatically', 'wallet', <button key="b" onClick={() => csvRef.bank.current?.click()}><Icon name="upload" size={14} /> Import CSV</button>, 'bank'],
          ].map(([title, desc, icon, btn, key], i) => (
            <div key={title}>
              <div className="connection-row">
                <div className={`connection-logo c${i}`}><Icon name={icon} size={18} /></div>
                <div><b>{title}</b><small>{desc}</small></div>
                {btn}
              </div>
              {key && result[key] && <p className={`import-result ${result[key].bad ? 'bad' : ''}`}>{result[key].msg}</p>}
            </div>
          ))}
        </Card>
      )}
      <Toast toast={toast} onDone={() => setToast(null)} />
    </Page>
  )
}
