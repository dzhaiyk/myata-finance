// Стартовая структура P&L нового клиента и запасной вариант, пока таблица
// pnl_lines (миграция 029) не загружена. Живая структура — pnlStructure.js.
// source: 'daily:field' | 'bank:category_code' | 'calc' | 'manual'
// С миграции 029 живая структура читается из базы (pnlStructure.js); этот
// массив — seed нового клиента и запасной вариант, пока база не загружена.
export const PNL_STRUCTURE = [
  // === REVENUE ===
  { key: 'revenue', label: 'ДОХОДЫ', level: 0, section: 'revenue', calc: 'sum_children' },
  { key: 'rev_kitchen', label: 'Кухня', dept: 'kitchen', level: 2, section: 'revenue', source: 'daily:dept_kitchen' },
  { key: 'rev_bar', label: 'Бар', dept: 'bar', level: 2, section: 'revenue', source: 'daily:dept_bar' },
  { key: 'rev_hookah', label: 'Кальян', dept: 'hookah', level: 2, section: 'revenue', source: 'daily:dept_hookah' },
  // Прочий доход приходит из двух мест: отдел «Прочее» в отчёте смены и
  // поступления на счёт, не связанные с эквайрингом (например, аренда места
  // под станции зарядки). У банковских строк знак обратный: кредит = доход.
  { key: 'rev_other', label: 'Прочее', level: 2, section: 'revenue', source: 'both:income_other', dailyField: 'dept_other' },

  // === EXPENSES ===
  { key: 'expenses', label: 'РАСХОДЫ', level: 0, section: 'expenses', calc: 'sum_children' },

  // CapEx
  { key: 'capex', label: 'CapEx (инвестиции)', level: 1, section: 'expenses', calc: 'sum_children' },
  { key: 'capex_repair', label: 'Ремонт', level: 2, section: 'expenses', source: 'bank:capex_repair' },
  { key: 'capex_furniture', label: 'Мебель и техника', level: 2, section: 'expenses', source: 'bank:capex_furniture' },
  { key: 'capex_other', label: 'CapEx прочее', level: 2, section: 'expenses', source: 'bank:capex_other' },

  // OpEx
  { key: 'opex', label: 'OpEx (ежемесячные расходы)', level: 1, section: 'expenses', calc: 'sum_children' },

  // ФОТ
  { key: 'payroll', label: 'ФОТ', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'payroll_mgmt', label: 'ФОТ Менеджмент', level: 3, section: 'expenses', source: 'bank:payroll_mgmt' },
  { key: 'payroll_kitchen', label: 'ФОТ Кухня', dept: 'kitchen', labelPrefix: 'ФОТ', level: 3, section: 'expenses', source: 'bank:payroll_kitchen' },
  { key: 'payroll_bar', label: 'ФОТ Бар', dept: 'bar', labelPrefix: 'ФОТ', level: 3, section: 'expenses', source: 'bank:payroll_bar' },
  { key: 'payroll_hookah', label: 'ФОТ Кальян', dept: 'hookah', labelPrefix: 'ФОТ', level: 3, section: 'expenses', source: 'bank:payroll_hookah' },
  { key: 'payroll_hall', label: 'ФОТ Зал', level: 3, section: 'expenses', source: 'bank:payroll_hall' },
  { key: 'payroll_transport', label: 'Развозка', level: 3, section: 'expenses', source: 'bank:payroll_transport' },
  { key: 'payroll_other', label: 'ФОТ Прочее', level: 3, section: 'expenses', source: 'both:payroll_other' },

  // Food Cost
  { key: 'foodcost', label: 'Food cost', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'fc_kitchen', label: 'Закуп кухня', dept: 'kitchen', labelPrefix: 'Закуп', level: 3, section: 'expenses', source: 'both:cogs_kitchen', dailyField: 'suppliers_kitchen' },
  { key: 'fc_bar', label: 'Закуп бар', dept: 'bar', labelPrefix: 'Закуп', level: 3, section: 'expenses', source: 'both:cogs_bar', dailyField: 'suppliers_bar' },
  { key: 'fc_hookah', label: 'Закуп кальян', dept: 'hookah', labelPrefix: 'Закуп', level: 3, section: 'expenses', source: 'both:cogs_hookah', dailyField: 'tobacco' },

  // Маркетинг
  { key: 'marketing', label: 'Маркетинг', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'mkt_smm', label: 'СММ', level: 3, section: 'expenses', source: 'bank:mkt_smm' },
  { key: 'mkt_target', label: 'Таргет', level: 3, section: 'expenses', source: 'bank:mkt_target' },
  { key: 'mkt_2gis', label: '2ГИС', level: 3, section: 'expenses', source: 'bank:mkt_2gis' },
  { key: 'mkt_yandex', label: 'Яндекс', level: 3, section: 'expenses', source: 'bank:mkt_yandex' },
  { key: 'mkt_google', label: 'Google', level: 3, section: 'expenses', source: 'bank:mkt_google' },
  { key: 'mkt_other', label: 'Маркетинг прочее', level: 3, section: 'expenses', source: 'bank:mkt_other' },

  // Аренда
  { key: 'rent', label: 'Аренда', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'rent_premises', label: 'Аренда помещения', level: 3, section: 'expenses', source: 'bank:rent_premises' },
  { key: 'rent_warehouse', label: 'Аренда склада и кровли', level: 3, section: 'expenses', source: 'bank:rent_warehouse' },
  { key: 'rent_property_tax', label: 'Налог на недвижимость', level: 3, section: 'expenses', source: 'bank:rent_property_tax' },

  // Коммунальные
  { key: 'utilities', label: 'Коммунальные платежи', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'util_electric', label: 'Электричество', level: 3, section: 'expenses', source: 'bank:util_electric' },
  { key: 'util_water', label: 'Водоснабжение', level: 3, section: 'expenses', source: 'bank:util_water' },
  { key: 'util_heating', label: 'Отопление', level: 3, section: 'expenses', source: 'bank:util_heating' },
  { key: 'util_bi', label: 'BI Service', level: 3, section: 'expenses', source: 'bank:util_bi' },
  { key: 'util_internet', label: 'Интернет и связь', level: 3, section: 'expenses', source: 'bank:util_internet' },
  { key: 'util_waste', label: 'Вывоз мусора', level: 3, section: 'expenses', source: 'bank:util_waste' },
  { key: 'util_other', label: 'Ком. услуги прочее', level: 3, section: 'expenses', source: 'bank:util_other' },

  // OpEx прочее
  { key: 'opex_other', label: 'OpEx прочее', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'opex_household', label: 'Хозтовары', level: 3, section: 'expenses', source: 'both:household', dailyField: 'other' },
  { key: 'opex_bank_fee', label: 'Комиссия банка', level: 3, section: 'expenses', source: 'bank:bank_fee' },
  { key: 'opex_security', label: 'Система безопасности', level: 3, section: 'expenses', source: 'bank:opex_security' },
  { key: 'opex_software', label: 'Программное обеспечение', level: 3, section: 'expenses', source: 'bank:opex_software' },
  { key: 'opex_menu', label: 'Меню', level: 3, section: 'expenses', source: 'bank:opex_menu' },
  { key: 'opex_pest', label: 'Дератизация/дезинсекция', level: 3, section: 'expenses', source: 'bank:opex_pest' },
  { key: 'opex_grease', label: 'Чистка жироуловителей', level: 3, section: 'expenses', source: 'bank:opex_grease' },
  { key: 'opex_repair', label: 'Мелкий ремонт', level: 3, section: 'expenses', source: 'bank:opex_repair' },
  { key: 'opex_uniform', label: 'Форма для персонала', level: 3, section: 'expenses', source: 'bank:opex_uniform' },
  { key: 'opex_music', label: 'Авторские права на музыку', level: 3, section: 'expenses', source: 'bank:opex_music' },
  { key: 'opex_royalty', label: 'Роялти', level: 3, section: 'expenses', source: 'bank:opex_royalty' },
  { key: 'opex_misc', label: 'Прочее', level: 3, section: 'expenses', source: 'bank:opex_misc' },

  // Налоги
  { key: 'taxes', label: 'Налоги', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'tax_retail', label: 'Розничный налог', level: 3, section: 'expenses', source: 'bank:tax_retail' },
  { key: 'tax_payroll', label: 'Налоги по зарплате', level: 3, section: 'expenses', source: 'bank:tax_payroll' },
  { key: 'tax_insurance', label: 'Страхование сотрудников', level: 3, section: 'expenses', source: 'bank:tax_insurance' },
  { key: 'tax_alcohol', label: 'Лицензия на алкоголь', level: 3, section: 'expenses', source: 'bank:tax_alcohol' },
  { key: 'tax_hookah', label: 'Лицензия на кальян', level: 3, section: 'expenses', source: 'bank:tax_hookah' },
  { key: 'tax_other', label: 'Налоги прочее', level: 3, section: 'expenses', source: 'bank:tax_other' },

  // === RESULTS ===
  { key: 'op_profit', label: 'Операционная прибыль (Доходы - OpEx)', level: 0, section: 'result', calc: 'revenue_minus_opex' },
  { key: 'net_profit', label: 'Прибыль', level: 0, section: 'result', calc: 'revenue_minus_all' },

  // === RATIOS ===
  { key: 'margin_pct', label: 'Маржа (от опер. прибыли)', level: 0, section: 'ratio', calc: 'ratio' },
  { key: 'fc_pct', label: 'Food cost в %', level: 0, section: 'ratio', calc: 'ratio' },
  { key: 'fc_kitchen_pct', label: 'Кухня', dept: 'kitchen', level: 2, section: 'ratio', calc: 'ratio' },
  { key: 'fc_bar_pct', label: 'Бар', dept: 'bar', level: 2, section: 'ratio', calc: 'ratio' },
  { key: 'fc_hookah_pct', label: 'Кальян', dept: 'hookah', level: 2, section: 'ratio', calc: 'ratio' },
]

