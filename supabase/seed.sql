-- =============================================================
-- supabase/seed.sql
-- Local development seed data for Mycelium B2B.
--
-- Companies  : 2  (Craft Brew Co / NutriLabs Inc)
-- Users      : 4  (1 admin + 1 buyer @ CraftBrew; 2 buyers @ NutriLabs)
-- Species    : 12
-- Batches    : 30 (22 pass, 4 fail, 4 pending)
-- =============================================================

-- ── Remove previous seed users (idempotent re-seed) ──────────
delete from auth.identities
where provider_id in (
  'admin@craftbrew.test',
  'buyer@craftbrew.test',
  'buyer1@nutrilabs.test',
  'buyer2@nutrilabs.test'
);

delete from auth.users
where email in (
  'admin@craftbrew.test',
  'buyer@craftbrew.test',
  'buyer1@nutrilabs.test',
  'buyer2@nutrilabs.test'
);

-- ── Wipe public tables in reverse FK order ───────────────────
truncate
  public.quotes,
  public.subscriptions,
  public.order_items,
  public.orders,
  public.batches,
  public.species,
  public.company_users,
  public.companies
restart identity cascade;

-- ── Auth users ────────────────────────────────────────────────
-- These users sign in via magic link; encrypted_password is unused.
insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'a1000001-0000-0000-0000-000000000001',
    'authenticated', 'authenticated',
    'admin@craftbrew.test', '',
    now(),
    '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a1000001-0000-0000-0000-000000000002',
    'authenticated', 'authenticated',
    'buyer@craftbrew.test', '',
    now(),
    '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a2000001-0000-0000-0000-000000000001',
    'authenticated', 'authenticated',
    'buyer1@nutrilabs.test', '',
    now(),
    '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a2000001-0000-0000-0000-000000000002',
    'authenticated', 'authenticated',
    'buyer2@nutrilabs.test', '',
    now(),
    '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
  );

-- ── Auth identities (required for magic-link flow) ────────────
insert into auth.identities (
  id, provider_id, user_id, identity_data,
  provider, last_sign_in_at, created_at, updated_at
) values
  (
    'a1000001-0000-0000-0000-000000000001',
    'admin@craftbrew.test',
    'a1000001-0000-0000-0000-000000000001',
    '{"sub":"a1000001-0000-0000-0000-000000000001","email":"admin@craftbrew.test"}',
    'email', now(), now(), now()
  ),
  (
    'a1000001-0000-0000-0000-000000000002',
    'buyer@craftbrew.test',
    'a1000001-0000-0000-0000-000000000002',
    '{"sub":"a1000001-0000-0000-0000-000000000002","email":"buyer@craftbrew.test"}',
    'email', now(), now(), now()
  ),
  (
    'a2000001-0000-0000-0000-000000000001',
    'buyer1@nutrilabs.test',
    'a2000001-0000-0000-0000-000000000001',
    '{"sub":"a2000001-0000-0000-0000-000000000001","email":"buyer1@nutrilabs.test"}',
    'email', now(), now(), now()
  ),
  (
    'a2000001-0000-0000-0000-000000000002',
    'buyer2@nutrilabs.test',
    'a2000001-0000-0000-0000-000000000002',
    '{"sub":"a2000001-0000-0000-0000-000000000002","email":"buyer2@nutrilabs.test"}',
    'email', now(), now(), now()
  );

-- ── Companies ─────────────────────────────────────────────────
insert into public.companies (
  id, name, tier, net30_enabled, contact_email, shipping_address
) values
  (
    'c1000001-0000-0000-0000-000000000001',
    'Craft Brew Co', 'agreement', true,
    'procurement@craftbrew.test',
    '{"line1":"123 Hop St","city":"Portland","state":"OR","postcode":"97201","country":"US"}'
  ),
  (
    'c2000001-0000-0000-0000-000000000001',
    'NutriLabs Inc', 'oem', false,
    'supply@nutrilabs.test',
    '{"line1":"456 Science Blvd","city":"Austin","state":"TX","postcode":"78701","country":"US"}'
  );

