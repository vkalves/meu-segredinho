-- Run on the disposable sitewide fixture after both tracking migrations.
begin;
insert into public.pages(slug,user_id,profile_name) values('new-test','11111111-1111-4111-8111-111111111111','New test');
do $$ begin
 if not exists(select 1 from public.tracking_sites where slug='new-test') then raise exception 'New page not provisioned'; end if;
end $$;
set local role anon;
insert into public.tracking_events(event_id,site_id,visitor_id,event_type,locale) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11','new-test','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','view','pt-BR');
insert into public.tracking_events(event_id,site_id,visitor_id,event_type,locale) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12','bianca','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','view','pt-BR');
do $$ begin
 begin
 insert into public.tracking_events(event_id,site_id,visitor_id,event_type,locale)values(gen_random_uuid(),'unregistered',gen_random_uuid(),'view','en');
 raise exception 'Unknown site admitted'; exception when foreign_key_violation then null; end;
 begin perform * from public.tracking_events; raise exception 'Anonymous read succeeded'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.pages set slug='renamed-test' where slug='new-test';
do $$ begin
 if not exists(select 1 from public.tracking_events where event_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11' and site_id='renamed-test') then raise exception 'Rename lost events'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 if exists(select 1 from public.tracking_sites where slug in ('bianca','renamed-test')) then raise exception 'Other owner site leak'; end if;
 if (public.get_tracking_report('renamed-test',7,'')->'summary'->>'views')::int<>0 then raise exception 'Other owner report leak'; end if;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
 if (public.get_tracking_report('renamed-test',7,'')->'summary'->>'views')::int<>1 then raise exception 'Owner cannot see report'; end if;
end $$;
reset role;
delete from public.pages where slug='renamed-test';
do $$ begin
 if exists(select 1 from public.tracking_sites where slug='renamed-test') then raise exception 'Deleted page tracking not removed'; end if;
end $$;
rollback;
