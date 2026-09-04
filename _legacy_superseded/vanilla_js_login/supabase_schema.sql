-- Run this once in your Supabase project's SQL Editor (Dashboard -> SQL Editor -> New query)

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  face_descriptor float8[],  -- 128-dim face-api.js descriptor, stored as an array
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Note: for the buildathon demo, email confirmation should be DISABLED so
-- signup -> immediate login works without checking an inbox:
-- Supabase Dashboard -> Authentication -> Providers -> Email -> turn OFF
-- "Confirm email"
