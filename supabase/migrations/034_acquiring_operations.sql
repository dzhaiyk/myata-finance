-- Операции эквайринга: подтверждение безнала смены живыми деньгами (TASK-048).
-- Даты текстом, как в bank_transactions и daily_reports.
CREATE TABLE IF NOT EXISTS public.acquiring_operations (
  id BIGSERIAL PRIMARY KEY,
  acquirer TEXT NOT NULL,               -- kaspi | halyk_pos
  merchant TEXT,
  op_type TEXT,
  operation_no TEXT NOT NULL,
  operated_on TEXT NOT NULL,
  operated_at TEXT,
  business_date TEXT NOT NULL,          -- операционный день (BR-SHF-001)
  amount NUMERIC(14,2) NOT NULL,
  fee NUMERIC(14,2) DEFAULT 0,
  pay_method TEXT,
  channel TEXT,
  terminal TEXT,
  source_file TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (acquirer, operation_no)
);

COMMENT ON TABLE public.acquiring_operations IS
  'Операции эквайринга из выписок Kaspi и Halyk POS. Сверяются с безналом смены (BR-CTL-019).';
COMMENT ON COLUMN public.acquiring_operations.business_date IS
  'Операционный день: ночная операция относится к смене предыдущего дня (BR-SHF-001).';

CREATE INDEX IF NOT EXISTS acquiring_operations_business_date_idx
  ON public.acquiring_operations (business_date);

GRANT ALL ON public.acquiring_operations TO anon;
GRANT USAGE, SELECT ON SEQUENCE acquiring_operations_id_seq TO anon;
ALTER TABLE public.acquiring_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All access acquiring_operations" ON public.acquiring_operations;
CREATE POLICY "All access acquiring_operations" ON public.acquiring_operations FOR ALL USING (true) WITH CHECK (true);
