-- =============================================================
-- 0005_coa_storage.sql
-- Creates the `coa` Storage bucket and RLS policies so that:
--   - Service-role can read/write unrestricted (upload CoA PDFs)
--   - Authenticated buyers can only SELECT (download) objects
--     belonging to batches linked to their own company's orders
--   - All other operations are denied for authenticated users
-- =============================================================

-- Create the bucket via the storage API extension.
-- Supabase Storage exposes storage.buckets as a table we can insert into.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'coa',
  'coa',
  false,
  52428800,   -- 50 MiB in bytes
  array['application/pdf']
)
on conflict (id) do nothing;

-- ── RLS on storage.objects ────────────────────────────────────
-- Storage RLS targets storage.objects, not a public table.
-- All policies must reference bucket_id = 'coa'.

-- Allow service-role full access (service-role bypasses RLS by
-- default, but explicit policies are belt-and-suspenders).

-- Buyers can download CoA PDFs only when they have an order
-- containing an order_item linked to the batch referenced by
-- the object name.
--
-- Object naming convention: `{batch_id}.pdf`
-- e.g. `coa/3fa85f64-5717-4562-b3fc-2c963f66afa6.pdf`
--
-- The policy extracts the batch_id from the object name (storage
-- path after the bucket prefix) and checks company ownership.

create policy "buyers can download coa for their batches"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'coa'
    and exists (
      select 1
        from public.order_items   oi
        join public.orders        o  on o.id = oi.order_id
       where oi.batch_id::text = regexp_replace(name, '\.pdf$', '')
         and o.company_id = public.current_company_id()
    )
  );

-- Service-role inserts/updates (production team uploads CoAs).
-- These are handled by the service-role client which bypasses RLS,
-- so no explicit insert policy is needed for authenticated users.
-- Deny unauthenticated access explicitly.
create policy "deny anon access to coa bucket"
  on storage.objects for select
  to anon
  using (bucket_id <> 'coa');