-- ── Company users ─────────────────────────────────────────────
insert into public.company_users (company_id, user_id, role) values
  ('c1000001-0000-0000-0000-000000000001', 'a1000001-0000-0000-0000-000000000001', 'admin'),
  ('c1000001-0000-0000-0000-000000000001', 'a1000001-0000-0000-0000-000000000002', 'buyer'),
  ('c2000001-0000-0000-0000-000000000001', 'a2000001-0000-0000-0000-000000000001', 'buyer'),
  ('c2000001-0000-0000-0000-000000000001', 'a2000001-0000-0000-0000-000000000002', 'buyer');

-- ── Species (12) ──────────────────────────────────────────────
-- shelf_life_days is measured from inoculation_date.
-- Fresh fruiting bodies (cold chain, short shelf life, Monday dispatch).
-- Dried / spawn (ambient, long shelf life, any day).
insert into public.species (
  id, common_name, latin_name, substrate_type,
  shelf_life_days, cold_chain_required, dispatch_window
) values
  (
    '5e000001-0000-0000-0000-000000000001',
    'Lion''s Mane', 'Hericium erinaceus', 'hardwood sawdust',
    7, true, array['MON']
  ),
  (
    '5e000002-0000-0000-0000-000000000001',
    'Oyster', 'Pleurotus ostreatus', 'wheat straw',
    5, true, array['MON']
  ),
  (
    '5e000003-0000-0000-0000-000000000001',
    'Shiitake', 'Lentinula edodes', 'oak sawdust',
    10, true, array['MON','WED']
  ),
  (
    '5e000004-0000-0000-0000-000000000001',
    'Cordyceps', 'Cordyceps militaris', 'grain',
    7, true, array['MON']
  ),
  (
    '5e000005-0000-0000-0000-000000000001',
    'King Oyster', 'Pleurotus eryngii', 'cottonseed hull',
    14, true, array['MON']
  ),
  (
    '5e000006-0000-0000-0000-000000000001',
    'Maitake', 'Grifola frondosa', 'oak sawdust',
    7, true, array['MON']
  ),
  (
    '5e000007-0000-0000-0000-000000000001',
    'Tremella', 'Tremella fuciformis', 'hardwood sawdust',
    5, true, array['MON']
  ),
  (
    '5e000008-0000-0000-0000-000000000001',
    'Black Poplar', 'Agrocybe aegerita', 'hardwood sawdust',
    7, true, array['MON','WED']
  ),
  (
    '5e000009-0000-0000-0000-000000000001',
    'Reishi', 'Ganoderma lucidum', 'hardwood log',
    365, false, array['ANY']
  ),
  (
    '5e000010-0000-0000-0000-000000000001',
    'Turkey Tail', 'Trametes versicolor', 'hardwood sawdust',
    365, false, array['ANY']
  ),
  (
    '5e000011-0000-0000-0000-000000000001',
    'Chaga', 'Inonotus obliquus', 'birch log',
    730, false, array['ANY']
  ),
  (
    '5e000012-0000-0000-0000-000000000001',
    'Agarikon', 'Fomitopsis officinalis', 'conifer log',
    730, false, array['ANY']
  );

