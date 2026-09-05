// Вкладка открыта со старой версии приложения. Имена файлов сборки меняются при
// каждом деплое, поэтому динамический импорт просит файл, которого уже нет; SPA
// отдаёт на него index.html со статусом 200, и браузер сообщает «Failed to fetch
// dynamically imported module». Чинить пользователю нечего — перезагружаем сами.
//
// Два предохранителя: не чаще одного раза в 30 секунд (иначе при настоящей
// поломке будет вечный цикл перезагрузок) и хуки — страница успевает сохранить
// заполненное, прежде чем страница уйдёт (в отчёте смены это черновик).

const STORAGE_KEY = 'myata_stale_reload_at'
const MIN_GAP_MS = 30000

// Сообщения браузеров об одном и том же: вместо модуля пришёл HTML или 404.
const STALE_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /is not a valid javascript mime type/i,
  /expected a javascript.*module script/i,
]

export function isStaleChunkError(err) {
  const msg = typeof err === 'string' ? err : String(err?.message || '')
  return STALE_PATTERNS.some(re => re.test(msg))
}

/** Перезагружать можно, если прошлая авто-перезагрузка была давно или её не было. */
export function shouldAutoReload(lastAt, now, minGapMs = MIN_GAP_MS) {
  if (!Number.isFinite(lastAt)) return true
  return now - lastAt >= minGapMs
}

// Хранилище может быть недоступно (приватный режим, запрет на данные сайта) —
// тогда считаем, что перезагрузок не было: лучше перезагрузить, чем не починить.
export function readLastReload(storage) {
  try { return Number(storage?.getItem(STORAGE_KEY)) } catch { return NaN }
}
export function markReload(storage, now) {
  try { storage?.setItem(STORAGE_KEY, String(now)) } catch { /* не критично */ }
}

const hooks = new Set()

/** Что выполнить перед перезагрузкой (сохранить черновик). Возвращает отписку. */
export function registerStaleReloadHook(fn) {
  hooks.add(fn)
  return () => hooks.delete(fn)
}

export async function runStaleReloadHooks() {
  for (const fn of [...hooks]) {
    try { await fn() } catch { /* не даём хуку помешать перезагрузке */ }
  }
}

/**
 * Обрабатывает ошибку загрузки модуля: сохраняет что успеет и перезагружает.
 * @returns {Promise<boolean>} перезагрузка запущена
 */
export async function handleStaleError(err, opts = {}) {
  const {
    storage = typeof sessionStorage === 'undefined' ? null : sessionStorage,
    now = Date.now(),
    reload = () => window.location.reload(),
  } = opts
  if (!isStaleChunkError(err)) return false
  if (!shouldAutoReload(readLastReload(storage), now)) return false
  markReload(storage, now)
  await runStaleReloadHooks()
  reload()
  return true
}

/** Динамический импорт, который сам чинит устаревшую вкладку. */
export async function loadModule(importer) {
  try {
    return await importer()
  } catch (err) {
    await handleStaleError(err)
    throw err
  }
}

/** Ловушка на случай, если модуль грузится не через loadModule. */
export function installStaleChunkReload(target = window) {
  target.addEventListener('vite:preloadError', (e) => { handleStaleError(e?.payload || e) })
  target.addEventListener('unhandledrejection', (e) => { handleStaleError(e?.reason) })
  target.addEventListener('error', (e) => { handleStaleError(e?.error || e?.message) })
}
