# Perfume Diary — project context for Claude

A personal perfume diary PWA for one user (the owner, not a developer). She tests perfumes from
3 ml decants, writes down notes, ratings and reviews, and wants to learn her own taste. Claude does
all technical work; the owner talks in Russian/Ukrainian and decides on features and design.

Live: https://innademidova.github.io/perfume-diary/ (installed on her iPhone via Safari → Add to Home Screen)
Repo: github.com/innademidova/perfume-diary · local: `~/projects/perfume-diary`

More detail: `docs/HISTORY.md` (what was built and why, in order), `docs/INSIGHTS.md` (findings about her taste and data).

## Hard rules from the owner

- **App UI is English.** All other non-English text (code comments, README, commit messages, repo
  description, glossary entries) must be **Ukrainian. Never Russian anywhere in the project.**
  Chat replies to the owner: in the language she writes in, plain and non-technical.
- Her reviews are kept exactly in her words (Ukrainian); only punctuation may be fixed.
  Notes are stored in **English, lowercase** (matches the UI's note suggestions and filters).
- Design: soft pastel pink + powder blue, modern sans (Plus Jakarta Sans), rounded translucent
  cards, floating pill tab bar, light + dark. She rejected an earlier beige/serif "luxury" look.
- Hosting must stay free (GitHub Pages + Supabase free tier).
- Bottle photos must never be cropped (`object-fit: contain` on white).
- Ask before anything that costs money.

## Stack and layout

- React 19 + Vite + TypeScript, `vite-plugin-pwa` (autoUpdate). No router lib: hash routes in `src/App.tsx`.
- Supabase project "Perfumes" (ref `eyczhhvxuofvfeoqwfbg`). Publishable key is in `src/lib.ts` (safe: RLS + login).
  Signups are disabled; single user `doc.idemidova@gmail.com`. Password: `.env.local` (git-ignored).
- `src/lib.ts` types, constants (families, notes, statuses, reasons…), photo upload/compress, helpers.
- `src/Perfumes.tsx` list (filters, Rated / To rate segmented control), detail card, add/edit form.
- `src/Terms.tsx` glossary. `src/More.tsx` Insights tab. `src/ui.tsx` shared components + icons.
- `src/predict.ts` note statistics + "similar perfumes" (no numeric forecast — see INSIGHTS).
- `src/Extra.tsx` add-from-photo, perfume links + Compare, Note passport. `src/Discover.tsx` AI recommendations
  (Discover tab; `recommend` action uses web search, ~3–5¢; results stored in `recommend_requests`).
- `src/ai.tsx` AI forecast card, taste profile card, accuracy card (queue-based, see below).
- `supabase/schema.sql` full schema; apply changes via SQL (append new statements to this file too).
- `scripts/sql.mjs` run SQL against the database (schema changes; token from the Supabase CLI login in Keychain).
- `scripts/add-perfumes.mjs` bulk-add perfumes from a JSON file (photos from Fragrantica IDs or image paths/URLs, duplicates skipped).
- `scripts/ai-queue.mjs` export/apply for the AI queue (forecasts, taste profile, lookup drafts).
- `supabase/functions/ai/index.ts` Edge Function (Deno) calling **Claude Haiku 5.5** (`claude-haiku-5-5`) via the API:
  actions `lookup` (web search on Fragrantica → candidate versions), `image` (copies the fimgs bottle photo into
  Storage), `forecast`, `profile`. Secrets in Supabase: `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID` (her key is
  not workspace-scoped, so the workspace header is required). Deploy:
  `npx supabase functions deploy ai --project-ref eyczhhvxuofvfeoqwfbg --use-api`.

## Data model (Supabase, all tables RLS "own rows only")

- `perfumes`: name, brand, perfumer, year, concentration, family (free text, English), top/heart/base_notes (text[]),
  price_per_ml (₴ by default), currency, volume_ml (3), status (`decant` | `sample` | `bottle` | `wishlist`),
  rating (0–5 in 0.5 steps; her notebook uses /10 → divide by 2), longevity/sillage (1–5), seasons, daytime,
  would_buy, tried_on, review, photo_path (Storage), favorite, reason_source + reason_note (why she wants it),
  links (jsonb `[{url,label}]`).
  - Sections: **Rated** = not wishlist & rating set · **To rate** = not wishlist & rating null ·
    **Want to try** = status `wishlist`.
- `terms`: glossary (molecule/note/accord/perfumer/term). Name in English so it auto-links to perfumes whose
  notes/review contain it; smell/description in Ukrainian.
- `predictions`: one per perfume — status `queued`|`done`, rating, confidence, summary (Ukrainian, her voice),
  likes[], risks[].
- `taste_profile`: one row — profile text (Ukrainian), loves[], avoids[], based_on (rated count), refresh_requested.
- Storage bucket `photos` (private, signed URLs), path `<user_id>/<uuid>.jpg`.

## Access in a new session (what persists on this Mac)

- GitHub: `gh` is logged in as `innademidova` (Keychain); this repo pushes through `gh auth git-credential`.
- Supabase CLI: logged in with an access token (Keychain) → `scripts/sql.mjs`, `supabase functions deploy`,
  `supabase secrets set` work. **If it fails with 401, the token expired** (she created it with an expiry): ask her to
  create a new one at supabase.com/dashboard/account/tokens and run `! npx supabase login --token sbp_…`.
- App data (her login): `.env.local` → `scripts/ai-queue.mjs`, `scripts/add-perfumes.mjs`.
- Claude API key + workspace: Supabase secrets (nothing needed locally).
- Nothing else needs to be reconnected.

## Deploy

`npm run build` to check, then `npm run deploy` (builds and force-pushes `dist` to the `gh-pages` branch;
Pages is in legacy branch mode). Then commit + push `main`. GitHub Actions is NOT used (the gh token lacks
`workflow` scope). Git on this Mac defaults to a work account; this repo uses a local credential helper
`gh auth git-credential` for the personal account `innademidova` — don't touch global git config.
After deploy the app updates itself: the service worker uses skipWaiting + clientsClaim (vite.config.ts) and `src/main.tsx` reloads the page when a new version takes control and checks for updates on focus. Without skipWaiting a new version stayed "waiting" until every app tab was closed.

## AI: two modes, her choice per action

Every AI action in the app offers **"… now"** (paid Claude API via the Edge Function; lookup ≈ 1–3¢ because web
search is $10 / 1000 searches, forecast < 1¢) and **"Add to queue"** (free: processed by Claude Code on her
subscription when she says «обработай очередь»). She wants to decide per case depending on urgency.

## Workflow: "обработай очередь" (process the AI queue)

The app only queues requests; Claude Code is the model. When she asks to process the queue:

1. `node scripts/ai-queue.mjs export /tmp/…/ctx.json` → queue, all rated perfumes with reviews, glossary,
   current profile, past predictions vs actual.
2. If `profile_requested` (or ≥3 new ratings since `based_on`), rewrite the taste profile from **all review
   texts**, not just notes. Keep it ~3 short paragraphs in Ukrainian addressed to her ("ти"), plus loves/avoids tags.
3. For each queued perfume write a forecast: rating (0.5 steps), confidence, a 3–5 sentence summary in Ukrainian
   in her style (what she'll probably smell, what she'll like/dislike, compare with perfumes she rated), likes/risks
   tags. Use her patterns (see INSIGHTS) and similar rated perfumes. Learn from past misses.
   **Before each forecast read the perfume's Fragrantica page in Chrome** (claude-in-chrome `get_page_text`; reading
   works): main accords (e.g. "powdery", "sweet"), season votes, rating, and user reviews (what people say about
   powderiness, sweetness, longevity, which note dominates). Her ratings follow how a perfume actually smells, not the
   note list, so reviews weigh more than notes. If Fragrantica fails, use Google snippets / Parfumo / Reddit. Mention
   in the summary what the reviews say when it matters.
