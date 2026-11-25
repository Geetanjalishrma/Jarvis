/**
 * studyStore.js — the brain of "Study with me".
 *
 * Lives OUTSIDE React on purpose: the timer and the music keep running while you
 * move to other JARVIS pages (a small mini-bar lets you get back). Components read it
 * with useStudy() and change it with the exported `study` actions.
 *
 * Music + ambience are generated live with the Web Audio API (no audio files, no copyright
 * issues, works offline): a slow lo-fi chord pad with soft plucks and vinyl crackle, plus
 * rain, waves and fireplace layers you can mix.
 */
import { useSyncExternalStore } from 'react'
import { api } from './api'

/* ───────────── helpers ───────────── */
const pad = (n) => String(n).padStart(2, '0')
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fmtTime = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
const load = (k, fb) => { try { return { ...fb, ...JSON.parse(localStorage.getItem(k) || '{}') } } catch { return fb } }
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

export const PRESETS = [
  { id: 'classic',  label: 'Classic Pomodoro', focus: 25, brk: 5,  note: '25 min focus · 5 min break' },
  { id: 'deep',     label: 'Deep work',        focus: 50, brk: 10, note: '50 min focus · 10 min break' },
  { id: 'marathon', label: 'Marathon',         focus: 90, brk: 20, note: '90 min focus · 20 min break' },
  { id: 'custom',   label: 'Custom',           focus: 30, brk: 5,  note: 'Set your own lengths' },
]

export const SCENES = [
  { id: 'rain',   name: 'Rainy night window', swatch: 'linear-gradient(160deg,#0b1226,#2a3b6b)', mix: { music: 0.55, rain: 0.6, waves: 0, fire: 0 } },
  { id: 'lamp',   name: 'Warm lamp room',     swatch: 'linear-gradient(160deg,#2a1b14,#8a5a3a)', mix: { music: 0.6, rain: 0, waves: 0, fire: 0.35 } },
  { id: 'forest', name: 'Forest morning',     swatch: 'linear-gradient(160deg,#cfe9d0,#4f9a6a)', mix: { music: 0.5, rain: 0, waves: 0.25, fire: 0 } },
  { id: 'city',   name: 'Sunset city',        swatch: 'linear-gradient(160deg,#ff9a76,#4b3a8c)', mix: { music: 0.65, rain: 0, waves: 0, fire: 0 } },
  { id: 'lake',   name: 'Starry lake',        swatch: 'linear-gradient(160deg,#05081a,#2c3f86)', mix: { music: 0.55, rain: 0, waves: 0.4, fire: 0 } },
  { id: 'ocean',  name: 'Calm ocean',         swatch: 'linear-gradient(160deg,#ffd9a8,#5fb0d8)', mix: { music: 0.45, rain: 0, waves: 0.7, fire: 0 } },
]

/* ───────────── state ───────────── */
const savedPrefs = load('jarvis_study_prefs', {
  presetId: 'classic', focus: 25, brk: 5, autoStart: false, task: '',
  scene: 'rain', mix: SCENES[0].mix, master: 0.7,
})
const savedStats = load('jarvis_study_stats', { days: {}, sessions: {}, total: 0 })

let state = {
  ...savedPrefs,
  phase: 'focus', remaining: savedPrefs.focus * 60, running: false, endAt: 0, cycle: 0,
  playing: false,
  yt: '', ytPlaying: false, ytError: '',
  stats: savedStats,
}
const listeners = new Set()
const emit = () => listeners.forEach(l => l())
const set = (patch) => {
  state = { ...state, ...patch }
  persistPrefs(); updateTitle(); emit()
}
const persistPrefs = () => {
  const { presetId, focus, brk, autoStart, task, scene, mix, master } = state
  save('jarvis_study_prefs', { presetId, focus, brk, autoStart, task, scene, mix, master })
}
const updateTitle = () => {
  if (typeof document === 'undefined') return
  if (state.running) document.title = `${fmtTime(state.remaining)} · ${state.phase === 'focus' ? 'Focus' : 'Break'} — JARVIS`
  else document.title = 'Jarvis'
}
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l) }
const snapshot = () => state
export const useStudy = () => useSyncExternalStore(subscribe, snapshot, snapshot)

/* ───────────── stats ───────────── */
let unsaved = 0
let lastTick = 0

