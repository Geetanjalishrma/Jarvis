/**
 * palette.js — the four colour palettes from the Figma file (50 / 40 / 10 rule).
 * The chosen palette is set on <html data-palette="…"> so the whole app (including the
 * sign-in screen and "Study with me") follows it. It's remembered on this device and saved
 * to your account (so it follows you to another browser).
 */
export const PALETTES = [
  { key: 'terracotta', name: 'Terracotta Studio', colors: [
    { role: '50% background', name: 'Warm Porcelain', hex: '#FFF8EE' }, { role: '40% secondary', name: 'Terracotta', hex: '#6B3A2E' },
    { role: '10% accent', name: 'Ember', hex: '#E05A3F' }, { role: 'Text', name: 'Ink', hex: '#211A18' } ] },
  { key: 'plum', name: 'Plum Paper', colors: [
    { role: '50% background', name: 'Paper', hex: '#FBF5F0' }, { role: '40% secondary', name: 'Deep Plum', hex: '#59364E' },
    { role: '10% accent', name: 'Dusty Rose', hex: '#D85F78' }, { role: 'Text', name: 'Plum Ink', hex: '#211B20' } ] },
  { key: 'saffron', name: 'Saffron Clay', colors: [
    { role: '50% background', name: 'Soft Parchment', hex: '#FFF7E8' }, { role: '40% secondary', name: 'Clay', hex: '#68452D' },
    { role: '10% accent', name: 'Saffron', hex: '#E39A24' }, { role: 'Text', name: 'Charcoal', hex: '#211C17' } ] },
  { key: 'rosewood', name: 'Rosewood Coral', colors: [
    { role: '50% background', name: 'Ivory Blush', hex: '#FFF4ED' }, { role: '40% secondary', name: 'Rosewood', hex: '#643437' },
    { role: '10% accent', name: 'Coral', hex: '#F06D52' }, { role: 'Text', name: 'Warm Black', hex: '#211A1A' } ] },
]

const KEY = 'jarvis_palette'
export const getStoredPalette = () => {
  try { const p = localStorage.getItem(KEY); return PALETTES.some(x => x.key === p) ? p : 'terracotta' } catch { return 'terracotta' }
}
export const applyPalette = (key) => {
  const k = PALETTES.some(x => x.key === key) ? key : 'terracotta'
  document.documentElement.dataset.palette = k
  try { localStorage.setItem(KEY, k) } catch {}
  return k
}
