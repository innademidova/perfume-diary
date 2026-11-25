import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  supabase, allNotes, mentions, money, formatDate, norm, uploadPhoto, removePhoto, linkTitle, cleanLinks,
  FAMILIES, CONCENTRATIONS, COMMON_NOTES, STATUSES, TRIED_STATUSES, REASONS, REASONS_SHORT,
  SEASONS, DAYTIME, WOULD_BUY, LONGEVITY, SILLAGE, callAI,
  type Perfume, type Term, type Candidate,
} from './lib'
import { Stars, Scale, Meter, Chips, TagInput, Thumb, Field, Icon, LinksEditor, usePhotoUrls } from './ui'
import { go, back } from './App'
import { buildModel, clues, canon } from './predict'
import { ForecastCard, TwoWays, useAI, matchSignals } from './ai'

export type Mode = 'tried' | 'wishlist'

export type Filters = {
  q: string
  family: string
  brand: string
  status: string
  note: string
  minRating: number
  season: string
  source: string
  favorite: boolean
  toRate: boolean
  sort: 'new' | 'rating' | 'price' | 'name' | 'tried'
}
export const emptyFilters: Filters = {
  q: '', family: '', brand: '', status: '', note: '', minRating: 0, season: '', source: '', favorite: false, toRate: false, sort: 'new',
}

export const isWish = (p: Perfume) => p.status === 'wishlist'
// Owned but not rated yet
export const isToRate = (p: Perfume) => !isWish(p) && p.rating == null

// List view: grid or rows. Rows by default on phones, grid on wider screens
function useLayout(): ['grid' | 'list', (v: 'grid' | 'list') => void] {
  const [v, setV] = useState<'grid' | 'list'>(() => {
    try {
      const saved = localStorage.getItem('layout')
      if (saved === 'grid' || saved === 'list') return saved
    } catch { /* private mode */ }
    return window.matchMedia('(min-width: 700px)').matches ? 'grid' : 'list'
  })
  return [v, (x) => { setV(x); try { localStorage.setItem('layout', x) } catch { /* ignore */ } }]
}

const uniq = (xs: (string | null | undefined)[]) =>
  [...new Set(xs.filter((x): x is string => !!x && !!x.trim()))].sort((a, b) => a.localeCompare(b, 'uk'))

// ---------- List ----------

