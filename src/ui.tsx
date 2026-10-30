import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { norm, photoUrls, type Link } from './lib'

export function Stars({ value, onChange, size = 'md' }: {
  value: number | null
  onChange?: (v: number | null) => void
  size?: 'sm' | 'md' | 'lg'
}) {
  const v = value ?? 0
  // Повторне натискання на ту саму зірку дає половинку, третє — скидає
  const tap = (i: number) => {
    if (!onChange) return
    if (v === i) onChange(i - 0.5)
    else if (v === i - 0.5) onChange(i === 1 ? null : i - 1)
    else onChange(i)
  }
  return (
    <span className={`stars stars-${size}${onChange ? ' stars-edit' : ''}`} aria-label={`Rating ${v} of 5`}>
      {[1, 2, 3, 4, 5].map(i => {
        const fill = v >= i ? 100 : v >= i - 0.5 ? 50 : 0
        const star = (
          <span className="star" style={{ ['--fill' as string]: `${fill}%` }}>★</span>
        )
        return onChange
          ? <button type="button" key={i} onClick={() => tap(i)} aria-label={`${i}`}>{star}</button>
          : <span key={i}>{star}</span>
      })}
    </span>
  )
}

export function Scale({ value, onChange, labels }: {
  value: number | null
  onChange: (v: number | null) => void
  labels: string[]
}) {
  return (
    <div className="scale">
      <div className="scale-dots">
        {[1, 2, 3, 4, 5].map(i => (
          <button type="button" key={i} className={value != null && value >= i ? 'on' : ''}
            onClick={() => onChange(value === i ? null : i)} aria-label={labels[i]} />
        ))}
      </div>
      <span className="muted small">{value ? labels[value] : 'not set'}</span>
    </div>
  )
}

export function Meter({ value, labels }: { value: number; labels: string[] }) {
  return (
    <div className="meter">
      <div className="meter-bar">
        {[1, 2, 3, 4, 5].map(i => <span key={i} className={value >= i ? 'on' : ''} />)}
      </div>
      <span className="small">{labels[value]}</span>
    </div>
  )
}

export function Chips<T extends string>({ options, value, onChange, multi }: {
  options: Record<T, string>
  value: T[]
  onChange: (v: T[]) => void
  multi?: boolean
}) {
  return (
    <div className="chips">
      {(Object.keys(options) as T[]).map(k => {
        const on = value.includes(k)
        return (
          <button type="button" key={k} className={`chip${on ? ' on' : ''}`}
            onClick={() => onChange(multi ? (on ? value.filter(x => x !== k) : [...value, k]) : (on ? [] : [k]))}>
            {options[k]}
          </button>
        )
      })}
    </div>
  )
}

export function TagInput({ value, onChange, suggestions, placeholder }: {
  value: string[]
  onChange: (v: string[]) => void
  suggestions: string[]
  placeholder?: string
}) {
  const [text, setText] = useState('')
  const [focus, setFocus] = useState(false)
  const add = (raw: string) => {
    const parts = raw.split(/[,;\n]/).map(s => s.trim()).filter(Boolean)
    const next = [...value]
    parts.forEach(p => { if (!next.some(x => norm(x) === norm(p))) next.push(p) })
    onChange(next)
    setText('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); if (text.trim()) add(text) }
    else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
  }
  const q = norm(text)
  const matches = q
    ? suggestions.filter(s => norm(s).includes(q) && !value.some(v => norm(v) === norm(s))).slice(0, 8)
    : []
  return (
    <div className="tags-wrap">
      <div className={`tags${focus ? ' focus' : ''}`}>
        {value.map(t => (
          <span key={t} className="tag">
            {t}
            <button type="button" onClick={() => onChange(value.filter(x => x !== t))} aria-label="Remove">×</button>
          </span>
        ))}
        <input value={text} placeholder={value.length ? '' : placeholder}
          onChange={e => {
            const v = e.target.value
            if (/[,;]/.test(v)) add(v); else setText(v)
          }}
          onKeyDown={onKey}
          onFocus={() => setFocus(true)}
          onBlur={() => { setFocus(false); if (text.trim()) add(text) }}
          enterKeyHint="done" autoCapitalize="none" />
      </div>
      {matches.length > 0 && (
        <div className="suggest">
          {matches.map(m => (
            <button type="button" key={m} onMouseDown={e => e.preventDefault()} onClick={() => add(m)}>{m}</button>
          ))}
        </div>
      )}
    </div>
  )
}

export function usePhotoUrls(paths: (string | null)[]) {
  const key = paths.filter(Boolean).sort().join('|')
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    const list = key ? key.split('|') : []
    if (!list.length) return
    let alive = true
    photoUrls(list).then(u => { if (alive) setUrls(u) })
    return () => { alive = false }
  }, [key])
  return urls
}

export function Thumb({ url, name, className = 'thumb' }: { url?: string; name: string; className?: string }) {
  return url
    ? <img className={className} src={url} alt="" loading="lazy" />
    : <div className={`${className} thumb-empty`}>{name.trim().charAt(0).toUpperCase() || '·'}</div>
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="muted small">{hint}</span>}
    </label>
  )
}

export function Icon({ name }: { name: 'back' | 'plus' | 'edit' | 'heart' | 'heart-fill' | 'search' | 'filter' | 'bottle' | 'book' | 'more' | 'camera' | 'trash' | 'close' | 'bookmark' | 'link' | 'check' | 'spark' }) {
  const p: Record<string, ReactNode> = {
    back: <path d="M15 5l-7 7 7 7" />,
    plus: <path d="M12 5v14M5 12h14" />,
    edit: <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />,
    heart: <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />,
    'heart-fill': <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" fill="currentColor" />,
    search: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
    filter: <path d="M4 6h16M7 12h10M10 18h4" />,
    bottle: <><path d="M10 3h4v3h-4z" /><path d="M8 8h8a2 2 0 012 2v9a2 2 0 01-2 2H8a2 2 0 01-2-2v-9a2 2 0 012-2z" /><path d="M6 14h12" /></>,
    book: <><path d="M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3V4z" /><path d="M5 17a3 3 0 013-3h10" /></>,
    more: <><circle cx="6" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="18" cy="12" r="1.3" fill="currentColor" /></>,
    camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
    trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
    close: <path d="M6 6l12 12M18 6L6 18" />,
    bookmark: <path d="M7 4h10a1 1 0 011 1v15l-6-4-6 4V5a1 1 0 011-1z" />,
    link: <><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></>,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />,
  }
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p[name]}</svg>
  )
}

export function LinksEditor({ value, onChange }: { value: Link[]; onChange: (v: Link[]) => void }) {
  const rows = value.length ? value : [{ url: '', label: '' }]
  const update = (i: number, patch: Partial<Link>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div className="links-edit">
      {rows.map((l, i) => (
        <div className="link-row" key={i}>
          <div className="link-inputs">
            <input value={l.url} onChange={e => update(i, { url: e.target.value })} placeholder="https://…"
              inputMode="url" autoCapitalize="none" autoCorrect="off" />
            <input value={l.label} onChange={e => update(i, { label: e.target.value })} placeholder="Label (optional), e.g. decant shop" />
          </div>
          {(rows.length > 1 || l.url || l.label) && (
            <button type="button" className="btn-icon" aria-label="Remove link"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}><Icon name="close" /></button>
          )}
        </div>
      ))}
      <button type="button" className="btn sm add-link" onClick={() => onChange([...rows, { url: '', label: '' }])}>
        <Icon name="plus" /> Add another link
      </button>
    </div>
  )
}
