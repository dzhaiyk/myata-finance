-- Migration 016: Fix app_users RLS — allow anon full access (custom auth, not Supabase Auth)
CREATE POLICY IF NOT EXISTS "Anon full access app_users" ON public.app_users
  FOR ALL USING (true) WITH CHECK (true);
