import { useState } from 'react'
import { sendTelegramNotification, saveNotifications, maskedBotToken, telegramChatId } from '@/lib/telegram'
import { getNotifications, THRESHOLDS, getThresholds, validateThresholds } from '@/lib/config'
import { saveThresholds } from '@/lib/thresholds'
import { getCutoffHour, saveCutoffHour } from '@/lib/dates'
import { useAuthStore } from '@/lib/store'
import BrandingSettings from '@/components/BrandingSettings'
import { Save, Send, Bell, Bot, Moon, Gauge } from 'lucide-react'
import { money } from '@/lib/utils'
import { currencySymbol } from '@/lib/config'

// Только те типы, которые приложение действительно умеет отправлять.
// Порог берётся из настроек, чтобы подпись не разошлась с логикой.
const notificationLabels = () => [
  { key: 'cash_discrepancy', label: 'Расхождение кассы', desc: `При отправке отчёта, если касса не сошлась${THRESHOLDS.cashDiscrepancy > 0 ? ` больше чем на ${money(THRESHOLDS.cashDiscrepancy)}` : ''}` },
  { key: 'daily_report', label: 'Ежедневный отчёт сдан', desc: 'При каждой отправке отчёта менеджером' },
  { key: 'bank_import', label: 'Импорт банковской выписки', desc: 'При загрузке и обработке выписки' },
]

// В форме доли показываются процентами (35), в настройках хранятся долями (0.35)
const pct = (v) => String(Math.round(Number(v) * 1000) / 10)
const toForm = (t) => ({
  cashDiscrepancy: String(t.cashDiscrepancy), accountBalanceTolerance: String(t.accountBalanceTolerance),
  acquiringDay: String(t.acquiringDay),
  ownerCashTolerance: String(t.ownerCashTolerance), payrollTolerance: String(t.payrollTolerance),
  payrollShareTarget: pct(t.payrollShareTarget), payrollShareAlert: pct(t.payrollShareAlert),
  foodCost: { target: pct(t.foodCost.target), warn: pct(t.foodCost.warn), critical: pct(t.foodCost.critical) },
  margin: { good: pct(t.margin.good), warn: pct(t.margin.warn) },
})
const share = (v) => Number(String(v).replace(',', '.')) / 100
const fromForm = (f) => ({
  cashDiscrepancy: Number(f.cashDiscrepancy), accountBalanceTolerance: Number(f.accountBalanceTolerance),
  acquiringDay: Number(f.acquiringDay),
  ownerCashTolerance: Number(f.ownerCashTolerance), payrollTolerance: Number(f.payrollTolerance),
  payrollShareTarget: share(f.payrollShareTarget), payrollShareAlert: share(f.payrollShareAlert),
  foodCost: { target: share(f.foodCost.target), warn: share(f.foodCost.warn), critical: share(f.foodCost.critical) },
  margin: { good: share(f.margin.good), warn: share(f.margin.warn) },
})

const MONEY_FIELDS = [
  ['cashDiscrepancy', 'Расхождение кассы', '0 — касса сходится в ноль (BR-SHF-020)'],
  ['accountBalanceTolerance', 'Допуск остатка счёта', 'сверка с выпиской (BR-CTL-017)'],
  ['ownerCashTolerance', 'Наличные у учредителей', 'необъяснённый остаток (BR-CTL-017)'],
  ['payrollTolerance', 'Допуск сверки ФОТ', 'ведомость против выдач'],
  ['acquiringDay', 'Эквайринг за смену', 'безнал смены против операций эквайрера (BR-CTL-019)'],
]
const SHARE_FIELDS = [
  ['foodCost.target', 'Food cost — ориентир', 'линия на графике'],
  ['foodCost.warn', 'Food cost — жёлтая', 'от этой доли'],
  ['foodCost.critical', 'Food cost — красная', 'от этой доли; аномалия в аналитике'],
  ['margin.good', 'Маржа — зелёная', 'от этой доли'],
  ['margin.warn', 'Маржа — жёлтая', 'от этой доли, ниже — красная'],
  ['payrollShareTarget', 'Доля ФОТ — ориентир', 'линия на графике'],
  ['payrollShareAlert', 'Доля ФОТ — тревога', 'выше этой доли'],
]
const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj)

