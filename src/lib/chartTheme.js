// Оформление графиков одно на все экраны и обе темы.
//
// Recharts принимает только конкретные цвета, поэтому берём их из тех же
// переменных CSS, что и остальной интерфейс: раньше подсказка и сетка были
// заданы тёмными шестнадцатеричными кодами и в светлой теме читались чёрным
// по чёрному.

const readVar = (name, fallback) => {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v ? `rgb(${v})` : fallback
}

/** Цвета графика на текущую тему. Вызывать при отрисовке, не на уровне модуля. */
export function chartColors() {
  return {
    grid: readVar('--c-slate-800', '#1e293b'),
    axis: readVar('--c-slate-500', '#64748b'),
    surface: readVar('--c-slate-850', '#172033'),
    border: readVar('--c-slate-750', '#293548'),
    text: readVar('--c-slate-100', '#f1f5f9'),
    muted: readVar('--c-slate-400', '#94a3b8'),
    revenue: readVar('--c-brand-500', '#22c55e'),
    expense: readVar('--c-red-500', '#ef4444'),
    accent: readVar('--c-blue-500', '#3b82f6'),
    warn: readVar('--c-amber-500', '#f59e0b'),
  }
}

/** Общие свойства подсказки: плавающая карточка, а не чёрный прямоугольник. */
export function tooltipProps(c = chartColors()) {
  return {
    contentStyle: {
      background: c.surface,
      border: `1px solid ${c.border}`,
      borderRadius: 14,
      fontSize: 14,
      boxShadow: '0 12px 32px -12px rgb(0 0 0 / 0.35)',
      color: c.text,
    },
    labelStyle: { color: c.muted, marginBottom: 4 },
    cursor: { fill: c.grid, opacity: 0.35 },
  }
}

/** Ось: подписи читаемого размера, без лишних линий. */
export function axisProps(c = chartColors()) {
  return {
    tick: { fill: c.axis, fontSize: 13 },
    tickLine: false,
    axisLine: false,
  }
}

/** Сетка: только горизонтальные линии, приглушённые. */
export function gridProps(c = chartColors()) {
  return { stroke: c.grid, strokeDasharray: '0', vertical: false }
}
