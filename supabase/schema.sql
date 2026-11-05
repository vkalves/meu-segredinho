-- Privame Links schema. Run once in the Supabase SQL Editor, or apply it through
-- a linked Supabase project after review.

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  profile_name text not null check (char_length(profile_name) between 1 and 50),
  title text not null check (char_length(title) between 1 and 70),
  subtitle text not null default '' check (char_length(subtitle) <= 180),
  button_label text not null check (char_length(button_label) between 1 and 36),
  destination_url text not null check (destination_url ~* '^https?://'),
  country_destinations jsonb not null default '{}'::jsonb constraint pages_country_destinations_object check (jsonb_typeof(country_destinations) = 'object'),
  avatar_url text not null default '',
  primary_color text not null default '#2AABEE' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color text not null default '#229ED9' check (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  background_color text not null default '#eaf6fd' check (background_color ~ '^#[0-9a-fA-F]{6}$'),
  card_color text not null default '#ffffff' check (card_color ~ '^#[0-9a-fA-F]{6}$'),
  text_color text not null default '#343434' check (text_color ~ '^#[0-9a-fA-F]{6}$'),
  verified boolean not null default true,
  show_online boolean not null default true,
  online_label text not null default 'online agora' check (char_length(online_label) <= 32),
  secure_label text not null default 'site seguro e anônimo' check (char_length(secure_label) <= 48),
  clicks bigint not null default 0 check (clicks >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pages_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$'),
  constraint pages_slug_not_reserved check (slug !~ '^(api|app|assets|dashboard|editor|login|register|logout|go|create|settings|bianca|eliane|juju|nicolle|privame|favicon\.ico|favicon\.svg|robots\.txt|sitemap\.xml)$')
);

create index if not exists pages_user_id_updated_at_idx on public.pages (user_id, updated_at desc);

alter table public.pages enable row level security;
revoke all on table public.pages from public, anon;
grant select, insert, update, delete on table public.pages to authenticated;
grant all on table public.pages to service_role;

drop policy if exists "Owners can read their pages" on public.pages;
create policy "Owners can read their pages" on public.pages
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Owners can create their pages" on public.pages;
create policy "Owners can create their pages" on public.pages
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Owners can update their pages" on public.pages;
create policy "Owners can update their pages" on public.pages
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Owners can delete their pages" on public.pages;
create policy "Owners can delete their pages" on public.pages
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Public profiles expose only the fields used by the public page renderer.
grant select (
  id, slug, profile_name, title, subtitle, button_label, avatar_url,
  primary_color, secondary_color, background_color, card_color, text_color,
  verified, show_online, online_label, secure_label, updated_at
) on table public.pages to anon;

drop policy if exists "Anyone can read public page profiles" on public.pages;
create policy "Anyone can read public page profiles" on public.pages
  for select to anon
  using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('privame-avatars', 'privame-avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

grant insert on table storage.objects to authenticated;
drop policy if exists "Users can upload their own avatars" on storage.objects;
create policy "Users can upload their own avatars" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'privame-avatars'
    and (storage.foldername(name))[1] = (select (auth.uid())::text)
  );

create or replace function public.increment_page_clicks(page_slug text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_url text;
begin
  update public.pages
  set clicks = clicks + 1
  where slug = page_slug
  returning destination_url into target_url;
  return target_url;
end;
$$;

revoke all on function public.increment_page_clicks(text) from public, anon, authenticated;
grant execute on function public.increment_page_clicks(text) to anon, service_role;

-- Keep the original overload available while older deployed code uses it.
create or replace function public.increment_page_clicks(page_slug text, country_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_url text;
begin
  update public.pages
  set clicks = clicks + 1
  where slug = page_slug
  returning coalesce(nullif(country_destinations ->> upper(country_code), ''), destination_url) into target_url;
  return target_url;
end;
$$;

revoke all on function public.increment_page_clicks(text, text) from public, anon, authenticated;
grant execute on function public.increment_page_clicks(text, text) to anon, service_role;

notify pgrst, 'reload schema';
