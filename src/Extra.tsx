// Додавання за фото, зв'язки між ароматами та порівняння, паспорт ноти.
import { useMemo, useState } from 'react'
import {
  supabase, callAI, compressImage, allNotes, norm, money, STATUSES, SEASONS, LONGEVITY, SILLAGE,
  type Perfume, type Term, type Candidate,
} from './lib'
import { Stars, Thumb, Icon, Meter, usePhotoUrls } from './ui'
import { TwoWays, QUEUE_HINT, useAI } from './ai'
import { canon, buildModel } from './predict'
import { go, back } from './App'

export type PerfumeLink = { id: string; a: string; b: string; kind: string; note: string | null; created_at: string }
export const LINK_KINDS: Record<string, string> = { similar: 'Similar', alternative: 'Alternative', twin: 'Twin' }

// Однаковий аромат, навіть якщо бренд написано трохи інакше («By Kilian» / «Kilian», «D&G» / «Dolce & Gabbana»)
const clean = (s: string | null | undefined) => norm(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/^by /, '').replace(/&/g, ' and ').replace(/[^a-z0-9а-яіїєґ]+/g, ' ').trim()
// Назва без концентрації: «My Devotion Eau de Parfum Intense» ≈ «My Devotion» + «EDP Intense»
const bare = (s: string | null | undefined) => clean(s)
  .replace(/\b(eau de parfum|eau de toilette|eau de cologne|extrait de parfum|edp|edt|edc|parfum|extrait|intense)\b/g, ' ')
  .replace(/\s+/g, ' ').trim()
export function findSame(perfumes: Perfume[], brand: string, name: string) {
  const b = clean(brand), n = clean(name)
  return perfumes.find(p => {
    const pn = clean(p.name), pb = clean(p.brand)
    const nameMatch = pn === n || pn.replace(pb, '').trim() === n.replace(b, '').trim()
      || (bare(name) !== '' && bare(p.name) === bare(name))
    const brandMatch = !b || !pb || pb === b || pb.includes(b) || b.includes(pb)
    return nameMatch && brandMatch
  })
}

const toBase64 = (blob: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(String(r.result).split(',')[1])
  r.onerror = rej
  r.readAsDataURL(blob)
})

// ---------- Додавання за фото / скріншотом ----------

type Item = {
  brand: string; name: string; concentration: string | null; price_per_ml: number | null
  rating10: number | null; review: string | null
  pick: boolean; dup?: Perfume
  candidates?: Candidate[]; chosen?: number   // -1 = додати лише з назвою
}

