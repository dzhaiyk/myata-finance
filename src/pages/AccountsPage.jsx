import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/store'
import { cn, fmt } from '@/lib/utils'
import { Plus, Edit3, Trash2, ArrowRightLeft, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight, ChevronUp, Save, RefreshCw, Eye, Power } from 'lucide-react'

const TYPES = { cash: 'Касса', bank: 'Банк. счёт', deposit: 'Депозит', terminal: 'Терминал' }
const TYPE_OPTIONS = Object.entries(TYPES).map(([k, v]) => ({ value: k, label: v }))

const today = () => new Date().toISOString().split('T')[0]

export default function AccountsPage() {
  const { hasPermission, profile } = useAuthStore()
  const canManage = hasPermission('settings.edit')
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [balances, setBalances] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview') // overview | transactions | reconcile | settings
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [showManualTx, setShowManualTx] = useState(false)
  const [acctForm, setAcctForm] = useState({ name: '', type: 'bank', bank_name: '', icon: '🏦', color: '#3b82f6', initial_balance: 0, sort_order: 0 })
  const [editAcctId, setEditAcctId] = useState(null)
  const [transferForm, setTransferForm] = useState({ from_id: '', to_id: '', amount: '', date: today(), description: '' })
  const [manualTxForm, setManualTxForm] = useState({ account_id: '', type: 'income', amount: '', date: today(), counterparty: '', description: '' })
  const [reconcileDate, setReconcileDate] = useState(today())
  const [reconcileInputs, setReconcileInputs] = useState({})

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [accRes, txRes, balRes] = await Promise.all([
      supabase.from('accounts').select('*').order('sort_order, id'),
      supabase.from('account_transactions').select('*').order('transaction_date', { ascending: false }).limit(100),
      supabase.from('account_balances').select('*').order('balance_date', { ascending: false }).limit(50),
    ])
    setAccounts(accRes.data || [])
    setTransactions(txRes.data || [])
    setBalances(balRes.data || [])
    setLoading(false)
  }

  // Calculate current balance from initial + all transactions
  const calcBalance = (accountId) => {
    const acct = accounts.find(a => a.id === accountId)
    if (!acct) return 0
    const initial = Number(acct.initial_balance) || 0
    const txTotal = transactions
      .filter(t => t.account_id === accountId)
      .reduce((sum, t) => {
        if (t.type === 'income' || t.type === 'transfer_in') return sum + Number(t.amount)
        if (t.type === 'expense' || t.type === 'transfer_out') return sum - Number(t.amount)
        return sum
      }, 0)
    return initial + txTotal
  }

  // Save account
  const saveAccount = async () => {
    if (!acctForm.name.trim()) return alert('Введите название')
    const payload = { ...acctForm }
    if (editAcctId) {
      await supabase.from('accounts').update(payload).eq('id', editAcctId)
    } else {
      await supabase.from('accounts').insert(payload)
    }
    setShowAddAccount(false); setEditAcctId(null)
    setAcctForm({ name: '', type: 'bank', bank_name: '', icon: '🏦', color: '#3b82f6', initial_balance: 0, sort_order: 0 })
    load()
  }

  // Transfer between accounts
  const executeTransfer = async () => {
    const { from_id, to_id, amount, date, description } = transferForm
    if (!from_id || !to_id || !amount) return alert('Заполните все поля')
    if (from_id === to_id) return alert('Счета должны быть разными')
    const amt = Number(amount)
    if (amt <= 0) return alert('Сумма должна быть > 0')

    // Create paired transactions
    const { data: txOut } = await supabase.from('account_transactions').insert({
      account_id: Number(from_id), transaction_date: date, type: 'transfer_out',
      amount: amt, description: description || 'Перевод', reference_type: 'manual',
      counterparty: accounts.find(a => a.id === Number(to_id))?.name,
    }).select().single()

    await supabase.from('account_transactions').insert({
      account_id: Number(to_id), transaction_date: date, type: 'transfer_in',
      amount: amt, description: description || 'Перевод', reference_type: 'manual',
      counterparty: accounts.find(a => a.id === Number(from_id))?.name,
      linked_transaction_id: txOut?.id,
    })

    // Update linked_transaction_id on first tx
    if (txOut) {
      const { data: txIn } = await supabase.from('account_transactions')
        .select('id').eq('linked_transaction_id', txOut.id).single()
      if (txIn) await supabase.from('account_transactions').update({ linked_transaction_id: txIn.id }).eq('id', txOut.id)
    }

    setShowTransfer(false)
    setTransferForm({ from_id: '', to_id: '', amount: '', date: today(), description: '' })
    load()
  }

  // Manual transaction
  const executeManualTx = async () => {
    const { account_id, type, amount, date, counterparty, description } = manualTxForm
    if (!account_id || !amount) return alert('Заполните счёт и сумму')
    await supabase.from('account_transactions').insert({
      account_id: Number(account_id), transaction_date: date, type,
      amount: Number(amount), counterparty, description, reference_type: 'manual',
    })
    setShowManualTx(false)
    setManualTxForm({ account_id: '', type: 'income', amount: '', date: today(), counterparty: '', description: '' })
    load()
  }

  // Reconcile
  const saveReconciliation = async () => {
    const entries = Object.entries(reconcileInputs).filter(([_, v]) => v !== '' && v !== undefined)
    if (entries.length === 0) return alert('Введите хотя бы один фактический остаток')
    for (const [accountId, actual] of entries) {
      const expected = calcBalance(Number(accountId))
      await supabase.from('account_balances').upsert({
        account_id: Number(accountId), balance_date: reconcileDate,
        expected_balance: expected, actual_balance: Number(actual),
        verified_by: profile?.id,
      }, { onConflict: 'account_id,balance_date' })
    }
    // Update current_balance on accounts
    for (const [accountId, actual] of entries) {
      await supabase.from('accounts').update({ current_balance: Number(actual) }).eq('id', Number(accountId))
    }
    alert('✅ Сверка сохранена')
    setReconcileInputs({})
    load()
  }

  const deleteTransaction = async (id) => {
    if (!confirm('Удалить операцию?')) return
    await supabase.from('account_transactions').delete().eq('id', id)
    load()
  }

  // Move account up/down in sort order
  const moveAccount = async (accountId, direction) => {
    const sorted = [...accounts].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    const idx = sorted.findIndex(a => a.id === accountId)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const current = sorted[idx]
    const swap = sorted[swapIdx]
    await Promise.all([
      supabase.from('accounts').update({ sort_order: swap.sort_order ?? swapIdx }).eq('id', current.id),
      supabase.from('accounts').update({ sort_order: current.sort_order ?? idx }).eq('id', swap.id),
    ])
    load()
  }

  // Toggle account active/inactive
  const toggleActive = async (accountId, currentlyActive) => {
    const action = currentlyActive ? 'деактивировать' : 'активировать'
    if (!confirm(`${currentlyActive ? 'Деактивировать' : 'Активировать'} этот счёт?`)) return
    await supabase.from('accounts').update({ is_active: !currentlyActive }).eq('id', accountId)
    load()
  }

  const totalBalance = accounts.filter(a => a.is_active).reduce((s, a) => s + calcBalance(a.id), 0)
  const activeAccounts = accounts.filter(a => a.is_active)

  if (loading) return <div className="text-center text-slate-500 py-20">Загрузка...</div>

  const tabs = [
    { key: 'overview', label: 'Обзор' },
    { key: 'reconcile', label: 'Сверка' },
    { key: 'transactions', label: 'Операции' },
    { key: 'settings', label: 'Счета' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Счета и остатки</h1>
          <p className="text-sm text-slate-500 mt-0.5">Контроль денежных потоков</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTransfer(true)} className="btn-secondary text-sm flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4" /> Перевод
          </button>
          <button onClick={() => setShowManualTx(true)} className="btn-primary text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Операция
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('px-4 py-2 rounded-lg text-sm font-medium flex-1 text-center transition-all',
              tab === t.key ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Transfer Modal */}
      {showTransfer && (
        <div className="card border-blue-500/30 space-y-4">
          <div className="text-sm font-semibold text-blue-400">Перевод между счетами</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div><label className="label">Откуда</label>
              <select value={transferForm.from_id} onChange={e => setTransferForm(f => ({...f, from_id: e.target.value}))} className="input text-sm w-full">
                <option value="">Выберите</option>
                {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
              </select></div>
            <div><label className="label">Куда</label>
              <select value={transferForm.to_id} onChange={e => setTransferForm(f => ({...f, to_id: e.target.value}))} className="input text-sm w-full">
                <option value="">Выберите</option>
                {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
              </select></div>
            <div><label className="label">Сумма</label>
              <input type="text" inputMode="numeric" value={transferForm.amount} onChange={e => setTransferForm(f => ({...f, amount: e.target.value.replace(/[^0-9]/g, '')}))} className="input text-sm w-full font-mono" placeholder="0" /></div>
            <div><label className="label">Дата</label>
              <input type="date" value={transferForm.date} onChange={e => setTransferForm(f => ({...f, date: e.target.value}))} className="input text-sm w-full" /></div>
            <div><label className="label">Описание</label>
              <input value={transferForm.description} onChange={e => setTransferForm(f => ({...f, description: e.target.value}))} className="input text-sm w-full" placeholder="Инкассация" /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={executeTransfer} className="btn-primary text-sm">Выполнить перевод</button>
            <button onClick={() => setShowTransfer(false)} className="btn-secondary text-sm">Отмена</button>
          </div>
        </div>
      )}

      {/* Manual Transaction */}
      {showManualTx && (
        <div className="card border-brand-500/30 space-y-4">
          <div className="text-sm font-semibold text-brand-400">Ручная операция</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div><label className="label">Счёт</label>
              <select value={manualTxForm.account_id} onChange={e => setManualTxForm(f => ({...f, account_id: e.target.value}))} className="input text-sm w-full">
                <option value="">Выберите</option>
                {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
              </select></div>
            <div><label className="label">Тип</label>
              <select value={manualTxForm.type} onChange={e => setManualTxForm(f => ({...f, type: e.target.value}))} className="input text-sm w-full">
                <option value="income">Приход</option>
                <option value="expense">Расход</option>
              </select></div>
            <div><label className="label">Сумма</label>
              <input type="text" inputMode="numeric" value={manualTxForm.amount} onChange={e => setManualTxForm(f => ({...f, amount: e.target.value.replace(/[^0-9]/g, '')}))} className="input text-sm w-full font-mono" placeholder="0" /></div>
            <div><label className="label">Дата</label>
              <input type="date" value={manualTxForm.date} onChange={e => setManualTxForm(f => ({...f, date: e.target.value}))} className="input text-sm w-full" /></div>
            <div><label className="label">Контрагент</label>
              <input value={manualTxForm.counterparty} onChange={e => setManualTxForm(f => ({...f, counterparty: e.target.value}))} className="input text-sm w-full" placeholder="Kaspi Pay / ТОО..." /></div>
            <div><label className="label">Описание</label>
              <input value={manualTxForm.description} onChange={e => setManualTxForm(f => ({...f, description: e.target.value}))} className="input text-sm w-full" placeholder="Зачисление с терминала" /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={executeManualTx} className="btn-primary text-sm">Сохранить</button>
            <button onClick={() => setShowManualTx(false)} className="btn-secondary text-sm">Отмена</button>
          </div>
        </div>
      )}

      {/* ====== OVERVIEW TAB ====== */}
      {tab === 'overview' && (
        <>
          {/* Total */}
          <div className="card bg-gradient-to-br from-brand-600/10 to-mint-600/5 border-brand-500/20">
            <div className="stat-label">ОБЩИЙ БАЛАНС</div>
            <div className="stat-value text-3xl text-brand-400">{fmt(totalBalance)} ₸</div>
            <div className="text-xs text-slate-500 mt-1">{activeAccounts.length} активных счетов</div>
          </div>

          {/* Account cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeAccounts.map(acct => {
              const bal = calcBalance(acct.id)
              const lastBalance = balances.find(b => b.account_id === acct.id)
              const hasDisc = lastBalance && lastBalance.discrepancy && Math.abs(lastBalance.discrepancy) > 100
              return (
                <div key={acct.id} className={cn('card-hover', hasDisc && 'border-red-500/30')}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{acct.icon}</span>
                      <div>
                        <div className="text-sm font-semibold">{acct.name}</div>
                        <div className="text-[10px] text-slate-500 uppercase">{TYPES[acct.type]}{acct.bank_name ? ` · ${acct.bank_name}` : ''}</div>
                      </div>
                    </div>
                  </div>
                  <div className="text-xl font-mono font-bold" style={{ color: acct.color }}>{fmt(bal)} ₸</div>
                  {lastBalance && (
                    <div className="mt-2 text-[10px] text-slate-500">
                      Сверка {lastBalance.balance_date}: {lastBalance.actual_balance != null ? (
                        hasDisc ? <span className="text-red-400">расхождение {fmt(lastBalance.discrepancy)} ₸</span>
                          : <span className="text-green-400">✓ сходится</span>
                      ) : 'не проведена'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Recent transactions */}
          <div className="card p-0">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-semibold">Последние операции</span>
            </div>
            <div className="divide-y divide-slate-800/50">
              {transactions.slice(0, 10).map(tx => {
                const acct = accounts.find(a => a.id === tx.account_id)
                const isIn = tx.type === 'income' || tx.type === 'transfer_in'
                return (
                  <div key={tx.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-800/20">
                    <div className="flex items-center gap-3">
                      <span className="text-sm">{acct?.icon || '?'}</span>
                      <div>
                        <div className="text-sm">{tx.counterparty || tx.description || TYPES[tx.type] || tx.type}</div>
                        <div className="text-[10px] text-slate-500">{tx.transaction_date} · {acct?.name}</div>
                      </div>
                    </div>
                    <span className={cn('font-mono text-sm font-semibold', isIn ? 'text-green-400' : 'text-red-400')}>
                      {isIn ? '+' : '−'}{fmt(tx.amount)} ₸
                    </span>
                  </div>
                )
              })}
              {transactions.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-500">Нет операций</div>}
            </div>
          </div>
        </>
      )}

      {/* ====== RECONCILE TAB ====== */}
      {tab === 'reconcile' && (
        <>
          <div className="card border-blue-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-blue-400">Ежедневная сверка остатков</div>
              <div className="flex items-center gap-2">
                <input type="date" value={reconcileDate} onChange={e => setReconcileDate(e.target.value)} className="input text-sm" />
                <button onClick={saveReconciliation} className="btn-primary text-sm flex items-center gap-2">
                  <Save className="w-4 h-4" /> Сохранить
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {activeAccounts.map(acct => {
                const expected = calcBalance(acct.id)
                const existingBal = balances.find(b => b.account_id === acct.id && b.balance_date === reconcileDate)
                const actual = reconcileInputs[acct.id] !== undefined ? reconcileInputs[acct.id] : (existingBal?.actual_balance ?? '')
                const disc = actual !== '' ? Number(actual) - expected : null
                return (
                  <div key={acct.id} className={cn('bg-slate-900 rounded-xl p-4', disc !== null && Math.abs(disc) > 100 && 'ring-1 ring-red-500/30')}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span>{acct.icon}</span>
                        <span className="text-sm font-medium">{acct.name}</span>
                      </div>
                      <span className="text-xs text-slate-500">{TYPES[acct.type]}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 items-end">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase mb-1">Ожидаемый</div>
                        <div className="font-mono text-sm font-semibold">{fmt(expected)} ₸</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase mb-1">Фактический</div>
                        <input type="text" inputMode="numeric" value={actual}
                          onChange={e => setReconcileInputs(prev => ({...prev, [acct.id]: e.target.value.replace(/[^0-9.-]/g, '')}))}
                          className="input text-sm font-mono w-full" placeholder="Введите остаток" />
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase mb-1">Расхождение</div>
                        {disc !== null ? (
                          <div className={cn('font-mono text-sm font-bold', Math.abs(disc) > 100 ? 'text-red-400' : 'text-green-400')}>
                            {disc > 0 ? '+' : ''}{fmt(disc)} ₸
                          </div>
                        ) : <div className="text-sm text-slate-600">—</div>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent reconciliations */}
          <div className="card p-0">
            <div className="px-4 py-3 border-b border-slate-800">
              <span className="text-sm font-semibold">История сверок</span>
            </div>
            <div className="divide-y divide-slate-800/50">
              {[...new Set(balances.map(b => b.balance_date))].slice(0, 7).map(date => {
                const dayBals = balances.filter(b => b.balance_date === date)
                const hasDisc = dayBals.some(b => b.discrepancy && Math.abs(b.discrepancy) > 100)
                return (
                  <div key={date} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{date}</span>
                      {hasDisc ? <AlertTriangle className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-green-400" />}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {dayBals.map(b => {
                        const acct = accounts.find(a => a.id === b.account_id)
                        return (
                          <div key={b.id} className="text-[10px] text-slate-500">
                            {acct?.icon} {acct?.name}: <span className={cn('font-mono', b.discrepancy && Math.abs(b.discrepancy) > 100 ? 'text-red-400' : 'text-green-400')}>
                              {b.discrepancy != null ? (b.discrepancy > 0 ? '+' : '') + fmt(b.discrepancy) + ' ₸' : '✓'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {balances.length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-500">Нет сверок</div>}
            </div>
          </div>
        </>
      )}

      {/* ====== TRANSACTIONS TAB ====== */}
      {tab === 'transactions' && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm min-w-[700px]">
            <thead><tr>
              <th className="table-header text-left">Дата</th>
              <th className="table-header text-left">Счёт</th>
              <th className="table-header text-left">Контрагент / Описание</th>
              <th className="table-header text-center">Тип</th>
              <th className="table-header text-right">Сумма</th>
              <th className="table-header text-center">Источник</th>
              <th className="table-header w-10"></th>
            </tr></thead>
            <tbody>
              {transactions.map(tx => {
                const acct = accounts.find(a => a.id === tx.account_id)
                const isIn = tx.type === 'income' || tx.type === 'transfer_in'
                const typeLabels = { income: 'Приход', expense: 'Расход', transfer_in: 'Вход перевод', transfer_out: 'Исх перевод' }
                const typeColors = { income: 'badge-green', expense: 'badge-red', transfer_in: 'badge-blue', transfer_out: 'badge-yellow' }
                return (
                  <tr key={tx.id} className="hover:bg-slate-800/30">
                    <td className="table-cell text-xs whitespace-nowrap">{tx.transaction_date}</td>
                    <td className="table-cell text-xs">{acct?.icon} {acct?.name}</td>
                    <td className="table-cell text-xs">{tx.counterparty || tx.description || '—'}</td>
                    <td className="table-cell text-center"><span className={cn('badge text-[10px]', typeColors[tx.type])}>{typeLabels[tx.type]}</span></td>
                    <td className={cn('table-cell text-right font-mono text-xs font-semibold', isIn ? 'text-green-400' : 'text-red-400')}>
                      {isIn ? '+' : '−'}{fmt(tx.amount)} ₸
                    </td>
                    <td className="table-cell text-center text-[10px] text-slate-500">{tx.reference_type || '—'}</td>
                    <td className="table-cell">
                      {tx.reference_type === 'manual' && (
                        <button onClick={() => deleteTransaction(tx.id)} className="p-1 text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {transactions.length === 0 && <tr><td colSpan="7" className="table-cell text-center text-slate-500 py-8">Нет операций</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ====== SETTINGS TAB ====== */}
      {tab === 'settings' && canManage && (
        <>
          <button onClick={() => { setShowAddAccount(true); setEditAcctId(null); setAcctForm({ name: '', type: 'bank', bank_name: '', icon: '🏦', color: '#3b82f6', initial_balance: 0, sort_order: accounts.length }) }}
            className="btn-primary text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> Добавить счёт</button>

          {showAddAccount && (
            <div className="card border-brand-500/30 space-y-4">
              <div className="text-sm font-semibold text-brand-400">{editAcctId ? 'Редактировать' : 'Новый счёт'}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div><label className="label">Название *</label>
                  <input value={acctForm.name} onChange={e => setAcctForm(f => ({...f, name: e.target.value}))} className="input text-sm w-full" placeholder="Kaspi Gold" /></div>
                <div><label className="label">Тип</label>
                  <select value={acctForm.type} onChange={e => setAcctForm(f => ({...f, type: e.target.value}))} className="input text-sm w-full">
                    {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select></div>
                <div><label className="label">Банк</label>
                  <input value={acctForm.bank_name || ''} onChange={e => setAcctForm(f => ({...f, bank_name: e.target.value}))} className="input text-sm w-full" placeholder="Kaspi" /></div>
                <div><label className="label">Иконка</label>
                  <input value={acctForm.icon} onChange={e => setAcctForm(f => ({...f, icon: e.target.value}))} className="input text-sm w-full" placeholder="🏦" /></div>
                <div><label className="label">Цвет</label>
                  <input type="color" value={acctForm.color} onChange={e => setAcctForm(f => ({...f, color: e.target.value}))} className="input text-sm w-full h-10" /></div>
                <div><label className="label">Начальный остаток</label>
                  <input type="number" value={acctForm.initial_balance || ''} onChange={e => setAcctForm(f => ({...f, initial_balance: Number(e.target.value)}))} className="input text-sm w-full" placeholder="0" /></div>
                <div><label className="label">Порядок сортировки</label>
                  <input type="number" value={acctForm.sort_order ?? ''} onChange={e => setAcctForm(f => ({...f, sort_order: Number(e.target.value)}))} className="input text-sm w-full" placeholder="0" /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveAccount} className="btn-primary text-sm">{editAcctId ? 'Сохранить' : 'Добавить'}</button>
                <button onClick={() => setShowAddAccount(false)} className="btn-secondary text-sm">Отмена</button>
              </div>
            </div>
          )}

          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead><tr>
                <th className="table-header text-left">Счёт</th>
                <th className="table-header text-left">Тип</th>
                <th className="table-header text-left">Банк</th>
                <th className="table-header text-right">Нач. остаток</th>
                <th className="table-header text-right">Текущий</th>
                <th className="table-header text-center">Статус</th>
                <th className="table-header text-center">Порядок</th>
                <th className="table-header w-24"></th>
              </tr></thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a.id} className={cn('hover:bg-slate-800/30', !a.is_active && 'opacity-50')}>
                    <td className="table-cell font-medium">{a.icon} {a.name}</td>
                    <td className="table-cell text-slate-400 text-xs">{TYPES[a.type]}</td>
                    <td className="table-cell text-slate-400 text-xs">{a.bank_name || '—'}</td>
                    <td className="table-cell text-right font-mono text-xs">{fmt(a.initial_balance || 0)} ₸</td>
                    <td className="table-cell text-right font-mono text-xs font-semibold">{fmt(calcBalance(a.id))} ₸</td>
                    <td className="table-cell text-center"><span className={cn('badge', a.is_active ? 'badge-green' : 'badge-red')}>{a.is_active ? 'Активен' : 'Неактивен'}</span></td>
                    <td className="table-cell text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => moveAccount(a.id, 'up')} className="p-1 text-slate-600 hover:text-slate-300" title="Вверх"><ChevronUp className="w-3.5 h-3.5" /></button>
                        <button onClick={() => moveAccount(a.id, 'down')} className="p-1 text-slate-600 hover:text-slate-300" title="Вниз"><ChevronDown className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditAcctId(a.id); setAcctForm({ ...a }); setShowAddAccount(true) }}
                          className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-blue-400" title="Редактировать"><Edit3 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => toggleActive(a.id, a.is_active)}
                          className={cn('p-1.5 rounded-lg hover:bg-slate-700', a.is_active ? 'text-slate-500 hover:text-red-400' : 'text-slate-500 hover:text-green-400')}
                          title={a.is_active ? 'Деактивировать' : 'Активировать'}><Power className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
