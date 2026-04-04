import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/store'
import { cn, fmt, MONTHS_RU } from '@/lib/utils'
import { Plus, HandCoins, Users, List, BarChart3, Trash2, Pencil } from 'lucide-react'
import TransactionModal from '@/components/investments/TransactionModal'
import BulkOperationModal from '@/components/investments/BulkOperationModal'
import ShareTransferModal from '@/components/investments/ShareTransferModal'
import InvestorCard from '@/components/investments/InvestorCard'
import YearlyBreakdownTable from '@/components/investments/YearlyBreakdownTable'

const TABS = [
  { key: 'dashboard', label: 'Дашборд', icon: BarChart3 },
  { key: 'journal', label: 'Журнал операций', icon: List },
  { key: 'investors', label: 'Учредители', icon: Users },
]

const TX_TYPE_LABELS = {
  investment: 'Внесение',
  dividend: 'Дивиденды',
  share_purchase: 'Покупка доли',
  share_sale: 'Продажа доли',
}

const TX_TYPE_BADGES = {
  investment: 'badge-green',
  dividend: 'badge-blue',
  share_purchase: 'badge-yellow',
  share_sale: 'badge-yellow',
}

const MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

const DIVIDEND_YEARS = [2022, 2023, 2024, 2025, 2026]

