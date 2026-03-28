---
name: myata-component
description: Standards for React components in Myata Finance restaurant app. Use when creating or editing any JSX component, page, or UI element. Covers dark theme palette, Tailwind classes, Zustand store, Supabase queries, and project conventions.
---

# Myata Finance — Component Standards

## Tech Stack
React 18.3, Vite, React Router 7, Tailwind CSS, Zustand 5, Supabase JS v2, Lucide React, Recharts, date-fns, xlsx, jsPDF

## Deploy: GitHub dzhaiyk/myata-finance → Netlify myata-finance.netlify.app → Supabase cwevmommscxgvbypaefc

## CSS Classes (src/index.css)
.card = bg-slate-850 border border-slate-750 rounded-2xl p-5
.card-hover = card + hover:border-brand-500/30 hover:shadow-lg
.btn-primary = bg-brand-600 hover:bg-brand-500 text-white font-semibold px-5 py-2.5 rounded-xl
.btn-secondary = bg-slate-750 hover:bg-slate-700 text-slate-200 border border-slate-700
.btn-danger = bg-red-600/20 text-red-400 border border-red-500/20
.input = bg-slate-900 border border-slate-750 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-brand-500/40
.label = text-sm font-medium text-slate-400 mb-1.5 block
.badge = inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold
.badge-green/red/yellow/blue = badge + bg-{color}-500/15 text-{color}-400
.table-header = text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-900/50 px-4 py-3
.table-cell = px-4 py-3 text-sm border-t border-slate-800

## Custom Tailwind Colors
brand: green (#22c55e at 500), mint: teal, slate: 750/850/925/950 custom shades

## Fonts
sans = DM Sans (body), display = Plus Jakarta Sans (headings), mono = JetBrains Mono (numbers)

## Auth (src/lib/store.js) — Custom via app_users, NOT Supabase Auth
const { user, profile, hasPermission, signIn, signOut } = useAuthStore()
profile.roles.name: 'Админ'|'Учредитель'|'Управляющий'|'Менеджер'|'Бухгалтер'
hasPermission('daily_report.edit') — Админ always returns true

## Utils (src/lib/utils.js)
fmt(n) → "1 234 567", fmtK(n) → "1.2M", fmtPct(n) → "29.1%", fmtDate(d) → "15.03.2026"
cn(...classes) → className joiner, MONTHS_RU = ['Январь',...,'Декабрь']

## Page Pattern
```jsx
export default function SomePage() {
  const { profile, hasPermission } = useAuthStore()
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Title</h1>
          <p className="text-sm text-slate-500 mt-0.5">Subtitle</p>
        </div>
        <button className="btn-primary text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> Action</button>
      </div>
      <div className="card">...</div>
    </div>
  )
}
```

## Rules
- All UI text Russian, code English
- Tailwind only, no CSS modules/styled-components
- Money inputs: type="text" inputMode="numeric" + font-mono tabular-nums text-right
- Soft delete: is_active = false (staff, suppliers, accounts)
- date-fns for date manipulation, not moment
