// Settings: account (name, password), AI language, backup, sign out.
// The language is stored in user_settings; the Edge Function and the queue read it from there, no redeploy needed.
import { useEffect, useState, type FormEvent } from 'react'
import { supabase, type Perfume, type Term } from './lib'
import { Icon } from './ui'

export type UserSettings = { display_name: string | null; ai_language: string }

// Languages the AI can write forecasts, the taste profile, note explanations and picks in
export const AI_LANGUAGES = ['Ukrainian', 'English', 'Russian']

export async function loadSettings(): Promise<UserSettings> {
  const { data } = await supabase.from('user_settings').select('display_name, ai_language').maybeSingle()
  return { display_name: data?.display_name ?? null, ai_language: data?.ai_language ?? 'Ukrainian' }
}

export function Settings({ email, perfumes, terms }: { email: string; perfumes: Perfume[]; terms: Term[] }) {
  const [s, setS] = useState<UserSettings | null>(null)
  const [name, setName] = useState('')
  const [saved, setSaved] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => { loadSettings().then(x => { setS(x); setName(x.display_name ?? '') }) }, [])

  const save = async (patch: Partial<UserSettings>, what: string) => {
    setErr(''); setSaved('')
    const { error } = await supabase.from('user_settings')
      .upsert({ ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) { setErr(error.message); return }
    setS(prev => ({ ...(prev ?? { display_name: null, ai_language: 'Ukrainian' }), ...patch }))
    setSaved(what)
    setTimeout(() => setSaved(''), 2500)
  }

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), perfumes, terms }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `perfume-diary-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  const known = s && AI_LANGUAGES.includes(s.ai_language)

  return (
    <>
      <header className="page-head"><div><h1>Settings</h1></div></header>

      <section className="card">
        <h2>Account</h2>
        <dl className="facts"><dt>Email</dt><dd>{email}</dd></dl>
        <form className="settings-row" onSubmit={e => { e.preventDefault(); save({ display_name: name.trim() || null }, 'name') }}>
          <label className="field">
            <span className="field-label">Name</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="How should the AI call you?" />
          </label>
          <button className="btn sm" disabled={!s || name.trim() === (s.display_name ?? '')}>Save</button>
        </form>
        {saved === 'name' && <p className="muted small">✓ Saved</p>}
        <PasswordForm />
      </section>

      <section className="card">
        <h2>Preferences</h2>
        <label className="field">
          <span className="field-label">AI language</span>
          <select value={s ? (known ? s.ai_language : 'Ukrainian') : ''} disabled={!s}
            onChange={e => save({ ai_language: e.target.value }, 'lang')}>
            {AI_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <p className="muted small">Forecasts, the taste profile, note explanations and Discover picks will be written in this language. Already written texts stay as they are until you update them.</p>
        {saved === 'lang' && <p className="muted small">✓ Saved</p>}
      </section>

      {err && <p className="error">{err}</p>}

      <section className="card">
        <h2>Data</h2>
        <p className="muted small">Everything is stored in your Supabase database. You can download a backup file anytime.</p>
        <button className="btn" onClick={exportData}>Download backup</button>
      </section>

      <section className="card">
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </section>
    </>
  )
}

function PasswordForm() {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setMsg(''); setErr('')
    if (pw.length < 8) { setErr('At least 8 characters'); return }
    if (pw !== pw2) { setErr("Passwords don't match"); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) setErr(error.message)
    else { setMsg('✓ Password changed'); setPw(''); setPw2('') }
  }
  return (
    <form onSubmit={submit} className="pw-form">
      <h3 className="small"><b>Change password</b></h3>
      <div className="pw-wrap">
        <input type={show ? 'text' : 'password'} placeholder="New password" value={pw} onChange={e => setPw(e.target.value)}
          autoComplete="new-password" autoCapitalize="none" autoCorrect="off" />
        <button type="button" className="pw-eye" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide password' : 'Show password'}>
          <Icon name={show ? 'eye-off' : 'eye'} />
        </button>
      </div>
      <input type={show ? 'text' : 'password'} placeholder="Repeat new password" value={pw2} onChange={e => setPw2(e.target.value)}
        autoComplete="new-password" autoCapitalize="none" autoCorrect="off" />
      {err && <p className="error">{err}</p>}
      {msg && <p className="muted small">{msg}</p>}
      <button className="btn sm" disabled={busy || !pw}>{busy ? 'Saving…' : 'Change password'}</button>
    </form>
  )
}