/* send focus minutes to the backend (Dashboard "Focus time" chart) — batched, retried if it fails */
let pendingSync = 0
let syncing = false
const trySync = async (force) => {
  if (syncing || (!force && pendingSync < 60)) return
  if (typeof localStorage === 'undefined' || !localStorage.getItem('token')) { pendingSync = 0; return }
  const sec = pendingSync
  const mins = Math.round((sec / 60) * 100) / 100
  if (mins < 0.5) return
  syncing = true; pendingSync = 0
  try {
    const r = await api.logStudy(mins, state.task || null)
    if (r && r.detail) pendingSync += sec
  } catch { pendingSync += sec }
  syncing = false
}

const flushStats = (force = true) => {
  if (unsaved <= 0) { trySync(force); return }
  const added = unsaved
  pendingSync += added
  const k = dayKey()
  const stats = {
    ...state.stats,
    days: { ...state.stats.days, [k]: (state.stats.days[k] || 0) + unsaved },
    total: (state.stats.total || 0) + unsaved,
  }
  unsaved = 0
  state = { ...state, stats }
  save('jarvis_study_stats', stats)
  emit()
  trySync(force)
}
const addSession = () => {
  const k = dayKey()
  const stats = { ...state.stats, sessions: { ...state.stats.sessions, [k]: (state.stats.sessions[k] || 0) + 1 } }
  state = { ...state, stats }
  save('jarvis_study_stats', stats)
}
export const statsFor = (stats, d = new Date()) => {
  const k = dayKey(d)
  return { seconds: stats.days[k] || 0, sessions: stats.sessions[k] || 0 }
}

/* ───────────── timer ───────────── */
let interval = null
const startTicking = () => {
  if (interval) return
  lastTick = Date.now()
  interval = setInterval(tick, 250)
}
const stopTicking = () => { clearInterval(interval); interval = null }

function tick() {
  if (!state.running) return stopTicking()
  const now = Date.now()
  const rem = Math.max(0, Math.ceil((state.endAt - now) / 1000))
  if (state.phase === 'focus') {
    unsaved += (now - lastTick) / 1000
    if (unsaved >= 10) flushStats(false)
  }
  lastTick = now
  if (rem !== state.remaining) set({ remaining: rem })
  if (rem <= 0) completePhase()
}

function completePhase() {
  chime()
  flushStats()
  if (state.phase === 'focus') {
    addSession()
    const cycle = state.cycle + 1
    const remaining = state.brk * 60
    set({ phase: 'break', cycle, remaining, running: state.autoStart, endAt: Date.now() + remaining * 1000 })
  } else {
    const remaining = state.focus * 60
    set({ phase: 'focus', remaining, running: state.autoStart, endAt: Date.now() + remaining * 1000 })
  }
  lastTick = Date.now()
  if (!state.running) stopTicking()
}

/* ───────────── audio engine ───────────── */
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12)
const CHORDS = [
  { bass: 41, notes: [53, 57, 60, 64] }, // Fmaj7
  { bass: 40, notes: [52, 55, 59, 62] }, // Em7
  { bass: 38, notes: [50, 53, 57, 60] }, // Dm7
  { bass: 36, notes: [48, 52, 55, 59] }, // Cmaj7
  { bass: 45, notes: [52, 57, 60, 64] }, // Am7
  { bass: 38, notes: [50, 53, 57, 60] }, // Dm7
  { bass: 43, notes: [55, 59, 62, 64] }, // G6
  { bass: 36, notes: [48, 52, 55, 59] }, // Cmaj7
]
const PENTA = [72, 74, 76, 79, 81, 84]
const BAR = 7
const LEVEL_SCALE = { music: 1, rain: 0.55, waves: 0.9, fire: 0.7 }

