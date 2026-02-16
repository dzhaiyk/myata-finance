-- Add Бухгалтер role if it doesn't exist
INSERT INTO public.roles (name, description, is_system)
VALUES ('Бухгалтер', 'Доступ к финансовым отчётам и зарплатам', false)
ON CONFLICT (name) DO NOTHING;
