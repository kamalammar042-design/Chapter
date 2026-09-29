-- ============================================================
-- CHAPTER — Migration 019: free access until payments are connected
-- ------------------------------------------------------------
-- Run AFTER 018.
--
-- Chapter has no payment integration yet. Until one is connected, every
-- account gets every paid feature: effective_tier() returns 'parent' (the
-- highest tier, which includes everything in 'pro'). Monthly AI allowances
-- still apply at the paid-plan level (see ai_monthly_cap), so AI cost stays
-- bounded.
--
-- When store payments are connected, turn the paywall on (SQL editor, as
-- the project owner):
--     update public.app_settings set paywall_enabled = true, updated_at = now();
-- From then on tiers come only from entitlements again.
--
-- The switch lives in the database, so clients can neither read nor change
-- it directly; my_subscription() reports it for the plan page.
-- ============================================================

create table if not exists public.app_settings (
  id              boolean primary key default true check (id),   -- single row
  paywall_enabled boolean not null default false,
  updated_at      timestamptz not null default now()
);
insert into public.app_settings (id, paywall_enabled) values (true, false) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

-- Fails closed: if the settings row were ever missing, the paywall applies.
create or replace function public.paywall_enabled()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select paywall_enabled from public.app_settings where id), true);
$$;
revoke execute on function public.paywall_enabled() from public, anon, authenticated;
grant execute on function public.paywall_enabled() to service_role;

-- Resolves the highest active tier for a user. 'parent' outranks 'pro'.
-- While the paywall is off, everyone has the highest tier.
create or replace function public.effective_tier(p_user uuid)
returns subscription_t language sql stable as $$
  select case
    when not public.paywall_enabled() then 'parent'::subscription_t
    else coalesce(
      (select e.tier
         from public.entitlements e
        where e.user_id = p_user
          and e.revoked_at is null
          and e.starts_at <= now()
          and (e.expires_at is null or e.expires_at > now())
        order by case e.tier when 'parent' then 2 when 'pro' then 1 else 0 end desc
        limit 1),
      'free'::subscription_t)
  end;
$$;

-- Entitlement summary for the signed-in user (plan page).
create or replace function public.my_subscription()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tier', public.effective_tier(auth.uid()),
    'paywall_enabled', public.paywall_enabled(),
    'founding_member', coalesce((select founding_member from public.profiles where id = auth.uid()), false),
    'active', coalesce((
      select jsonb_agg(jsonb_build_object('tier', e.tier, 'source', e.source, 'expires_at', e.expires_at))
        from public.entitlements e
       where e.user_id = auth.uid() and e.revoked_at is null
         and e.starts_at <= now() and (e.expires_at is null or e.expires_at > now())), '[]'::jsonb));
$$;
revoke execute on function public.my_subscription() from public, anon;
grant execute on function public.my_subscription() to authenticated;
