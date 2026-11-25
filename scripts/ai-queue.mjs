// Обробка черги ІІ через Claude Code.
//   node scripts/ai-queue.mjs export <file.json>  — вивантажує чергу та весь контекст щоденника
//   node scripts/ai-queue.mjs apply  <file.json>  — записує готові прогнози / профіль
// Формат файла для apply:
//   { "profile": { "profile": "...", "loves": [], "avoids": [] } | null,
//     "lookups": [{ "perfume_id": "...", "name": "", "brand": "", "year": 2020, "perfumer": "", "concentration": "EDP",
//                   "family": "", "top_notes": [], "heart_notes": [], "base_notes": [], "fragrantica_id": "12345" }],
//     "imports_done": [{ "id": "...", "result": "added 5, skipped 2 duplicates" }],   (perfumes themselves → scripts/add-perfumes.mjs)
//     "recommendations": [{ "id": "...", "items": [{ name, brand, year, family, concentration, fragrantica_url,
//        fragrantica_id, top_notes, heart_notes, base_notes, why (UA), risk (UA|null), match: high|medium|low }] }],
//     "terms": [{ "id": "...", "kind": "note", "smell": "...", "description": "..." }],
//     "predictions": [{ "perfume_id": "...", "rating": 2.5, "confidence": "medium",
//                       "summary": "...", "likes": [], "risks": [] }] }
// Логін береться з .env.local (PERFUME_EMAIL, PERFUME_PASSWORD) — файл не потрапляє в git.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient('https://eyczhhvxuofvfeoqwfbg.supabase.co', 'sb_publishable_cwDfk3jZoFSZAnyAsO2kjQ_zmUNoXog',
  { auth: { persistSession: false } })
const { error: le } = await sb.auth.signInWithPassword({ email: env.PERFUME_EMAIL, password: env.PERFUME_PASSWORD })
if (le) throw le

const [cmd, file] = process.argv.slice(2)
const strip = p => Object.fromEntries(Object.entries(p).filter(([k, v]) =>
  !['user_id', 'photo_path', 'created_at', 'updated_at', 'favorite', 'currency', 'volume_ml'].includes(k)
  && v != null && !(Array.isArray(v) && !v.length)))

