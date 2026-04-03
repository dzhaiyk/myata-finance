# Мята Finance — Blueprint (Архитектура проекта)

> Этот документ фиксирует архитектурный фундамент проекта. Любое изменение должно быть совместимо с описанными здесь решениями либо Blueprint должен быть обновлён перед внедрением.

---

## 1. Обзор системы

**Мята Finance** — SPA для финансового контроля заведения «Мята | Platinum 4YOU». Приложение покрывает полный цикл операционного учёта: ежедневные отчёты смен, импорт банковских выписок, формирование P&L, расчёт зарплат, управление счетами и остатками наличных.

```
┌─────────────────────────────────────────────────────┐
│                  Пользователь (браузер)              │
│  React 18 + React Router + Zustand + Tailwind CSS   │
└─────────────┬───────────────────────┬───────────────┘
              │ REST API              │ HTTP POST
              ▼                       ▼
   ┌──────────────────┐    ┌──────────────────┐
   │  Supabase Cloud  │    │  Telegram Bot API │
   │  (PostgreSQL +   │    │  (уведомления)    │
   │   PostgREST)     │    └──────────────────┘
   └──────────────────┘
              │
              ▼
   ┌──────────────────┐
   │     Netlify       │
   │  (хостинг SPA)   │
   └──────────────────┘
```

---

## 2. Технологический стек

| Слой | Технология | Версия | Назначение |
|------|-----------|--------|-----------|
| UI-фреймворк | React | 18.3 | Компонентная модель, хуки |
| Роутинг | React Router | 7.1 | SPA-навигация, ProtectedRoute |
| Стейт | Zustand | 5.0 | Глобальное состояние (auth, permissions) |
| Стилизация | Tailwind CSS | 3.4 | Утилитарные классы + кастомные компоненты |
| Графики | Recharts | 2.15 | Bar/Pie/Tooltip для дашборда и P&L |
| Иконки | Lucide React | 0.468 | SVG-иконки |
| БД | Supabase (PostgreSQL) | — | Хранение, REST API через PostgREST |
| Сборка | Vite | 6.0 | HMR, ESM, production build |
| Экспорт | jsPDF + html2canvas | — | PDF-генерация отчётов |
| Табличный импорт | xlsx (SheetJS) | 0.18 | Парсинг банковских выписок Excel |
| Даты | date-fns + date-fns-tz | 4.1 | Форматирование и таймзоны |
| Деплой | Netlify | — | CI/CD, SPA-редирект, Node 22 |

---

## 3. Архитектура приложения

### 3.1 Слои

```
┌──────────────────────────────────────────────────────┐
│  Pages (src/pages/)                                  │
│  Каждая страница — самодостаточный модуль:           │
│  собственные запросы к Supabase, локальный стейт,    │
│  рендеринг. Нет общих сервисов или хуков для данных. │
├──────────────────────────────────────────────────────┤
│  Components (src/components/)                        │
│  Общие UI-компоненты: Layout (sidebar + навигация)   │
├──────────────────────────────────────────────────────┤
│  Lib (src/lib/)                                      │
│  Утилиты и инфраструктура:                           │
│  store.js — Zustand (auth/permissions)               │
│  supabase.js — клиент Supabase                       │
│  telegram.js — отправка уведомлений                  │
│  categorize.js — парсинг и категоризация транзакций  │
│  utils.js — форматирование чисел, дат, классов       │
├──────────────────────────────────────────────────────┤
│  Supabase (PostgreSQL)                               │
│  Единственный бэкенд. Прямые запросы из браузера.    │
│  RLS открыт для anon. Авторизация на фронте.         │
└──────────────────────────────────────────────────────┘
```

### 3.2 Паттерн работы с данными

Каждая страница напрямую вызывает `supabase.from('table').select/insert/update/delete`. Нет промежуточного слоя (API-сервисов, кастомных хуков для данных, кеша). Состояние данных — локальные `useState` + `useEffect` для загрузки.

```jsx
// Типичный паттерн в каждой странице
const [data, setData] = useState([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  supabase.from('table').select('*').then(({ data }) => {
    setData(data || []);
    setLoading(false);
  });
}, []);
```

### 3.3 Роутинг

```
/login                → LoginPage (публичная)
/                     → Layout (ProtectedRoute)
  ├── /dashboard      → DashboardPage
  ├── /daily-report   → DailyReportPage
  ├── /accounts       → AccountsPage
  ├── /pnl            → PnLPage
  ├── /cashflow       → CashFlowPage
  ├── /investments    → InvestmentsPage
  ├── /analytics      → AnalyticsPage (perm: dashboard.view)
  ├── /bank-import    → BankImportPage
  ├── /staff          → StaffPage
  ├── /suppliers      → SuppliersPage
  ├── /payroll        → PayrollPage
  ├── /users          → UsersPage
  ├── /roles          → RolesPage
  └── /settings       → SettingsPage
```

