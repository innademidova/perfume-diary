// Виконати SQL у базі Supabase (зміни схеми тощо).
//   node scripts/sql.mjs "select count(*) from perfumes"     або     node scripts/sql.mjs file.sql
// Токен: SUPABASE_ACCESS_TOKEN або вхід Supabase CLI з Keychain (npx supabase login).
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const REF = 'eyczhhvxuofvfeoqwfbg'
let token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  try { token = execSync('security find-generic-password -s "Supabase CLI" -w', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }
  catch { /* немає */ }
  if (token?.startsWith('go-keyring-base64:')) token = Buffer.from(token.slice(18), 'base64').toString()
}
if (!token) { console.error('No Supabase token. Ask the owner to run: ! npx supabase login --token sbp_…'); process.exit(1) }

const arg = process.argv[2]
const query = arg && existsSync(arg) ? readFileSync(arg, 'utf8') : arg
const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
})
console.log(r.status, JSON.stringify(await r.json(), null, 1))
