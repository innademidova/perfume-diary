-- Парфумерний щоденник: схема бази даних

create table if not exists public.perfumes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null,
  brand         text,
  perfumer      text,
  year          smallint,
  concentration text,                         -- EDT, EDP, Parfum, Extrait, Cologne, Oil
  family        text,                         -- група аромату
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
  smell       text,                             -- як пахне
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

-- Доступ: кожен запис бачить і змінює лише його власниця
alter table public.perfumes enable row level security;
alter table public.terms enable row level security;

drop policy if exists "own perfumes" on public.perfumes;
create policy "own perfumes" on public.perfumes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own terms" on public.terms;
create policy "own terms" on public.terms for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Фото: приватне сховище, папка = id користувача
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "own photos" on storage.objects;
create policy "own photos" on storage.objects for all to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
