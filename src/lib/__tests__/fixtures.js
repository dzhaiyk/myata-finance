// Справочник отделов живёт в базе (миграция 025), в коде его нет — тесты
// подставляют свой набор, как это сделает любое заведение.
export const FIXTURE_DEPARTMENTS = [
  { code: 'kitchen', name: 'Кухня', for_revenue: true, for_staff: true, for_supply: true, iiko_store: 'СКЛАД КУХНЯ МЯТА', sort_order: 1, is_active: true },
  { code: 'bar', name: 'Бар', for_revenue: true, for_staff: true, for_supply: true, iiko_store: 'СКЛАД БАР МЯТА', sort_order: 2, is_active: true },
  { code: 'hookah', name: 'Кальян', for_revenue: true, for_staff: true, for_supply: true, iiko_store: 'СКЛАД КАЛЬЯН МЯТА', sort_order: 3, is_active: true },
  { code: 'hall', name: 'Зал', for_revenue: false, for_staff: true, for_supply: false, sort_order: 4, is_active: true },
  { code: 'household', name: 'Хозтовары', for_revenue: false, for_staff: false, for_supply: true, sort_order: 5, is_active: true },
  { code: 'other', name: 'Прочее', for_revenue: true, for_staff: true, for_supply: true, sort_order: 6, is_active: true },
  { code: 'closed', name: 'Закрытый', for_revenue: true, for_staff: true, for_supply: true, sort_order: 7, is_active: false },
]
