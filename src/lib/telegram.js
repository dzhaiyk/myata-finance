import { supabase } from './supabase'

const TELEGRAM_BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID

export async function sendTelegramNotification(message) {
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

export function formatDailyReportNotification(report) {
  const { date, manager, revenue, withdrawals, cashExpected, cashActual, discrepancy, departments } = report
  const disc = discrepancy !== 0 ? `\n⚠️ <b>РАСХОЖДЕНИЕ: ${fmt(discrepancy)} ₸</b>` : '\n✅ Расхождений нет'

  return `🍃 <b>Мята — Ежедневный отчёт</b>
📅 ${date}
👤 Менеджер: ${manager}

💰 <b>Выручка: ${fmt(revenue)} ₸</b>
🍽 Кухня: ${fmt(departments?.kitchen || 0)} ₸
🍸 Бар: ${fmt(departments?.bar || 0)} ₸
💨 Кальян: ${fmt(departments?.hookah || 0)} ₸

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
