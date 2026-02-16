-- Myata Finance - Database Schema
-- Run in Supabase SQL Editor

-- 1. Roles
CREATE TABLE IF NOT EXISTS public.roles (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.roles (name, description, is_system) VALUES
  ('Админ', 'Полный доступ ко всему', true),
  ('Учредитель', 'Просмотр всех финансов и отчётов', true),
  ('Управляющий', 'Управление ежедневными операциями', true),
  ('Менеджер', 'Создание ежедневных отчётов', true)
ON CONFLICT (name) DO NOTHING;

-- 2. Permissions
CREATE TABLE IF NOT EXISTS public.permissions (
  id SERIAL PRIMARY KEY,
  role_id INTEGER REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  allowed BOOLEAN DEFAULT false,
  UNIQUE(role_id, permission_key)
);

-- 3. Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  role_id INTEGER REFERENCES public.roles(id) DEFAULT 4,
  phone TEXT,
  telegram_chat_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Daily Reports
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id SERIAL PRIMARY KEY,
  report_date DATE UNIQUE NOT NULL,
  manager_id UUID REFERENCES public.profiles(id),
  manager_name TEXT,
  data JSONB NOT NULL DEFAULT '{}',
  total_revenue NUMERIC(15,2) DEFAULT 0,
  total_withdrawals NUMERIC(15,2) DEFAULT 0,
  cash_discrepancy NUMERIC(15,2) DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved')),
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_daily_reports_date ON public.daily_reports(report_date DESC);

-- 5. Bank Transactions (imported from statements)
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id SERIAL PRIMARY KEY,
  transaction_date TEXT,
  amount NUMERIC(15,2) NOT NULL,
  is_debit BOOLEAN DEFAULT true,
  beneficiary TEXT,
  purpose TEXT,
  knp TEXT,
  category TEXT DEFAULT 'uncategorized',
  confidence TEXT DEFAULT 'low',
  import_file TEXT,
  import_batch_id UUID DEFAULT gen_random_uuid(),
  pnl_month TEXT, -- e.g. '2025-12'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bank_tx_category ON public.bank_transactions(category);
CREATE INDEX idx_bank_tx_date ON public.bank_transactions(transaction_date);
CREATE INDEX idx_bank_tx_batch ON public.bank_transactions(import_batch_id);

-- 6. PnL Data (monthly aggregated)
CREATE TABLE IF NOT EXISTS public.pnl_data (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  category TEXT NOT NULL, -- matches PNL_STRUCTURE keys
  amount NUMERIC(15,2) DEFAULT 0,
  source TEXT DEFAULT 'manual', -- manual | daily_report | bank_import
  UNIQUE(year, month, category)
);

CREATE INDEX idx_pnl_year ON public.pnl_data(year, month);

-- 7. Cash Flow Data
CREATE TABLE IF NOT EXISTS public.cashflow_data (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  category TEXT NOT NULL,
  amount NUMERIC(15,2) DEFAULT 0,
  UNIQUE(year, month, category)
);

-- 8. Settings
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.settings (key, value) VALUES
  ('telegram', '{"bot_token":"","chat_id":"","notifications":{"cash_discrepancy":true,"daily_report":true,"bank_import":true,"no_report_reminder":true,"food_cost_alert":false}}'),
  ('general', '{"restaurant_name":"Мята Platinum 4YOU","company":"ТОО RIM PARTNERS","currency":"KZT"}')
ON CONFLICT (key) DO NOTHING;

-- 9. RLS Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pnl_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashflow_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Auth users read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users read roles" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users read permissions" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users read daily_reports" ON public.daily_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users read bank_tx" ON public.bank_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users read pnl" ON public.pnl_data FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users read cashflow" ON public.cashflow_data FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users read settings" ON public.settings FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert/update (further restricted in app logic)
CREATE POLICY "Auth users write daily_reports" ON public.daily_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users write bank_tx" ON public.bank_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users write pnl" ON public.pnl_data FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users write cashflow" ON public.cashflow_data FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users write roles" ON public.roles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users write permissions" ON public.permissions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users write settings" ON public.settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users update profile" ON public.profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