const engine = {
  ctx: null, master: null, chans: {}, musicBus: null, padFilter: null,
  nextT: 0, chordIdx: 0, timer: null, suspendTimer: null,

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const ctx = (this.ctx = new AC())
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination)
    const chan = (name) => { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.master); this.chans[name] = g; return g }

    const white = this.noise(ctx, 'white'), brown = this.noise(ctx, 'brown')
    const loop = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s }

    // rain
    const rain = chan('rain')
    const rs = loop(white), rhp = ctx.createBiquadFilter(), rlp = ctx.createBiquadFilter()
    rhp.type = 'highpass'; rhp.frequency.value = 900; rlp.type = 'lowpass'; rlp.frequency.value = 9000
    rs.connect(rhp); rhp.connect(rlp); rlp.connect(rain)
    const rr = loop(brown), rrg = ctx.createGain(); rrg.gain.value = 0.25; rr.connect(rrg); rrg.connect(rain)

    // waves (slow swell)
    const waves = chan('waves')
    const ws = loop(brown), wlp = ctx.createBiquadFilter(), wg = ctx.createGain()
    wlp.type = 'lowpass'; wlp.frequency.value = 700; wg.gain.value = 0.55
    const lfo = ctx.createOscillator(), lfoAmt = ctx.createGain()
    lfo.frequency.value = 0.09; lfoAmt.gain.value = 0.4; lfo.connect(lfoAmt); lfoAmt.connect(wg.gain); lfo.start()
    ws.connect(wlp); wlp.connect(wg); wg.connect(waves)

    // fireplace crackle + hum
    const fire = chan('fire')
    const fs = loop(this.sparse(ctx, 0.004, 4)), fbp = ctx.createBiquadFilter()
    fbp.type = 'bandpass'; fbp.frequency.value = 2200; fbp.Q.value = 0.6
    fs.connect(fbp); fbp.connect(fire)
    const fh = loop(brown), fhl = ctx.createBiquadFilter(), fhg = ctx.createGain()
    fhl.type = 'lowpass'; fhl.frequency.value = 220; fhg.gain.value = 0.5; fh.connect(fhl); fhl.connect(fhg); fhg.connect(fire)

    // music bus (pad + plucks + echo + vinyl crackle)
    const music = chan('music')
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 1; this.musicBus.connect(music)
    this.padFilter = ctx.createBiquadFilter(); this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 1100
    this.padFilter.connect(this.musicBus)
    const delay = ctx.createDelay(1.5); delay.delayTime.value = 0.43
    const fb = ctx.createGain(); fb.gain.value = 0.38
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 1800
    const wet = ctx.createGain(); wet.gain.value = 0.55
    delay.connect(dlp); dlp.connect(fb); fb.connect(delay); dlp.connect(wet); wet.connect(this.musicBus)
    this.delay = delay
    const vs = loop(this.sparse(ctx, 0.0007, 4)), vhp = ctx.createBiquadFilter(), vg = ctx.createGain()
    vhp.type = 'highpass'; vhp.frequency.value = 2500; vg.gain.value = 0.045
    vs.connect(vhp); vhp.connect(vg); vg.connect(this.musicBus)
  },

  noise(ctx, type) {
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 } else d[i] = w * 0.6
    }
    return buf
  },
  sparse(ctx, density, secs) {
    const len = ctx.sampleRate * secs, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() < density ? (Math.random() * 2 - 1) * (0.4 + Math.random() * 0.6) : 0
    return buf
  },

  apply(s) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    Object.keys(this.chans).forEach(k => this.chans[k].gain.setTargetAtTime((s.mix[k] || 0) * LEVEL_SCALE[k], t, 0.15))
    this.master.gain.setTargetAtTime(s.playing ? s.master : 0, t, s.playing ? 0.3 : 0.25)
  },

  play(s) {
    clearTimeout(this.suspendTimer)
    this.ensure()
    if (!this.ctx) return
    this.apply(s)
    if (!this.timer) {
      this.nextT = this.ctx.currentTime + 0.15
      this.timer = setInterval(() => this.schedule(), 250)
      this.schedule()
    }
  },
  pause(s) {
    if (!this.ctx) return
    this.apply(s)
    clearInterval(this.timer); this.timer = null
    this.suspendTimer = setTimeout(() => { if (!state.playing && this.ctx) this.ctx.suspend() }, 1200)
  },

  schedule() {
    const ctx = this.ctx
    while (this.nextT < ctx.currentTime + 1.5) { this.bar(this.nextT); this.nextT += BAR }
  },
  bar(t) {
    const ctx = this.ctx, ch = CHORDS[this.chordIdx % CHORDS.length]
    this.chordIdx++
    // pad
    ch.notes.forEach((n, i) => {
      ;[['triangle', -5], ['sine', 6]].forEach(([type, det]) => {
        const o = ctx.createOscillator(), g = ctx.createGain()
        o.type = type; o.frequency.value = midi(n); o.detune.value = det + i
        g.gain.setValueAtTime(0.0001, t)
        g.gain.linearRampToValueAtTime(0.034, t + 1.8)
        g.gain.setValueAtTime(0.034, t + BAR - 0.4)
        g.gain.linearRampToValueAtTime(0.0001, t + BAR + 2.2)
        o.connect(g); g.connect(this.padFilter)
        o.start(t); o.stop(t + BAR + 2.4)
      })
    })
    // bass
    const b = ctx.createOscillator(), bg = ctx.createGain()
    b.type = 'sine'; b.frequency.value = midi(ch.bass)
    bg.gain.setValueAtTime(0.0001, t); bg.gain.linearRampToValueAtTime(0.11, t + 0.6)
    bg.gain.linearRampToValueAtTime(0.0001, t + BAR + 0.8)
    b.connect(bg); bg.connect(this.musicBus); b.start(t); b.stop(t + BAR + 1)
    // soft plucks
    const count = 3 + Math.floor(Math.random() * 3)
    for (let i = 0; i < count; i++) {
      const at = t + 0.8 + Math.random() * (BAR - 1.4)
      const n = PENTA[Math.floor(Math.random() * PENTA.length)]
      this.pluck(at, n)
    }
  },
  pluck(t, n) {
    const ctx = this.ctx
    ;['triangle', 'sine'].forEach((type, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = type; o.frequency.value = midi(n) * (i ? 2 : 1)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(i ? 0.012 : 0.05, t + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6)
      o.connect(g); g.connect(this.musicBus); g.connect(this.delay)
      o.start(t); o.stop(t + 2.8)
    })
  },
}

