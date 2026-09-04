-- 024 · Суперправа по флагу, а не по названию роли
-- ADR-0010, TASK-015.
-- До этой миграции полные права давало сравнение roles.name = 'Админ'
-- (src/lib/store.js:50,65; src/pages/RolesPage.jsx:37,48,81,179).
-- Переименование роли в базе молча снимало доступ у всех её пользователей.

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS is_superuser BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.roles.is_superuser IS
  'Полные права независимо от строк в permissions. Код проверяет этот флаг, а не name.';

UPDATE public.roles SET is_superuser = true WHERE name = 'Админ';
