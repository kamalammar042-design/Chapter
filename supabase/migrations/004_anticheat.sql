-- ============================================================
-- CHAPTER — Anti-cheat hardening
-- Migration 004: protect integrity-sensitive columns
-- ------------------------------------------------------------
-- Run AFTER 001/002/003.
--
-- The client can edit its own local storage, and its own profile row via
-- RLS. That's fine for cosmetic fields, but XP and (especially) the
-- subscription must not be freely settable by the client, or a user could
-- grant themselves premium or fake a leaderboard score.
--
-- Strategy:
--   • subscription can ONLY be changed by the service_role (your verified
--     Play-receipt Edge Function). Any client UPDATE that tries to change
--     it is rejected.
--   • xp can only INCREASE, and only by a sane amount per update, blocking
--     "set my xp to 9,999,999" edits. Large legitimate jumps should be
--     written server-side anyway.
-- ============================================================

create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_service boolean;
begin
  -- service_role bypasses these guards (your verified server functions)
  is_service := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
             or coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'service_role';

  if is_service then
    return new;
  end if;

  -- clients may NOT change their subscription tier
  if new.subscription is distinct from old.subscription then
    raise exception 'subscription can only be changed by the server (verified purchase)';
  end if;

  -- clients may NOT change founding_member status
  if new.founding_member is distinct from old.founding_member then
    raise exception 'founding_member can only be set by the server';
  end if;

  -- xp may only increase, and not by an absurd amount in a single update
  if new.xp < old.xp then
    new.xp := old.xp;  -- silently ignore decreases rather than error
  end if;
  if new.xp - old.xp > 5000 then
    raise exception 'xp increase too large for a single update (%).', new.xp - old.xp;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_update on public.profiles;
create trigger trg_guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ============================================================
-- progress sanity: correct_answers can never exceed questions_seen
-- (blocks faking a 100%+ mastery by editing one number)
-- ============================================================
create or replace function public.guard_progress()
returns trigger
language plpgsql
as $$
begin
  if new.correct_answers > new.questions_seen then
    new.correct_answers := new.questions_seen;
  end if;
  if new.mastery_percent > 100 then new.mastery_percent := 100; end if;
  if new.mastery_percent < 0 then new.mastery_percent := 0; end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_progress_ins on public.progress;
create trigger trg_guard_progress_ins
  before insert or update on public.progress
  for each row execute function public.guard_progress();

-- ============================================================
-- NOTE on the full picture:
--   • These triggers stop the COMMON client-side cheats over the API.
--   • The truly authoritative path for premium is: Play purchase ->
--     your Edge Function (service_role) verifies the receipt with Google
--     -> sets subscription. Nothing else can grant premium.
--   • Local-storage edits on the device are corrected on next login by
--     sync.reconcileFromServer(), which overwrites local xp/subscription
--     with the DB values.
-- ============================================================
