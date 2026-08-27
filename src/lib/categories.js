// Категории, которые НЕ участвуют в P&L и операционном Cash Flow:
// - uncategorized — ещё не разнесено, попадёт в отчёт после категоризации
// - internal — перевод между своими счетами, не доход и не расход
// - acquiring_settlement — зачисление выручки с терминалов; сама выручка уже
//   учтена из отчётов смен, повторный учёт дал бы двойной счёт.
//   При этом строка ХРАНИТСЯ (не скрывается) — нужна для сверки
//   «терминалы ↔ зачисления» и двигает баланс банковского счёта.
export const NON_PNL_CATEGORIES = new Set([
  'uncategorized',
  'internal',
  'acquiring_settlement',
])

export const isPnlCategory = (category) => !!category && !NON_PNL_CATEGORIES.has(category)
