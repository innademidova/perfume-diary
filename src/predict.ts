// Hints from my diary: similar perfumes and note statistics.
// A numeric note-based forecast was tested (leave-one-out): it is no better than my average rating,
// so we only show hints; forecasts are made by the AI using the review texts.
import type { Perfume } from './lib'

// Geographic and qualifying words that don't change what the note is
const ORIGINS = /\b(madagascar|madagascan|turkish|bulgarian|egyptian|indian|italian|amalfi|calabrian|haitian|java|virginia|virginian|damask|may|tunisian|sicilian|chinese|australian|mexican|provencal|somalian|absolute|oil|essence|extract|accord)\b/g

const SYNONYMS: Record<string, string> = {
  'orris root': 'iris', orris: 'iris',
  litchi: 'lychee',
  'tea rose': 'rose', 'pink rose': 'rose', 'rose water': 'rose',
  'jasmine sambac': 'jasmine', 'water jasmine': 'jasmine',
  'vanilla pod': 'vanilla', 'vanilla bean': 'vanilla', 'vanilla beans': 'vanilla',
  'white musk': 'musk', 'gray musk': 'musk',
  ambrox: 'ambroxan', ambrofix: 'ambroxan',
  'white cedar': 'cedar', cedarwood: 'cedar',
  'african orange flower': 'orange blossom', 'orange flower': 'orange blossom',
  olibanum: 'incense', frankincense: 'incense',
  'cacao pod': 'cacao', chocolate: 'cacao', cocoa: 'cacao',
  oakmoss: 'moss', 'mossy notes': 'moss',
  'green mandarin': 'mandarin', 'mandarin orange': 'mandarin',
  'bitter almond': 'almond', 'sweet almond': 'almond',
  'black cherry': 'cherry', 'dark cherry': 'cherry', 'sour cherry': 'cherry',
  passionfruit: 'passion fruit',
  'white freesia': 'freesia',
  'white heliotrope': 'heliotrope',
  'patchouli leaf': 'patchouli',
  'white amber': 'amber',
  'pistachio cream': 'pistachio',
  'cassis': 'blackcurrant', 'black currant': 'blackcurrant',
  'cashmere wood': 'cashmeran',
}

export function canon(note: string) {
  let n = note.toLowerCase().replace(/[™®]/g, '').replace(ORIGINS, '').replace(/\s+/g, ' ').trim()
  return SYNONYMS[n] ?? n
}

const notesOf = (p: Perfume) => [...new Set([...p.top_notes, ...p.heart_notes, ...p.base_notes].map(canon).filter(Boolean))]

export type NoteStat = { note: string; n: number; avg: number; score: number }

export type Model = {
  mean: number
  rated: Perfume[]
  notes: Map<string, NoteStat>
  idf: Map<string, number>
}

const SHRINK = 2 // how many "virtual average ratings" we add so a single perfume doesn't drive conclusions

export function buildModel(perfumes: Perfume[]): Model {
  const rated = perfumes.filter(p => p.status !== 'wishlist' && p.rating != null)
  const mean = rated.length ? rated.reduce((s, p) => s + p.rating!, 0) / rated.length : 2.5
  const acc = new Map<string, number[]>()
  const df = new Map<string, number>()
  const all = perfumes
  for (const p of all) for (const n of notesOf(p)) df.set(n, (df.get(n) ?? 0) + 1)
  for (const p of rated) for (const n of notesOf(p)) acc.set(n, [...(acc.get(n) ?? []), p.rating!])
  const notes = new Map<string, NoteStat>()
  for (const [note, rs] of acc) {
    const sum = rs.reduce((a, b) => a + b, 0)
    notes.set(note, { note, n: rs.length, avg: sum / rs.length, score: (sum + SHRINK * mean) / (rs.length + SHRINK) })
  }
  const idf = new Map<string, number>()
  for (const [n, d] of df) idf.set(n, Math.log(1 + all.length / d))
  return { mean, rated, notes, idf }
}

function similarity(m: Model, a: Perfume, b: Perfume) {
  const A = notesOf(a), B = new Set(notesOf(b))
  if (!A.length || !B.size) return 0
  const w = (n: string) => m.idf.get(n) ?? Math.log(1 + m.rated.length)
  let inter = 0, na = 0, nb = 0
  for (const n of A) { na += w(n) ** 2; if (B.has(n)) inter += w(n) ** 2 }
  for (const n of B) nb += w(n) ** 2
  let sim = inter / Math.sqrt(na * nb)
  if (a.family && b.family && a.family === b.family) sim += 0.08
  if (a.brand && b.brand && a.brand === b.brand) sim += 0.04
  return Math.min(1, sim)
}

export type Clues = {
  similar: { perfume: Perfume; sim: number }[]
  notes: (NoteStat & { delta: number })[]   // notes of this perfume that already appeared in rated ones
}

export function clues(m: Model, p: Perfume): Clues {
  const similar = m.rated
    .filter(r => r.id !== p.id)
    .map(r => ({ perfume: r, sim: similarity(m, p, r) }))
    .filter(s => s.sim > 0.25)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 4)
  const notes = notesOf(p)
    .map(n => m.notes.get(n))
    .filter((x): x is NoteStat => !!x)
    .map(x => ({ ...x, delta: x.score - m.mean }))
    .sort((a, b) => b.n - a.n)
  return { similar, notes }
}

// Notes with enough data for conclusions — for the Insights page
export function noteInsights(m: Model) {
  const sig = [...m.notes.values()].filter(x => x.n >= 3)
  return {
    loved: sig.filter(x => x.score >= m.mean + 0.3).sort((a, b) => b.score - a.score).slice(0, 8),
    avoid: sig.filter(x => x.score <= m.mean - 0.3).sort((a, b) => a.score - b.score).slice(0, 8),
  }
}
