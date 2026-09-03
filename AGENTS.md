# Мята Finance — Контекст проекта

## Что это

Веб-приложение для финансового учёта заведения «Мята | Platinum 4YOU» (Казахстан). Управление ежедневными отчётами смен, импорт банковских выписок, P&L, расчёт зарплат, контроль остатков наличных и счетов.

## Стек

- **Frontend:** React 18, React Router 7, Zustand, Recharts, Lucide React
- **Стилизация:** Tailwind CSS 3 + кастомные компонентные классы в `src/index.css`
- **Сборка:** Vite 6, PostCSS, Autoprefixer
- **Backend:** Supabase (PostgreSQL + JS-клиент). Вся логика на фронте, бэкенда нет
- **Деплой:** Netlify (SPA-режим, Node 22). Папка `dist/`
- **Уведомления:** Telegram Bot API (lib/telegram.js)
- **Экспорт:** jsPDF (PDF-отчёты), xlsx (импорт выписок), html2canvas

## Структура каталогов

```
src/
├── main.jsx              # Точка входа
├── App.jsx               # Роутер + ProtectedRoute
├── index.css             # Tailwind + кастомные классы (.card, .btn-primary, .input, .badge, .table-header)
├── components/
│   └── Layout.jsx        # Боковая навигация, mobile-меню, проверка прав
├── lib/
│   ├── store.js          # Zustand: авторизация, профиль, права (24 permission_key)
│   ├── supabase.js       # Инициализация Supabase-клиента
│   ├── telegram.js       # Отправка уведомлений в Telegram
│   ├── utils.js          # fmt, fmtK, fmtPct, fmtDate, MONTHS_RU, cn
│   └── categorize.js     # Парсинг Excel Kaspi, авто-категоризация (31 regex-правило)
├── pages/
│   ├── LoginPage.jsx     # Вход по логину/паролю
│   ├── DashboardPage.jsx # KPI-карточки, графики выручки
│   ├── DailyReportPage.jsx  # Ежедневные отчёты (самый большой файл ~860 строк)
│   ├── PnLPage.jsx       # P&L с period allocation и ручными корректировками
│   ├── CashFlowPage.jsx  # Cash Flow (прямой метод, 3 секции CF)
│   ├── AnalyticsPage.jsx # Аналитика: тренды, аномалии, сезонность
│   ├── BankImportPage.jsx # Импорт банковских выписок Kaspi
│   ├── AccountsPage.jsx  # Счета: остатки, переводы, сверка
│   ├── StaffPage.jsx     # Сотрудники и должности
│   ├── PayrollPage.jsx   # Расчёт зарплат (авансы из daily_reports)
│   ├── SuppliersPage.jsx # Справочник поставщиков
│   ├── UsersPage.jsx     # Управление пользователями
│   ├── RolesPage.jsx     # RBAC: матрица прав
│   └── SettingsPage.jsx  # Настройки Telegram-бота
supabase/
└── migrations/           # 11 миграций (001–011)
```

## База данных (Supabase PostgreSQL)

### Ключевые таблицы

| Таблица | Назначение |
|---------|-----------|
| `app_users` | Пользователи (username/password, role_id) |
| `roles` / `permissions` | RBAC: роли + 24 permission_key |
| `daily_reports` | Ежедневные отчёты смен (JSONB data, revenue, withdrawals, discrepancy) |
| `bank_transactions` | Импортированные банковские транзакции (tx_hash для дедупликации) |
| `bank_rules` / `bank_rule_conditions` | Правила авто-категоризации |
| `categories` | 60+ категорий для P&L (income, cogs, opex, below_ebitda, other) |
| `pnl_data` | Ручные корректировки P&L |
| `accounts` | Счета (cash, bank, deposit, terminal) |
| `account_transactions` | Движения по счетам (income/expense/transfer_in/transfer_out) |
| `account_balances` | Ежедневная сверка остатков |
| `staff` / `positions` | Сотрудники и должности |
| `payroll_periods` / `payroll_details` | Расчёт зарплат по периодам |
| `suppliers` | Справочник поставщиков |
| `settings` | Системные настройки (JSONB) |

### RLS

Все таблицы используют RLS с полным доступом для anon-роли (`USING (true)`). Авторизация реализована на уровне фронтенда через Zustand store.

## Авторизация

- Кастомная (НЕ Supabase Auth). Таблица `app_users` с plain-text паролями
- Сессия хранится в `localStorage` как `myata_session` (только userId)
- При загрузке приложения store.initialize() проверяет наличие и активность пользователя
- Права загружаются из таблицы `permissions`, кешируются в Zustand
- Роль «Админ» (id=1) всегда имеет все права

### Роли по умолчанию

