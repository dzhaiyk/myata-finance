-- 017_investments.sql
-- Инвесторы и транзакции инвесторов

-- ============================================================
-- 1. Таблица investors
-- ============================================================
CREATE TABLE public.investors (
  id          SERIAL PRIMARY KEY,
  full_name   TEXT NOT NULL,
  share_pct   NUMERIC(5,2) DEFAULT 33.33,
  entry_date  DATE NOT NULL,
  exit_date   DATE,
  exit_type   TEXT CHECK (exit_type IN ('sold','buyout') OR exit_type IS NULL),
  successor_id INTEGER REFERENCES public.investors(id),
  purchase_price NUMERIC(15,2),
  status      TEXT DEFAULT 'active' CHECK (status IN ('active','exited')),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. Таблица investor_transactions
-- ============================================================
CREATE TABLE public.investor_transactions (
  id               SERIAL PRIMARY KEY,
  investor_id      INTEGER NOT NULL REFERENCES public.investors(id),
  transaction_date DATE NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('investment','dividend','share_purchase','share_sale')),
  amount           NUMERIC(15,2) NOT NULL,
  notes            TEXT,
  created_by       UUID REFERENCES public.app_users(id),
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. Индексы
-- ============================================================
CREATE INDEX idx_investor_transactions_investor_id ON public.investor_transactions(investor_id);
CREATE INDEX idx_investor_transactions_date ON public.investor_transactions(transaction_date);

-- ============================================================
-- 4. RLS + гранты
-- ============================================================
ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All access" ON public.investors FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.investors TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.investors_id_seq TO anon;

ALTER TABLE public.investor_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All access" ON public.investor_transactions FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.investor_transactions TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.investor_transactions_id_seq TO anon;

-- ============================================================
-- 5. Seed investors
-- ============================================================
INSERT INTO public.investors (id, full_name, share_pct, entry_date, status)
VALUES (1, 'Жайық', 33.33, '2021-11-15', 'active');

INSERT INTO public.investors (id, full_name, share_pct, entry_date, exit_date, exit_type, successor_id, purchase_price, status)
VALUES (2, 'Алмас', 33.33, '2021-11-15', '2025-09-15', 'sold', 4, 25000000, 'exited');

INSERT INTO public.investors (id, full_name, share_pct, entry_date, status)
VALUES (3, 'Абу', 33.34, '2021-11-15', 'active');

INSERT INTO public.investors (id, full_name, share_pct, entry_date, purchase_price, status)
VALUES (4, 'Әділет', 33.33, '2025-09-15', 25000000, 'active');

-- ============================================================
-- 6. Seed investor_transactions
-- ============================================================

-- PART 1: Общие транзакции для инвесторов 1, 2, 3
DO $$
DECLARE
  inv_id INTEGER;
  tx RECORD;
BEGIN
  FOR inv_id IN SELECT unnest(ARRAY[1, 2, 3]) LOOP
    FOR tx IN
      SELECT * FROM (VALUES
        ('2021-11-30'::date, 'investment', 3631333::numeric, 'Инвестиции 2021-11'),
        ('2021-12-31', 'investment', 1350000, 'Инвестиции 2021-12'),
        ('2022-02-28', 'investment', 4519167, 'Инвестиции 2022-02'),
        ('2022-03-31', 'investment', 3740000, 'Инвестиции 2022-03'),
        ('2022-04-30', 'investment', 1733333, 'Инвестиции 2022-04'),
        ('2022-05-31', 'investment', 3301667, 'Инвестиции 2022-05'),
        ('2022-06-30', 'investment', 2121718, 'Инвестиции 2022-06'),
        ('2022-07-31', 'investment', 394783, 'Инвестиции 2022-07'),
        ('2022-08-31', 'investment', 130413, 'Инвестиции 2022-08'),
        ('2022-09-30', 'dividend', 269110, 'Дивиденды 2022-09'),
        ('2022-10-31', 'investment', 124867, 'Инвестиции 2022-10'),
        ('2022-11-30', 'dividend', 2499412, 'Дивиденды 2022-11'),
        ('2022-12-31', 'investment', 133333, 'Инвестиции 2022-12'),
        ('2022-12-31', 'dividend', 2833333, 'Дивиденды 2022-12'),
        ('2023-01-31', 'dividend', 2500000, 'Дивиденды 2023-01'),
        ('2023-02-28', 'dividend', 3000000, 'Дивиденды 2023-02'),
        ('2023-03-31', 'dividend', 2500000, 'Дивиденды 2023-03'),
        ('2023-04-30', 'dividend', 2000000, 'Дивиденды 2023-04'),
        ('2023-05-31', 'dividend', 2000000, 'Дивиденды 2023-05'),
        ('2023-06-30', 'dividend', 1000000, 'Дивиденды 2023-06'),
        ('2023-08-31', 'dividend', 1500000, 'Дивиденды 2023-08'),
        ('2023-09-30', 'dividend', 2000000, 'Дивиденды 2023-09'),
        ('2023-10-31', 'dividend', 5000000, 'Дивиденды 2023-10'),
        ('2023-11-30', 'dividend', 2500000, 'Дивиденды 2023-11'),
        ('2023-12-31', 'dividend', 1533333, 'Дивиденды 2023-12'),
        ('2024-01-31', 'dividend', 1800000, 'Дивиденды 2024-01'),
        ('2024-02-29', 'dividend', 666667, 'Дивиденды 2024-02'),
        ('2024-03-31', 'dividend', 3000000, 'Дивиденды 2024-03'),
        ('2024-04-30', 'dividend', 2000000, 'Дивиденды 2024-04'),
        ('2024-05-31', 'dividend', 1500000, 'Дивиденды 2024-05'),
        ('2024-06-30', 'dividend', 500000, 'Дивиденды 2024-06'),
        ('2024-07-31', 'dividend', 2500000, 'Дивиденды 2024-07'),
        ('2024-08-31', 'dividend', 1500000, 'Дивиденды 2024-08'),
        ('2024-09-30', 'dividend', 1500000, 'Дивиденды 2024-09'),
        ('2024-10-31', 'dividend', 3000000, 'Дивиденды 2024-10'),
        ('2024-11-30', 'dividend', 3000000, 'Дивиденды 2024-11'),
        ('2024-12-31', 'dividend', 2500000, 'Дивиденды 2024-12'),
        ('2025-01-31', 'dividend', 3000000, 'Дивиденды 2025-01'),
        ('2025-02-28', 'dividend', 1500000, 'Дивиденды 2025-02'),
        ('2025-03-31', 'dividend', 2000000, 'Дивиденды 2025-03'),
        ('2025-04-30', 'dividend', 2000000, 'Дивиденды 2025-04'),
        ('2025-05-31', 'dividend', 1500000, 'Дивиденды 2025-05'),
        ('2025-06-30', 'dividend', 2000000, 'Дивиденды 2025-06'),
        ('2025-07-31', 'dividend', 2500000, 'Дивиденды 2025-07'),
        ('2025-08-31', 'dividend', 1000000, 'Дивиденды 2025-08')
      ) AS t(transaction_date, type, amount, notes)
    LOOP
      INSERT INTO public.investor_transactions (investor_id, transaction_date, type, amount, notes)
      VALUES (inv_id, tx.transaction_date, tx.type, tx.amount, tx.notes);
    END LOOP;
  END LOOP;
END $$;

-- PART 2: Индивидуальные транзакции
DO $$
BEGIN
  INSERT INTO public.investor_transactions (investor_id, transaction_date, type, amount, notes)
  VALUES
    (2, '2025-09-08', 'dividend', 1000000, 'Дивиденды — последние перед выходом'),
    (1, '2025-09-08', 'dividend', 1000000, 'Дивиденды 2025-09-08'),
    (3, '2025-09-08', 'dividend', 1000000, 'Дивиденды 2025-09-08'),
    (2, '2025-09-15', 'share_sale', 25000000, 'Продажа доли 33.33% → Әділет'),
    (4, '2025-09-15', 'share_purchase', 25000000, 'Покупка доли 33.33% у Алмаса');
END $$;

-- PART 3: Общие транзакции для инвесторов 1, 3, 4
DO $$
DECLARE
  inv_id INTEGER;
  tx RECORD;
BEGIN
  FOR inv_id IN SELECT unnest(ARRAY[1, 3, 4]) LOOP
    FOR tx IN
      SELECT * FROM (VALUES
        ('2025-09-23'::date, 'dividend', 1000000::numeric, 'Дивиденды'),
        ('2025-10-16', 'dividend', 2000000, 'Дивиденды'),
        ('2025-10-25', 'dividend', 1000000, 'Дивиденды'),
        ('2025-10-30', 'dividend', 1000000, 'Дивиденды'),
        ('2025-11-25', 'dividend', 500000, 'Дивиденды'),
        ('2025-12-03', 'dividend', 500000, 'Дивиденды'),
        ('2025-12-17', 'dividend', 500000, 'Дивиденды'),
        ('2026-01-05', 'dividend', 630000, 'Дивиденды'),
        ('2026-01-07', 'dividend', 500000, 'Дивиденды'),
        ('2026-01-08', 'dividend', 500000, 'Дивиденды'),
        ('2026-03-31', 'dividend', 500000, 'Дивиденды')
      ) AS t(transaction_date, type, amount, notes)
    LOOP
      INSERT INTO public.investor_transactions (investor_id, transaction_date, type, amount, notes)
      VALUES (inv_id, tx.transaction_date, tx.type, tx.amount, tx.notes);
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- 7. Permissions для роли Учредитель (role_id = 2)
-- ============================================================
INSERT INTO public.permissions (role_id, permission_key) VALUES
  (2, 'investments.view'),
  (2, 'investments.edit'),
  (2, 'investments.manage');

-- ============================================================
-- 8. Сброс последовательностей
-- ============================================================
SELECT setval('public.investors_id_seq', 4);
