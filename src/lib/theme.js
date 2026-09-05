// Тема оформления. Выбор пользователя важнее системной настройки, но пока
// выбора нет — идём за системой (в CSS это делает prefers-color-scheme).
//
// Помним за пользователем, а не за устройством: планшет в зале общий, а выбор
// личный. Локально — чтобы применилось мгновенно и работало без сети; в базе —
// чтобы выбор уезжал с пользователем на другое устройство.

export const THEMES = ['dark', 'light']
const KEY = (userId) => `myata_theme_${userId || 'guest'}`

/** Тема, которая реально будет показана: выбор или системная настройка. */
export function effectiveTheme(choice, systemPrefersLight) {
  if (choice === 'dark' || choice === 'light') return choice
  return systemPrefersLight ? 'light' : 'dark'
}

/** Что будет после нажатия на переключатель. */
export const nextTheme = (current) => (current === 'light' ? 'dark' : 'light')

export function readTheme(userId) {
  try {
    const v = localStorage.getItem(KEY(userId))
    return THEMES.includes(v) ? v : null
  } catch { return null }
}

/** Ставит атрибут на <html>; null — снимает, тогда работает системная настройка. */
export function applyTheme(choice) {
  const el = typeof document === 'undefined' ? null : document.documentElement
  if (!el) return
  if (THEMES.includes(choice)) el.setAttribute('data-theme', choice)
  else el.removeAttribute('data-theme')
}

export function systemPrefersLight() {
  try { return window.matchMedia('(prefers-color-scheme: light)').matches } catch { return false }
}

/** Тема, показанная сейчас, — по атрибуту или по системе. */
export function currentTheme(userId) {
  return effectiveTheme(readTheme(userId), systemPrefersLight())
}

/**
 * Сохраняет выбор: сразу локально и на экране, затем в базу — молча, чтобы
 * сеть не задерживала переключение.
 */
export async function saveTheme(userId, choice) {
  if (!THEMES.includes(choice)) return { error: null }
  try { localStorage.setItem(KEY(userId), choice) } catch { /* приватный режим */ }
  applyTheme(choice)
  if (!userId) return { error: null }
  try {
    const { supabase } = await import('./supabase')
    const { error } = await supabase.from('app_users').update({ theme: choice }).eq('id', userId)
    return { error }
  } catch (error) { return { error } }
}
