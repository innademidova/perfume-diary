// Асистент-підбирач: рекомендації ароматів поза щоденником.
import { useEffect, useState } from 'react'
import { supabase, callAI, formatDate, type Perfume } from './lib'
import { Icon } from './ui'
import { TwoWays, QUEUE_HINT } from './ai'
import { findSame } from './Extra'
import { go } from './App'

export type RecItem = {
  name: string; brand: string; year: number | null; family: string | null; concentration: string | null
  fragrantica_url: string; fragrantica_id: string | null; image_url: string | null
  top_notes: string[]; heart_notes: string[]; base_notes: string[]
  why: string; risk: string | null; match: 'high' | 'medium' | 'low'
}
export type RecRequest = {
  id: string; query: string; perfume_id: string | null; status: 'queued' | 'done'
  items: RecItem[]; created_at: string; done_at: string | null
}

const IDEAS = [
  'Something like Ambre Latte, but that won’t get boring',
  'Warm boozy perfume for winter, no powder',
  'Juicy pear or cherry, not too sweet, up to 100 ₴/ml',
  'Fresh but not citrus — for summer heat',
]
const MATCH: Record<string, string> = { high: 'great match', medium: 'worth a try', low: 'a gamble' }

export function Discover({ perfumes, basePerfume, onAdded }: {
  perfumes: Perfume[]; basePerfume?: Perfume; onAdded: (p: Perfume) => void
}) {
  const [query, setQuery] = useState('')
  const [history, setHistory] = useState<RecRequest[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.from('recommend_requests').select('*').order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setHistory((data ?? []) as RecRequest[]))
  }, [])

  const canAsk = !!query.trim() || !!basePerfume
  const now = async () => {
    setBusy(true); setErr('')
    try {
      const r = await callAI<RecRequest>({ action: 'recommend', query: query.trim(), perfume_id: basePerfume?.id ?? null })
      setHistory(h => [r, ...(h ?? [])]); setQuery('')
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }
  const later = async () => {
    const q = query.trim() || (basePerfume ? `Similar to ${basePerfume.brand ?? ''} ${basePerfume.name}`.trim() : '')
    const { data, error } = await supabase.from('recommend_requests')
      .insert({ query: q, perfume_id: basePerfume?.id ?? null }).select().single()
    if (error) { setErr(error.message); return }
    setHistory(h => [data as RecRequest, ...(h ?? [])]); setQuery('')
  }
  const remove = async (id: string) => {
    await supabase.from('recommend_requests').delete().eq('id', id)
    setHistory(h => (h ?? []).filter(x => x.id !== id))
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Discover</h1>
          <p className="muted small">new perfumes picked for my taste</p>
        </div>
      </header>

      <section className="card forecast">
        <h2>{basePerfume ? `Similar to ${basePerfume.name}` : 'What are you looking for?'}</h2>
        <textarea rows={3} value={query} onChange={e => setQuery(e.target.value)}
          placeholder={basePerfume ? 'Any extra wishes? e.g. for spring, cheaper, less sweet' : 'Describe it in your own words — notes, mood, season, a perfume it should resemble, price…'} />
        {!basePerfume && !query && (
          <div className="chips">{IDEAS.map(x => <button key={x} type="button" className="chip" onClick={() => setQuery(x)}>{x}</button>)}</div>
        )}
        {canAsk && <TwoWays now={now} later={later} busy={busy} nowLabel="Find now" />}
        {busy && <p className="muted small">Searching the web and checking against your diary — about 30–60 seconds…</p>}
        {err && <p className="error">{err}</p>}
        <p className="muted small">Search costs a bit more than a forecast (~3–5¢), the queue is free.</p>
      </section>

      {history?.map(r => <RecResult key={r.id} req={r} perfumes={perfumes} onAdded={onAdded} onRemove={() => remove(r.id)} />)}
    </>
  )
}

function RecResult({ req, perfumes, onAdded, onRemove }: {
  req: RecRequest; perfumes: Perfume[]; onAdded: (p: Perfume) => void; onRemove: () => void
}) {
  const [adding, setAdding] = useState<string | null>(null)

  const add = async (it: RecItem) => {
    setAdding(it.name)
    let photo_path: string | null = null
    if (it.fragrantica_id) {
      try { photo_path = (await callAI<{ path: string }>({ action: 'image', fragrantica_id: it.fragrantica_id })).path } catch { /* без фото */ }
    }
    const { data, error } = await supabase.from('perfumes').insert({
      name: it.name, brand: it.brand || null, year: it.year, family: it.family, concentration: it.concentration,
      top_notes: it.top_notes ?? [], heart_notes: it.heart_notes ?? [], base_notes: it.base_notes ?? [],
      status: 'wishlist', currency: '₴', volume_ml: null, tried_on: null, photo_path,
      reason_source: 'ai', reason_note: it.why, links: it.fragrantica_url ? [{ url: it.fragrantica_url, label: 'Fragrantica' }] : [],
    }).select().single()
    setAdding(null)
    if (error) alert(error.message); else onAdded(data as Perfume)
  }

  return (
    <section className="card rec">
      <div className="rec-head">
        <div>
          <b>{req.query}</b>
          <div className="muted small">{formatDate(req.created_at.slice(0, 10))}</div>
        </div>
        <button className="btn-icon" onClick={onRemove} aria-label="Remove"><Icon name="close" /></button>
      </div>
      {req.status === 'queued' ? (
        <><p className="queued">⏳ In the queue</p><p className="muted small">{QUEUE_HINT}</p></>
      ) : req.items.length === 0 ? (
        <p className="muted">Nothing found this time.</p>
      ) : (
        <ul className="rec-list">
          {req.items.map((it, i) => {
            const have = findSame(perfumes, it.brand, it.name)
            return (
              <li key={i}>
                {it.image_url ? <img src={it.image_url} alt="" /> : <div className="thumb thumb-empty">{it.name.charAt(0)}</div>}
                <div className="rec-body">
                  <span className={`pill match-${it.match}`}>{MATCH[it.match] ?? it.match}</span>
                  <b className="prow-name">{it.name}</b>
                  <div className="muted small">{[it.brand, it.family, it.year].filter(Boolean).join(' · ')}</div>
                  <p className="small">{it.why}</p>
                  {it.risk && <p className="small rec-risk">⚠︎ {it.risk}</p>}
                  {[...(it.top_notes ?? []), ...(it.heart_notes ?? []), ...(it.base_notes ?? [])].length > 0 && (
                    <div className="chips">
                      {[...it.top_notes, ...it.heart_notes, ...it.base_notes].slice(0, 9).map(n => (
                        <button key={n} className="chip" onClick={() => go(`/n/${encodeURIComponent(n)}`)}>{n}</button>
                      ))}
                    </div>
                  )}
                  <div className="row">
                    {have
                      ? <button className="btn sm" onClick={() => go(`/p/${have.id}`)}>In my diary ✓</button>
                      : <button className="btn primary sm" disabled={adding === it.name} onClick={() => add(it)}>
                          <Icon name="bookmark" /> {adding === it.name ? 'Adding…' : 'Want to try'}
                        </button>}
                    {it.fragrantica_url && <a className="btn ghost sm" href={it.fragrantica_url} target="_blank" rel="noopener noreferrer">Fragrantica</a>}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