**ProtectedRoute** — обёртка, проверяющая наличие сессии в Zustand store. Редирект на `/login` если `!user`.

---

## 4. Модель данных

### 4.1 ER-диаграмма (упрощённая)

```
roles ──1:N── permissions
  │
  └──1:N── app_users

positions ──1:N── staff
                    │
                    └──1:N── payroll_details ──N:1── payroll_periods

daily_reports (JSONB data — выручка, расходы, сверка кассы)

bank_rules ──1:N── bank_rule_conditions

bank_transactions (импорт из Excel, авто-категоризация)

categories (60+ записей — план счетов для P&L)

pnl_data (ручные корректировки)

accounts ──1:N── account_transactions
    │
    └──1:N── account_balances

suppliers (справочник)

settings (key-value JSONB)
```

### 4.2 Ключевые таблицы

#### daily_reports
Центральная таблица операционного учёта. Поле `data` (JSONB) содержит:
```json
{
  "revenue": { "kitchen": 0, "bar": 0, "hookah": 0, "other": 0 },
  "payments": { "cash": 0, "kaspiQR": 0, "halyk": 0, "wolt": 0, "glovo": 0, ... },
  "expenses": {
    "suppliers": [{ "name": "", "amount": 0, "note": "" }],
    "payroll": [{ "name": "", "amount": 0 }],
    "tobacco": [{ "name": "", "amount": 0 }],
    "other": [{ "name": "", "amount": 0, "note": "" }],
    "withdrawals": [{ "name": "", "amount": 0, "note": "" }]
  },
  "cash": { "opening": 0, "closing": 0 }
}
```

#### bank_transactions
Импортированные строки из Excel-выписок Kaspi Business. Авто-категоризация через `categorize.js` (regex по полям purpose, beneficiary, КНП). Поддержка period allocation (period_from/period_to).

#### accounts + account_transactions
Мультисчётная система: касса, банки, депозиты, терминалы. Переводы между счетами создают парные записи (transfer_out + transfer_in). Ежедневная сверка через account_balances.

### 4.3 Миграции

11 миграций в `supabase/migrations/` (001–011). Нумерация последовательная. Каждая миграция — идемпотентный SQL с `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

---

## 5. Авторизация и доступ

### 5.1 Архитектура

```
Браузер (localStorage: myata_session = { userId })
    │
    ▼
Zustand store → загружает app_users + permissions из Supabase
    │
    ▼
hasPermission('key') → проверка в кешированном объекте permissions
    │
    ▼
Layout.jsx / Pages → условный рендеринг меню и действий
```

### 5.2 Ролевая модель

| Роль | ID | Тип |
|------|-----|-----|
| Админ | 1 | Системная (все права автоматически) |
| Учредитель | 2 | Системная |
| Управляющий | 3 | Системная |
| Менеджер | 4 | Системная (по умолчанию для новых) |
| Бухгалтер | 5 | Системная |

### 5.3 Матрица прав

24 permission_key в 12 группах:

| Группа | Ключи |
|--------|-------|
| daily_report | view, create, edit, delete, submit, reopen |
| pnl | view, edit |
| cashflow | view |
| dashboard | view |
| bank_import | view, upload, categorize |
| staff | view, edit |
| suppliers | view, edit |
| payroll | view, edit |
| users | view, edit |
| roles | view, edit |
| settings | view, edit |
| telegram | send |

---

## 6. Потоки данных

### 6.1 Ежедневный отчёт

```
Менеджер заполняет форму
    │
    ├── Сохранить черновик → daily_reports (status: draft)
    │
    └── Отправить отчёт →
          ├── daily_reports (status: submitted)
          ├── Синхронизация баланса кассы → accounts.current_balance
          ├── Если |discrepancy| > 1000₸ → Telegram-алерт
          └── Генерация PDF / WhatsApp-сообщения (по кнопке)
```

### 6.2 Импорт банковской выписки

```
Загрузка Excel (Kaspi Business)
    │
    ▼
categorize.js: parseBankStatement()
    ├── Парсинг колонок (дата, дебет, кредит, получатель, назначение, КНП)
    ├── Авто-категоризация (31 regex-правило, confidence: high/medium/low)
    └── SHA-256 хеш для дедупликации
    │
    ▼
Превью в UI → ручная корректировка категорий
    │
    ▼
Сохранение → bank_transactions
    │
    ▼
P&L подтягивает данные из bank_transactions по category + period
```

### 6.3 Формирование P&L

```
PnLPage загружает 3 источника:
    │
    ├── daily_reports → выручка по отделам, кэш-расходы (поставщики, зарплаты)
    ├── bank_transactions → безналичные расходы (с period allocation)
    └── pnl_data → ручные корректировки
    │
    ▼
