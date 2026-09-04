// Supabase (PostgREST) отдаёт не больше 1000 строк за запрос и делает это молча:
// ошибки нет, просто часть данных не приходит. Из-за этого P&L за год терял
// расходы с мая (в выписке 2026 года 2610 строк) и показывал завышенную прибыль.
//
// Всё, что должно прийти целиком, забираем страницами. Порядок обязателен:
// без него .range() может повторить или пропустить строки.

export const PAGE_SIZE = 1000

/**
 * Загружает все строки запроса постранично.
 * @param {() => object} buildQuery функция, создающая НОВЫЙ запрос Supabase
 *   (её вызывают несколько раз; уже выполненный запрос переиспользовать нельзя).
 *   Запрос обязан иметь устойчивый порядок, например .order('id').
 * @param {{pageSize?: number, maxPages?: number}} opts
 * @returns {Promise<Array>}
 */
export async function fetchAll(buildQuery, { pageSize = PAGE_SIZE, maxPages = 100 } = {}) {
  const rows = []
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw error
    const batch = data || []
    rows.push(...batch)
    if (batch.length < pageSize) return rows
  }
  return rows
}
