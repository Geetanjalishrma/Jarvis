/**
 * StudyScenes.jsx — the animated "study with me" backgrounds.
 * Every scene is drawn in SVG/CSS (no image files), so they load instantly and stay sharp
 * on any screen. A shared rain layer fades in whenever the Rain slider is up.
 */
import { useEffect, useRef } from 'react'

const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const Svg = ({ children, id }) => (
  <svg className={`sw-art sw-art-${id}`} viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">{children}</svg>
)

function skyline(seed, baseY, minH, maxH, fill, litChance, litColor) {
  const r = rng(seed); const out = []; let x = -20
  while (x < 1640) {
    const w = 50 + r() * 90, h = minH + r() * (maxH - minH)
    out.push(<rect key={`b${x}`} x={x} y={baseY - h} width={w} height={h + 400} fill={fill} />)
    if (litChance > 0) {
      for (let wy = baseY - h + 14; wy < baseY - 10; wy += 22) for (let wx = x + 10; wx < x + w - 14; wx += 20) {
        if (r() < litChance) out.push(<rect key={`w${x}-${wx}-${wy}`} x={wx} y={wy} width="8" height="11" rx="1.5" fill={litColor} opacity={0.55 + r() * 0.4} />)
      }
    }
    x += w + 3 + r() * 6
  }
  return out
}

function Rainy() {
  const r = rng(7)
  const bokeh = Array.from({ length: 46 }, (_, i) => ({ x: r() * 1600, y: 420 + r() * 380, rad: 8 + r() * 30, c: ['#ffb86b', '#ff6b9d', '#6bc1ff', '#fff2b0', '#9a91d6'][Math.floor(r() * 5)], d: r() * 6 }))
  return (
    <Svg id="rain">
      <defs>
        <linearGradient id="rg-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#080d1f" /><stop offset="1" stopColor="#233463" /></linearGradient>
        <radialGradient id="rg-lamp" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#ffcf8a" stopOpacity=".8" /><stop offset="1" stopColor="#ffcf8a" stopOpacity="0" /></radialGradient>
        <filter id="rg-blur"><feGaussianBlur stdDeviation="7" /></filter>
      </defs>
      <rect width="1600" height="900" fill="url(#rg-bg)" />
      <g filter="url(#rg-blur)">{skyline(11, 760, 120, 330, '#0b1226', 0.28, '#ffd98a')}</g>
      <g filter="url(#rg-blur)">{bokeh.map((b, i) => <circle key={i} className="sw-twinkle" style={{ animationDelay: `${b.d}s` }} cx={b.x} cy={b.y} r={b.rad} fill={b.c} opacity=".38" />)}</g>
      <g stroke="#060a18" strokeWidth="16" fill="none" opacity=".92"><rect x="40" y="30" width="1520" height="760" rx="10" /><path d="M800 30V790M40 410H1560" /></g>
      <rect y="770" width="1600" height="130" fill="#10162b" />
      <circle className="sw-glow" cx="250" cy="740" r="380" fill="url(#rg-lamp)" />
      <path d="M205 770 L225 650 L290 650 L310 770Z" fill="#e9b872" /><path d="M262 650 L262 560 L330 520" stroke="#2a3150" strokeWidth="8" fill="none" strokeLinecap="round" /><path d="M300 520 L360 500 L372 535 L318 548Z" fill="#f3c987" />
      <rect x="1250" y="725" width="90" height="70" rx="12" fill="#e8e4dc" /><path d="M1340 740 q38 4 30 30 q-6 22 -30 20" stroke="#e8e4dc" strokeWidth="10" fill="none" />
      <path className="sw-steam" d="M1280 715 q-14 -28 0 -52 q14 -24 0 -50" stroke="#ffffff" strokeOpacity=".35" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path className="sw-steam s2" d="M1310 715 q-14 -28 0 -52 q14 -24 0 -50" stroke="#ffffff" strokeOpacity=".3" strokeWidth="6" fill="none" strokeLinecap="round" />
    </Svg>
  )
}

