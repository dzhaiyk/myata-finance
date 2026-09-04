---
paths:
  - "src/pages/PnLPage.jsx"
  - "src/pages/CashFlowPage.jsx"
  - "src/pages/DashboardPage.jsx"
  - "src/pages/AnalyticsPage.jsx"
  - "src/lib/pnlCompute.js"
  - "src/lib/pnl.js"
  - "src/lib/__tests__/pnlCompute.test.js"
  - "src/lib/__tests__/pnl.test.js"
  - "supabase/migrations/*pnl*"
---
Ты работаешь с кодом домена **reporting** (P&L, Cash Flow, аналитика).
- Перед изменением логики открой `docs/10-business/reporting/rules.md` — только затронутые BR-RPT-*.
- Реализуешь то, для чего нет правила CONFIRMED — остановись и задай вопрос владельцу.
- Меняешь поведение — обнови правило, тест с id правила и строку в `docs/INDEX.md` в том же коммите.