function AvgMonthlyDividends({ investors, transactions }) {
  const data = useMemo(() => {
    const divTx = transactions.filter(t => t.type === 'dividend')
    if (!divTx.length) return null

    // Per investor per year: sum / distinct months
    const rows = investors.map(inv => {
      const invDivs = divTx.filter(t => t.investor_id === inv.id)
      const yearData = {}
      DIVIDEND_YEARS.forEach(y => {
        const yearDivs = invDivs.filter(t => new Date(t.transaction_date).getFullYear() === y)
        if (!yearDivs.length) { yearData[y] = null; return }
        const sum = yearDivs.reduce((s, t) => s + (Number(t.amount) || 0), 0)
        const months = new Set(yearDivs.map(t => new Date(t.transaction_date).getMonth()))
        yearData[y] = Math.round(sum / months.size)
      })
      return { ...inv, yearData }
    })

    // Totals row
    const totals = {}
    DIVIDEND_YEARS.forEach(y => {
      const yearDivs = divTx.filter(t => new Date(t.transaction_date).getFullYear() === y)
      if (!yearDivs.length) { totals[y] = null; return }
      const sum = yearDivs.reduce((s, t) => s + (Number(t.amount) || 0), 0)
      const months = new Set(yearDivs.map(t => new Date(t.transaction_date).getMonth()))
      totals[y] = Math.round(sum / months.size)
    })

    // Max per column for color scale
    const maxPerYear = {}
    DIVIDEND_YEARS.forEach(y => {
      const vals = rows.map(r => r.yearData[y]).filter(Boolean)
      maxPerYear[y] = vals.length ? Math.max(...vals) : 1
    })

    return { rows, totals, maxPerYear }
  }, [investors, transactions])

  if (!data) return null

  const getColor = (val, max) => {
    if (!val) return {}
    const ratio = max > 0 ? val / max : 0
    const g = Math.round(80 + ratio * 175)
    return { color: `rgb(${Math.round(255 - ratio * 200)}, ${g}, ${Math.round(100 - ratio * 60)})` }
  }

  return (
    <div className="card overflow-hidden">
      <h2 className="text-lg font-display font-semibold text-white mb-4">Средние дивиденды в месяц по годам</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="table-header">Инвестор</th>
              {DIVIDEND_YEARS.map(y => <th key={y} className="table-header text-right">{y}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.rows.map(r => (
              <tr key={r.id} className={cn('hover:bg-slate-800/50', r.status === 'exited' && 'opacity-50')}>
                <td className="table-cell font-medium text-white">{r.full_name}</td>
                {DIVIDEND_YEARS.map(y => (
                  <td key={y} className="table-cell text-right font-mono text-sm" style={getColor(r.yearData[y], data.maxPerYear[y])}>
                    {r.yearData[y] ? `${fmt(r.yearData[y])} ₸/мес` : '—'}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t-2 border-slate-700">
              <td className="table-cell font-bold text-white">ИТОГО</td>
              {DIVIDEND_YEARS.map(y => (
                <td key={y} className="table-cell text-right font-mono text-sm font-bold text-slate-200">
                  {data.totals[y] ? `${fmt(data.totals[y])} ₸/мес` : '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

const PAGE_SIZE = 20

export default function InvestmentsPage() {
  const { hasPermission, profile } = useAuthStore()
  const canEdit = hasPermission('investments.edit')
  const canManage = hasPermission('investments.manage')

  const [investors, setInvestors] = useState([])
  const [transactions, setTransactions] = useState([])
  const [tab, setTab] = useState('dashboard')
  const [loading, setLoading] = useState(true)

  const [showTxModal, setShowTxModal] = useState(false)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [bulkMode, setBulkMode] = useState('dividend')
  const [editTx, setEditTx] = useState(null)

  const [filterInvestor, setFilterInvestor] = useState(null)
  const [filterType, setFilterType] = useState(null)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const [page, setPage] = useState(0)

  // Add investor form
  const [showAddInvestor, setShowAddInvestor] = useState(false)
  const [investorForm, setInvestorForm] = useState({ full_name: '', share_pct: '', entry_date: '' })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [invRes, txRes] = await Promise.all([
      supabase.from('investors').select('*').order('id'),
      supabase.from('investor_transactions').select('*, investors(full_name)').order('transaction_date', { ascending: false }),
    ])
    setInvestors(invRes.data || [])
    setTransactions(txRes.data || [])
    setLoading(false)
  }

  // Computed per-investor metrics
  const investorMetrics = useMemo(() => {
    return investors.map(inv => {
      const txs = transactions.filter(t => t.investor_id === inv.id)
      const invested = txs
        .filter(t => t.type === 'investment' || t.type === 'share_purchase')
        .reduce((s, t) => s + Number(t.amount || 0), 0)
      const withdrawn = txs
        .filter(t => t.type === 'dividend' || t.type === 'share_sale')
        .reduce((s, t) => s + Number(t.amount || 0), 0)
      const profit = withdrawn - invested
      const roi = invested > 0 ? withdrawn / invested : 0

      // Payback calculation
      let paybackMonth = null
      const sorted = [...txs].sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date))
      let running = 0
      for (const t of sorted) {
        if (t.type === 'investment' || t.type === 'share_purchase') {
          running += Number(t.amount || 0)
        } else {
          running -= Number(t.amount || 0)
        }
        if (running <= 0 && invested > 0) {
          const d = new Date(t.transaction_date)
          paybackMonth = `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
          break
        }
      }

      return { ...inv, invested, withdrawn, profit, roi, paybackMonth }
    })
  }, [investors, transactions])

  const totalInvested = useMemo(() => investorMetrics.reduce((s, m) => s + m.invested, 0), [investorMetrics])
  const totalWithdrawn = useMemo(() => investorMetrics.reduce((s, m) => s + m.withdrawn, 0), [investorMetrics])
  const totalProfit = totalWithdrawn - totalInvested
  const totalRoi = totalInvested > 0 ? totalWithdrawn / totalInvested : 0

  // Filtered transactions for journal
  const filteredTx = useMemo(() => {
    let list = [...transactions]
    if (filterInvestor) list = list.filter(t => t.investor_id === Number(filterInvestor))
    if (filterType) list = list.filter(t => t.type === filterType)
    if (filterFrom) list = list.filter(t => t.transaction_date >= filterFrom)
    if (filterTo) list = list.filter(t => t.transaction_date <= filterTo)
    return list
  }, [transactions, filterInvestor, filterType, filterFrom, filterTo])

  const totalPages = Math.ceil(filteredTx.length / PAGE_SIZE)
  const pagedTx = filteredTx.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Reset page when filters change
  useEffect(() => { setPage(0) }, [filterInvestor, filterType, filterFrom, filterTo])

  // CRUD
  const saveTx = async (data) => {
    if (data.id) {
      await supabase.from('investor_transactions').update(data).eq('id', data.id)
    } else {
      await supabase.from('investor_transactions').insert({ ...data, created_by: profile?.id })
    }
    setShowTxModal(false)
    setEditTx(null)
    await load()
  }

  const deleteTx = async (id) => {
    if (!confirm('Удалить эту операцию?')) return
    await supabase.from('investor_transactions').delete().eq('id', id)
    await load()
  }

  const saveBulk = async (items) => {
    const rows = items.map(item => ({ ...item, created_by: profile?.id }))
    await supabase.from('investor_transactions').insert(rows)
    setShowBulkModal(false)
    await load()
  }

  const saveTransfer = async ({ oldInvestor, newInvestor, saleTx, purchaseTx }) => {
    // Update old investor
    await supabase.from('investors').update({
      status: 'exited',
      exit_date: oldInvestor.exit_date,
      exit_type: oldInvestor.exit_type,
      successor_id: oldInvestor.successor_id,
    }).eq('id', oldInvestor.id)

    // Create or update new investor
    if (newInvestor.id) {
      await supabase.from('investors').update(newInvestor).eq('id', newInvestor.id)
    } else {
      const { data } = await supabase.from('investors').insert(newInvestor).select().single()
      if (data) purchaseTx.investor_id = data.id
    }

    // Insert transactions
    await supabase.from('investor_transactions').insert([
      { ...saleTx, created_by: profile?.id },
      { ...purchaseTx, created_by: profile?.id },
    ])

    setShowTransferModal(false)
    await load()
  }

  const addInvestor = async () => {
    if (!investorForm.full_name.trim()) return
    await supabase.from('investors').insert({
      full_name: investorForm.full_name.trim(),
      share_pct: Number(String(investorForm.share_pct).replace(',', '.')) || 0,
      entry_date: investorForm.entry_date || null,
    })
    setInvestorForm({ full_name: '', share_pct: '', entry_date: '' })
    setShowAddInvestor(false)
    await load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Инвестиции</h1>
          <p className="text-sm text-slate-500 mt-1">Учёт вложений и дивидендов учредителей</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
              tab === t.key ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-300'
            )}>
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {tab === 'dashboard' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card">
              <p className="stat-label">Всего вложено</p>
              <p className="stat-value text-green-400">{(totalInvested / 1e6).toFixed(1)}М ₸</p>
            </div>
            <div className="card">
              <p className="stat-label">Всего выведено</p>
              <p className="stat-value text-blue-400">{(totalWithdrawn / 1e6).toFixed(1)}М ₸</p>
            </div>
            <div className="card">
              <p className="stat-label">Прибыль</p>
              <p className={cn('stat-value', totalProfit >= 0 ? 'text-green-400' : 'text-red-400')}>
                {(totalProfit / 1e6).toFixed(1)}М ₸
              </p>
            </div>
            <div className="card">
              <p className="stat-label">ROI</p>
              <p className="stat-value text-brand-400">{totalRoi.toFixed(2)}x</p>
            </div>
          </div>

          {/* Investor breakdown table */}
          <div className="card overflow-hidden">
            <h2 className="text-lg font-display font-semibold text-white mb-4">Показатели по учредителям</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="table-header">Учредитель</th>
                    <th className="table-header text-right">Доля</th>
                    <th className="table-header text-right">Вложено</th>
                    <th className="table-header text-right">Выведено</th>
                    <th className="table-header text-right">Прибыль</th>
                    <th className="table-header text-right">ROI</th>
                    <th className="table-header">Окупаемость</th>
                    <th className="table-header">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {investorMetrics.map(m => (
                    <tr key={m.id} className="hover:bg-slate-800/50">
                      <td className="table-cell font-medium text-white">{m.full_name}</td>
                      <td className="table-cell text-right font-mono text-slate-300">{m.share_pct != null ? `${m.share_pct}%` : '—'}</td>
                      <td className="table-cell text-right font-mono text-green-400">{fmt(m.invested)}</td>
                      <td className="table-cell text-right font-mono text-blue-400">{fmt(m.withdrawn)}</td>
                      <td className={cn('table-cell text-right font-mono', m.profit >= 0 ? 'text-green-400' : 'text-red-400')}>
                        {fmt(m.profit)}
                      </td>
                      <td className="table-cell text-right font-mono text-slate-300">{m.roi.toFixed(2)}x</td>
                      <td className="table-cell text-slate-400">{m.paybackMonth || '—'}</td>
                      <td className="table-cell">
                        {m.status === 'exited'
                          ? <span className="badge badge-red">Вышел</span>
                          : <span className="badge badge-green">Активный</span>
                        }
                      </td>
                    </tr>
                  ))}
                  {investorMetrics.length === 0 && (
                    <tr>
                      <td colSpan={8} className="table-cell text-center text-slate-500">Нет данных</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Yearly Breakdown */}
          <YearlyBreakdownTable investors={investors} transactions={transactions} />

          {/* Average Monthly Dividends by Year */}
          <AvgMonthlyDividends investors={investors} transactions={transactions} />
        </div>
      )}

      {/* Journal Tab */}
      {tab === 'journal' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="card">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label">С даты</label>
                <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                  className="input text-sm" />
              </div>
              <div>
                <label className="label">По дату</label>
                <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                  className="input text-sm" />
              </div>
              <div>
                <label className="label">Учредитель</label>
                <select value={filterInvestor || ''} onChange={e => setFilterInvestor(e.target.value || null)}
                  className="input text-sm">
                  <option value="">Все</option>
                  {investors.map(inv => (
                    <option key={inv.id} value={inv.id}>{inv.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Тип</label>
                <select value={filterType || ''} onChange={e => setFilterType(e.target.value || null)}
                  className="input text-sm">
                  <option value="">Все</option>
                  <option value="investment">Внесение</option>
                  <option value="dividend">Дивиденды</option>
                  <option value="share_purchase">Покупка доли</option>
                  <option value="share_sale">Продажа доли</option>
                </select>
              </div>
              <div className="flex gap-2 ml-auto">
                {canEdit && (
                  <button onClick={() => { setEditTx(null); setShowTxModal(true) }} className="btn-primary flex items-center gap-2 text-sm">
                    <Plus size={16} /> Новая операция
                  </button>
                )}
                {canManage && (
                  <>
                    <button onClick={() => { setBulkMode('dividend'); setShowBulkModal(true) }}
                      className="btn-primary flex items-center gap-2 text-sm">
                      <HandCoins size={16} /> Выплатить дивиденды
                    </button>
                    <button onClick={() => { setBulkMode('investment'); setShowBulkModal(true) }}
                      className="btn-secondary flex items-center gap-2 text-sm">
                      <Plus size={16} /> Внести от всех
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Transactions table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="table-header">Дата</th>
                    <th className="table-header">Учредитель</th>
                    <th className="table-header">Тип</th>
                    <th className="table-header text-right">Сумма</th>
                    <th className="table-header">Примечание</th>
                    {canManage && <th className="table-header text-center">Действия</th>}
                  </tr>
                </thead>
                <tbody>
                  {pagedTx.map(tx => (
                    <tr key={tx.id} className="hover:bg-slate-800/50">
                      <td className="table-cell text-slate-300 font-mono text-xs">
                        {tx.transaction_date ? new Date(tx.transaction_date).toLocaleDateString('ru-RU') : '—'}
                      </td>
                      <td className="table-cell text-white">{tx.investors?.full_name || '—'}</td>
                      <td className="table-cell">
                        <span className={cn('badge', TX_TYPE_BADGES[tx.type])}>
                          {TX_TYPE_LABELS[tx.type] || tx.type}
                        </span>
                      </td>
                      <td className="table-cell text-right font-mono text-slate-200">{fmt(tx.amount)} ₸</td>
                      <td className="table-cell text-slate-400 text-sm max-w-xs truncate">{tx.note || '—'}</td>
                      {canManage && (
                        <td className="table-cell text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => { setEditTx(tx); setShowTxModal(true) }}
                              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => deleteTx(tx.id)}
                              className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {pagedTx.length === 0 && (
                    <tr>
                      <td colSpan={canManage ? 6 : 5} className="table-cell text-center text-slate-500 py-8">
                        Нет операций
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 py-3 border-t border-slate-800">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="btn-secondary text-xs px-2.5 py-1.5 disabled:opacity-30 disabled:pointer-events-none">
                  ← Назад
                </button>
                {Array.from({ length: totalPages }, (_, i) => i).map(i => {
                  if (i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1) {
                    return (
                      <button key={i} onClick={() => setPage(i)}
                        className={cn(
                          'text-xs px-2.5 py-1.5 rounded-lg transition-colors',
                          i === page ? 'bg-brand-500/20 text-brand-400 font-bold' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                        )}>
                        {i + 1}
                      </button>
                    )
                  }
                  if (i === 1 || i === totalPages - 2) {
                    return <span key={`dots-${i}`} className="text-slate-600 px-1">...</span>
                  }
                  return null
                })}
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  className="btn-secondary text-xs px-2.5 py-1.5 disabled:opacity-30 disabled:pointer-events-none">
                  Вперёд →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Investors Tab */}
      {tab === 'investors' && (
        <div className="space-y-4">
          {canManage && (
            <div className="flex justify-end">
              <button onClick={() => setShowAddInvestor(!showAddInvestor)}
                className="btn-primary flex items-center gap-2 text-sm">
                <Plus size={16} /> Добавить учредителя
              </button>
            </div>
          )}

          {showAddInvestor && (
            <div className="card">
              <h3 className="text-sm font-semibold text-white mb-3">Новый учредитель</h3>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="label">ФИО</label>
                  <input value={investorForm.full_name}
                    onChange={e => setInvestorForm({ ...investorForm, full_name: e.target.value })}
                    className="input text-sm" placeholder="Иванов Иван" />
                </div>
                <div>
                  <label className="label">Доля (%)</label>
                  <input value={investorForm.share_pct} inputMode="decimal"
                    onChange={e => setInvestorForm({ ...investorForm, share_pct: e.target.value.replace(/[^0-9.,]/g, '').replace('.', ',') })}
                    className="input text-sm w-24" placeholder="25" />
                </div>
                <div>
                  <label className="label">Дата входа</label>
                  <input type="date" value={investorForm.entry_date}
                    onChange={e => setInvestorForm({ ...investorForm, entry_date: e.target.value })}
                    className="input text-sm" />
                </div>
                <button onClick={addInvestor} className="btn-primary text-sm">Сохранить</button>
                <button onClick={() => { setShowAddInvestor(false); setInvestorForm({ full_name: '', share_pct: '', entry_date: '' }) }}
                  className="btn-secondary text-sm">Отмена</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {investors.map(inv => (
              <InvestorCard key={inv.id} investor={inv}
                metrics={investorMetrics.find(m => m.id === inv.id)}
                transactions={transactions.filter(t => t.investor_id === inv.id)}
                onTransfer={canManage ? () => setShowTransferModal(true) : undefined}
              />
            ))}
            {investors.length === 0 && (
              <div className="col-span-full text-center text-slate-500 py-12">
                Учредители не добавлены
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showTxModal && (
        <TransactionModal
          open={showTxModal}
          editTx={editTx}
          investors={investors}
          onSave={saveTx}
          onClose={() => { setShowTxModal(false); setEditTx(null) }}
        />
      )}

      {showBulkModal && (
        <BulkOperationModal
          open={showBulkModal}
          mode={bulkMode}
          investors={investors.filter(inv => inv.status !== 'exited')}
          onSave={saveBulk}
          onClose={() => setShowBulkModal(false)}
        />
      )}

      {showTransferModal && (
        <ShareTransferModal
          open={showTransferModal}
          investors={investors}
          onSave={saveTransfer}
          onClose={() => setShowTransferModal(false)}
        />
      )}
    </div>
  )
}
