-- Тема оформления запоминается за пользователем, а не за устройством: планшет
-- в зале общий, а выбор личный. Пусто — идём за системной настройкой (ADR-0013).
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS theme TEXT;

COMMENT ON COLUMN public.app_users.theme IS
  'Выбранная тема оформления: dark | light. NULL — как в системе.';