-- ── Batches (30) ──────────────────────────────────────────────
-- Contamination:  22 pass · 4 fail · 4 pending
-- Freshness from inoculation_date vs shelf_life_days:
--   fresh   = daysSince < shelf_life_days * 0.5
--   aging   = daysSince < shelf_life_days
--   expired = daysSince >= shelf_life_days
insert into public.batches (
  id, species_id,
  inoculation_date, substrate_lot, contamination_check,
  harvest_date, yield_kg, available_units, storage_zone, coa_url
) values

  -- ── Lion's Mane (shelf=7d) ──────────────────────────────────
  -- fresh: 3 days old → 4 days remaining
  (
    'ba000001-0000-0000-0000-000000000001',
    '5e000001-0000-0000-0000-000000000001',
    CURRENT_DATE - 3, 'LOT-LM-001', 'pass',
    CURRENT_DATE - 2, 1.20, 45, 'Cold Room A', null
  ),
  -- aging: 6 days old → 1 day remaining
  (
    'ba000002-0000-0000-0000-000000000001',
    '5e000001-0000-0000-0000-000000000001',
    CURRENT_DATE - 6, 'LOT-LM-002', 'pass',
    CURRENT_DATE - 4, 0.85, 18, 'Cold Room A', null
  ),
  -- fail: contamination at day 8
  (
    'ba000003-0000-0000-0000-000000000001',
    '5e000001-0000-0000-0000-000000000001',
    CURRENT_DATE - 8, 'LOT-LM-003', 'fail',
    null, null, 0, 'Quarantine', null
  ),

  -- ── Oyster (shelf=5d) ───────────────────────────────────────
  -- fresh: 2 days old → 3 days remaining
  (
    'ba000004-0000-0000-0000-000000000001',
    '5e000002-0000-0000-0000-000000000001',
    CURRENT_DATE - 2, 'LOT-OY-001', 'pass',
    CURRENT_DATE - 1, 1.60, 60, 'Cold Room A', null
  ),
  -- aging: 4 days old → 1 day remaining
  (
    'ba000005-0000-0000-0000-000000000001',
    '5e000002-0000-0000-0000-000000000001',
    CURRENT_DATE - 4, 'LOT-OY-002', 'pass',
    CURRENT_DATE - 2, 1.35, 28, 'Cold Room A', null
  ),
  -- pending: just inoculated
  (
    'ba000006-0000-0000-0000-000000000001',
    '5e000002-0000-0000-0000-000000000001',
    CURRENT_DATE - 1, 'LOT-OY-003', 'pending',
    null, null, 0, 'Incubation Room', null
  ),

  -- ── Shiitake (shelf=10d, MON+WED) ──────────────────────────
  -- fresh: 3 days old → 7 days remaining
  (
    'ba000007-0000-0000-0000-000000000001',
    '5e000003-0000-0000-0000-000000000001',
    CURRENT_DATE - 3, 'LOT-SK-001', 'pass',
    CURRENT_DATE - 2, 2.40, 50, 'Cold Room B', null
  ),
  -- aging: 8 days old → 2 days remaining
  (
    'ba000008-0000-0000-0000-000000000001',
    '5e000003-0000-0000-0000-000000000001',
    CURRENT_DATE - 8, 'LOT-SK-002', 'pass',
    CURRENT_DATE - 5, 2.10, 22, 'Cold Room B', null
  ),
  -- fail
  (
    'ba000009-0000-0000-0000-000000000001',
    '5e000003-0000-0000-0000-000000000001',
    CURRENT_DATE - 9, 'LOT-SK-003', 'fail',
    null, null, 0, 'Quarantine', null
  ),

  -- ── Cordyceps (shelf=7d) ────────────────────────────────────
  -- fresh: 2 days old → 5 days remaining
  (
    'ba000010-0000-0000-0000-000000000001',
    '5e000004-0000-0000-0000-000000000001',
    CURRENT_DATE - 2, 'LOT-CO-001', 'pass',
    CURRENT_DATE - 1, 0.75, 35, 'Cold Room A', null
  ),
  -- pending
  (
    'ba000011-0000-0000-0000-000000000001',
    '5e000004-0000-0000-0000-000000000001',
    CURRENT_DATE - 1, 'LOT-CO-002', 'pending',
    null, null, 0, 'Incubation Room', null
  ),

  -- ── King Oyster (shelf=14d) ─────────────────────────────────
  -- fresh: 4 days old → 10 days remaining
  (
    'ba000012-0000-0000-0000-000000000001',
    '5e000005-0000-0000-0000-000000000001',
    CURRENT_DATE - 4, 'LOT-KO-001', 'pass',
    CURRENT_DATE - 2, 3.20, 80, 'Cold Room B', null
  ),
  -- normal: 10 days old → 4 days remaining
  (
    'ba000013-0000-0000-0000-000000000001',
    '5e000005-0000-0000-0000-000000000001',
    CURRENT_DATE - 10, 'LOT-KO-002', 'pass',
    CURRENT_DATE - 7, 2.85, 40, 'Cold Room B', null
  ),
  -- aging: 13 days old → 1 day remaining
  (
    'ba000014-0000-0000-0000-000000000001',
    '5e000005-0000-0000-0000-000000000001',
    CURRENT_DATE - 13, 'LOT-KO-003', 'pass',
    CURRENT_DATE - 10, 2.50, 12, 'Cold Room B', null
  ),

  -- ── Maitake (shelf=7d) ──────────────────────────────────────
  -- fresh: 3 days old → 4 days remaining
  (
    'ba000015-0000-0000-0000-000000000001',
    '5e000006-0000-0000-0000-000000000001',
    CURRENT_DATE - 3, 'LOT-MT-001', 'pass',
    CURRENT_DATE - 2, 1.10, 25, 'Cold Room A', null
  ),
  -- aging: 5 days old → 2 days remaining
  (
    'ba000016-0000-0000-0000-000000000001',
    '5e000006-0000-0000-0000-000000000001',
    CURRENT_DATE - 5, 'LOT-MT-002', 'pass',
    CURRENT_DATE - 3, 0.90, 20, 'Cold Room A', null
  ),

  -- ── Tremella (shelf=5d) ─────────────────────────────────────
  -- fresh: 2 days old → 3 days remaining
  (
    'ba000017-0000-0000-0000-000000000001',
    '5e000007-0000-0000-0000-000000000001',
    CURRENT_DATE - 2, 'LOT-TR-001', 'pass',
    CURRENT_DATE - 1, 0.80, 30, 'Cold Room A', null
  ),
  -- fail
  (
    'ba000018-0000-0000-0000-000000000001',
    '5e000007-0000-0000-0000-000000000001',
    CURRENT_DATE - 6, 'LOT-TR-002', 'fail',
    null, null, 0, 'Quarantine', null
  ),

  -- ── Black Poplar (shelf=7d, MON+WED) ───────────────────────
  -- fresh: 3 days old → 4 days remaining
  (
    'ba000019-0000-0000-0000-000000000001',
    '5e000008-0000-0000-0000-000000000001',
    CURRENT_DATE - 3, 'LOT-BP-001', 'pass',
    CURRENT_DATE - 2, 1.45, 40, 'Cold Room B', null
  ),
  -- aging: 5 days old → 2 days remaining
  (
    'ba000020-0000-0000-0000-000000000001',
    '5e000008-0000-0000-0000-000000000001',
    CURRENT_DATE - 5, 'LOT-BP-002', 'pass',
    CURRENT_DATE - 3, 1.20, 22, 'Cold Room B', null
  ),

  -- ── Reishi (shelf=365d) ─────────────────────────────────────
  (
    'ba000021-0000-0000-0000-000000000001',
    '5e000009-0000-0000-0000-000000000001',
    CURRENT_DATE - 30, 'LOT-RE-001', 'pass',
    CURRENT_DATE - 20, 18.50, 100, 'Dry Store A', null
  ),
  (
    'ba000022-0000-0000-0000-000000000001',
    '5e000009-0000-0000-0000-000000000001',
    CURRENT_DATE - 15, 'LOT-RE-002', 'pass',
    CURRENT_DATE - 10, 15.20, 75, 'Dry Store A', null
  ),
  -- pending: colonisation in progress
  (
    'ba000023-0000-0000-0000-000000000001',
    '5e000009-0000-0000-0000-000000000001',
    CURRENT_DATE - 7, 'LOT-RE-003', 'pending',
    null, null, 0, 'Incubation Room', null
  ),

  -- ── Turkey Tail (shelf=365d) ────────────────────────────────
  (
    'ba000024-0000-0000-0000-000000000001',
    '5e000010-0000-0000-0000-000000000001',
    CURRENT_DATE - 60, 'LOT-TT-001', 'pass',
    CURRENT_DATE - 45, 22.00, 90, 'Dry Store A', null
  ),
  (
    'ba000025-0000-0000-0000-000000000001',
    '5e000010-0000-0000-0000-000000000001',
    CURRENT_DATE - 25, 'LOT-TT-002', 'pass',
    CURRENT_DATE - 18, 19.50, 55, 'Dry Store A', null
  ),

  -- ── Chaga (shelf=730d) ──────────────────────────────────────
  (
    'ba000026-0000-0000-0000-000000000001',
    '5e000011-0000-0000-0000-000000000001',
    CURRENT_DATE - 90, 'LOT-CG-001', 'pass',
    CURRENT_DATE - 70, 35.00, 120, 'Dry Store A', null
  ),
  -- fail: contamination found mid-colonisation
  (
    'ba000027-0000-0000-0000-000000000001',
    '5e000011-0000-0000-0000-000000000001',
    CURRENT_DATE - 45, 'LOT-CG-002', 'fail',
    null, null, 0, 'Quarantine', null
  ),

  -- ── Agarikon (shelf=730d) ───────────────────────────────────
  (
    'ba000028-0000-0000-0000-000000000001',
    '5e000012-0000-0000-0000-000000000001',
    CURRENT_DATE - 120, 'LOT-AG-001', 'pass',
    CURRENT_DATE - 100, 28.00, 80, 'Dry Store A', null
  ),
  (
    'ba000029-0000-0000-0000-000000000001',
    '5e000012-0000-0000-0000-000000000001',
    CURRENT_DATE - 60, 'LOT-AG-002', 'pass',
    CURRENT_DATE - 45, 24.50, 65, 'Dry Store A', null
  ),
  -- pending
  (
    'ba000030-0000-0000-0000-000000000001',
    '5e000012-0000-0000-0000-000000000001',
    CURRENT_DATE - 5, 'LOT-AG-003', 'pending',
    null, null, 0, 'Incubation Room', null
  );

