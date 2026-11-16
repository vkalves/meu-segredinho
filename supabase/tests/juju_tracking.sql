-- Run against a disposable database after the migration. Changes are rolled back.
begin;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
insert into public.tracking_sites(slug,user_id,name,path) values
  ('juju','11111111-1111-4111-8111-111111111111','Juju','/juju'),
  ('other','22222222-2222-4222-8222-222222222222','Other','/other');
set local role anon;
insert into public.tracking_events(event_id,site_id,visitor_id,event_type,country,city,locale)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','juju','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','view','US','Miami','en');
-- Duplicate deliveries must not double count.
do $$ begin
  begin
    insert into public.tracking_events(event_id,site_id,visitor_id,event_type,country,locale)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','juju','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','view','US','en');
    raise exception 'Duplicate event unexpectedly accepted';
  exception when unique_violation then null; end;
end $$;
insert into public.tracking_events(event_id,site_id,visitor_id,event_type,country,locale)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','juju','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','click','US','en');
do $$ begin
  begin perform * from public.tracking_events; raise exception 'Anonymous read unexpectedly succeeded'; exception when insufficient_privilege then null; end;
  begin perform public.get_tracking_report('juju',7,''); raise exception 'Anonymous report unexpectedly succeeded'; exception when insufficient_privilege then null; end;
  begin update public.tracking_events set country='BR'; raise exception 'Anonymous update unexpectedly succeeded'; exception when insufficient_privilege then null; end;
  begin delete from public.tracking_events; raise exception 'Anonymous delete unexpectedly succeeded'; exception when insufficient_privilege then null; end;
  begin
    insert into public.tracking_events(event_id,site_id,visitor_id,event_type,locale) values(gen_random_uuid(),'other',gen_random_uuid(),'view','en');
    raise exception 'Collection for unauthorized site unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.tracking_events(event_id,site_id,visitor_id,event_type,locale,created_at) values(gen_random_uuid(),'juju',gen_random_uuid(),'view','en',now()-interval '1 year');
    raise exception 'Timestamp override unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
  if exists(select 1 from public.tracking_events) then raise exception 'Cross-account data leak'; end if;
  if (public.get_tracking_report('juju',7,'')->'summary'->>'visitors')::int <> 0 then raise exception 'Cross-account report leak'; end if;
  begin insert into public.tracking_sites values('stolen','22222222-2222-4222-8222-222222222222','Stolen','/stolen'); raise exception 'Self-grant unexpectedly succeeded'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ declare r jsonb; begin
  r := public.get_tracking_report('juju',7,'');
  if (r->'summary'->>'views')::int <> 1 or (r->'summary'->>'clicks')::int <> 1 or (r->'summary'->>'visitors')::int <> 1 then raise exception 'Incorrect counts: %',r; end if;
  if jsonb_array_length(r->'visitors') <> 1 then raise exception 'Visitor grouping failed'; end if;
  if (public.get_tracking_report('juju',7,'BR')->'summary'->>'views')::int <> 0 then raise exception 'Country filter failed'; end if;
  begin delete from public.tracking_events; raise exception 'Authenticated delete unexpectedly succeeded'; exception when insufficient_privilege then null; end;
end $$;
rollback;