4a. For each item in `imports`: look at the image (Read the local file), recognize perfumes (shop screenshot,
   bottles, or a Ukrainian notebook page with rating /10 and review), skip ones already in the diary, find them on
   Fragrantica, verify photos, add with `scripts/add-perfumes.mjs` (status = `target_status`), then list the id in
   `imports_done` with a short result.
4c. For each item in `recommend` (Discover tab): suggest 5–8 real perfumes NOT in `diary_names` that fit the query
   (and `based_on` perfume if given) and her taste; verify each on Fragrantica (exact page + id, notes); `why` = 2–3
   sentences in Ukrainian ("ти") comparing with her rated perfumes, `risk` = 1 sentence or null, `match`. Put them in
   `recommendations`.
4b. For each item in `terms_to_explain`: write `kind`, `smell` (1–2 sentences) and `description` (2–4 sentences) in
   Ukrainian, addressing her as "ти", and put them in `terms`.
4. For each item in `lookups` (drafts she added by name only): find the exact Fragrantica page (see "Adding perfumes"),
   fill name, brand, year, perfumer, concentration, family, notes and `fragrantica_id` (the script copies the photo).
   Verify the bottle image visually before applying.
5. Write `{profile|null, lookups:[…], predictions:[…]}` and run `node scripts/ai-queue.mjs apply res.json`.
6. Tell her briefly what was predicted / added.

## Adding perfumes for her (how it has been done)

She gives names (or notebook photos — read handwriting, Ukrainian). For each: find the exact Fragrantica page
(watch out for flankers: EDT vs EDP, Eau Fraîche, Elixir, year versions), take notes from there, and the bottle
image `https://fimgs.net/mdimg/perfume/o.<fragrantica_id>.jpg`. Make a contact sheet to verify every bottle visually
before importing. Upload the image to Storage, insert the row. Unrated owned perfumes → status `decant`, rating null.

## Open items / ideas

- Claude API is connected (workspace `wrkspc_01NQkNTTNvnznQTWDAiigtWL`, secret set). Gemini was dropped: Google Search
  grounding isn't on its free tier.
- Possible later: chat with the diary ("what to wear this autumn?"), sort To rate by forecast.
