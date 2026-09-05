-- 026 · Статьи P&L, привязанные к отделу
-- ADR-0010, TASK-025.
--
-- «ФОТ Кухня» и «Закуп кухня» — названия, в которые вписан отдел. После
-- переименования отдела в справочнике они оставались со старым словом.
-- Теперь статья может ссылаться на отдел и хранить шаблон названия;
-- подпись собирается из шаблона и текущего названия отдела.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS department TEXT REFERENCES public.departments(code),
  ADD COLUMN IF NOT EXISTS name_template TEXT;

COMMENT ON COLUMN public.categories.department IS
  'Отдел, к которому относится статья. Если задан вместе с name_template, подпись собирается из них.';
COMMENT ON COLUMN public.categories.name_template IS
  'Шаблон подписи, {department} заменяется текущим названием отдела. Пусто — используется name.';

UPDATE public.categories SET department = 'kitchen',    name_template = 'Закуп {department}' WHERE code = 'cogs_kitchen';
UPDATE public.categories SET department = 'bar',        name_template = 'Закуп {department}' WHERE code = 'cogs_bar';
UPDATE public.categories SET department = 'hookah',     name_template = 'Закуп {department}' WHERE code = 'cogs_hookah';
UPDATE public.categories SET department = 'kitchen',    name_template = 'ФОТ {department}'   WHERE code = 'payroll_kitchen';
UPDATE public.categories SET department = 'bar',        name_template = 'ФОТ {department}'   WHERE code = 'payroll_bar';
UPDATE public.categories SET department = 'hookah',     name_template = 'ФОТ {department}'   WHERE code = 'payroll_hookah';
UPDATE public.categories SET department = 'hall',       name_template = 'ФОТ {department}'   WHERE code = 'payroll_hall';
UPDATE public.categories SET department = 'management', name_template = 'ФОТ {department}'   WHERE code = 'payroll_mgmt';
