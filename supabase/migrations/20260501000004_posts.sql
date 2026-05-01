-- =============================================================
-- 20260501000004_posts.sql
-- "Dispatches" blog — posts table.
--
-- Posts are authored by ops staff via the admin console and
-- published by setting published_at to a non-null timestamp.
-- Anon readers (public storefront) can SELECT published rows;
-- the service-role client used by server actions has full access.
-- =============================================================

create table public.posts (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  category     text not null default 'Update',
  body         text not null default '',
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Auto-update updated_at on every write.
create trigger posts_moddatetime
  before update on public.posts
  for each row execute function extensions.moddatetime(updated_at);

-- ── RLS ──────────────────────────────────────────────────────
alter table public.posts enable row level security;

-- Public storefront: any visitor (anon OR authenticated) can
-- read rows that are published and not in the future.
create policy "published posts are publicly readable"
  on public.posts for select
  to anon, authenticated
  using (
    published_at is not null
    and published_at <= now()
  );

-- Service-role bypasses RLS automatically; no explicit policy
-- needed for admin CRUD.
