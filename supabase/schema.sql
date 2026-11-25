-- Perfume Diary: database schema

create table if not exists public.perfumes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null,
  brand         text,
  perfumer      text,
  year          smallint,
  concentration text,                         -- EDT, EDP, Parfum, Extrait, Cologne, Oil
  family        text,                         -- fragrance family
  top_notes     text[] not null default '{}',
  heart_notes   text[] not null default '{}',
  base_notes    text[] not null default '{}',
  price_per_ml  numeric(10,2),
  currency      text not null default '₴',
  volume_ml     numeric(6,1) default 3,
  status        text not null default 'decant', -- decant, sample, bottle, wishlist
  rating        numeric(2,1) check (rating between 0 and 5),
  longevity     smallint check (longevity between 1 and 5),
  sillage       smallint check (sillage between 1 and 5),
  seasons       text[] not null default '{}',  -- winter, spring, summer, autumn
  daytime       text[] not null default '{}',  -- day, evening
  would_buy     text,                          -- yes, maybe, no
  tried_on      date,
  review        text,
  photo_path    text,
  favorite      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.terms (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  kind        text not null default 'molecule', -- molecule, note, accord, term, perfumer
  smell       text,                             -- how it smells
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists perfumes_touch on public.perfumes;
create trigger perfumes_touch before update on public.perfumes
  for each row execute function public.touch_updated_at();
drop trigger if exists terms_touch on public.terms;
create trigger terms_touch before update on public.terms
  for each row execute function public.touch_updated_at();

-- Access: each row is visible and editable only by its owner
alter table public.perfumes enable row level security;
alter table public.terms enable row level security;

drop policy if exists "own perfumes" on public.perfumes;
create policy "own perfumes" on public.perfumes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own terms" on public.terms;
create policy "own terms" on public.terms for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Photos: private storage, folder = user id
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "own photos" on storage.objects;
create policy "own photos" on storage.objects for all to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Want to try: where she heard about it and where to try it
alter table public.perfumes add column if not exists reason_source text;   -- friend, reels, tiktok, youtube, notes, review, store, other
alter table public.perfumes add column if not exists reason_note   text;
alter table public.perfumes add column if not exists links         jsonb not null default '[]'; -- [{ "url": "...", "label": "..." }]

-- AI forecasts: the app queues a request (or calls the API now); Claude Code processes the queue
create table if not exists public.predictions (
  perfume_id   uuid primary key references public.perfumes(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status       text not null default 'queued',     -- queued, done
  rating       numeric(2,1) check (rating between 0 and 5),
  confidence   text,                               -- low, medium, high
  summary      text,                               -- expected review in her words
  likes        text[] not null default '{}',       -- what she will probably like
  risks        text[] not null default '{}',       -- what she might dislike
  requested_at timestamptz not null default now(),
  done_at      timestamptz
);

-- Taste profile: one row per user
create table if not exists public.taste_profile (
  user_id           uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  profile           text,
  loves             text[] not null default '{}',
  avoids            text[] not null default '{}',
  based_on          int not null default 0,          -- how many rated perfumes were considered
  refresh_requested boolean not null default false,
  updated_at        timestamptz not null default now()
);

alter table public.predictions enable row level security;
alter table public.taste_profile enable row level security;
drop policy if exists "own predictions" on public.predictions;
create policy "own predictions" on public.predictions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own profile" on public.taste_profile;
create policy "own profile" on public.taste_profile for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Lookup queue: a perfume draft that Claude Code fills with notes and photo
alter table public.perfumes add column if not exists lookup_status text;  -- queued | null

-- Links between perfumes: similar / alternative / twin
create table if not exists public.perfume_links (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  a          uuid not null references public.perfumes(id) on delete cascade,
  b          uuid not null references public.perfumes(id) on delete cascade,
  kind       text not null default 'similar',   -- similar, alternative, twin
  note       text,
  created_at timestamptz not null default now()
);
alter table public.perfume_links enable row level security;
drop policy if exists "own links" on public.perfume_links;
create policy "own links" on public.perfume_links for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Photo/screenshot recognition queue (free path via Claude Code)
create table if not exists public.import_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  image_path    text not null,
  target_status text not null default 'wishlist',
  status        text not null default 'queued',   -- queued, done
  result        text,
  created_at    timestamptz not null default now()
);
alter table public.import_requests enable row level security;
drop policy if exists "own imports" on public.import_requests;
create policy "own imports" on public.import_requests for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Note passport: an AI explanation can be queued
alter table public.terms add column if not exists ai_status text;  -- queued | null

-- Discover: requests and results (now via the API or queued for Claude Code)
create table if not exists public.recommend_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  query       text not null,
  perfume_id  uuid references public.perfumes(id) on delete set null,
  status      text not null default 'queued',   -- queued, done
  items       jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);
alter table public.recommend_requests enable row level security;
drop policy if exists "own recs" on public.recommend_requests;
create policy "own recs" on public.recommend_requests for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Settings: name and AI output language (changed on the site, no redeploy)
create table if not exists public.user_settings (
  user_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text,
  ai_language  text not null default 'Ukrainian',
  updated_at   timestamptz not null default now()
);
alter table public.user_settings enable row level security;
drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
