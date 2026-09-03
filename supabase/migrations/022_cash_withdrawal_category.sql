-- Migration 022: категория «Снятие наличных со счёта»
-- Снятия в банкомате попадали в «Комиссия банка» (правило «бенефициар содержит Kaspi»).
-- Это перемещение денег (счёт → наличные), не расход: исключается из P&L и операционного CF.
INSERT INTO public.categories (code, name, type, pnl_group, sort_order)
VALUES ('cash_withdrawal', 'Снятие наличных со счёта', 'other', 'internal', 103)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type,
  pnl_group = EXCLUDED.pnl_group, sort_order = EXCLUDED.sort_order;

-- Правило «Комиссия банка» (бенефициар содержит Kaspi + дебет) не должно ловить снятия наличных
INSERT INTO public.bank_rule_conditions (rule_id, field, operator, value, sort_order)
SELECT r.id, 'purpose', 'not_contains', 'наличных', 2
FROM public.bank_rules r
WHERE r.name = 'Комиссия банка' AND r.category_code = 'bank_fee'
  AND NOT EXISTS (SELECT 1 FROM public.bank_rule_conditions c WHERE c.rule_id = r.id AND c.operator = 'not_contains');
