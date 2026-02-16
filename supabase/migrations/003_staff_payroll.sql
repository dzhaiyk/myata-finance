-- Myata Finance v3 - Staff, Suppliers, Payroll
-- Run in Supabase SQL Editor

-- 1. Positions (должности)
CREATE TABLE IF NOT EXISTS public.positions (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  department TEXT NOT NULL CHECK (department IN ('Кухня','Бар','Кальян','Зал','Менеджмент','Прочее')),
  daily_rate NUMERIC(10,2) DEFAULT 0,
  sales_pct NUMERIC(5,2) DEFAULT 0, -- % от продаж
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT ALL ON public.positions TO anon;
GRANT USAGE, SELECT ON SEQUENCE positions_id_seq TO anon;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All access positions" ON public.positions FOR ALL USING (true) WITH CHECK (true);

-- 2. Staff (сотрудники)
CREATE TABLE IF NOT EXISTS public.staff (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  position_id INTEGER REFERENCES public.positions(id),
  department TEXT NOT NULL CHECK (department IN ('Кухня','Бар','Кальян','Зал','Менеджмент','Прочее')),
  phone TEXT,
  daily_rate_override NUMERIC(10,2), -- если отличается от позиции
  sales_pct_override NUMERIC(5,2),
  hire_date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT ALL ON public.staff TO anon;
GRANT USAGE, SELECT ON SEQUENCE staff_id_seq TO anon;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All access staff" ON public.staff FOR ALL USING (true) WITH CHECK (true);

-- 3. Suppliers (поставщики)
CREATE TABLE IF NOT EXISTS public.suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Кухня','Бар','Кальян','Хозтовары','Прочее')),
  contact TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT ALL ON public.suppliers TO anon;
GRANT USAGE, SELECT ON SEQUENCE suppliers_id_seq TO anon;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All access suppliers" ON public.suppliers FOR ALL USING (true) WITH CHECK (true);

-- 4. Payroll periods
CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  period INTEGER NOT NULL CHECK (period IN (1, 2)), -- 1 = 1-15, 2 = 16-end
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','calculated','paid')),
  paid_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(year, month, period)
);

GRANT ALL ON public.payroll_periods TO anon;
GRANT USAGE, SELECT ON SEQUENCE payroll_periods_id_seq TO anon;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All access payroll_periods" ON public.payroll_periods FOR ALL USING (true) WITH CHECK (true);

-- 5. Payroll details (per employee per period)
CREATE TABLE IF NOT EXISTS public.payroll_details (
  id SERIAL PRIMARY KEY,
  period_id INTEGER REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  staff_id INTEGER REFERENCES public.staff(id),
  staff_name TEXT,
  position_name TEXT,
  days_worked INTEGER DEFAULT 0,
  daily_rate NUMERIC(10,2) DEFAULT 0,
  daily_total NUMERIC(12,2) DEFAULT 0, -- days_worked * daily_rate
  sales_amount NUMERIC(15,2) DEFAULT 0, -- продажи из iiko
  sales_pct NUMERIC(5,2) DEFAULT 0,
  sales_bonus NUMERIC(12,2) DEFAULT 0, -- sales_amount * sales_pct / 100
  advances NUMERIC(12,2) DEFAULT 0, -- выданные авансы
  deductions NUMERIC(12,2) DEFAULT 0, -- вычеты
  total_earned NUMERIC(12,2) DEFAULT 0, -- daily_total + sales_bonus
  total_payout NUMERIC(12,2) DEFAULT 0, -- total_earned - advances - deductions
  notes TEXT,
  UNIQUE(period_id, staff_id)
);

GRANT ALL ON public.payroll_details TO anon;
GRANT USAGE, SELECT ON SEQUENCE payroll_details_id_seq TO anon;
ALTER TABLE public.payroll_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All access payroll_details" ON public.payroll_details FOR ALL USING (true) WITH CHECK (true);
