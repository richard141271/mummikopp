-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create table for cups
create table public.cups (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  name text not null,
  series text,
  year integer,
  purchase_date date,
  price_paid numeric default 0,
  current_value numeric default 0,
  count integer default 1,
  rarity text,
  condition text,
  box boolean default false,
  notes text,
  image_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.cups enable row level security;

-- Create policies

-- 1. Users can do everything with their own cups
create policy "Users can CRUD their own cups" on public.cups
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Public Read Access (For Shared Collection Page)
-- This allows anyone to view cups if they have the user_id (via the shared link)
create policy "Public can view all cups" on public.cups
  for select using (true);

-- Storage bucket setup (You need to create a bucket named 'cup-images' in the dashboard)
-- Policy to allow authenticated uploads
-- create policy "Authenticated users can upload images" on storage.objects
--   for insert with check (bucket_id = 'cup-images' and auth.role() = 'authenticated');

-- Policy to allow public viewing of images
-- create policy "Public can view images" on storage.objects
--   for select using (bucket_id = 'cup-images');
