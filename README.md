# Парфумерний щоденник

Особистий PWA-застосунок для записів про розпиви: ноти, оцінки, відгуки, фото та словник молекул.

- Фронтенд: React + Vite, PWA (встановлюється на iPhone через Safari → «На екран «Додому»»)
- Дані та фото: Supabase (схема — `supabase/schema.sql`)
- Хостинг: GitHub Pages з гілки `gh-pages`, викладання командою `npm run deploy`

```
npm install
npm run dev
```

## Черга ІІ (прогнози та профіль смаку)

Кнопки в застосунку ставлять запити в таблиці `predictions` і `taste_profile`. Обробляє їх Claude Code:

```
node scripts/ai-queue.mjs export ctx.json   # черга + весь контекст щоденника
node scripts/ai-queue.mjs apply  res.json   # записати готові прогнози / профіль
```

Логін для скрипта — у `.env.local` (`PERFUME_EMAIL`, `PERFUME_PASSWORD`), файл не комітиться.
