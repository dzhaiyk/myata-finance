export const fmt = (n) => {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('ru-RU').format(Math.round(n))
}

export const fmtK = (n) => {
  if (n == null || isNaN(n)) return '—'
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return fmt(n)
}

export const fmtPct = (n) => {
  if (n == null || isNaN(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}

export const fmtDate = (d) => {
  if (!d) return ''
  const date = new Date(d)
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

export const cn = (...classes) => classes.filter(Boolean).join(' ')
