alter table public.pages
  add column if not exists country_destinations jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pages_country_destinations_object'
      and conrelid = 'public.pages'::regclass
  ) then
    alter table public.pages
      add constraint pages_country_destinations_object
      check (jsonb_typeof(country_destinations) = 'object') not valid;
  end if;
end;
$$;

alter table public.pages validate constraint pages_country_destinations_object;

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
