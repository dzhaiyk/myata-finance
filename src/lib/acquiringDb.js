// Операции эквайринга в базе: разбор файла, сохранение без дублей, чтение
// за период и сверка с безналом смен (TASK-048, BR-CTL-019).
import { fetchAll } from './fetchAll'
import { getCutoffHour } from './dates'
import { parseKaspiAcquiring, parseHalykPos, reconcileAcquiring } from './acquiring'

/**
 * Разбирает файл выписки эквайринга. Тип определяется расширением:
 * Kaspi отдаёт xlsx, Halyk по POS-договору — pdf.
 * @returns {Promise<{ops: object[], merchant: string|null, issues: string[], acquirer: string}>}
 */
export async function parseAcquiringFile({ name, data }) {
  const cutoffHour = getCutoffHour()
  if (/\.pdf$/i.test(name || '')) {
    const { extractPdfText } = await import('./pdfText.js')
    const { pages } = await extractPdfText(data)
    const res = parseHalykPos(pages, { cutoffHour })
    return { ...res, acquirer: 'halyk_pos' }
  }
  const XLSX = await import('xlsx')
  const wb = XLSX.read(data)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
  const res = parseKaspiAcquiring(rows, { cutoffHour })
  return { ...res, acquirer: 'kaspi' }
}

/**
 * Сохраняет операции. Повторная загрузка того же файла ничего не портит:
 * ключ (эквайрер, номер операции) уникален, дубли пропускаются.
 * @returns {Promise<{saved: number, error: object|null}>}
 */
export async function saveAcquiringOps(ops, { sourceFile } = {}) {
  if (!ops?.length) return { saved: 0, error: null }
  const { supabase } = await import('./supabase')
  const rows = ops.map(o => ({
    acquirer: o.acquirer, merchant: o.merchant || null, op_type: o.op_type || null,
    operation_no: o.operation_no, operated_on: o.operated_on, operated_at: o.operated_at || null,
    business_date: o.business_date, amount: o.amount, fee: o.fee || 0,
    pay_method: o.pay_method || null, channel: o.channel || null, terminal: o.terminal || null,
    source_file: sourceFile || null,
  }))
  let saved = 0
  // порциями: выписка за полгода — это тысячи строк
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await supabase.from('acquiring_operations')
      .upsert(chunk, { onConflict: 'acquirer,operation_no', ignoreDuplicates: true })
    if (error) return { saved, error }
    saved += chunk.length
  }
  return { saved, error: null }
}

/** Операции за период по операционным дням. */
export async function loadAcquiringOps(from, to) {
  const { supabase } = await import('./supabase')
  return fetchAll(() => supabase.from('acquiring_operations')
    .select('business_date, amount, acquirer')
    .gte('business_date', from).lte('business_date', to).order('id'))
}

/** Сколько операций уже загружено и за какой период — для карточки загрузки. */
export async function acquiringCoverage() {
  const { supabase } = await import('./supabase')
  const { data } = await supabase.from('acquiring_operations')
    .select('business_date').order('business_date', { ascending: true }).limit(1)
  const { data: last } = await supabase.from('acquiring_operations')
    .select('business_date').order('business_date', { ascending: false }).limit(1)
  const { count } = await supabase.from('acquiring_operations')
    .select('id', { count: 'exact', head: true })
  return { from: data?.[0]?.business_date || null, to: last?.[0]?.business_date || null, count: count || 0 }
}

/** Сверка безнала смен с эквайрингом за период. */
export async function acquiringCheck({ reports, from, to, threshold }) {
  const ops = await loadAcquiringOps(from, to)
  return { ...reconcileAcquiring({ reports, ops, threshold }), loaded: ops.length }
}
