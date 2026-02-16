import { useState } from 'react'
import { fmt, fmtPct, MONTHS_RU, cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'

const PNL_STRUCTURE = [
  { key: 'revenue', label: 'ДОХОДЫ', type: 'header', color: 'bg-green-600/20 text-green-400' },
  { key: 'rev_kitchen', label: 'Кухня', parent: 'revenue' },
  { key: 'rev_bar', label: 'Бар', parent: 'revenue' },
  { key: 'rev_hookah', label: 'Кальян', parent: 'revenue' },
  { key: 'rev_other', label: 'Прочее', parent: 'revenue' },
  { key: 'total_revenue', label: 'ИТОГО ДОХОДЫ', type: 'total', color: 'bg-green-700/30 text-green-300 font-bold' },

  { key: 'cogs', label: 'СЕБЕСТОИМОСТЬ (Food Cost)', type: 'header', color: 'bg-amber-600/20 text-amber-400' },
  { key: 'cogs_kitchen', label: 'Закуп кухня', parent: 'cogs' },
  { key: 'cogs_bar', label: 'Закуп бар', parent: 'cogs' },
  { key: 'cogs_hookah', label: 'Закуп кальян', parent: 'cogs' },
  { key: 'total_cogs', label: 'ИТОГО СЕБЕСТОИМОСТЬ', type: 'total', color: 'bg-amber-700/20 text-amber-300' },
  { key: 'gross_profit', label: 'ВАЛОВАЯ ПРИБЫЛЬ', type: 'total', color: 'bg-green-700/30 text-green-300 font-bold' },

  { key: 'payroll', label: 'ФОТ', type: 'header', color: 'bg-blue-600/20 text-blue-400' },
  { key: 'fot_mgmt', label: 'ФОТ Менеджмент', parent: 'payroll' },
  { key: 'fot_kitchen', label: 'ФОТ Кухня', parent: 'payroll' },
  { key: 'fot_bar', label: 'ФОТ Бар', parent: 'payroll' },
  { key: 'fot_hookah', label: 'ФОТ Дымный коктейль', parent: 'payroll' },
  { key: 'fot_hall', label: 'ФОТ Зал', parent: 'payroll' },
  { key: 'fot_transport', label: 'Развозка', parent: 'payroll' },
  { key: 'fot_other', label: 'ФОТ Прочее', parent: 'payroll' },
  { key: 'total_payroll', label: 'ИТОГО ФОТ', type: 'total', color: 'bg-blue-700/20 text-blue-300' },

  { key: 'marketing', label: 'МАРКЕТИНГ', type: 'header', color: 'bg-orange-600/20 text-orange-400' },
  { key: 'mkt_smm', label: 'СММ', parent: 'marketing' },
  { key: 'mkt_target', label: 'Таргет', parent: 'marketing' },
  { key: 'mkt_2gis', label: '2ГИС', parent: 'marketing' },
  { key: 'mkt_yandex', label: 'Яндекс', parent: 'marketing' },
  { key: 'mkt_google', label: 'Google', parent: 'marketing' },
  { key: 'mkt_other', label: 'Маркетинг прочее', parent: 'marketing' },
  { key: 'total_marketing', label: 'ИТОГО МАРКЕТИНГ', type: 'total', color: 'bg-orange-700/20 text-orange-300' },

  { key: 'rent', label: 'АРЕНДА', type: 'header', color: 'bg-stone-600/20 text-stone-400' },
  { key: 'rent_main', label: 'Аренда помещения', parent: 'rent' },
  { key: 'rent_storage', label: 'Аренда склада и кровли', parent: 'rent' },
  { key: 'rent_property_tax', label: 'Налог на недвижимость', parent: 'rent' },
  { key: 'total_rent', label: 'ИТОГО АРЕНДА', type: 'total', color: 'bg-stone-700/20 text-stone-300' },

  { key: 'utilities', label: 'КОММУНАЛЬНЫЕ', type: 'header', color: 'bg-teal-600/20 text-teal-400' },
  { key: 'util_electric', label: 'Электричество', parent: 'utilities' },
  { key: 'util_water', label: 'Водоснабжение', parent: 'utilities' },
  { key: 'util_heating', label: 'Отопление', parent: 'utilities' },
  { key: 'util_bi', label: 'BI Service', parent: 'utilities' },
  { key: 'util_internet', label: 'Интернет и связь', parent: 'utilities' },
  { key: 'util_trash', label: 'Вывоз мусора', parent: 'utilities' },
  { key: 'util_other', label: 'Ком.услуги прочее', parent: 'utilities' },
  { key: 'total_utilities', label: 'ИТОГО КОММУНАЛЬНЫЕ', type: 'total', color: 'bg-teal-700/20 text-teal-300' },

  { key: 'opex_other', label: 'ПРОЧИЕ ОПЕРАЦИОННЫЕ', type: 'header', color: 'bg-purple-600/20 text-purple-400' },
  { key: 'opx_supplies', label: 'Хозтовары', parent: 'opex_other' },
  { key: 'opx_bank', label: 'Комиссии банка/эквайринг', parent: 'opex_other' },
  { key: 'opx_security', label: 'Система безопасности', parent: 'opex_other' },
  { key: 'opx_software', label: 'Программное обеспечение', parent: 'opex_other' },
  { key: 'opx_menu', label: 'Меню', parent: 'opex_other' },
  { key: 'opx_pest', label: 'Дератизация/дезинсекция', parent: 'opex_other' },
  { key: 'opx_grease', label: 'Чистка жироуловителей', parent: 'opex_other' },
  { key: 'opx_repair', label: 'Мелкий ремонт', parent: 'opex_other' },
  { key: 'opx_uniform', label: 'Форма для персонала', parent: 'opex_other' },
  { key: 'opx_kao', label: 'Авторские права (КАО)', parent: 'opex_other' },
  { key: 'opx_royalty', label: 'Роялти', parent: 'opex_other' },
  { key: 'opx_other', label: 'Прочее', parent: 'opex_other' },
  { key: 'total_opex_other', label: 'ИТОГО ПРОЧИЕ ОПЕР.', type: 'total', color: 'bg-purple-700/20 text-purple-300' },

  { key: 'ebitda', label: 'EBITDA', type: 'total', color: 'bg-green-700/40 text-green-200 font-bold text-base' },

  { key: 'taxes', label: 'НАЛОГИ', type: 'header', color: 'bg-red-600/20 text-red-400' },
  { key: 'tax_retail', label: 'Розничный налог', parent: 'taxes' },
  { key: 'tax_payroll', label: 'Налоги по зарплате', parent: 'taxes' },
  { key: 'tax_insurance', label: 'Страхование сотрудников', parent: 'taxes' },
  { key: 'tax_alcohol', label: 'Лицензия на алкоголь', parent: 'taxes' },
  { key: 'tax_hookah', label: 'Лицензия на кальян', parent: 'taxes' },
  { key: 'tax_other', label: 'Налоги прочее', parent: 'taxes' },
  { key: 'total_taxes', label: 'ИТОГО НАЛОГИ', type: 'total', color: 'bg-red-700/20 text-red-300' },

  { key: 'op_profit', label: 'ОПЕРАЦИОННАЯ ПРИБЫЛЬ', type: 'total', color: 'bg-emerald-700/40 text-emerald-200 font-bold text-base' },
  { key: 'op_margin', label: 'Маржа опер. прибыли', type: 'pct' },

  { key: 'capex', label: 'CapEx', type: 'header', color: 'bg-slate-600/20 text-slate-400' },
  { key: 'capex_repair', label: 'Ремонт', parent: 'capex' },
  { key: 'capex_equipment', label: 'Мебель и техника', parent: 'capex' },
  { key: 'capex_other', label: 'CapEx прочее', parent: 'capex' },
  { key: 'total_capex', label: 'ИТОГО CapEx', type: 'total', color: 'bg-slate-700/30 text-slate-300' },

  { key: 'net_profit', label: 'ЧИСТАЯ ПРИБЫЛЬ', type: 'total', color: 'bg-brand-700/40 text-white font-bold text-lg' },
]

// Demo data generator
const demoVal = (base, variance = 0.3) => base + base * (Math.random() - 0.5) * variance

export default function PnLPage() {
  const [year, setYear] = useState('2025')
  const [collapsed, setCollapsed] = useState({})

  const toggleSection = (key) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const headers = SECTIONS_LIST()
  const visibleMonths = MONTHS_RU.slice(0, 10) // Jan-Oct filled

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">P&L</h1>
          <p className="text-sm text-slate-500 mt-0.5">Отчёт о прибылях и убытках</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={year} onChange={e => setYear(e.target.value)} className="input text-sm">
            <option>2025</option><option>2024</option><option>2023</option>
          </select>
          <button className="btn-secondary text-sm flex items-center gap-2">
            <Download className="w-4 h-4" /> Excel
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr>
              <th className="table-header text-left w-64 sticky left-0 bg-slate-900 z-10">Статья</th>
              {visibleMonths.map(m => (
                <th key={m} className="table-header text-right">{m.slice(0, 3)}</th>
              ))}
              <th className="table-header text-right font-bold">Итого</th>
              <th className="table-header text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {PNL_STRUCTURE.map(row => {
              // Check if this row should be hidden (collapsed parent)
              if (row.parent && collapsed[row.parent]) return null

              const isHeader = row.type === 'header'
              const isTotal = row.type === 'total'
              const isPct = row.type === 'pct'
              const isSub = !!row.parent
              const isCollapsed = collapsed[row.key]

              return (
                <tr
                  key={row.key}
                  className={cn(
                    'transition-colors',
                    isHeader && 'cursor-pointer hover:bg-slate-800/50',
                    isTotal && (row.color || ''),
                    !isHeader && !isTotal && 'hover:bg-slate-800/30'
                  )}
                  onClick={isHeader ? () => toggleSection(row.key) : undefined}
                >
                  <td className={cn(
                    'px-4 py-2 border-t border-slate-800/50 sticky left-0 z-10',
                    isHeader ? 'bg-slate-900' : isTotal ? '' : 'bg-slate-850',
                    isSub && 'pl-8'
                  )}>
                    <div className="flex items-center gap-2">
                      {isHeader && (
                        isCollapsed
                          ? <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                          : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      )}
                      <span className={cn(
                        isTotal && 'font-bold',
                        isHeader && 'font-semibold text-xs uppercase tracking-wider',
                        isSub && 'text-slate-400',
                        isPct && 'text-slate-500 text-xs italic'
                      )}>
                        {row.label}
                      </span>
                    </div>
                  </td>
                  {visibleMonths.map((_, mi) => (
                    <td key={mi} className={cn('px-3 py-2 text-right font-mono text-xs border-t border-slate-800/50 tabular-nums', isPct && 'text-slate-500')}>
                      {isPct ? '—' : '—'}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono text-xs font-bold border-t border-slate-800/50">—</td>
                  <td className="px-3 py-2 text-right font-mono text-xs border-t border-slate-800/50 text-slate-500">—</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-600 text-center">Данные заполняются из ежедневных отчётов и импорта банковской выписки</div>
    </div>
  )
}

function SECTIONS_LIST() {
  return PNL_STRUCTURE.filter(r => r.type === 'header').map(r => r.key)
}
