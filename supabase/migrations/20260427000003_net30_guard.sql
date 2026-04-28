-- =============================================================
-- 0004_net30_guard.sql
-- Trigger that enforces net-30 payment is only allowed for
-- companies that have net30_enabled = true.
--
-- Fires BEFORE INSERT OR UPDATE on orders so the row is never
-- written when the constraint is violated.
-- =============================================================

create or replace function public.net30_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_net30_enabled boolean;
begin
  -- Only enforce when payment_method is net30
  if NEW.payment_method <> 'net30' then
    return NEW;
  end if;

  select net30_enabled
    into v_net30_enabled
    from public.companies
   where id = NEW.company_id;

  if v_net30_enabled is not true then
    raise exception
      'net-30 payment is not enabled for company %', NEW.company_id
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

create trigger enforce_net30_eligibility
  before insert or update of payment_method on orders
  for each row execute function public.net30_guard();
