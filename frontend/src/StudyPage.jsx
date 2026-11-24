/**
 * StudyPage.jsx — "Study with me"
 *   Focus timer  : Pomodoro-style timer with presets, daily stats and a 7-day chart
 *   Study scenery: an immersive animated scene + soothing generated music, with the timer on top
 * Plus <StudyMiniBar/>: a small floating bar so the timer/music stay controllable on other pages.
 */
import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useStudy, study, fmtTime, statsFor, PRESETS, SCENES } from './studyStore'
import Scene, { RainLayer } from './StudyScenes'
import { Heading } from './ui'
import './study.css'

const Ico = ({ d, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)
const I = {
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" />,
  pause: <><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></>,
  reset: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>,
  skip: <><path d="M5 5v14l10-7z" fill="currentColor" /><path d="M19 5v14" /></>,
  music: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
  full: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  leaf: <path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15M5 19l8-8" />,
}

const todayMinutes = (stats) => Math.round(statsFor(stats).seconds / 60)
const fmtMins = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`)

/* ───────────── shared timer controls ───────────── */
function TimerControls({ s, dark }) {
  return (
    <div className={`sw-controls ${dark ? 'dark' : ''}`}>
      <button className="sw-round" onClick={() => study.reset()} aria-label="Reset timer" title="Reset"><Ico d={I.reset} /></button>
      <button className="sw-main" onClick={() => study.toggle()} aria-label={s.running ? 'Pause timer' : 'Start timer'}>
        <Ico d={s.running ? I.pause : I.play} size={26} />
        <span>{s.running ? 'Pause' : s.remaining < (s.phase === 'focus' ? s.focus : s.brk) * 60 ? 'Resume' : 'Start'}</span>
      </button>
      <button className="sw-round" onClick={() => study.skip()} aria-label="Skip to next phase" title={s.phase === 'focus' ? 'Skip to break' : 'Skip to focus'}><Ico d={I.skip} /></button>
    </div>
  )
}

const Dots = ({ cycle }) => {
  const filled = cycle > 0 && cycle % 4 === 0 ? 4 : cycle % 4
  return <div className="sw-dots" aria-label={`${cycle} sessions completed`}>{[0, 1, 2, 3].map(i => <i key={i} className={i < filled ? 'on' : ''} />)}</div>
}

/* ───────────── TAB 1: focus timer ───────────── */
function TimerTab({ s, openScenery }) {
  const total = (s.phase === 'focus' ? s.focus : s.brk) * 60
  const pct = Math.max(0, Math.min(100, ((total - s.remaining) / total) * 100))
  const [cf, setCf] = useState(s.focus)
  const [cb, setCb] = useState(s.brk)
  useEffect(() => { setCf(s.focus); setCb(s.brk) }, [s.focus, s.brk])
  const today = statsFor(s.stats)
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return { d, min: Math.round(statsFor(s.stats, d).seconds / 60) } })
  const max = Math.max(...week.map(w => w.min), 30)

  return (
    <div className="sw-grid">
      <section className="sw-card sw-timer-card">
        <div className="sw-phase"><i className={s.phase} />{s.phase === 'focus' ? 'FOCUS SESSION' : 'BREAK TIME'}</div>
        <div className="sw-ring" style={{ background: `conic-gradient(${s.phase === 'focus' ? 'var(--emerald)' : 'var(--lavender)'} ${pct * 3.6}deg, var(--ring-track) 0)` }}>
          <div className="sw-ring-in">
            <b>{fmtTime(s.remaining)}</b>
            <span>{s.phase === 'focus' ? 'Stay with it' : 'Stretch, sip some water'}</span>
          </div>
        </div>
        <input className="sw-task" placeholder="What are you studying? (optional)" value={s.task} onChange={e => study.setTask(e.target.value)} maxLength={60} />
        <TimerControls s={s} />
        <Dots cycle={s.cycle} />
        <label className="sw-check"><input type="checkbox" checked={s.autoStart} onChange={e => study.setAutoStart(e.target.checked)} /> Start the next phase automatically</label>
      </section>

      <section className="sw-card">
        <div className="sw-head"><span>TIMER</span><h2>Choose your rhythm</h2></div>
        <div className="sw-presets">
          {PRESETS.map(p => (
            <button key={p.id} className={s.presetId === p.id ? 'on' : ''} onClick={() => study.setPreset(p.id)}>
              <b>{p.label}</b><small>{p.id === 'custom' ? `${s.presetId === 'custom' ? s.focus : p.focus} / ${s.presetId === 'custom' ? s.brk : p.brk} min` : p.note}</small>
            </button>
          ))}
        </div>
        {s.presetId === 'custom' && (
          <div className="sw-custom">
            <label>Focus (min)<input type="number" min="1" max="240" value={cf} onChange={e => setCf(e.target.value)} /></label>
            <label>Break (min)<input type="number" min="1" max="60" value={cb} onChange={e => setCb(e.target.value)} /></label>
            <button className="sw-btn" onClick={() => study.setCustom(Number(cf), Number(cb))}>Apply</button>
          </div>
        )}
        <button className="sw-link" onClick={openScenery}><Ico d={I.leaf} size={16} /> Study in a calm scene with music →</button>
      </section>

      <section className="sw-card">
        <div className="sw-head"><span>YOUR FOCUS</span><h2>{fmtMins(Math.round(today.seconds / 60))} today</h2></div>
        <div className="sw-stats">
          <div><b>{today.sessions}</b><small>sessions today</small></div>
          <div><b>{fmtMins(Math.round((s.stats.total || 0) / 60))}</b><small>all-time focus</small></div>
        </div>
        <div className="sw-bars" role="img" aria-label="Focus minutes in the last 7 days">
          {week.map((w, i) => (
            <div key={i} title={`${w.min} min`}>
              <i className={i === 6 ? 'today' : ''} style={{ height: `${Math.max(4, (w.min / max) * 100)}%` }} />
              <small>{['S', 'M', 'T', 'W', 'T', 'F', 'S'][w.d.getDay()]}</small>
            </div>
          ))}
        </div>
        <p className="sw-note">Focus time is counted while a focus session is running. Saved on this device.</p>
      </section>

      <section className="sw-card sw-dark">
        <span className="sw-eyebrow">STUDY TIP</span>
        <h2>Protect the first 25 minutes.</h2>
        <p>Put your phone in another room, keep one task on screen, and let the timer do the worrying. Short breaks beat long grinds.</p>
      </section>
    </div>
  )
}

/* ───────────── TAB 2: study with me (scenery) ───────────── */
function Slider({ label, value, onChange }) {
  return (
    <label className="sw-slider">
      <span>{label}</span>
      <input type="range" min="0" max="1" step="0.01" value={value} onChange={e => onChange(Number(e.target.value))} style={{ '--p': `${value * 100}%` }} />
    </label>
  )
}

function SceneryTab({ s }) {
  const stageRef = useRef(null)
  const [native, setNative] = useState(false)   // real browser fullscreen (Android, desktop, iPad)
  const [pseudo, setPseudo] = useState(false)   // fallback fullscreen (iPhone Safari has no Fullscreen API)
  const full = native || pseudo
  const [yt, setYt] = useState('')
  const [panel, setPanel] = useState(true)
  const scene = SCENES.find(x => x.id === s.scene) || SCENES[0]

  useEffect(() => {
    const h = () => setNative(!!(document.fullscreenElement || document.webkitFullscreenElement))
    document.addEventListener('fullscreenchange', h)
    document.addEventListener('webkitfullscreenchange', h)
    return () => {
      document.removeEventListener('fullscreenchange', h)
      document.removeEventListener('webkitfullscreenchange', h)
    }
  }, [])

  // fallback mode: lock page scroll behind the overlay, Esc closes it
  useEffect(() => {
    if (!pseudo) return
    const onKey = e => { if (e.key === 'Escape') setPseudo(false) }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('sw-noscroll')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('sw-noscroll')
    }
  }, [pseudo])

  const toggleFull = async () => {
    if (pseudo) { setPseudo(false); return }
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)
      return
    }
    const el = stageRef.current
    const req = el?.requestFullscreen || el?.webkitRequestFullscreen
    if (!req) { setPseudo(true); return }          // iPhone / unsupported browsers
    try { await req.call(el) } catch { setPseudo(true) }
  }

  const stage = (
      <div ref={stageRef} className={`sw-stage ${full ? 'full' : ''} ${s.phase}`}>
        <Scene id={s.scene} />
        <RainLayer intensity={s.mix.rain} />
        <div className="sw-tint" />
        <div className="sw-shade" />

        <div className="sw-top">
          <span className="sw-chip"><i className={s.running ? 'live' : ''} />{scene.name}</span>
          <div>
            <button className="sw-glass" onClick={() => setPanel(p => !p)}><Ico d={I.music} size={16} /> {panel ? 'Hide sounds' : 'Sounds'}</button>
            <button className="sw-glass" onClick={toggleFull} aria-label="Toggle fullscreen"><Ico d={I.full} size={16} /> {full ? 'Exit' : 'Fullscreen'}</button>
          </div>
        </div>

        <div className="sw-center">
          <div className="sw-phase glass"><i className={s.phase} />{s.phase === 'focus' ? 'FOCUS' : 'BREAK'}</div>
          <div className="sw-big">{fmtTime(s.remaining)}</div>
          <div className="sw-doing">{s.task ? `Studying: ${s.task}` : s.phase === 'focus' ? 'Study with me — one session at a time' : 'Take a breath. You’ve earned it.'}</div>
          <TimerControls s={s} dark />
          <Dots cycle={s.cycle} />
        </div>

        {panel && (
          <div className="sw-dock">
            <button className={`sw-play ${s.playing ? 'on' : ''}`} onClick={() => study.togglePlay()}>
              <Ico d={s.playing ? I.pause : I.play} size={18} />
              <span>{s.playing ? 'Pause sounds' : 'Play soothing sounds'}</span>
            </button>
            <div className="sw-mixer">
              <Slider label="Lo-fi music" value={s.mix.music} onChange={v => study.setMix('music', v)} />
              <Slider label="Rain" value={s.mix.rain} onChange={v => study.setMix('rain', v)} />
              <Slider label="Waves" value={s.mix.waves} onChange={v => study.setMix('waves', v)} />
              <Slider label="Fireplace" value={s.mix.fire} onChange={v => study.setMix('fire', v)} />
              <Slider label="Volume" value={s.master} onChange={v => study.setMaster(v)} />
            </div>
          </div>
        )}
      </div>
  )

  return (
    <>
      {/* in fallback mode the stage is moved to <body> so nothing in the page can clip or offset it */}
      {pseudo ? createPortal(stage, document.body) : stage}

      <div className="sw-scenes" role="listbox" aria-label="Choose a scene">
        {SCENES.map(sc => (
          <button key={sc.id} role="option" aria-selected={s.scene === sc.id} className={s.scene === sc.id ? 'on' : ''} onClick={() => study.setScene(sc.id)}>
            <i style={{ background: sc.swatch }} /><span>{sc.name}</span>
          </button>
        ))}
      </div>

      <section className="sw-card sw-yt">
        <div className="sw-head"><span>YOUR OWN MUSIC</span><h2>Prefer a YouTube lo-fi stream?</h2></div>
        <p className="sw-note" style={{ marginTop: 0 }}>Paste a link to any lo-fi / study music video or playlist. It plays alongside the scene (needs internet; some videos block embedding).</p>
        <div className="sw-yt-row">
          <input placeholder="https://www.youtube.com/watch?v=…" value={yt} onChange={e => setYt(e.target.value)} onKeyDown={e => e.key === 'Enter' && study.playYouTube(yt)} />
          {s.ytPlaying
            ? <button className="sw-btn ghost" onClick={() => study.stopYouTube()}>Stop</button>
            : <button className="sw-btn" onClick={() => study.playYouTube(yt)} disabled={!yt.trim()}>Play</button>}
        </div>
        {s.ytError && <p className="sw-err">{s.ytError}</p>}
        {s.ytPlaying && <p className="sw-note">Playing your link — lower “Lo-fi music” above if you want only YouTube.</p>}
      </section>
    </>
  )
}

/* ───────────── page ───────────── */
export default function StudyPage() {
  const s = useStudy()
  const [tab, setTab] = useState('scenery')
  return (
    <main className="product-page study-page">
      <div className="product-wrap sw-page">
        <Heading eyebrow="Study with me" title="Focus, together with JARVIS."
          description="Pick a timer or settle into a calm scene with soothing music — your timer keeps running if you switch pages."
          action={
            <div className="sw-tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'timer'} className={tab === 'timer' ? 'on' : ''} onClick={() => setTab('timer')}><Ico d={I.clock} size={16} /> Focus timer</button>
              <button role="tab" aria-selected={tab === 'scenery'} className={tab === 'scenery' ? 'on' : ''} onClick={() => setTab('scenery')}><Ico d={I.leaf} size={16} /> Study with me</button>
            </div>
          } />
        {tab === 'timer' ? <TimerTab s={s} openScenery={() => setTab('scenery')} /> : <SceneryTab s={s} />}
      </div>
    </main>
  )
}

/* ───────────── always-mounted helper (mini bar + hidden YouTube player) ───────────── */
export function StudyMiniBar({ page, setPage }) {
  const s = useStudy()
  const show = page !== 'study' && (s.running || s.playing || s.ytPlaying)
  return (
    <>
      {s.ytPlaying && s.yt && <iframe className="sw-yt-host" title="Study music" src={s.yt} allow="autoplay; encrypted-media" />}
      {show && (
        <div className="sw-mini" role="status">
          <button className="sw-mini-open" onClick={() => setPage('study')} title="Open Study with me">
            <i className={s.phase} /><b>{fmtTime(s.remaining)}</b><span>{s.phase === 'focus' ? 'Focus' : 'Break'}</span>
          </button>
          <button onClick={() => study.toggle()} aria-label={s.running ? 'Pause timer' : 'Start timer'}><Ico d={s.running ? I.pause : I.play} size={16} /></button>
          <button onClick={() => (s.playing ? study.togglePlay() : s.ytPlaying ? study.stopYouTube() : study.togglePlay())} aria-label="Toggle music" className={s.playing || s.ytPlaying ? 'on' : ''}><Ico d={I.music} size={16} /></button>
        </div>
      )}
    </>
  )
}
