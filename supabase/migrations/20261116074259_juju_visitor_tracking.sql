-- Tracking is separate from editable pages: /juju remains a legacy static site.
create table public.tracking_sites (
  slug text primary key check (slug ~ '^[a-z0-9-]{1,30}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  path text not null check (path ~ '^/[a-z0-9/-]+$')
);
create index tracking_sites_user_id_idx on public.tracking_sites(user_id);
alter table public.tracking_sites enable row level security;
revoke all on public.tracking_sites from public, anon, authenticated;
grant select on public.tracking_sites to authenticated;
grant all on public.tracking_sites to service_role;
create policy "Owners read tracked sites" on public.tracking_sites
  for select to authenticated using (user_id = (select auth.uid()));

create table public.tracking_events (
  event_id uuid primary key,
  site_id text not null references public.tracking_sites(slug) on delete cascade,
  visitor_id uuid not null,
  event_type text not null check (event_type in ('view', 'click')),
  country text not null default '' check (country = '' or country ~ '^[A-Z]{2}$'),
  region text not null default '' check (char_length(region) <= 80),
  city text not null default '' check (char_length(city) <= 120),
  locale text not null check (locale in ('pt-BR', 'en', 'es', 'ar')),
  utm_source text not null default '' check (char_length(utm_source) <= 100),
  utm_medium text not null default '' check (char_length(utm_medium) <= 100),
  utm_campaign text not null default '' check (char_length(utm_campaign) <= 150),
  referrer_host text not null default '' check (char_length(referrer_host) <= 253),
  created_at timestamptz not null default now()
);
create index tracking_events_site_created_idx on public.tracking_events(site_id, created_at desc);
create index tracking_events_site_visitor_idx on public.tracking_events(site_id, visitor_id, created_at desc);
alter table public.tracking_events enable row level security;
revoke all on public.tracking_events from public, anon, authenticated;
-- Public collection can write bounded event fields, but cannot read, change the
-- server timestamp, update, delete, or see reports. Like other public analytics,
-- events can be affected by bots/spoofing and aren't proof of a person's identity.
grant insert (event_id, site_id, visitor_id, event_type, country, region, city,
  locale, utm_source, utm_medium, utm_campaign, referrer_host)
  on public.tracking_events to anon;
grant select on public.tracking_events to authenticated;
grant all on public.tracking_events to service_role;
create policy "Public Juju event collection" on public.tracking_events
  for insert to anon with check (site_id = 'juju');
create policy "Owners read tracked events" on public.tracking_events
  for select to authenticated using (
    site_id in (select slug from public.tracking_sites where user_id = (select auth.uid()))
  );

create function public.get_tracking_report(site_slug text, report_days integer default 7, filter_country text default '')
returns jsonb language sql stable security invoker set search_path = '' as $$
  with base as materialized (
    select * from public.tracking_events
    where site_id = site_slug
      and created_at >= now() - make_interval(days => least(greatest(report_days, 1), 30))
  ), filtered as materialized (
    select * from base where coalesce(filter_country, '') = '' or country = filter_country
  ), visitor_totals as (
    select visitor_id, min(created_at) as first_seen, max(created_at) as last_seen,
      count(*) filter (where event_type = 'view') as views,
      count(*) filter (where event_type = 'click') as clicks
    from filtered group by visitor_id
  ), latest as (
    select distinct on (visitor_id) visitor_id, country, region, city, locale,
      utm_source, utm_medium, utm_campaign, referrer_host
    from filtered order by visitor_id, created_at desc, event_id
  ), visitors as (
    select t.*, l.country, l.region, l.city, l.locale,
      l.utm_source, l.utm_medium, l.utm_campaign, l.referrer_host
    from visitor_totals t join latest l using (visitor_id)
    order by last_seen desc limit 100
  ), countries as (
    select country, count(distinct visitor_id) as visitors,
      count(*) filter (where event_type = 'view') as views,
      count(*) filter (where event_type = 'click') as clicks
    from base group by country order by visitors desc, country
  )
  select jsonb_build_object(
    'summary', (select jsonb_build_object(
      'views', count(*) filter (where event_type = 'view'),
      'clicks', count(*) filter (where event_type = 'click'),
      'visitors', count(distinct visitor_id),
      'clickedVisitors', count(distinct visitor_id) filter (where event_type = 'click')
    ) from filtered),
    'countries', coalesce((select jsonb_agg(to_jsonb(c)) from countries c), '[]'::jsonb),
    'visitors', coalesce((select jsonb_agg(to_jsonb(v)) from visitors v), '[]'::jsonb)
  );
$$;
revoke all on function public.get_tracking_report(text, integer, text) from public, anon;
grant execute on function public.get_tracking_report(text, integer, text) to authenticated;

-- Provision /juju for the intended existing Auth account using the SQL Editor:
-- insert into public.tracking_sites(slug, user_id, name, path)
-- select 'juju', id, 'Juju', '/juju' from auth.users
-- where lower(email) = lower('OWNER_LOGIN_EMAIL');
notify pgrst, 'reload schema';
