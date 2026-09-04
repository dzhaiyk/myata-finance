---
paths:
  - "src/pages/BankImportPage.jsx"
  - "src/lib/bankImport.js"
  - "src/lib/categorize.js"
  - "src/lib/categories.js"
  - "src/lib/halykStatement.js"
  - "src/lib/pdfText.js"
  - "src/lib/__tests__/bankImport.test.js"
  - "src/lib/__tests__/categorize.test.js"
  - "src/lib/__tests__/halykStatement.test.js"
  - "src/lib/__tests__/category-contract.test.js"
  - "supabase/migrations/*bank*"
  - "supabase/migrations/*categor*"
---
Ты работаешь с кодом домена **bank** (выписки и категоризация).
- Перед изменением логики открой `docs/10-business/bank/rules.md` — только затронутые BR-BNK-*.
- Реализуешь то, для чего нет правила CONFIRMED — остановись и задай вопрос владельцу.
- Меняешь поведение — обнови правило, тест с id правила и строку в `docs/INDEX.md` в том же коммите.
