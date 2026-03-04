-- Add richer "who do you want to talk to" preferences to guides
alter table guides add column if not exists preferred_career_stages text[] default '{}';
alter table guides add column if not exists preferred_backgrounds text[] default '{}';
alter table guides add column if not exists preferred_experience_level text[] default '{}';
alter table guides add column if not exists call_format text default 'either' check (call_format in ('one_off', 'ongoing', 'either'));
alter table guides add column if not exists languages text[] default '{English}';
alter table guides add column if not exists not_a_good_fit text;
alter table guides add column if not exists geographic_preference text default 'anywhere';

-- Avatar storage bucket
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Anyone can read avatars (they're public profile pics)
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- Authenticated users can upload their own avatar (path must start with their user id)
create policy "avatars_upload_own" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Authenticated users can update their own avatar
create policy "avatars_update_own" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Authenticated users can delete their own avatar
create policy "avatars_delete_own" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
