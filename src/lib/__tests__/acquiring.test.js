import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isoFromDots, parseKaspiAcquiring, parseHalykPos, sumByBusinessDate, reconcileAcquiring,
} from '../acquiring.js'

// Формы строк повторяют настоящие выписки; суммы и номера вымышленные.
const KASPI = [
  [], [], [], [null, 'Детальная информация по операциям'], [],
  [null, 'Период:', '2026-01-01 00:00:00 - 2026-01-31 23:59:59'],
  [null, 'ИИН/БИН', '211140017093'],
  [null, 'Наименование', 'ТОО "RIM PARTNERS"'],
  [], [null, 'Продажи с Kaspi.kz', '100000.0'], [], [], [], [], [], [], [], [],
  [null, 'Адрес торговой точки', 'Дата', 'Время', 'Сумма', 'Стоимость услуг Kaspi', 'Тип операции', 'Способ оплаты', 'Канал оплаты', 'Номер операции'],
  [null, 'Алматы', '12.01.2026', '23:40:00', 30000, -285, 'Покупка', 'Kaspi Gold', 'Kaspi QR', '111'],
  [null, 'Алматы', '13.01.2026', '01:10:00', 50000, -475, 'Покупка', 'Карта другого банка', 'Kaspi POS', '222'],
  [null, 'Алматы', '13.01.2026', '12:00:00', 20000, -190, 'Покупка', 'Kaspi Gold', 'Kaspi QR', '333'],
  [null, 'Алматы', '16.01.2026', '15:18:00', -50000, 475, 'Возврат', 'Карта другого банка', 'Kaspi POS', '444'],
]

describe('BR-CTL-019 — выписки эквайринга', () => {
  it('дата из выписки читается, мусор — нет', () => {
    assert.equal(isoFromDots('13.01.2026'), '2026-01-13')
    assert.equal(isoFromDots('13.01.2026 01:10'), '2026-01-13')
    assert.equal(isoFromDots('Итого'), null)
    assert.equal(isoFromDots(null), null)
  })

  it('Kaspi: шапка, операции и операционный день по границе 06:00', () => {
    const r = parseKaspiAcquiring(KASPI, { cutoffHour: 6 })
    assert.equal(r.merchant, 'ТОО "RIM PARTNERS"')
    assert.equal(r.bin, '211140017093')
    assert.deepEqual(r.issues, [])
    assert.equal(r.ops.length, 4)
    // ночная операция 13-го в 01:10 относится к смене 12-го
    assert.equal(r.ops[1].business_date, '2026-01-12')
    assert.equal(r.ops[2].business_date, '2026-01-13')
    assert.equal(r.ops[3].amount, -50000)
    assert.equal(r.ops[0].channel, 'Kaspi QR')
  })

  it('файл не той выписки не притворяется разобранным', () => {
    const r = parseKaspiAcquiring([['Дата операции', 'Дебет', 'Кредит']], {})
    assert.equal(r.ops.length, 0)
    assert.equal(r.issues.length, 1)
  })

  it('суммы складываются по операционным дням', () => {
    const { ops } = parseKaspiAcquiring(KASPI, { cutoffHour: 6 })
    assert.deepEqual(sumByBusinessDate(ops), { '2026-01-12': 80000, '2026-01-13': 20000, '2026-01-16': -50000 })
  })

  it('Halyk POS: три строки на запись, дата берётся транзакционная, возврат не затирает оплату', () => {
    const page = { lines: [
      '18.06.2026 ИП AKHMETKALI Myata Platinum 4YOU 61672083 805944-15/06/26 Оплата 10000.0 9920.0 -80.0 451007 616777489454 400303...1907 Visa_Halyk CHIP',
    ] }
    // перед строкой сумм идёт дата транзакции, после — время
    const pages = [{ lines: ['16.06.2026 г. Алматы', page.lines[0], '16:14:48 B/N',
      '17.06.2026 г. Алматы',
      '18.06.2026 ИП AKHMETKALI Myata 61672083 805944-15/06/26 Возврат -10000.0 -9920.0 80.0 451007 616777489454 400303...1907 Visa_Halyk CHIP',
      '03:20:00 B/N'] }]
    const r = parseHalykPos(pages, { cutoffHour: 6 })
    assert.equal(r.ops.length, 2)
    assert.equal(r.ops[0].business_date, '2026-06-16')   // дата транзакции, не зачисления
    assert.equal(r.ops[0].terminal, '61672083')
    assert.equal(r.ops[1].business_date, '2026-06-16')   // возврат в 03:20 — смена предыдущего дня
    assert.notEqual(r.ops[0].operation_no, r.ops[1].operation_no)
    assert.equal(r.ops[1].op_type, 'Возврат')
  })

  it('сверка: недостача по карте — это и есть искомый фрод', () => {
    const reports = [
      { report_date: '2026-01-12', data: { revenue: [{ type: 'Наличные', amount: '110869' }, { type: 'Kaspi', amount: '1655131' }] } },
      { report_date: '2026-01-13', data: { revenue: [{ type: 'Наличные', amount: '292603' }, { type: 'Kaspi', amount: '727752' }] } },
    ]
    const ops = [
      { business_date: '2026-01-12', amount: 2050627 },
      { business_date: '2026-01-13', amount: 727752 },
    ]
    const res = reconcileAcquiring({ reports, ops, threshold: 10000 })
    assert.equal(res.ok, false)
    assert.equal(res.days[0].status, 'extra_money')     // эквайринг больше — чека нет
    assert.equal(res.days[0].diff, -395496)
    assert.equal(res.days[1].status, 'ok')
    assert.equal(res.worst.date, '2026-01-12')
    assert.equal(res.totals.flagged, 1)
  })

  it('сверка: безнал есть, денег нет — расхождение в другую сторону', () => {
    const reports = [{ report_date: '2026-05-01', data: { revenue: [{ type: 'Наличные', amount: '100' }, { type: 'Kaspi', amount: '500000' }] } }]
    const res = reconcileAcquiring({ reports, ops: [{ business_date: '2026-05-01', amount: 300000 }], threshold: 10000 })
    assert.equal(res.days[0].status, 'missing_money')
    assert.equal(res.days[0].diff, 200000)
  })

  it('день без отчёта не считается расхождением', () => {
    const res = reconcileAcquiring({ reports: [], ops: [{ business_date: '2026-05-02', amount: 1000 }], threshold: 10000 })
    assert.equal(res.days[0].status, 'no_report')
    assert.equal(res.ok, true)
  })
})
