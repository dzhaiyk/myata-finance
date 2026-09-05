import { locale, currencySymbol, timezone, decimalSeparator } from './config.js'

export const fmt = (n) => {
  if (n == null || isNaN(n)) return '—'
  const num = Number(n)
  const loc = locale()
  if (Number.isInteger(num)) return new Intl.NumberFormat(loc).format(num)
  return new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)
}

/**
 * Деньги со знаком валюты. До TASK-020 символ ₸ был вписан строкой в 153 местах,
 * поэтому приложение нельзя было продать заведению в другой валюте.
 */
export const money = (n) => (n == null || isNaN(n) ? '—' : `${fmt(n)} ${currencySymbol()}`)

/**
 * Ввод суммы: оставляем цифры и разделитель, приводим к разделителю локали.
 * До TASK-020 везде принудительно ставилась запятая — русская нотация была
 * вписана в компоненты ввода.
 */
export const amountInput = (raw, { allowMinus = false } = {}) =>
  String(raw ?? '')
    .replace(allowMinus ? /[^0-9.,-]/g : /[^0-9.,]/g, '')
    .replace(/[.,]/g, decimalSeparator())

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
  return date.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: timezone() })
}

export const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

export const cn = (...classes) => classes.filter(Boolean).join(' ')

export function linearRegression(points) {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 }
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0
  for (const { x, y } of points) {
    sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x; sumY2 += y * y
  }
  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 }
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  const ssRes = points.reduce((s, { x, y }) => s + (y - (slope * x + intercept)) ** 2, 0)
  const meanY = sumY / n
  const ssTot = points.reduce((s, { y }) => s + (y - meanY) ** 2, 0)
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0
  return { slope, intercept, r2 }
}
