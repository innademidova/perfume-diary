# Perfume Diary

A personal PWA for notes on perfume decants: notes, ratings, reviews, photos and a glossary of molecules.

- Frontend: React + Vite, PWA (installed on iPhone via Safari → Add to Home Screen)
- Data and photos: Supabase (schema in `supabase/schema.sql`)
- Hosting: GitHub Pages from the `gh-pages` branch, deployed with `npm run deploy`

## AI queue (forecasts and taste profile)

Every AI action can run now (paid Claude API via the Edge Function `supabase/functions/ai`) or be queued for free.
Queued requests are processed by Claude Code:

```
node scripts/ai-queue.mjs export ctx.json   # queue + the whole diary context
node scripts/ai-queue.mjs apply  res.json   # write finished forecasts / profile
```

The script's login lives in `.env.local` (`PERFUME_EMAIL`, `PERFUME_PASSWORD`); the file is not committed.
