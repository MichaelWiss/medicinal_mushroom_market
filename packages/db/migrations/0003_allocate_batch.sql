-- =============================================================
-- 0003_allocate_batch.sql
-- Race-safe batch allocation using FOR UPDATE SKIP LOCKED.
--
-- Security model:
--   - security definer + fixed search_path so the function runs
--     as its owner (postgres/superuser), not the calling role.
--   - authenticated role gets EXECUTE only — no direct UPDATE
--     on batches is granted, so buyers cannot bypass allocation.
--   - anon role is NOT granted EXECUTE; allocation requires a
--     valid JWT.
-- =============================================================

create or replace function public.allocate_batch(
  p_species_id uuid,
  p_qty        int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
begin
  -- Basic input guard — catches client bugs, not a security boundary.
  if p_qty is null or p_qty <= 0 then
    raise exception 'allocate_batch: p_qty must be a positive integer, got %', p_qty;
  end if;

  -- Atomically select the oldest passing batch that can satisfy the
  -- requested quantity and lock the row.
  --
  -- FOR UPDATE      → holds a row-level exclusive lock until txn commits.
  -- SKIP LOCKED     → concurrent callers skip already-locked rows
  --                   instead of waiting, eliminating convoy queuing.
  -- ORDER BY created_at ASC → first-expire-first-out (oldest stock ships first).
  -- LIMIT 1         → single-row lock; no risk of locking more than needed.
  select id
    into v_batch_id
    from batches
   where species_id          = p_species_id
     and contamination_check = 'pass'
     and available_units     >= p_qty
   order by created_at asc
   limit 1
   for update skip locked;

  -- No eligible batch found (out of stock or all locked by concurrent txns).
  if v_batch_id is null then
    return null;
  end if;

  -- Decrement available_units. The row is locked so no concurrent txn
  -- can interleave between the SELECT and this UPDATE.
  -- The check constraint available_units >= 0 (from 0001_initial.sql)
  -- is a final safety net if logic ever regresses.
  update batches
     set available_units = available_units - p_qty
   where id = v_batch_id;

  return v_batch_id;
end;
$$;

-- Authenticated buyers can call via PostgREST RPC.
-- Anon role intentionally excluded.
grant execute on function public.allocate_batch(uuid, int) to authenticated;

-- Revoke direct UPDATE on batches from authenticated so buyers cannot
-- manipulate available_units outside of this function.
-- (No UPDATE policy exists on batches; this is belt-and-suspenders.)
revoke update on public.batches from authenticated;
