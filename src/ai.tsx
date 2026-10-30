// Прогнози та профіль смаку від ІІ.
// Застосунок лише ставить запити в чергу; обробляє їх Claude Code (scripts/ai-queue.mjs).
import { createContext, useContext, useState } from 'react'
import { supabase, formatDate, callAI, type Perfume } from './lib'
import { Stars, Icon } from './ui'

export type Prediction = {
  perfume_id: string
  status: 'queued' | 'done'
  rating: number | null
  confidence: 'low' | 'medium' | 'high' | null
  summary: string | null
  likes: string[]
  risks: string[]
  requested_at: string
  done_at: string | null
}

export type TasteProfile = {
  profile: string | null
  loves: string[]
  avoids: string[]
  based_on: number
  refresh_requested: boolean
  updated_at: string
}

type AI = {
  predictions: Map<string, Prediction>
  profile: TasteProfile | null
  savePrediction: (p: Prediction | null, perfumeId: string) => void
  saveProfile: (p: TasteProfile) => void
}
export const AIContext = createContext<AI>(null!)
export const useAI = () => useContext(AIContext)

export const QUEUE_HINT = 'Free option: it will appear here after you write «обработай очередь» to Claude Code on your computer. Need it right away? Use the button below (~1¢).'

// Два способи: зараз через API (платно, копійки) або в чергу для Claude Code (безкоштовно, пізніше)
export function TwoWays({ now, later, busy, nowLabel = 'Now', laterLabel = 'Add to queue' }: {
  now: () => void; later?: () => void; busy: boolean; nowLabel?: string; laterLabel?: string
}) {
  return (
    <div className="two-ways">
      <button className="btn primary sm" onClick={now} disabled={busy}>
        <Icon name="spark" /> {busy ? 'Thinking…' : nowLabel}
      </button>
      {later && <button className="btn sm" onClick={later} disabled={busy}>{laterLabel}</button>}
      <p className="muted small">«{nowLabel}» uses the paid API (~1¢). The queue is free: Claude Code handles it on the computer.</p>
    </div>
  )
}

const CONF: Record<string, string> = { low: 'low confidence', medium: 'medium confidence', high: 'high confidence' }