function chime() {
  try {
    engine.ensure()
    const ctx = engine.ctx
    if (!ctx) return
    const out = ctx.createGain(); out.gain.value = 0.18; out.connect(ctx.destination)
    ;[659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * 0.22
      o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 1.7)
    })
  } catch {}
}

/* ───────────── YouTube (optional, your own music) ───────────── */
export const parseYouTube = (url) => {
  const u = String(url || '').trim()
  if (!u) return null
  const list = u.match(/[?&]list=([A-Za-z0-9_-]+)/)
  const vid = u.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/)
  if (list && !vid) return `https://www.youtube.com/embed/videoseries?list=${list[1]}&autoplay=1&loop=1&playsinline=1&rel=0`
  if (vid) return `https://www.youtube.com/embed/${vid[1]}?autoplay=1&loop=1&playsinline=1&rel=0&playlist=${vid[1]}${list ? `&list=${list[1]}` : ''}`
  return null
}

/* ───────────── actions ───────────── */
export const study = {
  // timer
  start() {
    engine.ensure() // unlock audio inside the click so the end-of-session chime can play
    const remaining = state.remaining > 0 ? state.remaining : (state.phase === 'focus' ? state.focus : state.brk) * 60
    set({ running: true, remaining, endAt: Date.now() + remaining * 1000 })
    startTicking()
  },
  pause() {
    const remaining = Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000))
    set({ running: false, remaining }); flushStats(); stopTicking()
  },
  toggle() { state.running ? study.pause() : study.start() },
  reset() { flushStats(); stopTicking(); set({ running: false, phase: 'focus', remaining: state.focus * 60 }) },
  skip() {
    flushStats()
    const toBreak = state.phase === 'focus'
    const remaining = (toBreak ? state.brk : state.focus) * 60
    set({ phase: toBreak ? 'break' : 'focus', remaining, endAt: Date.now() + remaining * 1000 })
  },
  setPreset(id) {
    const p = PRESETS.find(x => x.id === id); if (!p) return
    const focus = id === 'custom' ? state.focus : p.focus, brk = id === 'custom' ? state.brk : p.brk
    stopTicking(); flushStats()
    set({ presetId: id, focus, brk, running: false, phase: 'focus', remaining: focus * 60 })
  },
  setCustom(focus, brk) {
    focus = Math.max(1, Math.min(240, Math.round(focus) || 1)); brk = Math.max(1, Math.min(60, Math.round(brk) || 1))
    stopTicking(); flushStats()
    set({ presetId: 'custom', focus, brk, running: false, phase: 'focus', remaining: focus * 60 })
  },
  setTask(task) { set({ task }) },
  setAutoStart(v) { set({ autoStart: v }) },

  // sound
  togglePlay() {
    const playing = !state.playing
    state = { ...state, playing }
    if (playing) engine.play(state); else engine.pause(state)
    set({ playing })
  },
  setMix(key, value) { const mix = { ...state.mix, [key]: value }; state = { ...state, mix }; engine.apply(state); set({ mix }) },
  setMaster(master) { state = { ...state, master }; engine.apply(state); set({ master }) },
  setScene(id) {
    const sc = SCENES.find(s => s.id === id); if (!sc) return
    state = { ...state, scene: id, mix: { ...sc.mix } }; engine.apply(state)
    set({ scene: id, mix: { ...sc.mix } })
  },
  playYouTube(url) {
    const src = parseYouTube(url)
    if (!src) return set({ ytError: 'That doesn’t look like a YouTube link.' })
    set({ yt: src, ytPlaying: true, ytError: '' })
  },
  stopYouTube() { set({ yt: '', ytPlaying: false }) },

  resetStats() { stopTicking(); unsaved = 0; const stats = { days: {}, sessions: {}, total: 0 }; save('jarvis_study_stats', stats); set({ stats }) },
}

if (typeof window !== 'undefined') window.addEventListener('beforeunload', flushStats)
