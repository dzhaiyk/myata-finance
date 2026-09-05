-- 031 · Табель смен
-- TASK-038. Смена за день — долей 1 / 0.7 / 0.5, начисление = ставка × доля
-- (BR-PAY). Штрафы — за полумесяц, в расчёт идут в deductions.
-- days_worked расширен до дробного: 9 + 0.7 + 0.5 = 10.2 смены.

CREATE TABLE IF NOT EXISTS public.timesheet_entries (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  share NUMERIC(3,2) NOT NULL DEFAULT 1 CHECK (share > 0 AND share <= 1),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (staff_id, work_date)
);
COMMENT ON TABLE public.timesheet_entries IS 'Табель: смена сотрудника за день долей 1 / 0.7 / 0.5; начисление = ставка × доля (BR-PAY, TASK-038).';

CREATE TABLE IF NOT EXISTS public.timesheet_fines (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  period INTEGER NOT NULL CHECK (period IN (1, 2)),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (staff_id, year, month, period)
);
COMMENT ON TABLE public.timesheet_fines IS 'Штрафы за полумесяц из табеля; в расчёт идут в payroll_details.deductions.';

ALTER TABLE public.payroll_details ALTER COLUMN days_worked TYPE NUMERIC(5,2);
COMMENT ON COLUMN public.payroll_details.days_worked IS 'Смены за период, может быть дробным: доли 0.7 / 0.5 из табеля.';

GRANT ALL ON public.timesheet_entries TO anon;
GRANT ALL ON public.timesheet_fines TO anon;
GRANT USAGE, SELECT ON SEQUENCE timesheet_entries_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE timesheet_fines_id_seq TO anon;
ALTER TABLE public.timesheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_fines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All access timesheet_entries" ON public.timesheet_entries;
CREATE POLICY "All access timesheet_entries" ON public.timesheet_entries FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "All access timesheet_fines" ON public.timesheet_fines;
CREATE POLICY "All access timesheet_fines" ON public.timesheet_fines FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS timesheet_entries_date_idx ON public.timesheet_entries (work_date);
