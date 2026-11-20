begin;

-- Visitor identities are now verified by /api/visitor, using a server-issued cookie.
-- Neither anonymous nor signed-in browser clients may access this private table.
alter table public.users enable row level security;
drop policy if exists users_public_read on public.users;
drop policy if exists users_public_insert on public.users;
drop policy if exists users_public_update on public.users;
revoke all on table public.users from anon, authenticated;
grant select, insert, update, delete on table public.users to service_role;

-- Account profiles, including email, are readable only by their authenticated owner.
alter table public.profiles enable row level security;
drop policy if exists profiles_public_read on public.profiles;
drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
revoke all on table public.profiles from anon;

-- Public guide display fields are projected by the server recommendation route.
-- The underlying account records are not a public API.

-- Usage and costs are admin-only; writes already use the server service role.
drop policy if exists api_usage_public_read on public.api_usage;
drop policy if exists api_usage_service_insert on public.api_usage;
revoke all on table public.api_usage from anon, authenticated;
grant select, insert, update, delete on table public.api_usage to service_role;

notify pgrst, 'reload schema';
commit;
