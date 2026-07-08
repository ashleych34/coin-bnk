-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).

create table if not exists public.coin_bank (
  id bigint primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security must be ON for any table exposed to the browser.
alter table public.coin_bank enable row level security;

-- This app is a trusted family tool: anyone holding the app URL (which
-- embeds the public anon key) can read and write the single shared row.
-- The parent PIN inside the app is a convenience gate, not real security.
create policy "family read"
  on public.coin_bank for select
  using (true);

create policy "family insert"
  on public.coin_bank for insert
  with check (id = 1);

create policy "family update"
  on public.coin_bank for update
  using (id = 1);

-- Note: no delete policy is created, so the row cannot be deleted
-- through the app's public key. (Deletes remain possible from the
-- Supabase dashboard, where you are authenticated as the owner.)