if (cmd === 'export') {
  const [{ data: perfumes }, { data: terms }, { data: predictions }, { data: profile }, { data: imports }] = await Promise.all([
    sb.from('perfumes').select('*'), sb.from('terms').select('*'),
    sb.from('predictions').select('*'), sb.from('taste_profile').select('*').maybeSingle(),
    sb.from('import_requests').select('*').eq('status', 'queued'),
  ])
  const { data: recs } = await sb.from('recommend_requests').select('*').eq('status', 'queued')
  // мова й ім'я з Settings: усі тексти (прогнози, профіль, пояснення, підбірки) писати цією мовою
  const { data: settings } = await sb.from('user_settings').select('ai_language, display_name').maybeSingle()
  // фото з черги зберігаємо поруч із файлом контексту, щоб їх можна було переглянути
  const imgDir = join(dirname(file), 'imports'); mkdirSync(imgDir, { recursive: true })
  const importItems = []
  for (const r of imports ?? []) {
    const { data: blob } = await sb.storage.from('photos').download(r.image_path)
    const local = join(imgDir, `${r.id}.jpg`)
    if (blob) writeFileSync(local, Buffer.from(await blob.arrayBuffer()))
    importItems.push({ id: r.id, target_status: r.target_status, image: local })
  }
  const rated = perfumes.filter(p => p.status !== 'wishlist' && p.rating != null)
  const queue = predictions.filter(x => x.status === 'queued')
  const out = {
    ai_language: settings?.ai_language ?? 'Ukrainian',
    display_name: settings?.display_name ?? null,
    profile_requested: !!profile?.refresh_requested,
    current_profile: profile,
    rated_count: rated.length,
    queue: queue.map(q => strip(perfumes.find(p => p.id === q.perfume_id))),
    // чернетки: знайти точну версію на Fragrantica, ноти та фото (fragrantica_id)
    // фото/скріншоти: розпізнати аромати, додати через scripts/add-perfumes.mjs (пропускаючи дублікати), потім imports_done
    imports: importItems,
    // підбір ароматів поза щоденником: 5–8 варіантів (див. CLAUDE.md), результати → "recommendations"
    recommend: (recs ?? []).map(r => ({ id: r.id, query: r.query,
      based_on: r.perfume_id ? strip(perfumes.find(p => p.id === r.perfume_id) ?? {}) : null })),
    diary_names: perfumes.map(p => `${p.brand ?? ''} ${p.name}`.trim()),
    // ноти, які треба пояснити українською (паспорт ноти)
    terms_to_explain: terms.filter(t => t.ai_status === 'queued').map(t => ({ id: t.id, name: t.name })),
    lookups: perfumes.filter(p => p.lookup_status === 'queued').map(p => ({ perfume_id: p.id, name: p.name, brand: p.brand, status: p.status })),
    rated: rated.map(strip),
    glossary: terms.map(t => ({ name: t.name, kind: t.kind, smell: t.smell, description: t.description })),
    past_predictions: predictions.filter(x => x.status === 'done').map(x => {
      const p = perfumes.find(y => y.id === x.perfume_id)
      return { name: p?.name, predicted: x.rating, actual: p?.rating ?? null }
    }),
  }
  writeFileSync(file, JSON.stringify(out, null, 1))
  console.log(`language: ${out.ai_language}, recommend: ${out.recommend.length}, imports: ${out.imports.length}, notes to explain: ${out.terms_to_explain.length}, lookups: ${out.lookups.length}, queue: ${queue.length}, profile requested: ${out.profile_requested}, rated: ${rated.length} → ${file}`)
} else if (cmd === 'apply') {
  const res = JSON.parse(readFileSync(file, 'utf8'))
  if (res.profile) {
    const { count } = await sb.from('perfumes').select('*', { count: 'exact', head: true })
      .neq('status', 'wishlist').not('rating', 'is', null)
    const { error } = await sb.from('taste_profile').upsert({
      ...res.profile, based_on: count, refresh_requested: false, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    console.log('profile:', error?.message ?? 'saved')
  }
  const { data: { user } } = await sb.auth.getUser()
  for (const l of res.lookups ?? []) {
    const { perfume_id, fragrantica_id, ...fields } = l
    let photo_path
    if (fragrantica_id) {
      const r = await fetch(`https://fimgs.net/mdimg/perfume/o.${fragrantica_id}.jpg`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (r.ok) {
        photo_path = `${user.id}/${crypto.randomUUID()}.jpg`
        const up = await sb.storage.from('photos').upload(photo_path, await r.arrayBuffer(), { contentType: 'image/jpeg' })
        if (up.error) { console.log('photo upload failed', up.error.message); photo_path = undefined }
      }
    }
    const { error } = await sb.from('perfumes').update({ ...fields, ...(photo_path ? { photo_path } : {}), lookup_status: null }).eq('id', perfume_id)
    console.log('lookup', fields.name, error?.message ?? (photo_path ? 'saved with photo' : 'saved'))
  }
  for (const t of res.terms ?? []) {
    const { id, ...fields } = t
    const { error } = await sb.from('terms').update({ ...fields, ai_status: null }).eq('id', id)
    console.log('term', id, error?.message ?? 'saved')
  }
  for (const r of res.recommendations ?? []) {
    const items = r.items.map(it => ({ ...it, image_url: it.fragrantica_id ? `https://fimgs.net/mdimg/perfume/o.${it.fragrantica_id}.jpg` : null }))
    const { error } = await sb.from('recommend_requests').update({ status: 'done', items, done_at: new Date().toISOString() }).eq('id', r.id)
    console.log('recommendation', r.id, error?.message ?? `${items.length} items`)
  }
  for (const r of res.imports_done ?? []) {
    const { error } = await sb.from('import_requests').update({ status: 'done', result: r.result ?? null }).eq('id', r.id)
    console.log('import', r.id, error?.message ?? 'done')
  }
  for (const p of res.predictions ?? []) {
    const { error } = await sb.from('predictions').update({
      status: 'done', rating: p.rating, confidence: p.confidence, summary: p.summary,
      likes: p.likes ?? [], risks: p.risks ?? [], done_at: new Date().toISOString(),
    }).eq('perfume_id', p.perfume_id)
    console.log('prediction', p.perfume_id, error?.message ?? 'saved')
  }
} else {
  console.log('usage: node scripts/ai-queue.mjs export|apply <file.json>')
}