export function PerfumeList({ mode, perfumes: all, filters: f, setFilters }: {
  mode: Mode
  perfumes: Perfume[]
  filters: Filters
  setFilters: (f: Filters) => void
}) {
  const wish = mode === 'wishlist'
  const [showFilters, setShowFilters] = useState(false)
  const [layout, setLayout] = useLayout()
  const set = (patch: Partial<Filters>) => setFilters({ ...f, ...patch })

  const ownList = useMemo(() => all.filter(p => isWish(p) === wish), [all, wish])
  const toRateCount = useMemo(() => ownList.filter(isToRate).length, [ownList])
  const perfumes = useMemo(
    () => wish ? ownList : ownList.filter(p => isToRate(p) === f.toRate),
    [ownList, wish, f.toRate],
  )
  const families = useMemo(() => uniq(perfumes.map(p => p.family)), [perfumes])
  const brands = useMemo(() => uniq(perfumes.map(p => p.brand)), [perfumes])
  const notes = useMemo(() => uniq(perfumes.flatMap(allNotes)), [perfumes])
  const newPath = wish ? '/w/new' : '/p/new'

  const shown = useMemo(() => {
    const q = norm(f.q)
    const list = perfumes.filter(p => {
      if (q) {
        const hay = norm([p.name, p.brand, p.perfumer, p.family, p.review, p.reason_note, p.concentration, ...allNotes(p)].join(' '))
        if (!q.split(/\s+/).every(w => hay.includes(w))) return false
      }
      if (f.family && p.family !== f.family) return false
      if (f.brand && p.brand !== f.brand) return false
      if (f.status && p.status !== f.status) return false
      if (f.note && !allNotes(p).some(n => canon(n) === canon(f.note))) return false
      if (f.minRating && (p.rating ?? 0) < f.minRating) return false
      if (f.season && !p.seasons.includes(f.season)) return false
      if (f.source && p.reason_source !== f.source) return false
      if (f.favorite && !p.favorite) return false
      return true
    })
    const by: Record<Filters['sort'], (a: Perfume, b: Perfume) => number> = {
      new: (a, b) => b.created_at.localeCompare(a.created_at),
      rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
      price: (a, b) => (b.price_per_ml ?? -1) - (a.price_per_ml ?? -1),
      name: (a, b) => a.name.localeCompare(b.name, 'uk'),
      tried: (a, b) => (b.tried_on ?? '').localeCompare(a.tried_on ?? ''),
    }
    return list.sort(by[f.sort])
  }, [perfumes, f])

  const urls = usePhotoUrls(shown.map(p => p.photo_path))
  const active: [keyof Filters, string][] = []
  if (f.family) active.push(['family', f.family])
  if (f.brand) active.push(['brand', f.brand])
  if (f.status) active.push(['status', STATUSES[f.status]])
  if (f.note) active.push(['note', `note: ${f.note}`])
  if (f.minRating) active.push(['minRating', `${f.minRating}★ and up`])
  if (f.season) active.push(['season', SEASONS[f.season]])
  if (f.source) active.push(['source', REASONS_SHORT[f.source]])
  if (f.favorite) active.push(['favorite', 'favourites'])

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{wish ? 'Want to try' : 'Perfumes'}</h1>
          <p className="muted small">{perfumes.length ? `${shown.length} of ${perfumes.length}` : 'nothing here yet'}</p>
        </div>
        <div className="row">
          <button className="btn-icon" onClick={() => go(wish ? '/import/wishlist' : '/import')} aria-label="Add from photo" title="Add from photo"><Icon name="camera" /></button>
          <button className="btn-icon accent" onClick={() => go(newPath)} aria-label="Add perfume"><Icon name="plus" /></button>
        </div>
      </header>

      {!wish && (toRateCount > 0 || f.toRate) && (
        <div className="segmented">
          <button className={!f.toRate ? 'on' : ''} onClick={() => set({ toRate: false, minRating: 0 })}>
            Rated <span>{ownList.length - toRateCount}</span>
          </button>
          <button className={f.toRate ? 'on' : ''} onClick={() => set({ toRate: true, minRating: 0 })}>
            To rate <span>{toRateCount}</span>
          </button>
        </div>
      )}

      {perfumes.length > 0 && (
        <div className="toolbar">
          <div className="search">
            <Icon name="search" />
            <input type="search" placeholder={wish ? 'Name, brand, note, why…' : 'Name, brand, note, review…'}
              value={f.q} onChange={e => set({ q: e.target.value })} />
          </div>
          <button className="btn-icon" onClick={() => setLayout(layout === 'grid' ? 'list' : 'grid')}
            aria-label={layout === 'grid' ? 'Show as list' : 'Show as grid'} title={layout === 'grid' ? 'List' : 'Grid'}>
            <Icon name={layout === 'grid' ? 'list' : 'grid'} />
          </button>
          <button className={`btn-icon${showFilters || active.length ? ' on' : ''}`} onClick={() => setShowFilters(s => !s)} aria-label="Filters">
            <Icon name="filter" />{active.length > 0 && <span className="badge">{active.length}</span>}
          </button>
        </div>
      )}

      {showFilters && (
        <div className="filters card">
          <div className="grid2">
            <Field label="Family">
              <select value={f.family} onChange={e => set({ family: e.target.value })}>
                <option value="">all</option>
                {families.map(x => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Brand">
              <select value={f.brand} onChange={e => set({ brand: e.target.value })}>
                <option value="">all</option>
                {brands.map(x => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Note">
              <select value={f.note} onChange={e => set({ note: e.target.value })}>
                <option value="">any</option>
                {notes.map(x => <option key={x}>{x}</option>)}
              </select>
            </Field>
            {wish ? (
              <Field label="Found it via">
                <select value={f.source} onChange={e => set({ source: e.target.value })}>
                  <option value="">anywhere</option>
                  {Object.entries(REASONS_SHORT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            ) : (
              <>
                <Field label="Status">
                  <select value={f.status} onChange={e => set({ status: e.target.value })}>
                    <option value="">any</option>
                    {Object.entries(TRIED_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Season">
                  <select value={f.season} onChange={e => set({ season: e.target.value })}>
                    <option value="">any</option>
                    {Object.entries(SEASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                {!f.toRate && <Field label="Min rating">
                  <select value={f.minRating} onChange={e => set({ minRating: Number(e.target.value) })}>
                    <option value={0}>any</option>
                    {[2, 3, 3.5, 4, 4.5, 5].map(x => <option key={x} value={x}>{x} ★</option>)}
                  </select>
                </Field>}
              </>
            )}
            <Field label="Sort by">
              <select value={f.sort} onChange={e => set({ sort: e.target.value as Filters['sort'] })}>
                <option value="new">newest first</option>
                {!wish && <option value="tried">date tried</option>}
                {!wish && <option value="rating">rating</option>}
                {!wish && <option value="price">price per ml</option>}
                <option value="name">name</option>
              </select>
            </Field>
          </div>
          {!wish && (
            <label className="check">
              <input type="checkbox" checked={f.favorite} onChange={e => set({ favorite: e.target.checked })} /> Favourites only
            </label>
          )}
        </div>
      )}

      {active.length > 0 && (
        <div className="chips active-filters">
          {active.map(([k, label]) => (
            <button key={k} className="chip on" onClick={() => set({ [k]: emptyFilters[k] })}>{label} ×</button>
          ))}
          <button className="chip link" onClick={() => setFilters({ ...emptyFilters, sort: f.sort, toRate: f.toRate })}>clear all</button>
        </div>
      )}

      {perfumes.length === 0 ? (
        f.toRate ? (
          <div className="empty">
            <p className="big">Everything is rated</p>
            <p className="muted">Perfumes you own but haven't rated yet will show up here</p>
          </div>
        ) : wish ? (
          <div className="empty">
            <p className="big">Nothing on your list yet</p>
            <p className="muted">Save perfumes you've heard about: from a friend, a reel, or just because of the notes</p>
            <button className="btn primary" onClick={() => go(newPath)}>Add a perfume to try</button>
          </div>
        ) : (
          <div className="empty">
            <p className="big">Your perfumes will live here</p>
            <p className="muted">Start with the decant you're wearing right now</p>
            <button className="btn primary" onClick={() => go(newPath)}>Add your first perfume</button>
          </div>
        )
      ) : shown.length === 0 ? (
        <div className="empty"><p className="muted">Nothing found</p></div>
      ) : (
        <ul className={`plist ${layout}`}>
          {shown.map(p => (
            <li key={p.id}>
              <button className="prow" onClick={() => go(`/p/${p.id}`)}>
                <Thumb url={p.photo_path ? urls[p.photo_path] : undefined} name={p.name} />
                <div className="prow-body">
                  <div className="prow-title">
                    <span className="prow-name">{p.name}</span>
                    {p.favorite && <span className="fav-dot" aria-label="favourite">♥</span>}
                    {p.lookup_status === 'queued' && <span title="Waiting for Claude">⏳</span>}
                  </div>
                  <div className="muted small">{[p.brand, p.family].filter(Boolean).join(' · ')}</div>
                  <div className="prow-meta">
                    {wish ? (
                      <>
                        {p.reason_source && <span className="pill">{REASONS_SHORT[p.reason_source]}</span>}
                        {p.links.length > 0 && (
                          <span className="small muted with-icon"><Icon name="link" />{p.links.length === 1 ? '1 link' : `${p.links.length} links`}</span>
                        )}
                      </>
                    ) : (
                      <>
                        {p.rating != null ? <Stars value={p.rating} size="sm" /> : <span className="pill">to rate</span>}
                        {p.price_per_ml != null && <span className="small muted">{money(p.price_per_ml, p.currency)}/ml</span>}
                      </>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// ---------- Perfume card ----------

export function PerfumeDetail({ perfume: p, perfumes, terms, onChange, onDelete, onNote, children }: {
  children?: ReactNode
  perfume: Perfume
  perfumes: Perfume[]
  terms: Term[]
  onChange: (p: Perfume) => void
  onDelete: (id: string) => void
  onNote: (note: string, mode: Mode) => void
}) {
  const wish = isWish(p)
  const home = wish ? '/wishlist' : '/'
  const hint = useMemo(() => (wish || isToRate(p)) ? clues(buildModel(perfumes), p) : null, [perfumes, p, wish])
  const { profile } = useAI()
  const signals = useMemo(() => (wish || isToRate(p)) ? matchSignals(p, profile?.signals ?? []) : [], [p, wish, profile])
  const urls = usePhotoUrls([p.photo_path, ...(hint?.similar.map(s => s.perfume.photo_path) ?? [])])
  const related = terms.filter(t => mentions(p, t))
  const total = p.price_per_ml != null && p.volume_ml ? p.price_per_ml * p.volume_ml : null

  const toggleFav = async () => {
    const { data, error } = await supabase.from('perfumes').update({ favorite: !p.favorite }).eq('id', p.id).select().single()
    if (!error) onChange(data as Perfume)
  }
  const remove = async () => {
    if (!confirm(`Delete “${p.name}”? This can't be undone.`)) return
    const { error } = await supabase.from('perfumes').delete().eq('id', p.id)
    if (error) { alert(error.message); return }
    await removePhoto(p.photo_path)
    onDelete(p.id)
    back(home)
  }

  const pyramid: [string, string[]][] = [['Top', p.top_notes], ['Heart', p.heart_notes], ['Base', p.base_notes]]
  const hasPyramid = pyramid.some(([, n]) => n.length)
  const hasReason = !!(p.reason_source || p.reason_note)

  const reasonCard = hasReason && (
    <section className="card">
      <h2>{wish ? 'Why I want to try it' : 'Why I wanted to try it'}</h2>
      {p.reason_source && <span className="pill reason-pill">{REASONS[p.reason_source]}</span>}
      {p.reason_note && <p className="review">{p.reason_note}</p>}
    </section>
  )
  const linksCard = p.links.length > 0 && (
    <section className="card">
      <h2>{wish ? 'Where to try' : 'Links'}</h2>
      <ul className="links">
        {p.links.map((l, i) => (
          <li key={i}>
            <a href={l.url} target="_blank" rel="noopener noreferrer">
              <Icon name="link" /><span>{linkTitle(l)}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )

  return (
    <article className="detail">
      <div className="detail-bar">
        <button className="btn-icon glass" onClick={() => back(home)} aria-label="Back"><Icon name="back" /></button>
        <div className="row">
          {!wish && (
            <button className="btn-icon glass" onClick={toggleFav} aria-label="Favourite">
              <Icon name={p.favorite ? 'heart-fill' : 'heart'} />
            </button>
          )}
          <button className="btn-icon glass" onClick={() => go(`/p/${p.id}/edit`)} aria-label="Edit"><Icon name="edit" /></button>
        </div>
      </div>

      {p.photo_path && urls[p.photo_path]
        ? <img className="hero" src={urls[p.photo_path]} alt={p.name} />
        : <div className="hero hero-empty"><span>{p.name.charAt(0)}</span></div>}

      <div className="detail-body">
        {p.brand && <p className="eyebrow">{p.brand}</p>}
        <h1 className="detail-title">{p.name}</h1>
        {p.lookup_status === 'queued' && (
          <p className="ai-filled">⏳ Waiting for Claude to fill in brand, notes and photo</p>
        )}
        <p className="muted">{[p.concentration, p.year, p.perfumer && `by ${p.perfumer}`].filter(Boolean).join(' · ')}</p>

        {!wish && (
          <div className="detail-rating">
            {p.rating != null
              ? <><Stars value={p.rating} size="lg" /><span className="serif">{String(p.rating)}</span></>
              : <span className="muted">waiting for my rating</span>}
          </div>
        )}

        <div className="chips">
          <span className="pill">{STATUSES[p.status]}</span>
          {p.family && <span className="pill soft">{p.family}</span>}
        </div>

        {wish && (
          <button className="btn primary wide" onClick={() => go(`/p/${p.id}/tried`)}>
            <Icon name="check" /> I tried it
          </button>
        )}
        {isToRate(p) && (
          <button className="btn primary wide" onClick={() => go(`/p/${p.id}/edit`)}>
            <Icon name="edit" /> Rate it
          </button>
        )}

        <ForecastCard perfume={p} />

        {hint && (hint.similar.length > 0 || signals.length > 0) && (
          <section className="card">
            <h2>Clues from my diary</h2>
            {hint.similar.length > 0 && (
              <>
                <p className="muted small">Similar perfumes I've rated</p>
                <ul className="plist compact">
                  {hint.similar.map(({ perfume: s }) => (
                    <li key={s.id}>
                      <button className="prow" onClick={() => go(`/p/${s.id}`)}>
                        <Thumb url={s.photo_path ? urls[s.photo_path] : undefined} name={s.name} />
                        <div className="prow-body">
                          <span className="prow-name">{s.name}</span>
                          <div className="muted small">{s.brand}</div>
                          <Stars value={s.rating} size="sm" />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {signals.length > 0 && (
              <ul className="signals">
                {signals.map(s => (
                  <li key={s.title} className={`signal ${s.type}`}>
                    <span className="signal-dot">{s.type === 'red' ? '🔴' : '🟢'}</span>
                    <div>
                      <b>{s.title}</b>
                      <p className="small">{s.why}</p>
                      <p className="muted small">
                        {[...s.hitNotes, ...s.hitAccords.map(a => `${a} (accord)`)].join(', ')}
                        {s.examples?.length ? ` · like ${s.examples.join(', ')}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {wish && reasonCard}
        {wish && linksCard}

        {(hasPyramid || p.accords?.length > 0) && (
          <section className="card">
            <h2>Notes</h2>
            {pyramid.map(([label, notes]) => notes.length > 0 && (
              <div className="pyr-row" key={label}>
                <span className="pyr-label">{label}</span>
                <div className="chips">
                  {notes.map(n => <button key={n} className="chip" onClick={() => onNote(n, wish ? 'wishlist' : 'tried')}>{n}</button>)}
                </div>
              </div>
            ))}
            {p.accords?.length > 0 && (
              <div className="pyr-row">
                <span className="pyr-label">Accords</span>
                <div className="chips">{p.accords.map(a => <span key={a} className="chip accord">{a}</span>)}</div>
              </div>
            )}
            <p className="muted small">Tap a note to open its passport</p>
          </section>
        )}

        {(p.longevity || p.sillage || p.seasons.length > 0 || p.daytime.length > 0 || p.would_buy) && (
          <section className="card">
            <h2>Impression</h2>
            <dl className="facts">
              {p.longevity && <><dt>Longevity</dt><dd><Meter value={p.longevity} labels={LONGEVITY} /></dd></>}
              {p.sillage && <><dt>Sillage</dt><dd><Meter value={p.sillage} labels={SILLAGE} /></dd></>}
              {p.seasons.length > 0 && <><dt>Season</dt><dd>{p.seasons.map(s => SEASONS[s]).join(', ')}</dd></>}
              {p.daytime.length > 0 && <><dt>Time</dt><dd>{p.daytime.map(s => DAYTIME[s]).join(', ')}</dd></>}
              {p.would_buy && <><dt>Bottle?</dt><dd>{WOULD_BUY[p.would_buy]}</dd></>}
            </dl>
          </section>
        )}

        {p.review && (
          <section className="card">
            <h2>My review</h2>
            <p className="review">{p.review}</p>
          </section>
        )}

        {!wish && linksCard}
        {!wish && reasonCard}

        {related.length > 0 && (
          <section className="card">
            <h2>From my glossary</h2>
            <ul className="term-mini">
              {related.map(t => (
                <li key={t.id}>
                  <button onClick={() => go(`/t/${t.id}`)}>
                    <strong>{t.name}</strong>
                    {t.smell && <span className="muted"> — {t.smell}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(p.price_per_ml != null || p.tried_on) && (
          <section className="card">
            <dl className="facts">
              {p.price_per_ml != null && <><dt>Price</dt><dd>{money(p.price_per_ml, p.currency)} per ml</dd></>}
              {total != null && !wish && <><dt>{p.status === 'bottle' ? 'Bottle' : 'Decant'}</dt><dd>{p.volume_ml} ml · {money(total, p.currency)}</dd></>}
              {p.tried_on && !wish && <><dt>Tried on</dt><dd>{formatDate(p.tried_on)}</dd></>}
            </dl>
          </section>
        )}

        {children}

        <button className="btn" onClick={() => go(`/discover/${p.id}`)}><Icon name="spark" /> Find similar outside my diary</button>

        <p className="muted small center">Added {formatDate(p.created_at)}</p>
        <button className="btn danger ghost" onClick={remove}><Icon name="trash" /> Delete perfume</button>
      </div>
    </article>
  )
}

// ---------- Form ----------

type Draft = Omit<Perfume, 'id' | 'created_at' | 'updated_at' | 'year' | 'price_per_ml' | 'volume_ml'> & {
  year: string; price_per_ml: string; volume_ml: string
}

const today = () => new Date().toISOString().slice(0, 10)

const blank: Draft = {
  name: '', brand: '', perfumer: '', year: '', concentration: '', family: '',
  top_notes: [], heart_notes: [], base_notes: [], accords: [], price_per_ml: '', currency: '₴', volume_ml: '3',
  status: 'decant', rating: null, longevity: null, sillage: null, seasons: [], daytime: [],
  would_buy: null, tried_on: today(), review: '', photo_path: null, favorite: false,
  reason_source: null, reason_note: '', links: [], lookup_status: null,
}
const blankWish: Draft = { ...blank, status: 'wishlist', tried_on: null, volume_ml: '' }

const toDraft = (p: Perfume): Draft => ({
  ...p,
  brand: p.brand ?? '', perfumer: p.perfumer ?? '', concentration: p.concentration ?? '', family: p.family ?? '',
  review: p.review ?? '', reason_note: p.reason_note ?? '', year: p.year?.toString() ?? '',
  price_per_ml: p.price_per_ml?.toString() ?? '', volume_ml: p.volume_ml?.toString() ?? '',
})

const num = (s: string) => {
  const v = parseFloat(s.replace(',', '.'))
  return Number.isFinite(v) ? v : null
}

export function PerfumeForm({ perfume, perfumes, wish: newWish, convert, onSaved }: {
  perfume?: Perfume
  perfumes: Perfume[]
  wish?: boolean      // new entry in "Want to try"
  convert?: boolean   // moving from "Want to try" to tried
  onSaved: (p: Perfume) => void
}) {
  const [d, setD] = useState<Draft>(() => {
    if (!perfume) return newWish ? blankWish : blank
    const draft = toDraft(perfume)
    return convert ? { ...draft, status: 'decant', tried_on: today(), volume_ml: draft.volume_ml || '3' } : draft
  })
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dropPhoto, setDropPhoto] = useState(false)
  const [aiAccords, setAiAccords] = useState<string[] | null>(null)   // Fragrantica accords found by the AI
  const [aiFid, setAiFid] = useState<string | null>(null)       // bottle photo found by the AI, uploaded on save
  const [aiSource, setAiSource] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [finding, setFinding] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<Draft>) => setD(x => ({ ...x, ...patch }))
  const urls = usePhotoUrls([perfume?.photo_path ?? null])
  const wish = d.status === 'wishlist'

  const brands = useMemo(() => uniq(perfumes.map(p => p.brand)), [perfumes])
  const families = useMemo(() => uniq([...FAMILIES, ...perfumes.map(p => p.family)]), [perfumes])
  const noteSuggestions = useMemo(() => uniq([...COMMON_NOTES, ...perfumes.flatMap(allNotes)]), [perfumes])

  const pickPhoto = (f: File | undefined) => {
    if (!f) return
    setFile(f); setDropPhoto(false)
    setPreview(URL.createObjectURL(f))
  }
  const find = async () => {
    if (!query.trim()) return
    setFinding(true); setError(''); setCandidates(null)
    try {
      const r = await callAI<{ candidates: Candidate[] }>({ action: 'lookup', query: query.trim() })
      setCandidates(r.candidates)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setFinding(false)
  }
  // Write the brand the way it already is in the diary ("By Kilian" → "Kilian")
  const sameBrand = (b: string) => norm(b).replace(/^by /, '')
  const choose = (c: Candidate) => {
    const known = c.brand ? brands.find(b => sameBrand(b) === sameBrand(c.brand)) : undefined
    set({
      name: c.name || d.name, brand: known ?? (c.brand || d.brand), year: c.year ? String(c.year) : d.year,
      perfumer: c.perfumer ?? d.perfumer, family: c.family ?? d.family,
      concentration: c.concentration && CONCENTRATIONS.includes(c.concentration) ? c.concentration : d.concentration,
      top_notes: c.top_notes ?? [], heart_notes: c.heart_notes ?? [], base_notes: c.base_notes ?? [],
    })
    if (c.accords?.length) setAiAccords(c.accords)
    if (c.fragrantica_id && !file) { setAiFid(c.fragrantica_id); setPreview(c.image_url); setDropPhoto(false) }
    setAiSource(c.fragrantica_url || null)
    setCandidates(null)
  }
  // Free path: a draft with the name, Claude Code fills it from the queue
  const queueLookup = async () => {
    if (!query.trim()) return
    setBusy(true); setError('')
    const { data, error } = await supabase.from('perfumes')
      .insert({ name: query.trim(), status: d.status, lookup_status: 'queued', volume_ml: wish ? null : 3, tried_on: null })
      .select().single()
    if (error) { setError(error.message); setBusy(false); return }
    onSaved(data as Perfume)
    location.replace(`#/p/${(data as Perfume).id}`)
  }

  const currentPhoto = preview ?? (!dropPhoto && perfume?.photo_path ? urls[perfume.photo_path] : null)

  const price = num(d.price_per_ml), vol = num(d.volume_ml)
  const cancelTo = perfume ? `/p/${perfume.id}` : wish ? '/wishlist' : '/'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!d.name.trim()) { setError('Name is required'); return }
    setBusy(true); setError('')
    try {
      let photo_path = dropPhoto ? null : d.photo_path
      if (file) photo_path = await uploadPhoto(file)
      else if (aiFid) {
        try { photo_path = (await callAI<{ path: string }>({ action: 'image', fragrantica_id: aiFid })).path }
        catch { /* can be saved without a photo too */ }
      }
      const row = {
        ...d,
        name: d.name.trim(),
        brand: d.brand?.trim() || null, perfumer: d.perfumer?.trim() || null,
        concentration: d.concentration || null, family: d.family?.trim() || null,
        review: d.review?.trim() || null, reason_note: d.reason_note?.trim() || null,
        tried_on: wish ? null : d.tried_on || null, links: cleanLinks(d.links),
        year: num(d.year), price_per_ml: price, volume_ml: vol, photo_path, lookup_status: null,
        ...(aiAccords ? { accords: aiAccords } : {}),
      }
      const q = perfume
        ? supabase.from('perfumes').update(row).eq('id', perfume.id)
        : supabase.from('perfumes').insert(row)
      const { data, error } = await q.select().single()
      if (error) throw error
      if (perfume?.photo_path && perfume.photo_path !== photo_path) await removePhoto(perfume.photo_path)
      onSaved(data as Perfume)
      if (perfume) back(`/p/${perfume.id}`)
      else location.replace(`#/p/${(data as Perfume).id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const title = convert ? 'How was it?' : perfume ? 'Edit perfume' : wish ? 'Want to try' : 'New perfume'

  const reasonFields = (
    <>
      <Field label="Where did I hear about it?">
        <select value={d.reason_source ?? ''} onChange={e => set({ reason_source: e.target.value || null })}>
          <option value="">—</option>
          {Object.entries(REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Details">
        <textarea rows={3} value={d.reason_note ?? ''} onChange={e => set({ reason_note: e.target.value })}
          placeholder="Who recommended it, which reel, what caught my eye in the notes…" />
      </Field>
    </>
  )

  return (
    <form className="form" onSubmit={submit}>
      <header className="form-head">
        <button type="button" className="btn ghost" onClick={() => back(cancelTo)}>Cancel</button>
        <h1>{title}</h1>
        <button className="btn primary sm" disabled={busy}>{busy ? '…' : 'Save'}</button>
      </header>

      {error && <p className="error">{error}</p>}

      {!perfume && (
        <div className="segmented">
          <button type="button" className={!wish ? 'on' : ''}
            onClick={() => set({ status: 'decant', tried_on: d.tried_on ?? today(), volume_ml: d.volume_ml || '3' })}>I have it</button>
          <button type="button" className={wish ? 'on' : ''}
            onClick={() => set({ status: 'wishlist', tried_on: null })}>Want to try</button>
        </div>
      )}

      {!perfume && (
        <section className="card ai-find">
          <h2>Find with AI</h2>
          <div className="row">
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Brand + name, e.g. Kilian Angels' Share"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); find() } }} />
          </div>
          {query.trim() && !candidates && (
            <TwoWays now={find} later={queueLookup} busy={finding || busy} nowLabel="Find now" laterLabel="Add to queue" />
          )}
          {finding && <p className="muted small">Searching the web, usually 10–30 seconds…</p>}
          {candidates && (candidates.length === 0
            ? <p className="muted small">Nothing found. Try another spelling, or fill the form yourself.</p>
            : (
              <>
                <p className="muted small">Which one?</p>
                <ul className="candidates">
                  {candidates.map((c, i) => (
                    <li key={i}>
                      <button type="button" onClick={() => choose(c)}>
                        {c.image_url ? <img src={c.image_url} alt="" /> : <div className="thumb thumb-empty">{c.name.charAt(0)}</div>}
                        <div>
                          <b>{c.name}</b>
                          <div className="muted small">{[c.brand, c.concentration, c.year].filter(Boolean).join(' · ')}</div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ))}
          {aiSource && (
            <p className="ai-filled">✨ Filled in by AI — please check before saving. <a href={aiSource} target="_blank" rel="noopener noreferrer">Source</a></p>
          )}
          <p className="muted small">Or fill in the form yourself ↓</p>
        </section>
      )}

      <div className="photo-pick">
        {currentPhoto
          ? <img src={currentPhoto} alt="" />
          : <div className="photo-empty"><Icon name="camera" /><span>Add a photo</span></div>}
        <input type="file" accept="image/*" onChange={e => pickPhoto(e.target.files?.[0])} aria-label="Photo" />
        {currentPhoto && (
          <button type="button" className="btn-icon glass photo-remove" aria-label="Remove photo"
            onClick={() => { setFile(null); setPreview(null); setDropPhoto(true); setAiFid(null) }}><Icon name="close" /></button>
        )}
      </div>

      <section className="card">
        <Field label="Name *">
          <input value={d.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Portrait of a Lady" required />
        </Field>
        <Field label="Brand">
          <input value={d.brand ?? ''} onChange={e => set({ brand: e.target.value })} list="brands" />
          <datalist id="brands">{brands.map(b => <option key={b} value={b} />)}</datalist>
        </Field>
        <div className="grid2">
          <Field label="Concentration">
            <select value={d.concentration ?? ''} onChange={e => set({ concentration: e.target.value })}>
              <option value="">—</option>
              {CONCENTRATIONS.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Year">
            <input inputMode="numeric" value={d.year} onChange={e => set({ year: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
          </Field>
        </div>
        <Field label="Perfumer">
          <input value={d.perfumer ?? ''} onChange={e => set({ perfumer: e.target.value })} />
        </Field>
        <Field label="Fragrance family">
          <input value={d.family ?? ''} onChange={e => set({ family: e.target.value })} list="families" placeholder="pick one or type your own" />
          <datalist id="families">{families.map(f => <option key={f} value={f} />)}</datalist>
        </Field>
      </section>

      {wish && (
        <section className="card">
          <h2>Why I want to try it</h2>
          {reasonFields}
        </section>
      )}

      {wish && (
        <section className="card">
          <h2>Where to try</h2>
          <LinksEditor value={d.links} onChange={v => set({ links: v })} />
        </section>
      )}

      <section className="card">
        <h2>Notes</h2>
        <p className="muted small">Separate with a comma or Enter</p>
        <Field label="Top">
          <TagInput value={d.top_notes} onChange={v => set({ top_notes: v })} suggestions={noteSuggestions} placeholder="bergamot, pink pepper…" />
        </Field>
        <Field label="Heart">
          <TagInput value={d.heart_notes} onChange={v => set({ heart_notes: v })} suggestions={noteSuggestions} placeholder="rose, iris…" />
        </Field>
        <Field label="Base">
          <TagInput value={d.base_notes} onChange={v => set({ base_notes: v })} suggestions={noteSuggestions} placeholder="sandalwood, musk…" />
        </Field>
      </section>

      {!wish && (
        <>
          <section className="card">
            <h2>Impression</h2>
            <Field label="Rating" hint="Tap a star again for a half star">
              <Stars value={d.rating} onChange={v => set({ rating: v })} size="lg" />
            </Field>
            <Field label="Longevity"><Scale value={d.longevity} onChange={v => set({ longevity: v })} labels={LONGEVITY} /></Field>
            <Field label="Sillage"><Scale value={d.sillage} onChange={v => set({ sillage: v })} labels={SILLAGE} /></Field>
            <Field label="Season"><Chips multi options={SEASONS} value={d.seasons} onChange={v => set({ seasons: v })} /></Field>
            <Field label="Time of day"><Chips multi options={DAYTIME} value={d.daytime} onChange={v => set({ daytime: v })} /></Field>
            <Field label="Would I buy a bottle?">
              <Chips options={WOULD_BUY} value={d.would_buy ? [d.would_buy] : []} onChange={v => set({ would_buy: v[0] ?? null })} />
            </Field>
            <Field label="My review">
              <textarea rows={6} value={d.review ?? ''} onChange={e => set({ review: e.target.value })}
                placeholder="How it opens, what it reminds you of, how it wears on skin…" />
            </Field>
            <Field label="Links" hint="Reviews, shops, videos — anything worth keeping">
              <LinksEditor value={d.links} onChange={v => set({ links: v })} />
            </Field>
          </section>

          <section className="card">
            <h2>Purchase</h2>
            <Field label="Status">
              <Chips options={TRIED_STATUSES} value={[d.status]} onChange={v => v[0] && set({ status: v[0] })} />
            </Field>
            <div className="grid3">
              <Field label="Price per ml">
                <input inputMode="decimal" value={d.price_per_ml} onChange={e => set({ price_per_ml: e.target.value })} />
              </Field>
              <Field label="Currency">
                <select value={d.currency} onChange={e => set({ currency: e.target.value })}>
                  {['₴', '$', '€', 'zł'].map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Volume, ml">
                <input inputMode="decimal" value={d.volume_ml} onChange={e => set({ volume_ml: e.target.value })} />
              </Field>
            </div>
            {price != null && vol != null && <p className="muted small">Total: {money(price * vol, d.currency)}</p>}
            <Field label="Date tried">
              <input type="date" value={d.tried_on ?? ''} onChange={e => set({ tried_on: e.target.value })} />
            </Field>
          </section>

          {(d.reason_source || d.reason_note) && (
            <section className="card">
              <h2>Why I wanted to try it</h2>
              {reasonFields}
            </section>
          )}
        </>
      )}

      <button className="btn primary wide" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
    </form>
  )
}