Агрегация в 33-строчную иерархию:
    Выручка (4 отдела)
    − Себестоимость (food cost)
    = Валовая прибыль
    − OpEx (зарплаты, аренда, маркетинг, коммуналка, хозтовары)
    = EBITDA
    − Налоги, CapEx, прочие
    = Чистая прибыль
```

### 6.4 Расчёт зарплат

```
PayrollPage
    │
    ├── Загрузка staff + positions → ставки, % продаж
    ├── Загрузка daily_reports за период → поиск авансов по имени сотрудника
    │
    ▼
Расчёт: Итого = (Дни × Ставка) + (Продажи × %) − Авансы − Удержания
    │
    ▼
Сохранение → payroll_details + payroll_periods (status: draft → paid)
```

### 6.5 Cash Flow

```
CashFlowPage загружает 4 источника:
    │
    ├── daily_reports → наличная выручка (payments.cash), кассовые расходы
    ├── bank_transactions → безналичные поступления и расходы (с period allocation)
    ├── investor_transactions → дивиденды, взносы учредителей
    └── pnl_data → исторические данные для ранних месяцев
    │
    ▼
Агрегация прямым методом в 3 секции:
    1. Операционная деятельность:
       + Наличная выручка + Банковские поступления
       − Кассовые расходы (закуп, авансы ЗП, хозтовары, инкассация)
       − Банковские OpEx (ФОТ, закуп, аренда, ком.услуги, маркетинг, налоги)
    2. Инвестиционная деятельность:
       − CapEx (ремонт, мебель, аппараты кальян, прочее)
    3. Финансовая деятельность:
       − Дивиденды + Взносы учредителей + Внутренние переводы
    = Чистое изменение денежных средств
```

### 6.6 Аналитика

```
AnalyticsPage загружает все данные за всё время:
    │
    ├── daily_reports → выручка, расхождения кассы
    ├── pnl_data → исторические P&L данные
    └── bank_transactions → расходы по категориям
    │
    ▼
7 аналитических секций (все вычисления на клиенте через useMemo):
    1. Тренды выручки (90 дней, 7-дн скользящее среднее, линейная регрессия)
    2. Выручка по дням недели (3 периода сравнения)
    3. Food Cost % тренд (помесячно, с бенчмарками)
    4. ФОТ % тренд (помесячно, бенчмарк 30%)
    5. Детекция аномалий расходов (mean + 1.5σ за 12 мес)
    6. Расхождения кассы (месячный трекер + топ-10)
    7. Сезонность выручки (хитмап месяцы × годы)
