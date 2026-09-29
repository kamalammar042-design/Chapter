-- ============================================================
-- 021: pin search_path on trigger functions and effective_tier
-- ------------------------------------------------------------
-- Deleting an account runs as Supabase Auth's database role, whose
-- search_path is only "auth". The cascade from auth.users deletes the
-- student's entitlements, which fires sync_subscription → effective_tier,
-- and effective_tier names the type subscription_t without a schema, so
-- the delete failed for anyone who had ever held an entitlement (Chapter
-- Plus). Pinning search_path makes these functions independent of the
-- caller's settings.
-- ============================================================

alter function public.effective_tier(uuid) set search_path = public, pg_temp;
alter function public.sync_subscription() set search_path = public, pg_temp;
alter function public.guard_profile_update() set search_path = public, pg_temp;
alter function public.guard_progress() set search_path = public, pg_temp;
alter function public.guard_question() set search_path = public, pg_temp;
alter function public.touch_updated_at() set search_path = public, pg_temp;
alter function public.validate_profile() set search_path = public, pg_temp;
