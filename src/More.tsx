import { useMemo } from 'react'
import { supabase, allNotes, money, type Perfume, type Term } from './lib'
import { buildModel, noteInsights } from './predict'
import { ProfileCard, AccuracyCard } from './ai'

function top<T extends string>(xs: T[], n = 5) {
  const m = new Map<T, number>()
  xs.forEach(x => m.set(x, (m.get(x) ?? 0) + 1))
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
}

export function More({ email, perfumes, terms }: { email: string; perfumes: Perfume[]; terms: Term[] }) {
  const stats = useMemo(() => {
    const tried = perfumes.filter(p => p.status !== 'wishlist')
    const rated = tried.filter(p => p.rating != null)
    const avg = rated.length ? rated.reduce((s, p) => s + p.rating!, 0) / rated.length : null
    // Улюблені ноти — з ароматів з оцінкою 4 і вище
    const loved = rated.filter(p => p.rating! >= 4)
    const spent = new Map<string, number>()
    tried.forEach(p => {
      if (p.price_per_ml != null && p.volume_ml) spent.set(p.currency, (spent.get(p.currency) ?? 0) + p.price_per_ml * p.volume_ml)
    })
    return {
      tried: tried.length,
      wishlist: perfumes.length - tried.length,
      avg,
      lovedNotes: top(loved.flatMap(p => allNotes(p).map(n => n.toLowerCase()))),
      families: top(tried.map(p => p.family).filter((x): x is string => !!x)),
      brands: top(tried.map(p => p.brand).filter((x): x is string => !!x)),
      spent: [...spent.entries()],
    }
  }, [perfumes])

  const insight = useMemo(() => noteInsights(buildModel(perfumes)), [perfumes])

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), perfumes, terms }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `perfume-diary-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  const max = (xs: [string, number][]) => Math.max(1, ...xs.map(x => x[1]))

  return (
    <>
      <header className="page-head"><div><h1>Insights</h1><p className="muted small">what my notes say about me</p></div></header>

      <div className="stat-row">
        <div className="stat"><span className="stat-num">{stats.tried}</span><span className="muted small">in my diary</span></div>
        <div className="stat"><span className="stat-num">{stats.avg ? stats.avg.toFixed(1) : '—'}</span><span className="muted small">average rating</span></div>
        <div className="stat"><span className="stat-num">{terms.length}</span><span className="muted small">in glossary</span></div>
      </div>

      {[
        ['Notes I love', stats.lovedNotes, 'Shows up once you rate perfumes 4★ or higher'],
        ['My families', stats.families, 'Shows up once your perfumes have a family'],
        ['Brands', stats.brands, ''],
      ].map(([title, rows, emptyText]) => (
        (rows as [string, number][]).length > 0 || emptyText ? (
          <section className="card" key={title as string}>
            <h2>{title as string}</h2>
            {(rows as [string, number][]).length === 0
              ? <p className="muted small">{emptyText as string}</p>
              : (
                <ul className="bars">
                  {(rows as [string, number][]).map(([label, n]) => (
                    <li key={label}>
                      <span className="bar-label">{label}</span>
                      <span className="bar"><span style={{ width: `${(n / max(rows as [string, number][])) * 100}%` }} /></span>
                      <span className="bar-num">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        ) : null
      ))}

      <ProfileCard ratedCount={stats.tried - perfumes.filter(p => p.status !== 'wishlist' && p.rating == null).length} />
      <AccuracyCard perfumes={perfumes} />

      {(insight.loved.length > 0 || insight.avoid.length > 0) && (
        <section className="card">
          <h2>Notes by my ratings</h2>
          <p className="muted small">Notes that appear in 3+ rated perfumes. ★ is my average for them, ×n is how many.</p>
          {insight.loved.length > 0 && (
            <>
              <p className="small"><b>I tend to like</b></p>
              <div className="chips">
                {insight.loved.map(n => <span key={n.note} className="chip note-stat good">{n.note} <b>{n.avg.toFixed(1)}★</b> <small>×{n.n}</small></span>)}
              </div>
            </>
          )}
          {insight.avoid.length > 0 && (
            <>
              <p className="small"><b>I tend to avoid</b></p>
              <div className="chips">
                {insight.avoid.map(n => <span key={n.note} className="chip note-stat bad">{n.note} <b>{n.avg.toFixed(1)}★</b> <small>×{n.n}</small></span>)}
              </div>
            </>
          )}
        </section>
      )}

      {(stats.spent.length > 0 || stats.wishlist > 0) && (
        <section className="card">
          <dl className="facts">
            {stats.spent.length > 0 && <><dt>Spent</dt><dd>{stats.spent.map(([c, v]) => money(Math.round(v), c)).join(' + ')}</dd></>}
            {stats.wishlist > 0 && <><dt>Want to try</dt><dd><a className="link" href="#/wishlist">{stats.wishlist}</a></dd></>}
          </dl>
        </section>
      )}

      <section className="card">
        <h2>Data</h2>
        <p className="muted small">Everything is stored in your Supabase database. You can download a backup file anytime.</p>
        <button className="btn" onClick={exportData}>Download backup</button>
      </section>

      <section className="card">
        <p className="muted small">Signed in as {email}</p>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </section>
    </>
  )
}
