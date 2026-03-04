-- Profiles: extends auth.users with app-specific data.
-- Auto-created on signup via trigger.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'guide', 'creator', 'admin')),
  bio text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row when a new user signs up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- RLS for profiles
alter table profiles enable row level security;

create policy "profiles_public_read" on profiles
  for select using (true);

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

-- Guides: mentor/guide-specific data.
-- One guide per profile (1:1 relationship).
create table if not exists guides (
  id uuid primary key references profiles(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  headline text,
  calendar_link text,
  capacity_per_month int default 4,
  meeting_duration_minutes int default 30,
  topics text[] default '{}',
  expertise_areas text[] default '{}',
  best_for text,
  location text,
  is_available_in_person boolean default false,
  linkedin_url text,
  website_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS for guides
alter table guides enable row level security;

create policy "guides_public_read_active" on guides
  for select using (status = 'active' or auth.uid() = id);

create policy "guides_insert_own" on guides
  for insert with check (auth.uid() = id);

create policy "guides_update_own" on guides
  for update using (auth.uid() = id);

-- updated_at triggers
create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

create trigger guides_updated_at
  before update on guides
  for each row execute function update_updated_at();
