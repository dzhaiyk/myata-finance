-- 025 · Справочник отделов вместо CHECK-ограничений
-- ADR-0010, TASK-018.
--
-- До этой миграции набор отделов был зашит в CHECK трёх таблиц (миграция 003):
-- заведение с другим набором отделов не могло завести свой без правки схемы.
-- Плюс отделы хранились отображаемым названием, и переименование ломало расчёты.
--
-- Порядок важен: сначала таблица и seed, затем перевод значений на коды,
-- затем снятие CHECK и внешние ключи, и только потом JSONB отчётов.

-- 1. Справочник -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.departments (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  -- где отдел предлагается: выручка смены, персонал, закуп
  for_revenue BOOLEAN NOT NULL DEFAULT false,
  for_staff BOOLEAN NOT NULL DEFAULT false,
  for_supply BOOLEAN NOT NULL DEFAULT false,
  -- название склада в iiko: отдел выручки определяется складом списания (BR-SHF-019)
  iiko_store TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT ALL ON public.departments TO anon;
GRANT USAGE, SELECT ON SEQUENCE departments_id_seq TO anon;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All access departments" ON public.departments;
CREATE POLICY "All access departments" ON public.departments FOR ALL USING (true) WITH CHECK (true);

-- Наполнение под «Мяту». У другого клиента здесь будет свой набор.
INSERT INTO public.departments (code, name, for_revenue, for_staff, for_supply, iiko_store, sort_order) VALUES
  ('kitchen',    'Кухня',      true,  true,  true,  'СКЛАД КУХНЯ МЯТА',  1),
  ('bar',        'Бар',        true,  true,  true,  'СКЛАД БАР МЯТА',    2),
  ('hookah',     'Кальян',     true,  true,  true,  'СКЛАД КАЛЬЯН МЯТА', 3),
  ('hall',       'Зал',        false, true,  false, NULL,                4),
  ('management', 'Менеджмент', false, true,  false, NULL,                5),
  ('household',  'Хозтовары',  false, false, true,  NULL,                6),
  ('other',      'Прочее',     true,  true,  true,  NULL,                7)
ON CONFLICT (code) DO NOTHING;

-- 2. Значения в таблицах переводятся с названий на коды ---------------------

UPDATE public.positions p SET department = d.code
  FROM public.departments d WHERE p.department = d.name;
UPDATE public.staff s SET department = d.code
  FROM public.departments d WHERE s.department = d.name;
UPDATE public.suppliers s SET category = d.code
  FROM public.departments d WHERE s.category = d.name;

-- 3. CHECK снимаются, вместо них внешние ключи ------------------------------

ALTER TABLE public.positions DROP CONSTRAINT IF EXISTS positions_department_check;
ALTER TABLE public.staff     DROP CONSTRAINT IF EXISTS staff_department_check;
ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_category_check;

ALTER TABLE public.positions DROP CONSTRAINT IF EXISTS positions_department_fkey;
ALTER TABLE public.staff     DROP CONSTRAINT IF EXISTS staff_department_fkey;
ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_category_fkey;

ALTER TABLE public.positions ADD CONSTRAINT positions_department_fkey
  FOREIGN KEY (department) REFERENCES public.departments(code);
ALTER TABLE public.staff ADD CONSTRAINT staff_department_fkey
  FOREIGN KEY (department) REFERENCES public.departments(code);
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_category_fkey
  FOREIGN KEY (category) REFERENCES public.departments(code);

-- 4. Коды в отчётах смен ----------------------------------------------------
-- Отделы лежат в data->'departments' как [{name, amount}]. Добавляем code,
-- сохраняя порядок элементов. Название оставляем: оно показывается в старых PDF.

UPDATE public.daily_reports r
SET data = jsonb_set(r.data, '{departments}', (
  SELECT COALESCE(jsonb_agg(
           CASE WHEN d.code IS NULL THEN e ELSE e || jsonb_build_object('code', d.code) END
           ORDER BY ord
         ), '[]'::jsonb)
  FROM jsonb_array_elements(r.data->'departments') WITH ORDINALITY AS t(e, ord)
  LEFT JOIN public.departments d ON d.name = e->>'name'
))
WHERE jsonb_typeof(r.data->'departments') = 'array'
  AND jsonb_array_length(r.data->'departments') > 0;
