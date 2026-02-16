-- Myata Finance v2 - Simple Username/Password Auth
-- Run in Supabase SQL Editor AFTER 001_init.sql

-- Drop old profile trigger (we won't use Supabase Auth anymore for user creation)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Add username/password fields to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Remove the foreign key to auth.users (we'll manage users ourselves)
-- Create a new standalone users table
CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL CHECK (char_length(username) >= 3),
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role_id INTEGER REFERENCES public.roles(id) DEFAULT 4,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Allow anonymous access for login
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- RLS: anyone can attempt login (select by username), but we hash passwords
CREATE POLICY "Anyone can read app_users for login" ON public.app_users 
  FOR SELECT USING (true);

CREATE POLICY "Authenticated can manage app_users" ON public.app_users 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Also allow anon to read for login
GRANT SELECT ON public.app_users TO anon;
GRANT SELECT ON public.roles TO anon;

-- Insert admin user (password: jumanji7877 - stored as plain text, hashed in app)
INSERT INTO public.app_users (username, password_hash, full_name, role_id)
VALUES ('zhaiyk', 'jumanji7877', 'Жайык', 1)
ON CONFLICT (username) DO NOTHING;

-- Make daily_reports accessible without auth (we handle auth in app)
DROP POLICY IF EXISTS "Auth users read daily_reports" ON public.daily_reports;
DROP POLICY IF EXISTS "Auth users write daily_reports" ON public.daily_reports;
CREATE POLICY "All access daily_reports" ON public.daily_reports FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.daily_reports TO anon;
GRANT USAGE, SELECT ON SEQUENCE daily_reports_id_seq TO anon;

-- Same for bank_transactions
DROP POLICY IF EXISTS "Auth users read bank_tx" ON public.bank_transactions;
DROP POLICY IF EXISTS "Auth users write bank_tx" ON public.bank_transactions;
CREATE POLICY "All access bank_tx" ON public.bank_transactions FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.bank_transactions TO anon;
GRANT USAGE, SELECT ON SEQUENCE bank_transactions_id_seq TO anon;

-- Same for pnl_data
DROP POLICY IF EXISTS "Auth users read pnl" ON public.pnl_data;
DROP POLICY IF EXISTS "Auth users write pnl" ON public.pnl_data;
CREATE POLICY "All access pnl" ON public.pnl_data FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.pnl_data TO anon;
GRANT USAGE, SELECT ON SEQUENCE pnl_data_id_seq TO anon;

-- Same for cashflow_data
DROP POLICY IF EXISTS "Auth users read cashflow" ON public.cashflow_data;
DROP POLICY IF EXISTS "Auth users write cashflow" ON public.cashflow_data;
CREATE POLICY "All access cashflow" ON public.cashflow_data FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.cashflow_data TO anon;
GRANT USAGE, SELECT ON SEQUENCE cashflow_data_id_seq TO anon;

-- Same for roles, permissions, settings
DROP POLICY IF EXISTS "Auth users read roles" ON public.roles;
DROP POLICY IF EXISTS "Auth users write roles" ON public.roles;
CREATE POLICY "All access roles" ON public.roles FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.roles TO anon;
GRANT USAGE, SELECT ON SEQUENCE roles_id_seq TO anon;

DROP POLICY IF EXISTS "Auth users read permissions" ON public.permissions;
DROP POLICY IF EXISTS "Auth users write permissions" ON public.permissions;
CREATE POLICY "All access permissions" ON public.permissions FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.permissions TO anon;
GRANT USAGE, SELECT ON SEQUENCE permissions_id_seq TO anon;

DROP POLICY IF EXISTS "Auth users read settings" ON public.settings;
DROP POLICY IF EXISTS "Auth users write settings" ON public.settings;
CREATE POLICY "All access settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.settings TO anon;