function Lamp() {
  return (
    <Svg id="lamp">
      <defs>
        <linearGradient id="lm-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2b1c16" /><stop offset="1" stopColor="#5a3a29" /></linearGradient>
        <radialGradient id="lm-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#ffd08a" stopOpacity=".85" /><stop offset="1" stopColor="#ffd08a" stopOpacity="0" /></radialGradient>
        <linearGradient id="lm-night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#14213f" /><stop offset="1" stopColor="#2e4a7d" /></linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#lm-bg)" />
      <rect x="980" y="130" width="470" height="400" rx="14" fill="url(#lm-night)" stroke="#1b110d" strokeWidth="18" />
      <path d="M1215 130V530M980 330H1450" stroke="#1b110d" strokeWidth="12" />
      <circle cx="1330" cy="230" r="34" fill="#fff6d6" opacity=".92" />
      {Array.from({ length: 22 }, (_, i) => <circle key={i} className="sw-twinkle" style={{ animationDelay: `${(i * 0.37) % 4}s` }} cx={1000 + ((i * 97) % 430)} cy={150 + ((i * 53) % 160)} r="2" fill="#fff" />)}
      <rect x="120" y="170" width="560" height="14" fill="#2a1912" /><rect x="120" y="330" width="560" height="14" fill="#2a1912" />
      {[0, 1, 2, 3, 4, 5, 6].map(i => <rect key={i} x={140 + i * 76} y={90 + (i % 3) * 8} width="52" height={80 - (i % 3) * 8} fill={['#c9694f', '#6d8f7a', '#d9b36a', '#7b6fb3', '#b85c7a', '#5d86a8', '#cf8a54'][i]} />)}
      {[0, 1, 2, 3, 4, 5].map(i => <rect key={i} x={150 + i * 86} y={252 + (i % 2) * 6} width="60" height={78 - (i % 2) * 6} fill={['#d9b36a', '#c9694f', '#5d86a8', '#6d8f7a', '#7b6fb3', '#b85c7a'][i]} />)}
      <circle className="sw-glow" cx="560" cy="700" r="460" fill="url(#lm-glow)" />
      <rect y="760" width="1600" height="140" fill="#24150f" />
      <path d="M480 760 L505 640 L615 640 L640 760Z" fill="#f0c27d" /><path d="M560 640 V560 L650 505" stroke="#150c08" strokeWidth="10" fill="none" strokeLinecap="round" /><path d="M610 505 L700 475 L715 520 L634 540Z" fill="#ffd89a" />
      <path d="M1180 760 q-70 -160 0 -300 q70 140 0 300Z" fill="#2f5a3f" /><path d="M1180 760 q-120 -90 -150 -210 q130 20 150 210Z" fill="#3b7050" /><path d="M1180 760 q110 -100 130 -230 q-120 40 -130 230Z" fill="#2a4f38" />
      <rect x="1140" y="740" width="80" height="60" rx="8" fill="#a9684a" />
      <rect x="860" y="715" width="86" height="68" rx="12" fill="#efe9dd" /><path d="M946 730 q36 4 28 28 q-6 20 -28 18" stroke="#efe9dd" strokeWidth="10" fill="none" />
      <path className="sw-steam" d="M885 705 q-14 -28 0 -52 q14 -24 0 -50" stroke="#fff" strokeOpacity=".4" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path className="sw-steam s2" d="M918 705 q-14 -28 0 -52 q14 -24 0 -50" stroke="#fff" strokeOpacity=".32" strokeWidth="6" fill="none" strokeLinecap="round" />
    </Svg>
  )
}

