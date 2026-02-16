-- Fix: Remove broken foreign key on daily_reports.manager_id
-- It references profiles(id) which doesn't exist - we use app_users

ALTER TABLE public.daily_reports DROP CONSTRAINT IF EXISTS daily_reports_manager_id_fkey;
