// Название заведения, юрлицо и логотип. До TASK-019 всё это было вписано
// в исходники — сайдбар, экран входа, копирайт, шапка PDF (ADR-0010).
import { useState } from 'react'
import { getBranding } from '@/lib/config'
import { saveBranding } from '@/lib/branding'
import { useAuthStore } from '@/lib/store'
import { Save, Building2 } from 'lucide-react'

const FIELDS = [
  { key: 'app_title', label: 'Название приложения', hint: 'Видно в сайдбаре, на экране входа и во вкладке браузера' },
  { key: 'restaurant_name', label: 'Название заведения', hint: 'Подставляется в отчёты, уведомления и копирайт' },
  { key: 'company', label: 'Юридическое лицо', hint: 'Показывается в копирайте на экране входа' },
  { key: 'logo_url', label: 'Ссылка на логотип', hint: 'Например /logo-192.png. Пусто — логотип не показывается' },
]

export default function BrandingSettings({ canEdit }) {
  const [form, setForm] = useState(() => getBranding())
  const [status, setStatus] = useState('')

  const save = async () => {
    setStatus('Сохранение...')
    const { error } = await saveBranding(form)
    if (error) { setStatus('❌ ' + error.message); return }
    // обновляем то, на что подписаны экран входа и заголовок вкладки
    useAuthStore.setState({ branding: getBranding() })
    setForm(getBranding())
    setStatus('✅ Сохранено')
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
          <Building2 className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <div className="text-sm font-semibold">Заведение</div>
          <div className="text-xs text-slate-500">Название и юрлицо подставляются везде: интерфейс, PDF, уведомления</div>
        </div>
      </div>

      <div className="space-y-3">
        {FIELDS.map(f => (
          <div key={f.key}>
            <label className="label">{f.label}</label>
            <input value={form[f.key] || ''} disabled={!canEdit} className="input w-full text-sm"
              onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
            <div className="text-xs text-slate-500 mt-1">{f.hint}</div>
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="flex items-center gap-3">
          <button onClick={save} className="btn-primary text-sm flex items-center gap-2">
            <Save className="w-4 h-4" /> Сохранить
          </button>
          {status && <span className="text-xs text-slate-400">{status}</span>}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Пустое название приложения — показывается нейтральное «Финансовый учёт».
        Изменения видны сразу, кроме уже выгруженных PDF.
      </p>
    </div>
  )
}
