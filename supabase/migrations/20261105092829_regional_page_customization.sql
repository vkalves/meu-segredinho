alter table public.pages
  add column if not exists country_variants jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pages_country_variants_object'
      and conrelid = 'public.pages'::regclass
  ) then
    alter table public.pages
      add constraint pages_country_variants_object
      check (jsonb_typeof(country_variants) = 'object') not valid;
  end if;
end;
$$;

alter table public.pages validate constraint pages_country_variants_object;

-- Return only the public profile fields after applying the visitor's regional page overrides.
create or replace function public.get_public_page_for_region(page_slug text, country_group text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected_page as (
    select
      p.*,
      case
        when country_group in ('BR', 'EU', 'US', 'GB') then p.country_variants -> country_group
        else '{}'::jsonb
      end as variant
    from public.pages as p
    where p.slug = page_slug
    limit 1
  )
  select jsonb_build_object(
    'id', id,
    'slug', slug,
    'profile_name', coalesce(variant ->> 'profile_name', profile_name),
    'title', coalesce(variant ->> 'title', title),
    'subtitle', coalesce(variant ->> 'subtitle', subtitle),
    'button_label', coalesce(variant ->> 'button_label', button_label),
    'avatar_url', coalesce(variant ->> 'avatar_url', avatar_url),
    'primary_color', coalesce(variant ->> 'primary_color', primary_color),
    'secondary_color', coalesce(variant ->> 'secondary_color', secondary_color),
    'background_color', coalesce(variant ->> 'background_color', background_color),
    'card_color', coalesce(variant ->> 'card_color', card_color),
    'text_color', coalesce(variant ->> 'text_color', text_color),
    'verified', coalesce((variant ->> 'verified')::boolean, verified),
    'show_online', coalesce((variant ->> 'show_online')::boolean, show_online),
    'online_label', coalesce(variant ->> 'online_label', online_label),
    'secure_label', coalesce(variant ->> 'secure_label', secure_label),
    'updated_at', updated_at
  )
  from selected_page;
$$;

revoke all on function public.get_public_page_for_region(text, text) from public, anon, authenticated;
grant execute on function public.get_public_page_for_region(text, text) to anon, service_role;

notify pgrst, 'reload schema';