function Forest() {
  const r = rng(21)
  const pines = (seed, y, hMin, hMax, fill) => { const q = rng(seed); const out = []; for (let x = -40; x < 1660; x += 40 + q() * 40) { const h = hMin + q() * (hMax - hMin), w = h * 0.38; out.push(<path key={`${seed}-${x}`} d={`M${x} ${y} L${x + w / 2} ${y - h} L${x + w} ${y}Z`} fill={fill} />) } return out }
  return (
    <Svg id="forest">
      <defs>
        <linearGradient id="fo-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6f1c9" /><stop offset=".55" stopColor="#b9dcb4" /><stop offset="1" stopColor="#6bb083" /></linearGradient>
        <radialGradient id="fo-sun" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#fffbd8" stopOpacity="1" /><stop offset="1" stopColor="#fff7bf" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#fo-bg)" />
      <circle className="sw-glow" cx="1150" cy="210" r="360" fill="url(#fo-sun)" />
      <g className="sw-rays" style={{ transformOrigin: '1150px 210px' }} opacity=".18">{Array.from({ length: 9 }, (_, i) => <path key={i} d={`M1150 210 L${700 + i * 120} 900 L${760 + i * 120} 900Z`} fill="#fffbd8" />)}</g>
      <g opacity=".55">{pines(3, 620, 160, 300, '#8fc39a')}</g>
      <rect className="sw-mist" y="470" width="1600" height="90" fill="#fff" opacity=".22" rx="45" />
      <g opacity=".85">{pines(5, 720, 220, 400, '#4f9a6a')}</g>
      <rect className="sw-mist m2" y="610" width="1600" height="80" fill="#fff" opacity=".2" rx="40" />
      <g>{pines(8, 830, 300, 560, '#2e6b47')}</g>
      <rect y="800" width="1600" height="100" fill="#1f4d33" />
      {Array.from({ length: 26 }, (_, i) => <circle key={i} className="sw-float" style={{ animationDelay: `${r() * 9}s`, animationDuration: `${9 + r() * 8}s` }} cx={r() * 1600} cy={300 + r() * 520} r={2 + r() * 3} fill="#fff7a8" />)}
    </Svg>
  )
}

function City() {
  const r = rng(33)
  return (
    <Svg id="city">
      <defs>
        <linearGradient id="ci-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a2b78" /><stop offset=".5" stopColor="#d9658a" /><stop offset="1" stopColor="#ffb67a" /></linearGradient>
        <radialGradient id="ci-sun" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#fff1c9" /><stop offset="1" stopColor="#ffd08a" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#ci-bg)" />
      <circle className="sw-glow" cx="800" cy="560" r="330" fill="url(#ci-sun)" />
      <circle cx="800" cy="560" r="96" fill="#fff0c4" />
      {[0, 1, 2, 3].map(i => <ellipse key={i} className="sw-cloud" style={{ animationDuration: `${60 + i * 25}s`, animationDelay: `${-i * 18}s` }} cx={200 + i * 380} cy={170 + (i % 2) * 90} rx={150 + r() * 60} ry={26} fill="#ffd6e0" opacity=".45" />)}
      <g opacity=".7">{skyline(4, 700, 100, 260, '#5b3f86', 0, '')}</g>
      <g>{skyline(9, 780, 90, 330, '#2a1f55', 0.3, '#ffd98a')}</g>
      <rect y="770" width="1600" height="130" fill="#1a1440" />
    </Svg>
  )
}

function Lake() {
  const r = rng(51)
  return (
    <Svg id="lake">
      <defs>
        <linearGradient id="lk-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#040616" /><stop offset="1" stopColor="#25387a" /></linearGradient>
        <radialGradient id="lk-moon" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#fff9de" stopOpacity=".9" /><stop offset="1" stopColor="#fff9de" stopOpacity="0" /></radialGradient>
        <linearGradient id="lk-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1a2a62" /><stop offset="1" stopColor="#0a1030" /></linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#lk-bg)" />
      {Array.from({ length: 170 }, (_, i) => <circle key={i} className="sw-twinkle" style={{ animationDelay: `${r() * 5}s` }} cx={r() * 1600} cy={r() * 480} r={0.6 + r() * 1.8} fill="#fff" />)}
      <circle className="sw-glow" cx="1180" cy="190" r="260" fill="url(#lk-moon)" />
      <circle cx="1180" cy="190" r="54" fill="#fffbe6" />
      <path d="M0 560 L180 400 L330 500 L520 330 L720 520 L900 420 L1100 540 L1300 380 L1450 500 L1600 430 V620 H0Z" fill="#0c1233" />
      <path d="M0 620 L240 500 L420 590 L640 470 L860 600 L1080 520 L1300 610 L1600 500 V680 H0Z" fill="#070b22" />
      <rect y="620" width="1600" height="280" fill="url(#lk-water)" />
      <ellipse cx="1180" cy="700" rx="46" ry="190" fill="#fff9de" opacity=".14" />
      {Array.from({ length: 14 }, (_, i) => <rect key={i} className="sw-shimmer" style={{ animationDelay: `${i * 0.4}s` }} x={1130 + (i % 2 ? 12 : -8)} y={640 + i * 18} width={70 - i * 3} height="3" rx="1.5" fill="#fff9de" opacity=".4" />)}
    </Svg>
  )
}