```

---

## 7. UI-архитектура

### 7.1 Дизайн-система

| Элемент | Реализация |
|---------|-----------|
| Тема | Тёмная (slate-925 фон, slate-100 текст) |
| Акцент | brand-500 (#22c55e) — зелёный |
| Вторичный акцент | mint (teal) — для графиков |
| Шрифты | DM Sans (текст), Plus Jakarta Sans (заголовки), JetBrains Mono (цифры) |
| Карточки | `.card` — bg-slate-850, border-slate-750, rounded-2xl |
| Кнопки | `.btn-primary` — bg-brand-600, hover:bg-brand-500 |
| Инпуты | `.input` — bg-slate-800, border-slate-700, focus:ring-brand-500 |
| Таблицы | `.table-header` — bg-slate-800/50, text-slate-400, uppercase |
| Анимации | fadeIn, slideUp, pulseSoft (Tailwind keyframes) |

### 7.2 Компоненты

На данный момент единственный общий компонент — `Layout.jsx` (sidebar + Outlet). Все остальные компоненты встроены в страницы. Повторно используемых UI-компонентов (Button, Modal, Input, Table) пока нет.

### 7.3 Адаптивность

- Sidebar: скрыт на мобильных, hamburger-меню
- Tailwind breakpoints: `sm:`, `lg:`
- Таблицы: горизонтальный скролл на малых экранах

---

## 8. Внешние интеграции

### 8.1 Supabase

- URL и anon key через env-переменные
- Прямые вызовы `supabase.from().select/insert/update/delete`
- RLS: все политики `USING (true)` — фактически отключён
- Нет Edge Functions, нет Storage, нет Realtime

### 8.2 Telegram Bot

- Отправка через `sendTelegramNotification()` (HTTP POST к api.telegram.org)
- Типы уведомлений: отчёт смены, алерт кассы, импорт выписки
- Токен и chat_id через env-переменные (фронтенд!)

### 8.3 Kaspi Business

- Офлайн-интеграция: ручная загрузка Excel-файла
- Парсинг: фиксированная структура колонок (categorize.js)
- Формат: Документ №, дата, дебет, кредит, получатель, ИИН/БИН, счёт, БИК, КНП, назначение

---

## 9. Архитектурные решения и ограничения

### 9.1 Принятые решения

| Решение | Обоснование |
|---------|------------|
| SPA без серверной логики | Минимальная сложность для MVP |
| Supabase как единственный бэкенд | Быстрый старт, встроенный REST API |
| Кастомная авторизация (не Supabase Auth) | Простота: username/password без email-подтверждения |
| JSONB для данных отчётов | Гибкая структура, часто меняющиеся поля |
| Regex-категоризация транзакций | Достаточно для Kaspi-формата, расширяемо |
| Zustand для глобального стейта | Легковесная альтернатива Redux |

### 9.2 Известные ограничения

| Проблема | Риск | Приоритет |
|----------|------|-----------|
| Пароли в plain text | Критический для безопасности | Высокий |
| RLS отключён (USING true) | Любой может читать/писать все данные | Высокий |
| Нет серверной валидации | Данные можно подделать из DevTools | Средний |
| Telegram-токен на фронте | Утечка токена в исходниках | Средний |
| Нет тестов | Регрессии при изменениях | Средний |
| Профиль staff → payroll связь по имени | Сломается при переименовании | Средний |

---

## 10. Правила развития проекта

### 10.1 Файловая организация

- **Новая страница** → `src/pages/НазваниеPage.jsx`
- **Общий компонент** → `src/components/НазваниеКомпонента.jsx`
- **Утилитарная функция** → `src/lib/название.js`
- **Новая миграция** → `supabase/migrations/NNN_описание.sql` (следующий номер)

### 10.2 Стиль кода

- JSX-компоненты: функциональные, с хуками
- CSS: только Tailwind-классы + кастомные из index.css. Inline-стили — исключение
- Именование: camelCase для переменных, PascalCase для компонентов
- Суффикс `Page` для страниц, без суффикса для компонентов
- Импорт Supabase: `import { supabase } from '@/lib/supabase'`
- Импорт утилит: `import { fmt, fmtDate } from '@/lib/utils'`

### 10.3 Работа с БД

- Новые таблицы — через миграцию, не руками в Supabase Dashboard
- Всегда добавлять RLS-политику (даже если пока открытая)
- Числовые поля для денег: `NUMERIC(15,2)`
- Все timestamps: `TIMESTAMPTZ DEFAULT now()`
- Уникальные ограничения — для предотвращения дубликатов

### 10.4 При добавлении нового модуля

1. Создать миграцию с таблицами
2. Создать страницу в `src/pages/`
3. Добавить роут в `App.jsx`
4. Добавить пункт меню в `Layout.jsx` (с проверкой прав)
5. Добавить permission_key в `store.js` → `ALL_PERMISSIONS`
6. Обновить `claude.md` и этот Blueprint

---

## 11. Дерево зависимостей модулей

```
DashboardPage
  └── reads: daily_reports, pnl_data

DailyReportPage
  ├── reads/writes: daily_reports
  ├── reads: suppliers, staff (для автоподсказок)
  ├── writes: accounts (синхронизация баланса при отправке)
  └── calls: telegram.js (уведомления)

PnLPage
  ├── reads: daily_reports (выручка, кэш-расходы)
  ├── reads: bank_transactions (безнал)
  └── reads/writes: pnl_data (ручные корректировки)

CashFlowPage
  ├── reads: daily_reports (наличная выручка, кассовые расходы)
  ├── reads: bank_transactions (безнал, period allocation)
  ├── reads: investor_transactions (дивиденды, взносы)
  └── reads: pnl_data (исторические данные)

AnalyticsPage
  ├── reads: daily_reports (выручка, расхождения кассы)
  ├── reads: pnl_data (исторические P&L)
  └── reads: bank_transactions (расходы по категориям)

InvestmentsPage
  ├── reads/writes: investors
  ├── reads/writes: investor_transactions
  └── uses: InvestorCard, YearlyBreakdownTable, AvgMonthlyDividends (inline)

BankImportPage
  ├── uses: categorize.js (парсинг + авто-категоризация)
  ├── reads: categories, bank_rules
  └── writes: bank_transactions

PayrollPage
  ├── reads: staff, positions
  ├── reads: daily_reports (авансы по имени)
  └── writes: payroll_periods, payroll_details

AccountsPage
  ├── reads/writes: accounts, account_transactions
  └── reads/writes: account_balances

StaffPage
  └── reads/writes: staff, positions

SuppliersPage
  └── reads/writes: suppliers

UsersPage
  └── reads/writes: app_users, roles

RolesPage
  └── reads/writes: roles, permissions
```
