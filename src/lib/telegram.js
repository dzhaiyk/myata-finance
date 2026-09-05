import { supabase } from './supabase'
import { getNotifications, setNotifications, isNotificationEnabled, departmentsFor } from './config.js'

const TELEGRAM_BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID

/** Токен для показа в настройках: целиком его светить незачем. */
export const maskedBotToken = () => {
  const t = String(TELEGRAM_BOT_TOKEN || '')
  return t ? `${t.slice(0, 6)}…${t.slice(-4)}` : ''
}
export const telegramChatId = () => String(TELEGRAM_CHAT_ID || '')

// Какие типы уведомлений включены — хранится в settings (key='telegram',
// поле value.notifications), кешируется в config.js. Загружается при старте
// приложения (store.initialize), как и час отсечки.
export async function loadNotifications() {
  try {
    const { data } = await supabase.from('settings').select('value').eq('key', 'telegram').single()
    if (data?.value?.notifications) setNotifications(data.value.notifications)
  } catch (_) { /* нет записи — остаются значения по умолчанию */ }
  return getNotifications()
}

export async function saveNotifications(value) {
  setNotifications(value)
  // остальные поля ключа telegram (bot_token, chat_id) не затираем
  const { data } = await supabase.from('settings').select('value').eq('key', 'telegram').single()
  const next = { ...(data?.value || {}), notifications: getNotifications() }
  const { error } = await supabase.from('settings').upsert(
    { key: 'telegram', value: next, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )
  return { error }
}

/**
 * @param {string} message готовый HTML
 * @param {string} [type] тип уведомления; выключенный в настройках не отправляется
 */
export async function sendTelegramNotification(message, type) {
  if (type && !isNotificationEnabled(type)) return
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('Telegram not configured')
    return
  }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
  } catch (e) {
    console.error('Telegram notification failed:', e)
  }
}

// Отделы в уведомлении перечисляются по справочнику: раньше три строки были
// вписаны в шаблон, и переименование отдела в них не попадало.
const DEPARTMENT_ICONS = { kitchen: '🍽', bar: '🍸', hookah: '💨' }

function departmentLines(departments) {
  const rows = departmentsFor('revenue')
  if (!rows.length) return ''
  return rows
    .map(d => `${DEPARTMENT_ICONS[d.code] || '•'} ${d.name}: ${fmt(departments?.[d.code] || 0)} ₸`)
    .join('\n')
}

export function formatDailyReportNotification(report) {
  const { date, manager, revenue, withdrawals, cashExpected, cashActual, discrepancy, departments } = report
  const disc = discrepancy !== 0 ? `\n⚠️ <b>РАСХОЖДЕНИЕ: ${fmt(discrepancy)} ₸</b>` : '\n✅ Расхождений нет'

  return `🍃 <b>Мята — Ежедневный отчёт</b>
📅 ${date}
👤 Менеджер: ${manager}

💰 <b>Выручка: ${fmt(revenue)} ₸</b>
${departmentLines(departments)}

📤 Изъятия: ${fmt(withdrawals)} ₸
💵 Ожидаемый остаток: ${fmt(cashExpected)} ₸
💵 Фактический остаток: ${fmt(cashActual)} ₸${disc}`
}

export function formatCashDiscrepancyAlert(date, manager, amount) {
  return `🚨 <b>ALERT: Расхождение кассы!</b>
📅 ${date}
👤 ${manager}
💸 Расхождение: <b>${fmt(amount)} ₸</b>
Проверьте немедленно!`
}

export function formatBankImportNotification(month, totalTx, categorized, uncategorized) {
  return `🏦 <b>Импорт банковской выписки</b>
📅 ${month}
📊 Всего транзакций: ${totalTx}
✅ Распознано: ${categorized}
❓ Не распознано: ${uncategorized}
${uncategorized > 0 ? '\n⚠️ Требуется ручная категоризация!' : ''}`
}

function fmt(n) {
  return new Intl.NumberFormat('ru-RU').format(Math.round(n))
}
