import { createClient } from '@supabase/supabase-js'

// Публічний ключ: дані захищені правилами доступу в базі (RLS) і входом за паролем
export const supabase = createClient(
  'https://eyczhhvxuofvfeoqwfbg.supabase.co',
  'sb_publishable_cwDfk3jZoFSZAnyAsO2kjQ_zmUNoXog',
)

export type Perfume = {
  id: string
  name: string
  brand: string | null
  perfumer: string | null
  year: number | null
  concentration: string | null
  family: string | null
  top_notes: string[]
  heart_notes: string[]
  base_notes: string[]
  price_per_ml: number | null
  currency: string
  volume_ml: number | null
  status: string
  rating: number | null
  longevity: number | null
  sillage: number | null
  seasons: string[]
  daytime: string[]
  would_buy: string | null
  tried_on: string | null
  review: string | null
  photo_path: string | null
  favorite: boolean
  reason_source: string | null
  reason_note: string | null
  links: Link[]
  created_at: string
  updated_at: string
}

export type Link = { url: string; label: string }

export type Term = {
  id: string
  name: string
  kind: string
  smell: string | null
  description: string | null
  created_at: string
  updated_at: string
}

export const FAMILIES = [
  'Floral', 'Fruity Floral', 'Floral Aldehydic', 'Floral Chypre', 'Floral Amber', 'Amber (Oriental)',
  'Woody', 'Woody Spicy', 'Woody Amber', 'Chypre', 'Fougère', 'Citrus', 'Gourmand',
  'Leather', 'Green', 'Aquatic', 'Spicy', 'Musky', 'Powdery', 'Tobacco', 'Incense',
]

export const CONCENTRATIONS = ['EDC', 'EDT', 'EDP', 'Parfum', 'Extrait', 'Oil']

export const COMMON_NOTES = [
  'bergamot', 'lemon', 'mandarin', 'orange', 'grapefruit', 'neroli', 'petitgrain', 'yuzu',
  'pink pepper', 'black pepper', 'cardamom', 'saffron', 'cinnamon', 'clove', 'ginger', 'nutmeg',
  'rose', 'jasmine', 'tuberose', 'iris', 'violet', 'peony', 'magnolia', 'ylang-ylang', 'gardenia',
  'lily of the valley', 'orange blossom', 'lavender', 'mimosa', 'heliotrope', 'osmanthus', 'frangipani',
  'peach', 'pear', 'blackcurrant', 'raspberry', 'cherry', 'fig', 'apple', 'plum', 'coconut',
  'green tea', 'mint', 'basil', 'galbanum', 'violet leaf', 'tomato leaf',
  'sandalwood', 'cedar', 'vetiver', 'patchouli', 'oud', 'guaiac wood', 'birch', 'cashmeran',
  'amber', 'ambroxan', 'musk', 'vanilla', 'tonka bean', 'benzoin', 'incense', 'myrrh', 'labdanum',
  'leather', 'suede', 'tobacco', 'coffee', 'cacao', 'caramel', 'honey', 'praline', 'almond', 'rum',
  'sea notes', 'ozonic notes', 'aldehydes', 'oakmoss', 'orris root', 'castoreum', 'civet',
]

export const STATUSES: Record<string, string> = {
  decant: 'Decant', sample: 'Sample', bottle: 'Bottle', wishlist: 'Want to try',
}
// Статуси для ароматів, які вже спробувала (без «хочу спробувати»)
export const TRIED_STATUSES: Record<string, string> = {
  decant: 'Decant', sample: 'Sample', bottle: 'Bottle',
}
export const REASONS: Record<string, string> = {
  friend: 'Someone recommended it',
  reels: 'Instagram Reels',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  notes: 'I like the notes',
  review: 'Review or blog',
  store: 'Smelled it in a store',
  other: 'Other',
}
export const REASONS_SHORT: Record<string, string> = {
  friend: 'Recommended', reels: 'Reels', tiktok: 'TikTok', youtube: 'YouTube',
  notes: 'The notes', review: 'Review', store: 'Store', other: 'Other',
}

export const SEASONS: Record<string, string> = {
  spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter',
}
export const DAYTIME: Record<string, string> = { day: 'Day', evening: 'Evening' }
export const WOULD_BUY: Record<string, string> = {
  yes: 'Yes, I want a bottle', maybe: 'Maybe', no: 'No, the decant is enough',
}
export const TERM_KINDS: Record<string, string> = {
  molecule: 'Molecule', note: 'Note', accord: 'Accord', perfumer: 'Perfumer', term: 'Term',
}
export const LONGEVITY = ['', 'Very weak', 'Weak', 'Moderate', 'Long-lasting', 'Eternal']
export const SILLAGE = ['', 'Skin scent', 'Soft', 'Moderate', 'Strong', 'Enormous']

export const allNotes = (p: Perfume) => [...p.top_notes, ...p.heart_notes, ...p.base_notes]

export const norm = (s: string) => s.toLowerCase().replace(/[’ʼ`]/g, "'").trim()

// Термін зі словника згадується в ароматі, якщо його назва є в нотах або відгуку
export function mentions(p: Perfume, t: Term) {
  const name = norm(t.name)
  if (name.length < 2) return false
  const hay = norm([...allNotes(p), p.review ?? '', p.family ?? '', p.perfumer ?? ''].join(' | '))
  return hay.includes(name)
}

export function linkTitle(l: Link) {
  if (l.label.trim()) return l.label.trim()
  try { return new URL(l.url).hostname.replace(/^www\./, '') } catch { return l.url }
}

export function cleanLinks(links: Link[]): Link[] {
  return links
    .map(l => ({ url: l.url.trim(), label: l.label.trim() }))
    .filter(l => l.url)
    .map(l => ({ ...l, url: /^https?:\/\//i.test(l.url) ? l.url : `https://${l.url}` }))
}

export function money(v: number | null | undefined, cur: string) {
  if (v == null) return ''
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '')
  return `${s} ${cur}`
}

export function formatDate(d: string | null) {
  if (!d) return ''
  return new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

// --- Фото ---

const urlCache = new Map<string, { url: string; exp: number }>()

export async function photoUrls(paths: string[]) {
  const now = Date.now()
  const missing = paths.filter(p => !(urlCache.get(p)?.exp! > now))
  if (missing.length) {
    const { data } = await supabase.storage.from('photos').createSignedUrls(missing, 60 * 60 * 6)
    data?.forEach(d => {
      if (d.signedUrl && d.path) urlCache.set(d.path, { url: d.signedUrl, exp: now + 1000 * 60 * 60 * 5 })
    })
  }
  const out: Record<string, string> = {}
  paths.forEach(p => { const c = urlCache.get(p); if (c) out[p] = c.url })
  return out
}

// Зменшуємо фото з iPhone перед завантаженням: до 1400px по довшій стороні, JPEG
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const max = 1400
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((res, rej) =>
    canvas.toBlob(b => (b ? res(b) : rej(new Error('Could not process the photo'))), 'image/jpeg', 0.82),
  )
}

export async function uploadPhoto(file: File) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Please sign in again')
  const blob = await compressImage(file)
  const path = `${user.id}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw error
  return path
}

export async function removePhoto(path: string | null) {
  if (path) await supabase.storage.from('photos').remove([path])
}
