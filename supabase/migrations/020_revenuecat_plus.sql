-- ============================================================
-- CHAPTER — Migration 020: Chapter Plus through RevenueCat
-- ------------------------------------------------------------
-- Run AFTER 019.
--
-- Chapter stays free for everyone (migration 019). Chapter Plus is an
-- optional supporter subscription sold through RevenueCat Web Billing:
-- it triples the monthly AI allowances. Entitlements are written only by
-- the revenuecat-webhook and revenuecat-sync Edge Functions, which verify
-- the purchase with RevenueCat on the server; the client can never grant
-- itself Plus.
-- ============================================================

alter table public.entitlements drop constraint if exists entitlements_source_check;
alter table public.entitlements add constraint entitlements_source_check
  check (source in ('play_billing', 'stripe', 'admin', 'promo', 'revenuecat'));

-- Which RevenueCat event last changed an entitlement, so a late,
-- out-of-order webhook cannot undo a newer change.
alter table public.entitlements add column if not exists source_event_at timestamptz;

-- Processed RevenueCat webhook events (a redelivered event is applied once).
create table if not exists public.revenuecat_events (
  id           text primary key,
  type         text not null,
  environment  text,
  processed_at timestamptz not null default now()
);
alter table public.revenuecat_events enable row level security;
revoke all on public.revenuecat_events from anon, authenticated;

-- Active Chapter Plus entitlement (from RevenueCat) for a user.
create or replace function private.has_plus(p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entitlements e
     where e.user_id = p_user and e.source = 'revenuecat' and e.revoked_at is null
       and e.starts_at <= now() and (e.expires_at is null or e.expires_at > now()));
$$;

-- AI allowance, tripled for Chapter Plus supporters.
create or replace function private.can_use_ai(p_user uuid, p_kind text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t subscription_t; cap int; used int; plus boolean;
begin
  t    := public.effective_tier(p_user);
  plus := private.has_plus(p_user);
  cap  := public.ai_monthly_cap(t, p_kind) * case when plus then 3 else 1 end;
  used := public.ai_usage_this_month(p_user, p_kind);
  return jsonb_build_object(
    'allowed', cap > 0 and used < cap,
    'tier', t, 'plus', plus, 'cap', cap, 'used', used,
    'remaining', greatest(0, cap - used),
    'reason', case
      when cap = 0 then 'upgrade_required'
      when used >= cap then 'monthly_cap_reached'
      else null end);
end $$;

-- Plan summary for the signed-in user, now including Plus.
create or replace function public.my_subscription()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tier', public.effective_tier(auth.uid()),
    'paywall_enabled', public.paywall_enabled(),
    'plus', private.has_plus(auth.uid()),
    'plus_expires_at', (select max(e.expires_at) from public.entitlements e
                         where e.user_id = auth.uid() and e.source = 'revenuecat' and e.revoked_at is null),
    'founding_member', coalesce((select founding_member from public.profiles where id = auth.uid()), false),
    'active', coalesce((
      select jsonb_agg(jsonb_build_object('tier', e.tier, 'source', e.source, 'expires_at', e.expires_at))
        from public.entitlements e
       where e.user_id = auth.uid() and e.revoked_at is null
         and e.starts_at <= now() and (e.expires_at is null or e.expires_at > now())), '[]'::jsonb));
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;
revoke execute on function public.my_subscription() from public, anon;
grant execute on function public.my_subscription() to authenticated;
