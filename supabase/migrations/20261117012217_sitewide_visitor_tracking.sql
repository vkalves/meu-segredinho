-- Keep ownership from Juju for legacy pages and from pages.user_id for user pages.
alter table public.tracking_sites drop constraint tracking_sites_path_check;
alter table public.tracking_sites add constraint tracking_sites_path_check check (path ~ '^/[a-z0-9/.-]+$');
alter table public.tracking_events drop constraint tracking_events_site_id_fkey;
alter table public.tracking_events add constraint tracking_events_site_id_fkey
  foreign key (site_id) references public.tracking_sites(slug) on delete cascade on update cascade;
drop policy "Public Juju event collection" on public.tracking_events;
-- The FK admits only provisioned sites; all existing read/owner policies remain.
create policy "Public site event collection" on public.tracking_events
  for insert to anon with check (true);

insert into public.tracking_sites(slug,user_id,name,path)
select v.slug, j.user_id, v.name, v.path
from public.tracking_sites j cross join (values
  ('principal','Principal','/index.html'), ('bianca','Bianca','/bianca'),
  ('eliane','Eliane','/eliane'), ('nicolle','Nicolle','/nicolle'),
  ('privame','Privame institucional','/privame'), ('vejamais','Veja Mais','/vejamais')
) as v(slug,name,path) where j.slug='juju';

create schema if not exists private;
create function private.sync_page_tracking() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.tracking_sites where slug=old.slug and user_id=old.user_id;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    update public.tracking_sites set slug=new.slug, user_id=new.user_id,
      name=left(new.profile_name,80), path='/'||new.slug
    where slug=old.slug and user_id=old.user_id;
    if found then return new; end if;
  end if;
  insert into public.tracking_sites(slug,user_id,name,path)
  values(new.slug,new.user_id,left(new.profile_name,80),'/'||new.slug);
  return new;
end $$;
revoke all on function private.sync_page_tracking() from public,anon,authenticated;
create trigger sync_page_tracking after insert or update of slug,user_id,profile_name or delete
on public.pages for each row execute function private.sync_page_tracking();

insert into public.tracking_sites(slug,user_id,name,path)
select slug,user_id,left(profile_name,80),'/'||slug from public.pages;
notify pgrst, 'reload schema';
