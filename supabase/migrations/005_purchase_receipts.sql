-- ============================================================
-- CHAPTER — Purchase receipts (anti-replay for payment verification)
-- Migration 005: receipts table
-- ------------------------------------------------------------
-- Run AFTER 004. The verify-purchase Edge Function records every verified
-- purchase token here so the same token can't be replayed to unlock other
-- accounts. Only the service_role (the Edge Function) writes this table;
-- clients have no access at all.
-- ============================================================

create table if not exists public.purchase_receipts (
  purchase_token text primary key,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  product_id     text not null,
  tier           text not null,
  expiry_millis  bigint not null default 0,
  verified_at    timestamptz not null default now()
);

create index if not exists receipts_user_idx on public.purchase_receipts (user_id);

-- Lock it down: RLS on, and NO policies for normal users => default deny.
-- The service_role key (used only server-side by the Edge Function) bypasses
-- RLS, so the function can read/write; clients can do neither.
alter table public.purchase_receipts enable row level security;

-- (intentionally no policies: clients cannot select/insert/update/delete)

revoke all on public.purchase_receipts from anon, authenticated;