function Ocean() {
  const wave = (y, amp, fill, cls, op = 1) => <g className={`sw-wave ${cls}`} opacity={op}><path d={`M0 ${y} ${Array.from({ length: 9 }, (_, i) => `q200 ${i % 2 ? amp : -amp} 400 0`).join(' ')} V900 H0Z`} fill={fill} /></g>
  return (
    <Svg id="ocean">
      <defs>
        <linearGradient id="oc-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd9a8" /><stop offset=".5" stopColor="#bfe3f0" /><stop offset="1" stopColor="#7fc4e6" /></linearGradient>
        <radialGradient id="oc-sun" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#fff6dc" /><stop offset="1" stopColor="#ffe7b0" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#oc-bg)" />
      <circle className="sw-glow" cx="1050" cy="400" r="330" fill="url(#oc-sun)" />
      <circle cx="1050" cy="400" r="80" fill="#fff8e6" />
      {[0, 1, 2].map(i => <ellipse key={i} className="sw-cloud" style={{ animationDuration: `${70 + i * 30}s`, animationDelay: `${-i * 25}s` }} cx={250 + i * 520} cy={150 + i * 40} rx="170" ry="28" fill="#fff" opacity=".6" />)}
      {wave(520, 22, '#8fd0e8', 'w1', 0.75)}
      {wave(600, 26, '#58aedb', 'w2', 0.85)}
      {wave(690, 30, '#3a8fc4', 'w3')}
      {wave(790, 34, '#23699f', 'w4')}
    </Svg>
  )
}

export function RainLayer({ intensity }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current; if (!c || intensity <= 0.03) return
    const ctx = c.getContext('2d'); let raf, drops = []
    const size = () => { c.width = c.clientWidth; c.height = c.clientHeight; drops = Array.from({ length: Math.round(c.width / 5) }, () => mk(true)) }
    const mk = (rand) => ({ x: Math.random() * c.width, y: rand ? Math.random() * c.height : -20, l: 10 + Math.random() * 20, v: 9 + Math.random() * 9 })
    size()
    const ro = new ResizeObserver(size); ro.observe(c)
    const loop = () => {
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.strokeStyle = 'rgba(200,220,255,.45)'; ctx.lineWidth = 1.2; ctx.beginPath()
      const n = Math.round(drops.length * Math.min(1, intensity * 1.3))
      for (let i = 0; i < n; i++) { const d = drops[i]; ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 2, d.y + d.l); d.y += d.v; d.x -= 0.6; if (d.y > c.height) Object.assign(d, mk(false)) }
      ctx.stroke(); raf = requestAnimationFrame(loop)
    }
    loop()
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [intensity > 0.03])
  if (intensity <= 0.03) return null
  return <canvas ref={ref} className="sw-rain" style={{ opacity: Math.min(1, 0.35 + intensity) }} />
}

const MAP = { rain: Rainy, lamp: Lamp, forest: Forest, city: City, lake: Lake, ocean: Ocean }
export default function Scene({ id }) {
  const C = MAP[id] || Rainy
  return <C />
}
