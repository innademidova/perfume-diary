import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Perfume, type Term } from './lib'
import { Icon } from './ui'
import { PerfumeList, PerfumeDetail, PerfumeForm, emptyFilters, type Filters } from './Perfumes'
import { TermList, TermDetail, TermForm } from './Terms'
import { More } from './More'

// Маршрути в адресі після #, щоб працювало на GitHub Pages
export type Route =
  | { view: 'list' } | { view: 'perfume'; id: string } | { view: 'perfume-edit'; id?: string }
  | { view: 'terms' } | { view: 'term'; id: string } | { view: 'term-edit'; id?: string }
  | { view: 'more' }

function parse(hash: string): Route {
  const [a, b, c] = hash.replace(/^#\/?/, '').split('/')
  if (a === 'p' && b === 'new') return { view: 'perfume-edit' }
  if (a === 'p' && b && c === 'edit') return { view: 'perfume-edit', id: b }
  if (a === 'p' && b) return { view: 'perfume', id: b }
  if (a === 'terms') return { view: 'terms' }
  if (a === 't' && b === 'new') return { view: 'term-edit' }
  if (a === 't' && b && c === 'edit') return { view: 'term-edit', id: b }
  if (a === 't' && b) return { view: 'term', id: b }
  if (a === 'more') return { view: 'more' }
  return { view: 'list' }
}

// Скільки кроків ми пройшли всередині застосунку — щоб «назад» не виводив із нього
let depth = 0
export const go = (path: string) => { depth++; location.hash = path }
export const back = (fallback: string) => {
  if (depth > 0) { depth--; history.back() }
  else location.replace('#' + fallback)
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="splash"><span className="brand">Perfume Diary</span></div>
  if (!session) return <Login />
  return <Diary email={session.user.email ?? ''} />
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(error.message.includes('Invalid') ? 'Wrong email or password' : error.message)
    setBusy(false)
  }
  return (
    <div className="login">
      <form onSubmit={submit} className="login-card">
        <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="login-logo" />
        <h1>Perfume Diary</h1>
        <p className="muted">My decants, notes and discoveries</p>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
          autoComplete="username" required />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
          autoComplete="current-password" required />
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}

function Diary({ email }: { email: string }) {
  const [route, setRoute] = useState<Route>(() => parse(location.hash))
  const [perfumes, setPerfumes] = useState<Perfume[] | null>(null)
  const [terms, setTerms] = useState<Term[] | null>(null)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [termQuery, setTermQuery] = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const on = () => { setRoute(parse(location.hash)); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const load = useCallback(async () => {
    setLoadError('')
    const [p, t] = await Promise.all([
      supabase.from('perfumes').select('*').order('created_at', { ascending: false }),
      supabase.from('terms').select('*').order('name'),
    ])
    if (p.error || t.error) { setLoadError((p.error ?? t.error)!.message); return }
    setPerfumes(p.data as Perfume[])
    setTerms(t.data as Term[])
  }, [])
  useEffect(() => { load() }, [load])

  const savePerfume = (p: Perfume) =>
    setPerfumes(list => [p, ...(list ?? []).filter(x => x.id !== p.id)])
  const dropPerfume = (id: string) => setPerfumes(list => (list ?? []).filter(x => x.id !== id))
  const saveTerm = (t: Term) =>
    setTerms(list => [...(list ?? []).filter(x => x.id !== t.id), t].sort((a, b) => a.name.localeCompare(b.name, 'ru')))
  const dropTerm = (id: string) => setTerms(list => (list ?? []).filter(x => x.id !== id))

  if (loadError) return (
    <div className="splash">
      <p>Couldn't load the diary</p>
      <p className="muted small">{loadError}</p>
      <button className="btn" onClick={load}>Try again</button>
    </div>
  )
  if (!perfumes || !terms) return <div className="splash"><span className="brand">Perfume Diary</span></div>

  const tab = route.view.startsWith('term') ? 'terms' : route.view === 'more' ? 'more' : 'list'
  const findP = (id?: string) => perfumes.find(p => p.id === id)
  const findT = (id?: string) => terms.find(t => t.id === id)

  let screen
  switch (route.view) {
    case 'list':
      screen = <PerfumeList perfumes={perfumes} filters={filters} setFilters={setFilters} />
      break
    case 'perfume': {
      const p = findP(route.id)
      screen = p
        ? <PerfumeDetail perfume={p} terms={terms} onChange={savePerfume} onDelete={dropPerfume}
            onNote={note => { setFilters({ ...emptyFilters, note }); go('/') }} />
        : <NotFound />
      break
    }
    case 'perfume-edit':
      screen = <PerfumeForm key={route.id ?? 'new'} perfume={findP(route.id)} perfumes={perfumes} onSaved={savePerfume} />
      break
    case 'terms':
      screen = <TermList terms={terms} perfumes={perfumes} query={termQuery} setQuery={setTermQuery} />
      break
    case 'term': {
      const t = findT(route.id)
      screen = t ? <TermDetail term={t} perfumes={perfumes} onDelete={dropTerm} /> : <NotFound />
      break
    }
    case 'term-edit':
      screen = <TermForm key={route.id ?? 'new'} term={findT(route.id)} onSaved={saveTerm} />
      break
    case 'more':
      screen = <More email={email} perfumes={perfumes} terms={terms} />
  }

  const editing = route.view.endsWith('-edit')
  return (
    <div className="app">
      <main className="screen">{screen}</main>
      {!editing && (
        <nav className="tabbar">
          <a href="#/" className={tab === 'list' ? 'on' : ''}><Icon name="bottle" /><span>Perfumes</span></a>
          <a href="#/terms" className={tab === 'terms' ? 'on' : ''}><Icon name="book" /><span>Glossary</span></a>
          <a href="#/more" className={tab === 'more' ? 'on' : ''}><Icon name="more" /><span>Insights</span></a>
        </nav>
      )}
    </div>
  )
}

function NotFound() {
  return (
    <div className="empty">
      <p>Entry not found</p>
      <a className="btn" href="#/">Back to list</a>
    </div>
  )
}