export default function SettingsPage() {
  const { hasPermission } = useAuthStore()
  const canEdit = hasPermission('settings.edit')
  const [testResult, setTestResult] = useState('')
  const [notifications, setNotificationsState] = useState(getNotifications())
  const [notifSaved, setNotifSaved] = useState('')
  const [cutoffHour, setCutoffHourState] = useState(getCutoffHour())
  const [cutoffSaved, setCutoffSaved] = useState('')
  const [thresholds, setThresholdsState] = useState(() => toForm(getThresholds()))
  const [thrSaved, setThrSaved] = useState('')

  const patchThr = (path, raw) => setThresholdsState(prev => {
    const next = { ...prev, foodCost: { ...prev.foodCost }, margin: { ...prev.margin } }
    const [a, b] = path.split('.')
    if (b) next[a][b] = raw; else next[a] = raw
    return next
  })

  const handleSaveThresholds = async () => {
    const value = fromForm(thresholds)
    const errors = validateThresholds(value)
    if (errors.length) { setThrSaved('❌ ' + errors.join('; ')); return }
    setThrSaved('Сохранение...')
    const { error } = await saveThresholds(value)
    setThrSaved(error ? '❌ Ошибка: ' + error.message : '✅ Сохранено')
  }

  const handleSaveCutoff = async () => {
    setCutoffSaved('Сохранение...')
    const { error } = await saveCutoffHour(cutoffHour)
    setCutoffSaved(error ? '❌ Ошибка: ' + error.message : '✅ Сохранено')
  }

  const toggleNotification = (key) => setNotificationsState(n => ({ ...n, [key]: !n[key] }))

  const handleSaveNotifications = async () => {
    setNotifSaved('Сохранение...')
    const { error } = await saveNotifications(notifications)
    setNotifSaved(error ? '❌ Ошибка: ' + error.message : '✅ Сохранено')
  }

  const testTelegram = async () => {
    if (!maskedBotToken() || !telegramChatId()) {
      setTestResult('❌ Не настроено: задайте переменные бота в панели Netlify')
      return
    }
    setTestResult('Отправка...')
    // Без типа — тестовое сообщение уходит независимо от переключателей
    await sendTelegramNotification('Тест: уведомления подключены')
    setTestResult('✅ Отправлено — проверьте чат')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Настройки</h1>
        <p className="text-sm text-slate-500 mt-0.5">Конфигурация системы</p>
      </div>

      {/* Операционный день */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Moon className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <div className="text-sm font-semibold">Операционный день</div>
            <div className="text-xs text-slate-500">Заведение закрывается после полуночи — ночные операции относятся к смене предыдущего дня</div>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Граница операционного дня</label>
            <select value={cutoffHour} onChange={e => setCutoffHourState(Number(e.target.value))} className="input text-sm w-full">
              {Array.from({ length: 13 }, (_, h) => (
                <option key={h} value={h}>{h === 0 ? '00:00 (без переноса)' : `до ${String(h).padStart(2, '0')}:00`}</option>
              ))}
            </select>
          </div>
          <button onClick={handleSaveCutoff} className="btn-primary text-sm flex items-center gap-2">
            <Save className="w-4 h-4" /> Сохранить
          </button>
          {cutoffSaved && <span className="text-xs text-slate-400 pb-2.5">{cutoffSaved}</span>}
        </div>
        <p className="text-xs text-slate-500">
          Всё, что происходит с 00:00 до этой границы (дата отчёта смены, операции по счетам,
          ночные транзакции в банковской выписке), приписывается к предыдущей дате.
          Закрываетесь в 02:00 — оставьте запас, например «до 06:00».
        </p>
      </div>

      <BrandingSettings canEdit={canEdit} />

      {/* Telegram Bot */}
      <div className="card space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="text-sm font-semibold">Telegram-бот</div>
            <div className="text-xs text-slate-500">Уведомления о расхождениях кассы и отчётах</div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Bot Token</label>
            <div className="input w-full font-mono text-xs text-slate-400">{maskedBotToken() || 'не задан'}</div>
          </div>
          <div>
            <label className="label">Chat ID (группа или личный)</label>
            <div className="input w-full font-mono text-xs text-slate-400">{telegramChatId() || 'не задан'}</div>
          </div>
          <p className="text-xs text-slate-500">
            Токен и чат задаются переменными окружения в панели хостинга и применяются
            при следующей сборке — отсюда их не изменить.
          </p>

          <div className="flex items-center gap-3">
            <button onClick={testTelegram} className="btn-secondary text-sm flex items-center gap-2">
              <Send className="w-4 h-4" /> Тест
            </button>
            {testResult && <span className="text-xs text-slate-400">{testResult}</span>}
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4">
          <div className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-2">
            <Bell className="w-3.5 h-3.5" /> Типы уведомлений
          </div>
          <div className="space-y-2">
            {notificationLabels().map(n => (
              <label key={n.key} className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-800/30 cursor-pointer transition-colors">
                <input type="checkbox" checked={notifications[n.key] !== false}
                  onChange={() => toggleNotification(n.key)} className="mt-0.5 accent-brand-500" />
                <div>
                  <div className="text-sm font-medium">{n.label}</div>
                  <div className="text-xs text-slate-500">{n.desc}</div>
                </div>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button onClick={handleSaveNotifications} className="btn-primary text-sm flex items-center gap-2">
              <Save className="w-4 h-4" /> Сохранить
            </button>
            {notifSaved && <span className="text-xs text-slate-400">{notifSaved}</span>}
          </div>
        </div>
      </div>

      {/* Пороги и нормы */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Gauge className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="text-sm font-semibold">Пороги и нормы</div>
            <div className="text-xs text-slate-500">Допуски сверок в {currencySymbol()} и границы показателей в процентах — одни на все экраны</div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {MONEY_FIELDS.map(([key, label, hint]) => (
            <div key={key}>
              <label className="label">{label}, {currencySymbol()}</label>
              <input value={thresholds[key]} disabled={!canEdit} inputMode="decimal" className="input text-sm w-full"
                onChange={e => patchThr(key, e.target.value)} />
              <div className="text-2xs text-slate-500 mt-0.5">{hint}</div>
            </div>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {SHARE_FIELDS.map(([key, label, hint]) => (
            <div key={key}>
              <label className="label">{label}, %</label>
              <input value={getPath(thresholds, key)} disabled={!canEdit} inputMode="decimal" className="input text-sm w-full"
                onChange={e => patchThr(key, e.target.value)} />
              <div className="text-2xs text-slate-500 mt-0.5">{hint}</div>
            </div>
          ))}
        </div>
        {canEdit && (
          <div className="flex items-center gap-3">
            <button onClick={handleSaveThresholds} className="btn-primary text-sm flex items-center gap-2">
              <Save className="w-4 h-4" /> Сохранить
            </button>
            {thrSaved && <span className="text-xs text-slate-400">{thrSaved}</span>}
          </div>
        )}
      </div>

      {/* How to setup */}
      <div className="card border-blue-500/20 bg-blue-500/5">
        <div className="text-sm font-semibold text-blue-300 mb-3">📋 Как настроить Telegram-бот</div>
        <div className="text-xs text-slate-400 space-y-2">
          <p>1. Откройте @BotFather в Telegram → /newbot → придумайте имя боту</p>
          <p>2. Скопируйте полученный Token и вставьте выше</p>
          <p>3. Создайте группу, добавьте бота, напишите любое сообщение</p>
          <p>4. Откройте <code className="text-blue-400">api.telegram.org/bot[TOKEN]/getUpdates</code></p>
          <p>5. Найдите chat.id (отрицательное число для группы) и вставьте выше</p>
          <p>6. Нажмите «Тест» для проверки</p>
        </div>
      </div>
    </div>
  )
}
