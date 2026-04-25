-- =============================================================
-- 0001_initial.sql
-- Full schema for the Mycelium B2B portal.
-- Tables: companies, company_users, species, batches,
--         orders, order_items, subscriptions, quotes
-- =============================================================

-- ── Extensions ───────────────────────────────────────────────
create extension if not exists "moddatetime" schema extensions;

-- ── Enums ────────────────────────────────────────────────────

create type company_tier as enum ('spot', 'agreement', 'oem');

create type company_user_role as enum ('buyer', 'admin');

create type contamination_result as enum ('pending', 'pass', 'fail');

create type order_status as enum (
  'pending',
  'confirmed',
  'picking',
  'dispatched',
  'delivered',
  'cancelled'
);

create type payment_method as enum ('card', 'net30');

create type product_format as enum (
  'fresh',
  'powder',
  'spawn',
  'culture',
  'block'
);

create type subscription_frequency as enum ('weekly', 'biweekly', 'monthly');

create type quote_status as enum ('draft', 'sent', 'approved', 'expired', 'cancelled');

-- ── Helper: dispatch_window validation ───────────────────────
-- Allowed values for each element of dispatch_window text[]
create or replace function validate_dispatch_window(days text[])
returns boolean
language sql
immutable
as $$
  select bool_and(
    d = any(array['MON','TUE','WED','THU','FRI','SAT','SUN','ANY'])
  )
  from unnest(days) as d
$$;

-- ── companies ────────────────────────────────────────────────
create table companies (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  tier                company_tier not null default 'spot',
  net30_enabled       boolean not null default false,
  contact_email       text not null,
  shipping_address    jsonb not null default '{}',
  stripe_customer_id  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── company_users ─────────────────────────────────────────────
create table company_users (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        company_user_role not null default 'buyer',
  created_at  timestamptz not null default now(),
  unique (company_id, user_id)
);

-- ── species ───────────────────────────────────────────────────
create table species (
  id                    uuid primary key default gen_random_uuid(),
  common_name           text not null,
  latin_name            text not null,
  substrate_type        text not null,
  shelf_life_days       integer not null check (shelf_life_days > 0),
  cold_chain_required   boolean not null default false,
  dispatch_window       text[] not null default array['ANY']
                          constraint dispatch_window_values
                          check (validate_dispatch_window(dispatch_window)),
  datasheet_url         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── batches ───────────────────────────────────────────────────
create table batches (
  id                    uuid primary key default gen_random_uuid(),
  species_id            uuid not null references species(id) on delete restrict,
  inoculation_date      date not null,
  substrate_lot         text not null,
  contamination_check   contamination_result not null default 'pending',
  harvest_date          date,
  yield_kg              numeric(8,3),
  available_units       integer not null default 0 check (available_units >= 0),
  storage_zone          text,
  coa_url               text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── orders ────────────────────────────────────────────────────
create table orders (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete restrict,
  status            order_status not null default 'pending',
  payment_method    payment_method not null default 'card',
  dispatch_date     date,
  tracking_number   text,
  total_price       integer not null default 0 check (total_price >= 0), -- pence/cents
  subscription_id   uuid,  -- FK added after subscriptions table
  stripe_session_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── order_items ───────────────────────────────────────────────
create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  species_id    uuid not null references species(id) on delete restrict,
  batch_id      uuid references batches(id) on delete restrict, -- nullable until allocated
  format        product_format not null,
  quantity      integer not null check (quantity > 0),
  unit_price    integer not null check (unit_price >= 0), -- pence/cents
  allocated_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- ── subscriptions ─────────────────────────────────────────────
create table subscriptions (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  species_id      uuid not null references species(id) on delete restrict,
  format          product_format not null,
  quantity        integer not null check (quantity > 0),
  frequency       subscription_frequency not null default 'weekly',
  priority_tier   integer not null default 99 check (priority_tier >= 1),
  next_dispatch   date not null,
  stripe_sub_id   text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Back-fill the FK from orders to subscriptions now that the table exists
alter table orders
  add constraint orders_subscription_id_fkey
  foreign key (subscription_id) references subscriptions(id) on delete set null;

-- ── quotes ────────────────────────────────────────────────────
create table quotes (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  line_items  jsonb not null default '[]',
  status      quote_status not null default 'draft',
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── moddatetime triggers ──────────────────────────────────────
-- Keep updated_at current on every UPDATE automatically.

create trigger handle_updated_at_companies
  before update on companies
  for each row execute procedure extensions.moddatetime(updated_at);

create trigger handle_updated_at_species
  before update on species
  for each row execute procedure extensions.moddatetime(updated_at);

create trigger handle_updated_at_batches
  before update on batches
  for each row execute procedure extensions.moddatetime(updated_at);

create trigger handle_updated_at_orders
  before update on orders
  for each row execute procedure extensions.moddatetime(updated_at);

create trigger handle_updated_at_subscriptions
  before update on subscriptions
  for each row execute procedure extensions.moddatetime(updated_at);

create trigger handle_updated_at_quotes
  before update on quotes
  for each row execute procedure extensions.moddatetime(updated_at);

-- ── Indexes ───────────────────────────────────────────────────
create index on batches (species_id, contamination_check, available_units);
create index on orders (company_id, status);
create index on order_items (order_id);
create index on order_items (batch_id);
create index on subscriptions (company_id, active);
create index on company_users (user_id);
