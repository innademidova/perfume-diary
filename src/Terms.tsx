import { useMemo, useState, type FormEvent } from 'react'
import { supabase, mentions, norm, formatDate, TERM_KINDS, type Perfume, type Term } from './lib'
import { Chips, Field, Icon, Stars, Thumb, usePhotoUrls } from './ui'
import { go, back } from './App'

export function TermList({ terms, perfumes, query, setQuery }: {
  terms: Term[]
  perfumes: Perfume[]
  query: string
  setQuery: (q: string) => void
}) {
  const [kind, setKind] = useState<string[]>([])
  const shown = useMemo(() => {
    const q = norm(query)
    return terms.filter(t =>
      (!kind.length || kind.includes(t.kind)) &&
      (!q || norm([t.name, t.smell, t.description].join(' ')).includes(q)))
  }, [terms, query, kind])

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Glossary</h1>
          <p className="muted small">molecules, notes and new discoveries</p>
        </div>
        <button className="btn-icon accent" onClick={() => go('/t/new')} aria-label="Add entry"><Icon name="plus" /></button>
      </header>

      {terms.length > 0 && (
        <>
          <div className="toolbar">
            <div className="search">
              <Icon name="search" />
              <input type="search" placeholder="Search the glossary…" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
          </div>
          <Chips multi options={TERM_KINDS} value={kind} onChange={setKind} />
        </>
      )}

      {terms.length === 0 ? (
        <div className="empty">
          <p className="serif big">Your glossary is empty</p>
          <p className="muted">Keep the molecules, notes and terms you learn about here. For example: “Orris root: powdery, carroty, earthy.”</p>
          <button className="btn primary" onClick={() => go('/t/new')}>Add your first entry</button>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty"><p className="muted">Nothing found</p></div>
      ) : (
        <ul className="tlist">
          {shown.map(t => {
            const count = perfumes.filter(p => mentions(p, t)).length
            return (
              <li key={t.id}>
                <button className="trow" onClick={() => go(`/t/${t.id}`)}>
                  <div className="trow-head">
                    <span className="trow-name">{t.name}</span>
                    <span className="pill soft">{TERM_KINDS[t.kind]}</span>
                  </div>
                  {t.smell && <p className="trow-smell">{t.smell}</p>}
                  {count > 0 && <p className="muted small">in {count} {count === 1 ? 'perfume' : 'perfumes'}</p>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

export function TermDetail({ term: t, perfumes, onDelete }: {
  term: Term
  perfumes: Perfume[]
  onDelete: (id: string) => void
}) {
  const related = perfumes.filter(p => mentions(p, t))
  const urls = usePhotoUrls(related.map(p => p.photo_path))
  const remove = async () => {
    if (!confirm(`Delete “${t.name}” from the glossary?`)) return
    const { error } = await supabase.from('terms').delete().eq('id', t.id)
    if (error) { alert(error.message); return }
    onDelete(t.id)
    back('/terms')
  }
  return (
    <article className="detail">
      <div className="detail-bar static">
        <button className="btn-icon" onClick={() => back('/terms')} aria-label="Back"><Icon name="back" /></button>
        <button className="btn-icon" onClick={() => go(`/t/${t.id}/edit`)} aria-label="Edit"><Icon name="edit" /></button>
      </div>
      <div className="detail-body">
        <p className="eyebrow">{TERM_KINDS[t.kind]}</p>
        <h1 className="detail-title">{t.name}</h1>
        {t.smell && (
          <section className="card">
            <h2>How it smells</h2>
            <p className="review">{t.smell}</p>
          </section>
        )}
        {t.description && (
          <section className="card">
            <h2>Notes</h2>
            <p className="review">{t.description}</p>
          </section>
        )}
        <section className="card">
          <h2>In my perfumes</h2>
          {related.length === 0
            ? <p className="muted small">Not in any perfume yet. The link appears automatically once “{t.name}” shows up in a perfume’s notes or review.</p>
            : (
              <ul className="plist compact">
                {related.map(p => (
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
            )}
        </section>
        <p className="muted small center">Added {formatDate(t.created_at)}</p>
        <button className="btn danger ghost" onClick={remove}><Icon name="trash" /> Delete entry</button>
      </div>
    </article>
  )
}

export function TermForm({ term, onSaved }: { term?: Term; onSaved: (t: Term) => void }) {
  const [name, setName] = useState(term?.name ?? '')
  const [kind, setKind] = useState(term?.kind ?? 'molecule')
  const [smell, setSmell] = useState(term?.smell ?? '')
  const [description, setDescription] = useState(term?.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setBusy(true); setError('')
    const row = { name: name.trim(), kind, smell: smell.trim() || null, description: description.trim() || null }
    const q = term ? supabase.from('terms').update(row).eq('id', term.id) : supabase.from('terms').insert(row)
    const { data, error } = await q.select().single()
    if (error) { setError(error.message); setBusy(false); return }
    onSaved(data as Term)
    if (term) back(`/t/${term.id}`)
    else location.replace(`#/t/${(data as Term).id}`)
  }

  return (
    <form className="form" onSubmit={submit}>
      <header className="form-head">
        <button type="button" className="btn ghost" onClick={() => back(term ? `/t/${term.id}` : '/terms')}>Cancel</button>
        <h1>{term ? 'Edit entry' : 'New entry'}</h1>
        <button className="btn primary sm" disabled={busy}>{busy ? '…' : 'Save'}</button>
      </header>
      {error && <p className="error">{error}</p>}
      <section className="card">
        <Field label="Type">
          <Chips options={TERM_KINDS} value={[kind]} onChange={v => v[0] && setKind(v[0])} />
        </Field>
        <Field label="Name *">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ambroxan" required />
        </Field>
        <Field label="How it smells">
          <textarea rows={3} value={smell} onChange={e => setSmell(e.target.value)} placeholder="Warm, salty, “skin after the sea”…" />
        </Field>
        <Field label="Notes">
          <textarea rows={6} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Where I learned about it, which perfumes use it, fun facts…" />
        </Field>
      </section>
      <button className="btn primary wide" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
    </form>
  )
}