export function ForecastCard({ perfume }: { perfume: Perfume }) {
  const { predictions, savePrediction } = useAI()
  const pr = predictions.get(perfume.id)
  const rated = perfume.rating != null && perfume.status !== 'wishlist'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const now = async () => {
    setBusy(true); setErr('')
    try { savePrediction(await callAI<Prediction>({ action: 'forecast', perfume_id: perfume.id }), perfume.id) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }

  const request = async () => {
    const row = {
      perfume_id: perfume.id, status: 'queued', rating: null, confidence: null, summary: null,
      likes: [], risks: [], requested_at: new Date().toISOString(), done_at: null,
    }
    const { data, error } = await supabase.from('predictions').upsert(row).select().single()
    if (error) alert(error.message); else savePrediction(data as Prediction, perfume.id)
  }
  const cancel = async () => {
    const { error } = await supabase.from('predictions').delete().eq('perfume_id', perfume.id)
    if (error) alert(error.message); else savePrediction(null, perfume.id)
  }

  // Уже оцінено: показуємо прогноз поруч із реальністю
  if (rated) {
    if (pr?.status !== 'done' || pr.rating == null) return null
    const diff = perfume.rating! - pr.rating
    return (
      <section className="card forecast">
        <h2>Forecast vs reality</h2>
        <dl className="facts">
          <dt>AI predicted</dt><dd><Stars value={pr.rating} size="sm" /> {pr.rating}</dd>
          <dt>I gave</dt><dd><Stars value={perfume.rating} size="sm" /> {perfume.rating}</dd>
        </dl>
        <p className="muted small">
          {Math.abs(diff) <= 0.5 ? 'The forecast was right 🎯' : diff > 0 ? 'I liked it more than predicted' : 'I liked it less than predicted'}
        </p>
        {pr.summary && <details><summary className="small muted">What the forecast said</summary><p className="review small">{pr.summary}</p></details>}
      </section>
    )
  }

  if (!pr) return (
    <section className="card forecast">
      <h2>AI forecast</h2>
      <p className="muted small">Claude will compare this perfume with everything in my diary and guess my rating and impressions.</p>
      <TwoWays now={now} later={request} busy={busy} nowLabel="Forecast now" />
      {err && <p className="error">{err}</p>}
    </section>
  )

  if (pr.status === 'queued') return (
    <section className="card forecast">
      <h2>AI forecast</h2>
      <p className="queued">⏳ In the queue since {formatDate(pr.requested_at.slice(0, 10))}</p>
      <p className="muted small">{QUEUE_HINT}</p>
      <div className="row">
        <button className="btn sm" onClick={now} disabled={busy}><Icon name="spark" /> {busy ? 'Thinking…' : 'Do it now instead'}</button>
        <button className="btn ghost sm" onClick={cancel}>Cancel request</button>
      </div>
      {err && <p className="error">{err}</p>}
    </section>
  )

  return (
    <section className="card forecast">
      <h2>AI forecast</h2>
      <div className="forecast-head">
        <span className="ghost-stars"><Stars value={pr.rating} size="lg" /></span>
        <div>
          <div className="forecast-num">~{pr.rating}</div>
          {pr.confidence && <div className="muted small">{CONF[pr.confidence]}</div>}
        </div>
      </div>
      {pr.summary && <p className="review">{pr.summary}</p>}
      {pr.likes.length > 0 && (
        <div className="chips">{pr.likes.map(x => <span key={x} className="chip note-stat good">{x}</span>)}</div>
      )}
      {pr.risks.length > 0 && (
        <div className="chips">{pr.risks.map(x => <span key={x} className="chip note-stat bad">{x}</span>)}</div>
      )}
      <p className="muted small">Made {pr.done_at ? formatDate(pr.done_at.slice(0, 10)) : ''} · it's a guess, not a verdict</p>
      <details>
        <summary className="small muted">Ask again</summary>
        <TwoWays now={now} later={request} busy={busy} nowLabel="Forecast now" />
      </details>
      {err && <p className="error">{err}</p>}
    </section>
  )
}

export function ProfileCard({ ratedCount }: { ratedCount: number }) {
  const { profile, saveProfile } = useAI()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const now = async () => {
    setBusy(true); setErr('')
    try { saveProfile(await callAI<TasteProfile>({ action: 'profile' })) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }
  const request = async () => {
    const { data, error } = await supabase.from('taste_profile')
      .upsert({ refresh_requested: true }, { onConflict: 'user_id' }).select().single()
    if (error) alert(error.message); else saveProfile(data as TasteProfile)
  }
  const fresh = profile ? ratedCount - profile.based_on : ratedCount
  return (
    <section className="card">
      <h2>My taste profile</h2>
      {profile?.profile ? (
        <>
          <p className="review">{profile.profile}</p>
          {profile.loves.length > 0 && <div className="chips">{profile.loves.map(x => <span key={x} className="chip note-stat good">{x}</span>)}</div>}
          {profile.avoids.length > 0 && <div className="chips">{profile.avoids.map(x => <span key={x} className="chip note-stat bad">{x}</span>)}</div>}
          <p className="muted small">
            Based on {profile.based_on} rated perfumes · updated {formatDate(profile.updated_at.slice(0, 10))}
            {fresh > 0 && <> · <b>{fresh} new since then</b></>}
          </p>
        </>
      ) : (
        <p className="muted small">Claude will read all my ratings and reviews and describe what I like and avoid.</p>
      )}
      {profile?.refresh_requested ? (
        <>
          <p className="queued">⏳ Update requested</p>
          <p className="muted small">{QUEUE_HINT}</p>
          <button className="btn sm" onClick={now} disabled={busy}><Icon name="spark" /> {busy ? 'Thinking…' : 'Do it now instead'}</button>
        </>
      ) : (!profile?.profile || fresh >= 3) ? (
        <TwoWays now={now} later={request} busy={busy} nowLabel={profile?.profile ? 'Update now' : 'Build now'} />
      ) : (
        <details>
          <summary className="small muted">Update anyway</summary>
          <TwoWays now={now} later={request} busy={busy} nowLabel="Update now" />
        </details>
      )}
      {err && <p className="error">{err}</p>}
    </section>
  )
}

export function AccuracyCard({ perfumes }: { perfumes: Perfume[] }) {
  const { predictions } = useAI()
  const pairs = perfumes
    .filter(p => p.rating != null && p.status !== 'wishlist')
    .map(p => ({ p, pr: predictions.get(p.id) }))
    .filter(x => x.pr?.status === 'done' && x.pr.rating != null)
  const queued = [...predictions.values()].filter(x => x.status === 'queued').length
  if (!pairs.length && !queued) return null
  const hits = pairs.filter(x => Math.abs(x.p.rating! - x.pr!.rating!) <= 0.5).length
  const mae = pairs.reduce((s, x) => s + Math.abs(x.p.rating! - x.pr!.rating!), 0) / (pairs.length || 1)
  return (
    <section className="card">
      <h2>AI forecasts</h2>
      <dl className="facts">
        {queued > 0 && <><dt>In the queue</dt><dd>{queued}</dd></>}
        {pairs.length > 0 && <><dt>Checked</dt><dd>{hits} of {pairs.length} within ½★</dd></>}
        {pairs.length > 0 && <><dt>Average miss</dt><dd>{mae.toFixed(1)}★</dd></>}
      </dl>
      {queued > 0 && <p className="muted small">{QUEUE_HINT}</p>}
    </section>
  )
}