export function ImportScreen({ perfumes, initialStatus, onAdded }: {
  perfumes: Perfume[]; initialStatus: string; onAdded: (p: Perfume) => void
}) {
  const [status, setStatus] = useState(initialStatus === 'wishlist' ? 'wishlist' : 'decant')
  const [files, setFiles] = useState<File[]>([])
  const [step, setStep] = useState<'pick' | 'review' | 'confirm' | 'done'>('pick')
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [added, setAdded] = useState(0)
  const wish = status === 'wishlist'
  const home = wish ? '/wishlist' : '/'

  const upd = (i: number, patch: Partial<Item>) => setItems(xs => xs.map((x, j) => j === i ? { ...x, ...patch } : x))

  const recognize = async () => {
    setError('')
    const found: Item[] = []
    try {
      for (let i = 0; i < files.length; i++) {
        setBusy(`Reading photo ${i + 1} of ${files.length}…`)
        const image = await toBase64(await compressImage(files[i]))
        const r = await callAI<{ items: Omit<Item, 'pick'>[] }>({ action: 'scan', image, media_type: 'image/jpeg' })
        for (const it of r.items ?? []) {
          if (!it.name) continue
          if (found.some(f => clean(f.brand) === clean(it.brand) && clean(f.name) === clean(it.name))) continue
          const dup = findSame(perfumes, it.brand, it.name)
          found.push({ ...it, pick: !dup, dup })
        }
      }
      setItems(found)
      setStep('review')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }

  // Безкоштовний шлях: фото йдуть у чергу, Claude Code розпізнає їх на комп'ютері
  const queue = async () => {
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      for (let i = 0; i < files.length; i++) {
        setBusy(`Uploading photo ${i + 1} of ${files.length}…`)
        const path = `${user!.id}/imports/${crypto.randomUUID()}.jpg`
        const up = await supabase.storage.from('photos').upload(path, await compressImage(files[i]), { contentType: 'image/jpeg' })
        if (up.error) throw up.error
        const { error } = await supabase.from('import_requests').insert({ image_path: path, target_status: status })
        if (error) throw error
      }
      setStep('done'); setAdded(-1)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }

  const findDetails = async () => {
    setError('')
    const picked = items.map((x, i) => [x, i] as const).filter(([x]) => x.pick)
    for (let k = 0; k < picked.length; k++) {
      const [it, i] = picked[k]
      setBusy(`Looking up ${k + 1} of ${picked.length}: ${it.brand} ${it.name}…`)
      try {
        const r = await callAI<{ candidates: Candidate[] }>({ action: 'lookup', query: `${it.brand} ${it.name} ${it.concentration ?? ''}`.trim() })
        upd(i, { candidates: r.candidates, chosen: r.candidates.length ? 0 : -1 })
      } catch { upd(i, { candidates: [], chosen: -1 }) }
    }
    setBusy('')
    setStep('confirm')
  }

  const save = async () => {
    setError('')
    let n = 0
    const picked = items.filter(x => x.pick)
    for (let k = 0; k < picked.length; k++) {
      const it = picked[k]
      setBusy(`Saving ${k + 1} of ${picked.length}…`)
      const c = it.chosen != null && it.chosen >= 0 ? it.candidates?.[it.chosen] : undefined
      let photo_path: string | null = null
      if (c?.fragrantica_id) {
        try { photo_path = (await callAI<{ path: string }>({ action: 'image', fragrantica_id: c.fragrantica_id })).path } catch { /* без фото */ }
      }
      const known = perfumes.find(p => p.brand && clean(p.brand) === clean(c?.brand ?? it.brand))?.brand
      const row = {
        name: c?.name || it.name, brand: known ?? (c?.brand || it.brand || null),
        year: c?.year ?? null, perfumer: c?.perfumer ?? null, family: c?.family ?? null,
        concentration: c?.concentration ?? it.concentration ?? null,
        top_notes: c?.top_notes ?? [], heart_notes: c?.heart_notes ?? [], base_notes: c?.base_notes ?? [],
        price_per_ml: it.price_per_ml, currency: '₴', status, volume_ml: wish ? null : 3, tried_on: null,
        rating: it.rating10 != null ? Math.round(it.rating10) / 2 : null, review: it.review, photo_path, links: [],
      }
      const { data, error } = await supabase.from('perfumes').insert(row).select().single()
      if (error) { setError(error.message); continue }
      onAdded(data as Perfume); n++
    }
    setAdded(n); setBusy(''); setStep('done')
  }

  const picked = items.filter(x => x.pick).length

  return (
    <div className="form">
      <header className="form-head">
        <button type="button" className="btn ghost" onClick={() => back(home)}>{step === 'done' ? 'Close' : 'Cancel'}</button>
        <h1>Add from photo</h1>
        <span style={{ width: 64 }} />
      </header>
      {error && <p className="error">{error}</p>}
      {busy && <p className="queued">⏳ {busy}</p>}

      {step === 'pick' && (
        <>
          <div className="segmented">
            <button type="button" className={!wish ? 'on' : ''} onClick={() => setStatus('decant')}>I have them</button>
            <button type="button" className={wish ? 'on' : ''} onClick={() => setStatus('wishlist')}>Want to try</button>
          </div>
          <section className="card">
            <p className="muted small">A shop screenshot, a wishlist, bottles on a shelf or a notebook page. You can pick several photos.</p>
            <label className="photo-pick">
              <div className="photo-empty"><Icon name="camera" /><span>{files.length ? `${files.length} photo(s) selected` : 'Choose photos'}</span></div>
              <input type="file" accept="image/*" multiple onChange={e => setFiles([...(e.target.files ?? [])])} />
            </label>
            {files.length > 0 && !busy && <TwoWays now={recognize} later={queue} busy={!!busy} nowLabel="Recognize now" />}
          </section>
        </>
      )}

      {step === 'review' && (
        <section className="card">
          <h2>Found {items.length}</h2>
          {items.length === 0 && <p className="muted">Nothing recognized. Try a clearer photo.</p>}
          <ul className="import-list">
            {items.map((it, i) => (
              <li key={i} className={it.pick ? '' : 'off'}>
                <input type="checkbox" checked={it.pick} onChange={e => upd(i, { pick: e.target.checked })} />
                <div className="import-fields">
                  <input value={it.brand} onChange={e => upd(i, { brand: e.target.value })} placeholder="Brand" />
                  <input value={it.name} onChange={e => upd(i, { name: e.target.value })} placeholder="Name" />
                  <div className="muted small">
                    {[it.concentration, it.price_per_ml != null && `${money(it.price_per_ml, '₴')}/ml`, it.rating10 != null && `${it.rating10}/10`].filter(Boolean).join(' · ')}
                    {it.dup && <span className="pill">already in diary: {it.dup.name}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {picked > 0 && !busy && (
            <>
              <button className="btn primary" onClick={findDetails}><Icon name="spark" /> Find notes & photos for {picked}</button>
              <p className="muted small">Web search for each perfume, about 1–3¢ each.</p>
            </>
          )}
        </section>
      )}

      {step === 'confirm' && (
        <section className="card">
          <h2>Check the versions</h2>
          <ul className="candidates">
            {items.filter(x => x.pick).map(it => {
              const i = items.indexOf(it)
              const c = it.chosen != null && it.chosen >= 0 ? it.candidates?.[it.chosen] : undefined
              return (
                <li key={i} className="confirm-row">
                  {c?.image_url ? <img src={c.image_url} alt="" /> : <div className="thumb thumb-empty">{it.name.charAt(0)}</div>}
                  <div>
                    <b>{c?.name ?? it.name}</b>
                    <div className="muted small">{[c?.brand ?? it.brand, c?.concentration, c?.year].filter(Boolean).join(' · ')}</div>
                    {(it.candidates?.length ?? 0) > 0 && (
                      <select value={it.chosen ?? -1} onChange={e => upd(i, { chosen: Number(e.target.value) })}>
                        {it.candidates!.map((x, j) => <option key={j} value={j}>{x.name}{x.year ? ` (${x.year})` : ''}</option>)}
                        <option value={-1}>None of these — add with name only</option>
                      </select>
                    )}
                    {!it.candidates?.length && <div className="muted small">Not found — will be added with name only</div>}
                  </div>
                </li>
              )
            })}
          </ul>
          {!busy && <button className="btn primary wide" onClick={save}>Add {picked} to {wish ? 'Want to try' : 'Perfumes'}</button>}
        </section>
      )}

      {step === 'done' && (
        <section className="card">
          {added === -1
            ? <><p>📮 Photos are in the queue.</p><p className="muted small">{QUEUE_HINT}</p></>
            : <p>✨ Added {added} perfume{added === 1 ? '' : 's'}.</p>}
          <button className="btn primary" onClick={() => location.replace('#' + home)}>Open {wish ? 'Want to try' : 'Perfumes'}</button>
        </section>
      )}
    </div>
  )
}

// ---------- Зв'язки «схожий / альтернатива / близнюк» ----------

export function LinksCard({ perfume: p, perfumes, links, onLinksChange }: {
  perfume: Perfume; perfumes: Perfume[]; links: PerfumeLink[]; onLinksChange: (l: PerfumeLink[]) => void
}) {
  const mine = links.filter(l => l.a === p.id || l.b === p.id)
  const others = mine.map(l => ({ link: l, other: perfumes.find(x => x.id === (l.a === p.id ? l.b : l.a)) }))
    .filter((x): x is { link: PerfumeLink; other: Perfume } => !!x.other)
  const urls = usePhotoUrls(others.map(x => x.other.photo_path))
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('similar')
  const [note, setNote] = useState('')

  const matches = useMemo(() => {
    const s = clean(q)
    if (!s) return []
    return perfumes.filter(x => x.id !== p.id && !others.some(o => o.other.id === x.id)
      && clean(`${x.brand} ${x.name}`).includes(s)).slice(0, 6)
  }, [q, perfumes, p.id, others])

  const add = async (other: Perfume) => {
    const { data, error } = await supabase.from('perfume_links')
      .insert({ a: p.id, b: other.id, kind, note: note.trim() || null }).select().single()
    if (error) { alert(error.message); return }
    onLinksChange([...links, data as PerfumeLink])
    setAdding(false); setQ(''); setNote('')
  }
  const remove = async (id: string) => {
    if (!confirm('Remove this link?')) return
    await supabase.from('perfume_links').delete().eq('id', id)
    onLinksChange(links.filter(l => l.id !== id))
  }

  return (
    <section className="card">
      <h2>Similar & alternatives</h2>
      {others.length === 0 && !adding && <p className="muted small">Link perfumes that remind you of each other, then compare them side by side.</p>}
      <ul className="link-list">
        {others.map(({ link, other }) => (
          <li key={link.id}>
            <button className="prow" onClick={() => go(`/p/${other.id}`)}>
              <Thumb url={other.photo_path ? urls[other.photo_path] : undefined} name={other.name} />
              <div className="prow-body">
                <span className="pill">{LINK_KINDS[link.kind] ?? link.kind}</span>
                <span className="prow-name">{other.name}</span>
                <div className="muted small">{other.brand}</div>
                {other.rating != null && <Stars value={other.rating} size="sm" />}
                {link.note && <div className="small">{link.note}</div>}
              </div>
            </button>
            <div className="row">
              <button className="btn sm" onClick={() => go(`/compare/${p.id}/${other.id}`)}>Compare</button>
              <button className="btn ghost sm" onClick={() => remove(link.id)}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      {adding ? (
        <div className="link-add">
          <div className="chips">
            {Object.entries(LINK_KINDS).map(([k, v]) => (
              <button key={k} type="button" className={`chip${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>{v}</button>
            ))}
          </div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional), e.g. cheaper, almost the same" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search my diary…" autoFocus />
          <ul className="candidates">
            {matches.map(m => (
              <li key={m.id}><button type="button" onClick={() => add(m)}><b>{m.name}</b>&nbsp;<span className="muted small">{m.brand}</span></button></li>
            ))}
          </ul>
          <button className="btn ghost sm" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : (
        <button className="btn sm" onClick={() => setAdding(true)}><Icon name="plus" /> Link a perfume</button>
      )}
    </section>
  )
}

// ---------- Порівняння двох ароматів ----------

export function Compare({ a, b }: { a?: Perfume; b?: Perfume }) {
  const { predictions } = useAI()
  const urls = usePhotoUrls([a?.photo_path ?? null, b?.photo_path ?? null])
  if (!a || !b) return <div className="empty"><p>Perfume not found</p></div>
  const na = new Set(allNotes(a).map(canon)), nb = new Set(allNotes(b).map(canon))
  const shared = [...na].filter(n => nb.has(n))
  const only = (s: Set<string>, o: Set<string>) => [...s].filter(n => !o.has(n))

  const col = (p: Perfume, own: string[]) => {
    const pr = predictions.get(p.id)
    return (
      <div className="cmp-col">
        <button className="cmp-photo" onClick={() => go(`/p/${p.id}`)}>
          <Thumb url={p.photo_path ? urls[p.photo_path] : undefined} name={p.name} className="cmp-img" />
        </button>
        <p className="eyebrow">{p.brand}</p>
        <h2 className="cmp-name">{p.name}</h2>
        <div className="cmp-row">{p.rating != null
          ? <><Stars value={p.rating} size="sm" /> <b>{p.rating}</b></>
          : pr?.rating != null ? <span className="muted small">forecast ~{pr.rating}★</span> : <span className="muted small">not rated</span>}</div>
        <div className="cmp-row small">{STATUSES[p.status]}{p.price_per_ml != null && ` · ${money(p.price_per_ml, p.currency)}/ml`}</div>
        <div className="cmp-row small muted">{[p.family, p.concentration, p.year].filter(Boolean).join(' · ') || '—'}</div>
        {p.longevity && <div className="cmp-row"><Meter value={p.longevity} labels={LONGEVITY} /></div>}
        {p.sillage && <div className="cmp-row"><Meter value={p.sillage} labels={SILLAGE} /></div>}
        {p.seasons.length > 0 && <div className="cmp-row small">{p.seasons.map(s => SEASONS[s]).join(', ')}</div>}
        {own.length > 0 && <div className="chips">{own.map(n => <button key={n} className="chip" onClick={() => go(`/n/${encodeURIComponent(n)}`)}>{n}</button>)}</div>}
        {p.review && <details><summary className="small muted">My review</summary><p className="review small">{p.review}</p></details>}
      </div>
    )
  }

  return (
    <article>
      <header className="form-head">
        <button className="btn ghost" onClick={() => back('/')}>Back</button>
        <h1>Compare</h1>
        <span style={{ width: 64 }} />
      </header>
      {shared.length > 0 && (
        <section className="card">
          <h2>Shared notes ({shared.length})</h2>
          <div className="chips">{shared.map(n => <button key={n} className="chip on" onClick={() => go(`/n/${encodeURIComponent(n)}`)}>{n}</button>)}</div>
        </section>
      )}
      <p className="muted small">Notes below are the ones each perfume has on its own.</p>
      <div className="cmp">
        {col(a, only(na, nb))}
        {col(b, only(nb, na))}
      </div>
    </article>
  )
}

// ---------- Паспорт ноти ----------

export function NotePassport({ note, perfumes, terms, onTerm, onFilter }: {
  note: string; perfumes: Perfume[]; terms: Term[]; onTerm: (t: Term) => void; onFilter: (note: string) => void
}) {
  const key = canon(note)
  const term = terms.find(t => canon(t.name) === key || norm(t.name) === norm(note))
  const withNote = perfumes.filter(p => allNotes(p).some(n => canon(n) === key))
  const rated = withNote.filter(p => p.status !== 'wishlist' && p.rating != null).sort((x, y) => y.rating! - x.rating!)
  const toRate = withNote.filter(p => p.status !== 'wishlist' && p.rating == null)
  const wish = withNote.filter(p => p.status === 'wishlist')
  const model = useMemo(() => buildModel(perfumes), [perfumes])
  const stat = model.notes.get(key)
  const urls = usePhotoUrls(withNote.map(p => p.photo_path))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Ноти, які найчастіше трапляються разом із цією
  const pairs = useMemo(() => {
    const m = new Map<string, number>()
    withNote.forEach(p => new Set(allNotes(p).map(canon)).forEach(n => { if (n !== key) m.set(n, (m.get(n) ?? 0) + 1) }))
    return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8)
  }, [withNote, key])

  const explain = async () => {
    setBusy(true); setErr('')
    try { onTerm(await callAI<Term>({ action: 'explain_note', note: key })) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }
  const queue = async () => {
    const { data, error } = await supabase.from('terms').insert({ name: key, kind: 'note', ai_status: 'queued' }).select().single()
    if (error) setErr(error.message); else onTerm(data as Term)
  }

  const section = (title: string, list: Perfume[]) => list.length > 0 && (
    <section className="card">
      <h2>{title} ({list.length})</h2>
      <ul className="plist compact">
        {list.map(p => (
          <li key={p.id}>
            <button className="prow" onClick={() => go(`/p/${p.id}`)}>
              <Thumb url={p.photo_path ? urls[p.photo_path] : undefined} name={p.name} />
              <div className="prow-body">
                <span className="prow-name">{p.name}</span>
                <div className="muted small">{p.brand}</div>
                {p.rating != null && <Stars value={p.rating} size="sm" />}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )

  return (
    <article className="passport">
      <header className="form-head">
        <button className="btn ghost" onClick={() => back('/')}>Back</button>
        <h1>Note</h1>
        <span style={{ width: 64 }} />
      </header>
      <p className="eyebrow">Note passport</p>
      <h1 className="detail-title">{key}</h1>

      <section className="card">
        <h2>What it smells like</h2>
        {term && (term as Term & { ai_status?: string }).ai_status === 'queued' ? (
          <><p className="queued">⏳ Waiting for Claude to explain it</p><p className="muted small">{QUEUE_HINT}</p></>
        ) : term?.smell || term?.description ? (
          <>
            {term.smell && <p className="review">{term.smell}</p>}
            {term.description && <p className="review muted">{term.description}</p>}
            <button className="btn ghost sm" onClick={() => go(`/t/${term.id}`)}>Open in glossary</button>
          </>
        ) : (
          <>
            <p className="muted small">Not in your glossary yet. Claude can explain what it smells like and where it's used — it will be saved to your glossary.</p>
            <TwoWays now={explain} later={queue} busy={busy} nowLabel="Explain now" />
          </>
        )}
        {err && <p className="error">{err}</p>}
      </section>

      <div className="stat-row">
        <div className="stat"><span className="stat-num">{stat ? stat.avg.toFixed(1) : '—'}</span><span className="muted small">my average ★</span></div>
        <div className="stat"><span className="stat-num">{rated.length}</span><span className="muted small">rated</span></div>
        <div className="stat"><span className="stat-num">{toRate.length + wish.length}</span><span className="muted small">to try</span></div>
      </div>
      {stat && stat.n >= 2 && (
        <p className={`note-verdict ${stat.score >= model.mean + 0.35 ? 'good' : stat.score <= model.mean - 0.35 ? 'bad' : ''}`}>
          {stat.score >= model.mean + 0.35 ? 'You usually like perfumes with this note.'
            : stat.score <= model.mean - 0.35 ? 'Perfumes with this note usually disappoint you.'
            : 'No clear pattern yet — this note alone doesn’t decide it for you.'}
        </p>
      )}

      {pairs.length > 0 && (
        <section className="card">
          <h2>Often paired with</h2>
          <div className="chips">
            {pairs.map(([n, c]) => <button key={n} className="chip" onClick={() => go(`/n/${encodeURIComponent(n)}`)}>{n} <small>×{c}</small></button>)}
          </div>
        </section>
      )}

      {section('Rated', rated)}
      {section('To rate', toRate)}
      {section('Want to try', wish)}

      <button className="btn" onClick={() => onFilter(key)}><Icon name="filter" /> Show in my list</button>
    </article>
  )
}
