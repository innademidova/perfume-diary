// Bulk-add perfumes from a JSON file (used for notebook entries and shop screenshots).
//   node scripts/add-perfumes.mjs perfumes.json
// Each item: { name, brand, status: "decant"|"wishlist"|..., fragrantica_id? | image? (path or URL),
//   family?, concentration?, top_notes[], heart_notes[], base_notes[], rating? (0–5), price_per_ml?, review?, … }
// Photo: image or https://fimgs.net/mdimg/perfume/o.<fragrantica_id>.jpg; flattened onto white.
// Duplicates (same brand + name) are skipped. Check the photos visually before importing!
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient('https://eyczhhvxuofvfeoqwfbg.supabase.co', 'sb_publishable_cwDfk3jZoFSZAnyAsO2kjQ_zmUNoXog',
  { auth: { persistSession: false } })
const { error: le } = await sb.auth.signInWithPassword({ email: env.PERFUME_EMAIL, password: env.PERFUME_PASSWORD })
if (le) throw le
const { data: { user } } = await sb.auth.getUser()
const { data: existing } = await sb.from('perfumes').select('name, brand')
const key = (b, n) => `${b ?? ''}|${n}`.toLowerCase()
const have = new Set(existing.map(e => key(e.brand, e.name)))

async function imageBuffer(e) {
  const src = e.image ?? (e.fragrantica_id ? `https://fimgs.net/mdimg/perfume/o.${e.fragrantica_id}.jpg` : null)
  if (!src) return null
  const raw = /^https?:/.test(src)
    ? Buffer.from(await (await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0' } })).arrayBuffer())
    : readFileSync(src)
  return sharp(raw).flatten({ background: '#ffffff' }).resize(1400, 1400, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()
}

let added = 0
for (const e of JSON.parse(readFileSync(process.argv[2], 'utf8'))) {
  if (have.has(key(e.brand, e.name))) { console.log('skip duplicate:', e.brand, e.name); continue }
  const { fragrantica_id, image, ...row } = e
  let photo_path = null
  const buf = await imageBuffer(e).catch(err => { console.log('no photo for', e.name, err.message); return null })
  if (buf) {
    photo_path = `${user.id}/${crypto.randomUUID()}.jpg`
    const up = await sb.storage.from('photos').upload(photo_path, buf, { contentType: 'image/jpeg' })
    if (up.error) { console.log('photo upload failed', e.name); photo_path = null }
  }
  const wish = (row.status ?? 'decant') === 'wishlist'
  const { error } = await sb.from('perfumes').insert({
    status: 'decant', currency: '₴', volume_ml: wish ? null : 3, tried_on: null, links: [], ...row, photo_path,
  })
  if (error) console.log('FAILED', e.name, error.message); else { added++; have.add(key(e.brand, e.name)) }
}
console.log('added:', added)
