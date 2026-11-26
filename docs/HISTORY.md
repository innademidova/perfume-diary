# History — what was built, in order (all on 2026-10-30)

1. **Idea.** She kept a paper notebook (name, brand, price/ml, rating, picture, family, top/heart/base notes,
   review, plus things she learns, e.g. "Petalia is a Givaudan molecule"). Problems: no search/filter, no photos,
   handwriting. iPhone first, free hosting. Chosen: PWA + Supabase + GitHub Pages.
2. **Setup.** Claude created the Supabase schema, login user, disabled signups, built the app, deployed.
   She logged in to GitHub/Supabase herself (Claude can't create accounts).
3. **v1** in Russian with a beige/serif design → she asked for **English UI** and a **softer modern pastel
   pink/blue design**. Then: **no Russian anywhere**, Ukrainian instead.
4. **First notebook entry** (Etat Libre d'Orange — Don't Get Me Wrong Baby, Yes I Do) transcribed from photos,
   official bottle photo from the brand site.
5. **Want to try** tab: reason dropdown (friend / Reels / TikTok / YouTube / notes / review / store / other) +
   free-text details, multiple "where to try" links, "I tried it" button converting to a rated entry.
   Links also added to normal perfume cards. "Date tried" not needed for wishlist.
6. **Bulk import:** 48 notebook photos → 51 entries with reviews; 8 glossary terms; then a list of 39 owned but
   unrated perfumes (+ Orza later) → new **To rate** section (segmented control in Perfumes tab, "Rate it" button).
7. Fixes: bottle thumbnails were cropped → `contain` on white. Added **brand filter**.
8. **Forecasting.** She wanted predictions of whether she'll like a perfume. Advice given: no RAG needed (data is
   small; send everything). Step 1 algorithm tested — notes alone don't predict her ratings (see INSIGHTS), so the
   app shows "Clues from my diary" (similar rated perfumes, her average per note) and "Notes by my ratings" in
   Insights instead of a fake number.
9. **AI via Claude Code queue** (her choice: free on her subscription): "Ask for a forecast" button queues a request,
   she asks Claude Code to process the queue, Claude writes forecasts and the taste profile into Supabase.
   Forecast vs reality is shown after she rates; accuracy in Insights. First profile + first forecast (Orza, ~2.5★)
   written by Claude.
10. **Agreed next:** AI autofill on the add form using Gemini (free) — waiting for her API key.
11. She asked to keep full project context in the repo → this file, `CLAUDE.md`, `docs/INSIGHTS.md`.
12. **Responsive layout** (she uses it on the computer too): grid of cards ⇄ list toggle (remembered per device;
    default grid on ≥700px, list on phone), tablet layout, desktop ≥1100px with a left sidebar, perfume card in two
    columns (sticky photo left) on ≥900px.
13. **Gemini key received** for AI autofill. Notes: older models (2.5) are unavailable to new users; new models
    work via the Interactions API (`POST /v1beta/interactions`, tools `[{"type":"google_search"}]`).
14. Gemini dropped (no free search grounding for current models; Fragrantica/Parfumo/search engines block scraping).
15. She gave a **Claude API key**: Edge Function `ai` with Claude Haiku 5.5. Every AI action now offers "now" (API) or
    "queue" (free, Claude Code). Add form has "Find with AI" (candidate versions with bottle photos → prefilled form,
    marked "filled by AI", source link) or "Add to queue" (draft with ⏳, filled by Claude Code).
16. Password changed at her request (stored only in `.env.local`).
17. Workspace ID received → API mode works (lookup ~15 s with 3 web searches; forecast ~5 s).
18. Add form: "I have it / Want to try" switch (she couldn't find how to add to Want to try). Password field has a show/hide eye.
19. Wide monitors: content fills the screen (grid up to ~1640px, centred), narrow pages centred; Insights stat renamed to «in my diary».
20. Photos replaced for Carate Urio and Red Enigma (white background). Added 24 perfumes to Want to try from her shop screenshots (with ₴/ml where shown); duplicates skipped.
21. Helper scripts moved into the repo (sql.mjs, add-perfumes.mjs) and CLAUDE.md documents what persists between sessions.
22. Add from photo (screenshot/bottles/notebook → recognize → skip duplicates → find versions → add; or queue), perfume links (similar/alternative/twin, 15 seeded from her reviews) with side-by-side Compare, Note passport (/n/<note>: explanation via AI or queue, saved to glossary; her average; often paired; perfumes by section). Tapping notes anywhere opens the passport.
23. Discover tab: AI recommendations beyond the diary (free-text request or «Find similar outside my diary» on a perfume card), results with photo, why/risk in Ukrainian, match level, one-tap «Want to try» (reason = AI recommendation). Now (~3–5¢, ~40 s) or queue.
24. Taste profile: «Update now / Add to queue» buttons always visible (no «Update anyway» dropdown).
25. Removed "process the queue" hints from the app (she knows how the queue works).
26. Queue forecasts now read the perfume's Fragrantica page (accords, season votes, user reviews) via Chrome before predicting.
27. Forecast card: «Forecast now» (diary only) and «With reviews» (web search of reviews first, ~2–4¢) + queue.
28. Settings screen: name, change password, AI language (stored in user_settings, read by the Edge Function and the queue — no redeploy), backup, sign out.
29. Repo switched to English-only (no Cyrillic in code, prompts, docs, commits). Repo made public again, Pages back on.
30. Red/green signals from her reviews replace per-note averages on To rate / Want to try cards (taste_profile.signals); Fragrantica main accords stored in perfumes.accords and shown on the card.
31. Profile and signals rewritten in Russian (her AI language); new green signal for light Eau Fraîche versions; signals can match by perfume name.
