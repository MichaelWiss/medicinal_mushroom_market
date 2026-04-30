-- =============================================================
-- 20260429000001_carts.sql
-- Cell 3.1 — server-side cart persistence for cross-device continuity.
--
-- Each authenticated user owns exactly one row in `public.carts`.
-- `items` stores the cart payload as JSONB matching @repo/shared
-- `cartItemSchema` (speciesId, speciesName, format, unitPrice, quantity).
--
-- The cart belongs to the user, not the company: two buyers from the
-- same company maintain independent carts. RLS enforces self-ownership.
-- =============================================================

create table if not exists public.carts (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  items       jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.carts enable row level security;

-- Users can read, insert, update, and delete only their own cart row.
create policy "users select own cart"
  on public.carts for select
  to authenticated
  using (user_id = auth.uid());

create policy "users insert own cart"
  on public.carts for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users update own cart"
  on public.carts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users delete own cart"
  on public.carts for delete
  to authenticated
  using (user_id = auth.uid());

-- Auto-bump updated_at on UPDATE (mirrors pattern in 0001_initial.sql).
create trigger handle_updated_at_carts
  before update on public.carts
  for each row execute procedure extensions.moddatetime(updated_at);