-- ── Orders (2 confirmed) ──────────────────────────────────────
-- Two fully-allocated orders so Cell 2.6 (batch traceability) and
-- Cell 3.5 (order detail) have realistic data to render.
--
-- Pricing reflects @repo/shared/pricing.ts:
--   discount = min(0.35, tier_discount + volume_discount)
--   line     = round(unit_price * qty * (1 - discount))
--
-- Order o1: Craft Brew Co (agreement, 10%) — 2 line items
--   Line A: Lion's Mane batch ba000001, qty 5  @ 2500c
--           discount = 0.10 (vol@5 = 0%)        → 2500*5*0.90 = 11250
--   Line B: Agarikon   batch ba000028, qty 10 @ 3500c
--           discount = 0.10 + 0.03 = 0.13       → 3500*10*0.87 = 30450
--   total_price = 41700
--
-- Order o2: NutriLabs Inc (oem, 22%, no net30) — 1 line item
--   Line C: Agarikon batch ba000029, qty 20 @ 3500c
--           discount = 0.22 + 0.03 = 0.25       → 3500*20*0.75 = 52500
--   total_price = 52500

insert into public.orders (
  id, company_id, status, payment_method,
  dispatch_date, tracking_number, total_price, stripe_session_id
) values
  (
    '0d000001-0000-0000-0000-000000000001',
    'c1000001-0000-0000-0000-000000000001',
    'confirmed', 'card',
    CURRENT_DATE + 2, null, 41700,
    'cs_test_seed_craftbrew_001'
  ),
  (
    '0d000002-0000-0000-0000-000000000001',
    'c2000001-0000-0000-0000-000000000001',
    'confirmed', 'card',
    CURRENT_DATE + 3, null, 52500,
    'cs_test_seed_nutrilabs_001'
  );

