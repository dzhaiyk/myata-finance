-- 028 · Подкатегории статей P&L
-- ADR-0011, TASK-027.
--
-- Статья может быть вложена в другую: «Коммунальные → Электричество».
-- Глубина — один уровень (решение владельца 05.09.2026): родитель сам не
-- может быть подстатьёй. Ограничение глубины держит приложение
-- (categoriesDict.js), база — только ссылочную целостность.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_code TEXT REFERENCES public.categories(code);

COMMENT ON COLUMN public.categories.parent_code IS
  'Родительская статья; в отчётах подстатья сворачивается в неё. Один уровень вложенности.';

CREATE INDEX IF NOT EXISTS categories_parent_code_idx ON public.categories(parent_code);
