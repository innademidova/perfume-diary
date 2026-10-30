---
name: perfume-diary
description: The owner's personal Perfume Diary app (PWA + Supabase, ~/projects/perfume-diary). Use whenever she mentions her perfume diary/app, perfumes, decants, ratings, notes, glossary, "To rate", "Want to try", taste profile or forecasts, asks to add perfumes (names, lists or notebook photos), or says «обработай очередь» / "process the queue".
---

# Perfume Diary

1. Read `~/projects/perfume-diary/CLAUDE.md` first — it has the rules (UI English, never Russian in the project,
   Ukrainian otherwise), architecture, data model, deploy steps and workflows. Background: `docs/HISTORY.md`,
   `docs/INSIGHTS.md`.
2. Work inside `~/projects/perfume-diary`.
3. «обработай очередь» → follow "Workflow: process the AI queue" in CLAUDE.md
   (`node scripts/ai-queue.mjs export …` → write forecasts/profile → `node scripts/ai-queue.mjs apply …`).
4. Adding perfumes → follow "Adding perfumes for her" in CLAUDE.md (verify bottle photos visually).
5. After any code change: build, `npm run deploy`, commit (Ukrainian message) and push; then append a line to
   `docs/HISTORY.md` and update CLAUDE.md if rules, features or open items changed.