insert into public.order_items (
  id, order_id, species_id, batch_id,
  format, quantity, unit_price, allocated_at
) values
  -- Order o1 line A — Lion's Mane
  (
    '01000001-0000-0000-0000-000000000001',
    '0d000001-0000-0000-0000-000000000001',
    '5e000001-0000-0000-0000-000000000001',
    'ba000001-0000-0000-0000-000000000001',
    'fresh', 5, 2500, now()
  ),
  -- Order o1 line B — Agarikon
  (
    '01000002-0000-0000-0000-000000000001',
    '0d000001-0000-0000-0000-000000000001',
    '5e000012-0000-0000-0000-000000000001',
    'ba000028-0000-0000-0000-000000000001',
    'powder', 10, 3500, now()
  ),
  -- Order o2 line C — Agarikon
  (
    '01000003-0000-0000-0000-000000000001',
    '0d000002-0000-0000-0000-000000000001',
    '5e000012-0000-0000-0000-000000000001',
    'ba000029-0000-0000-0000-000000000001',
    'powder', 20, 3500, now()
  );

-- Decrement available_units to reflect the post-allocation state these
-- "confirmed" orders represent. In live traffic this happens inside
-- `allocate_batch()` (see migration 20260427000002); for seed we apply
-- the equivalent net effect directly.
update public.batches set available_units = available_units - 5
  where id = 'ba000001-0000-0000-0000-000000000001';
update public.batches set available_units = available_units - 10
  where id = 'ba000028-0000-0000-0000-000000000001';
update public.batches set available_units = available_units - 20
  where id = 'ba000029-0000-0000-0000-000000000001';
