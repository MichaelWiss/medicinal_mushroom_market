-- =============================================================
-- 0002_rls.sql
-- Row Level Security policies + JWT custom claim hook.
--
-- Strategy:
--   1. Enable RLS on every public table.
--   2. species + batches(pass) → readable by any authenticated user.
--   3. companies, company_users, orders, order_items, subscriptions,
--      quotes → scoped to auth.jwt() ->> 'company_id'.
--   4. handle_jwt() Auth hook injects company_id into the access token
--      so policies do not need a per-row subquery.
-- =============================================================

-- ── Enable RLS on every table ────────────────────────────────
alter table companies        enable row level security;
alter table company_users    enable row level security;
alter table species          enable row level security;
alter table batches          enable row level security;
alter table orders           enable row level security;
alter table order_items      enable row level security;
alter table subscriptions    enable row level security;
alter table quotes           enable row level security;

-- ── Catalog: readable by any authenticated user ──────────────

create policy "species are readable by authenticated users"
  on species for select
  to authenticated
  using (true);

create policy "passing batches are readable by authenticated users"
  on batches for select
  to authenticated
  using (contamination_check = 'pass');

-- ── Helper: company_id from JWT claim ────────────────────────
-- Returns the buyer's company_id without hitting any table.
-- Lives in public schema (cannot create functions in auth).

create or replace function public.current_company_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'company_id', '')::uuid
$$;

-- ── companies ─────────────────────────────────────────────────

create policy "users can read their own company"
  on companies for select
  to authenticated
  using (id = public.current_company_id());

create policy "users can update their own company"
  on companies for update
  to authenticated
  using (id = public.current_company_id())
  with check (id = public.current_company_id());

-- ── company_users ─────────────────────────────────────────────

create policy "users can read members of their own company"
  on company_users for select
  to authenticated
  using (company_id = public.current_company_id());

-- ── orders ────────────────────────────────────────────────────

create policy "users can read their company's orders"
  on orders for select
  to authenticated
  using (company_id = public.current_company_id());

create policy "users can insert orders for their company"
  on orders for insert
  to authenticated
  with check (company_id = public.current_company_id());

-- ── order_items ───────────────────────────────────────────────
-- Scoped via the parent order row.

create policy "users can read items of their company's orders"
  on order_items for select
  to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and o.company_id = public.current_company_id()
    )
  );

create policy "users can insert items for their company's orders"
  on order_items for insert
  to authenticated
  with check (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and o.company_id = public.current_company_id()
    )
  );

-- ── subscriptions ─────────────────────────────────────────────

create policy "users can read their company's subscriptions"
  on subscriptions for select
  to authenticated
  using (company_id = public.current_company_id());

create policy "users can manage their company's subscriptions"
  on subscriptions for all
  to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- ── quotes ────────────────────────────────────────────────────

create policy "users can read their company's quotes"
  on quotes for select
  to authenticated
  using (company_id = public.current_company_id());

create policy "users can manage their company's quotes"
  on quotes for all
  to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- =============================================================
-- handle_jwt — Auth hook that injects company_id into the JWT
--
-- Registered in supabase/config.toml as:
--   [auth.hook.custom_access_token]
--   enabled = true
--   uri = "pg-functions://postgres/public/handle_jwt"
--
-- Supabase calls this once at sign-in / refresh, not on every
-- query, so the lookup cost is amortised.
-- =============================================================

create or replace function public.handle_jwt(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_claims jsonb;
begin
  v_user_id := (event ->> 'user_id')::uuid;
  v_claims  := event -> 'claims';

  select cu.company_id, cu.role::text
    into v_company_id, v_role
    from public.company_users cu
   where cu.user_id = v_user_id
   limit 1;

  if v_company_id is not null then
    v_claims := jsonb_set(v_claims, '{company_id}', to_jsonb(v_company_id::text));
    v_claims := jsonb_set(v_claims, '{company_role}', to_jsonb(v_role));
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

-- The Auth admin role must be allowed to call the hook.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.handle_jwt(jsonb) to supabase_auth_admin;

-- The hook needs to read company_users; bypass RLS for this one role.
grant select on public.company_users to supabase_auth_admin;
create policy "auth admin can read company_users for jwt hook"
  on company_users for select
  to supabase_auth_admin
  using (true);