Админ, Учредитель, Управляющий, Менеджер, Бухгалтер

### Группы прав (24 ключа)

daily_report (view/create/edit/delete/submit/reopen), pnl (view/edit), cashflow (view/edit), dashboard (view/kpi), bank_import (view/upload/categorize), staff (view/manage), suppliers (view/manage), payroll (view/manage), investments (view/edit/manage), users (view/manage), roles (view/manage), settings (view/edit), telegram (manage)

Аналитика использует `dashboard.view` для доступа.

## Бизнес-логика

### Ежедневный отчёт (DailyReportPage)
- Выручка по отделам: Кухня, Бар, Кальян, Прочее
- Выручка по типу оплаты: Наличные, Kaspi, Halyk, Wolt, Glovo и др.
- Расходы: поставщики, зарплаты, табак, прочие, инкассация
- Сверка кассы: opening → expected (+ наличные продажи − выдачи) → actual → discrepancy
- При |discrepancy| > 500₸ — красный флаг, > 1000₸ — Telegram-алерт
- Статусы: draft → submitted. Переоткрытие только для админа

### P&L (PnLPage)
- Источники: daily_reports (выручка, кэш-расходы) + bank_transactions (безнал) + pnl_data (ручные)
- Period allocation: транзакции с period_from/period_to разделяются по месяцам пропорционально
- 33-строчная иерархическая структура P&L
- Режим: месяц или YTD

### Импорт выписок (BankImportPage)
- Формат: Excel из Kaspi Business
- Парсинг через categorize.js (regex-правила по полям: purpose → beneficiary → КНП)
- Дедупликация через SHA-256 хеш (tx_hash)
- Ручная перекатегоризация

### Cash Flow (CashFlowPage)
- Прямой метод: фактическое движение денежных средств
- 3 секции: Операционная деятельность (наличная выручка, кассовые расходы, банковские OpEx), Инвестиционная (CapEx), Финансовая (дивиденды, взносы учредителей)
- Источники: daily_reports (наличные), bank_transactions (безнал, period allocation), investor_transactions (дивиденды/взносы), pnl_data (исторические данные)
- Режимы: Месяц / YTD / Год (горизонтальная таблица)
- KPI карточки: Операционный CF, Инвестиционный CF, Финансовый CF, Чистое изменение

### Аналитика (AnalyticsPage)
- Тренды выручки (90 дней) с 7-дневным скользящим средним и линейной регрессией
- Выручка по дням недели (всё время / 90 дней / 30 дней)
- Food Cost % тренд помесячно с бенчмарками (30%, 35%, 40%)
- ФОТ % тренд с бенчмарком 30%
- Детекция аномалий расходов (mean + 1.5σ)
- Расхождения кассы: месячный трекер + топ-10 худших дней
- Сезонность выручки: хитмап по месяцам × годам
- Права доступа: dashboard.view

### Инвестиции (InvestmentsPage) — дополнения
- Таблица «Средние дивиденды в месяц по годам» в Dashboard-табе
- InvestorCard: средние дивиденды текущего и прошлого года

### Зарплаты (PayrollPage)
- Периоды: 1–15 и 16–конец месяца
- Авансы автоматически подтягиваются из daily_reports (по имени сотрудника)
- Формула: Итого = (Дни × Ставка) + (Продажи × %) − Авансы − Удержания

## Переменные окружения

```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
VITE_TELEGRAM_BOT_TOKEN=xxx
VITE_TELEGRAM_CHAT_ID=xxx
```

## Команды

```bash
npm run dev      # Vite dev-server
npm run build    # Production build → dist/
npm run preview  # Превью production build
```

## Алиас путей

`@` → `./src` (настроен в vite.config.js)

## Валюта

Тенге (₸ / KZT). Форматирование через `fmt()` в `lib/utils.js` (русская локаль, без копеек).

## Шрифты

DM Sans (основной), Plus Jakarta Sans (заголовки), JetBrains Mono (цифры). Подключены через Google Fonts.

## Тема

Тёмная. Фон: slate-925 (#0d1520). Акцент: brand-500 (#22c55e) / mint. Кастомные оттенки slate (750, 850, 925, 950) в tailwind.config.js.

## Важные особенности

- Весь UI на русском языке
- Все вычисления выполняются на клиенте (нет серверной логики)
- Пароли хранятся в plain text (известная проблема безопасности)
- RLS открыт для всех — авторизация только на фронте
- CashFlowPage — реализован (прямой метод CF)
- AnalyticsPage — аналитика с графиками и детекцией аномалий
- profiles — legacy-таблица от Supabase Auth, не используется активно
- daily_reports.manager_id — FK удалён (миграция 009), связь по имени
