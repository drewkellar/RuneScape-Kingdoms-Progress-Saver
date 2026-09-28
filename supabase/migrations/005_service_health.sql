-- A public, read-only probe for the scheduled database availability check.
-- Contains no character, account, or group information.
create table public.service_health (
  id integer primary key check (id = 1)
);
insert into public.service_health (id) values (1);
alter table public.service_health enable row level security;
revoke all on public.service_health from public, anon, authenticated;
grant select on public.service_health to anon, authenticated;
create policy service_health_read on public.service_health
  for select to anon, authenticated using (true);
