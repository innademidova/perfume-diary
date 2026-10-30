// Обробка черги ІІ через Claude Code.
//   node scripts/ai-queue.mjs export <file.json>  — вивантажує чергу та весь контекст щоденника
//   node scripts/ai-queue.mjs apply  <file.json>  — записує готові прогнози / профіль
// Формат файла для apply:
//   { "profile": { "profile": "...", "loves": [], "avoids": [] } | null,
//     "predictions": [{ "perfume_id": "...", "rating": 2.5, "confidence": "medium",
//                       "summary": "...", "likes": [], "risks": [] }] }
// Логін береться з .env.local (PERFUME_EMAIL, PERFUME_PASSWORD) — файл не потрапляє в git.
import { readFileSync, writeFileSync } from 'node:fs'
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
  const [{ data: perfumes }, { data: terms }, { data: predictions }, { data: profile }] = await Promise.all([
    sb.from('perfumes').select('*'), sb.from('terms').select('*'),
    sb.from('predictions').select('*'), sb.from('taste_profile').select('*').maybeSingle(),
  ])
  const rated = perfumes.filter(p => p.status !== 'wishlist' && p.rating != null)
  const queue = predictions.filter(x => x.status === 'queued')
  const out = {
    profile_requested: !!profile?.refresh_requested,
    current_profile: profile,
    rated_count: rated.length,
    queue: queue.map(q => strip(perfumes.find(p => p.id === q.perfume_id))),
    rated: rated.map(strip),
    glossary: terms.map(t => ({ name: t.name, kind: t.kind, smell: t.smell, description: t.description })),
    past_predictions: predictions.filter(x => x.status === 'done').map(x => {
      const p = perfumes.find(y => y.id === x.perfume_id)
      return { name: p?.name, predicted: x.rating, actual: p?.rating ?? null }
    }),
  }
  writeFileSync(file, JSON.stringify(out, null, 1))
  console.log(`queue: ${queue.length}, profile requested: ${out.profile_requested}, rated: ${rated.length} → ${file}`)
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
