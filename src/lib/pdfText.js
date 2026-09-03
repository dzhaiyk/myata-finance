// Извлечение позиционированного текста из PDF без внешних зависимостей.
// Работает и в браузере, и в Node 18+ (DecompressionStream есть в обоих).
// Поддерживает то, что реально встречается в банковских выписках:
// FlateDecode-потоки, простые шрифты (WinAnsi) и Type0/Identity-H с ToUnicode.

const latin1 = (buf) => {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  return s
}

const toBytes = (str) => {
  const out = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff
  return out
}

async function inflate(str) {
  const data = toBytes(str)
  for (const format of ['deflate', 'deflate-raw']) {
    try {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream(format))
      return latin1(await new Response(stream).arrayBuffer())
    } catch { /* пробуем следующий формат */ }
  }
  return null
}

// --- объекты PDF ---------------------------------------------------------

function parseObjects(src) {
  const objs = new Map()
  const re = /(\d+)\s+0\s+obj\b/g
  let m
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length
    const end = src.indexOf('endobj', start)
    if (end < 0) continue
    objs.set(Number(m[1]), src.slice(start, end))
  }
  return objs
}

async function streamOf(objs, num) {
  const body = objs.get(num)
  if (!body) return null
  const m = /stream\r?\n/.exec(body)
  if (!m) return null
  const dict = body.slice(0, m.index)
  const start = m.index + m[0].length
  // /Length задаёт точный размер: DecompressionStream не терпит хвостовых байтов
  const lenMatch = /\/Length\s+(\d+)(?!\s+0\s+R)/.exec(dict)
  const end = lenMatch ? start + Number(lenMatch[1]) : body.lastIndexOf('endstream')
  let raw = body.slice(start, Math.min(end, body.lastIndexOf('endstream')))
  if (!lenMatch) raw = raw.replace(/[\r\n]+$/, '')
  if (/\/FlateDecode/.test(dict)) return await inflate(raw)
  return raw
}

const refIn = (dict, key) => {
  const m = new RegExp(`/${key}\\s+(\\d+)\\s+0\\s+R`).exec(dict)
  return m ? Number(m[1]) : null
}

// Вырезает значение-словарь по ключу с учётом вложенных << >>
function dictValue(src, key) {
  const at = src.indexOf(`/${key}`)
  if (at < 0) return ''
  let i = at + key.length + 1
  while (i < src.length && /\s/.test(src[i])) i++
  if (src[i] !== '<' || src[i + 1] !== '<') return ''
  let depth = 0, start = i
  while (i < src.length) {
    if (src[i] === '<' && src[i + 1] === '<') { depth++; i += 2; continue }
    if (src[i] === '>' && src[i + 1] === '>') { depth--; i += 2; if (!depth) return src.slice(start, i) ; continue }
    i++
  }
  return src.slice(start)
}

// --- ToUnicode CMap ------------------------------------------------------

const hexToStr = (hex) => {
  let out = ''
  for (let i = 0; i + 3 < hex.length + 1; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16))
  return out
}

function parseCMap(cmap) {
  const map = new Map()
  let codeBytes = 1
  const cs = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(cmap)
  if (cs) {
    const first = /<([0-9a-fA-F]+)>/.exec(cs[1])
    if (first) codeBytes = Math.max(1, Math.round(first[1].length / 2))
  }
  const charRe = /beginbfchar([\s\S]*?)endbfchar/g
  let block
  while ((block = charRe.exec(cmap))) {
    const pairRe = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g
    let p
    while ((p = pairRe.exec(block[1]))) map.set(parseInt(p[1], 16), hexToStr(p[2]))
  }
  const rangeRe = /beginbfrange([\s\S]*?)endbfrange/g
  while ((block = rangeRe.exec(cmap))) {
    const rowRe = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([\s\S]*?)\])/g
    let r
    while ((r = rowRe.exec(block[1]))) {
      const lo = parseInt(r[1], 16), hi = parseInt(r[2], 16)
      if (r[3] != null) {
        const base = parseInt(r[3], 16)
        const tail = r[3].length > 4 ? hexToStr(r[3]).slice(0, -1) : ''
        for (let c = lo; c <= hi && c - lo < 65536; c++) map.set(c, tail + String.fromCharCode(base + (c - lo)))
      } else {
        const items = r[4].match(/<([0-9a-fA-F]+)>/g) || []
        items.forEach((it, i) => map.set(lo + i, hexToStr(it.slice(1, -1))))
      }
    }
  }
  return { map, codeBytes }
}

// WinAnsi отличается от latin1 только в диапазоне 0x80–0x9f; для выписок хватает.
const WIN_ANSI_HIGH = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰',
  0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•',
  0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
}

async function buildFontMap(objs, resourcesDict) {
  const fonts = new Map()
  let fontDict = dictValue(resourcesDict || '', 'Font')
  if (!fontDict) {
    const ref = refIn(resourcesDict || '', 'Font')
    if (ref != null) fontDict = objs.get(ref) || ''
  }
  if (!fontDict) return fonts
  const re = /\/(\w+)\s+(\d+)\s+0\s+R/g
  let m
  while ((m = re.exec(fontDict))) {
    const dict = objs.get(Number(m[2])) || ''
    const tuRef = refIn(dict, 'ToUnicode')
    if (tuRef != null) {
      const cmap = await streamOf(objs, tuRef)
      fonts.set(m[1], cmap ? parseCMap(cmap) : { map: new Map(), codeBytes: 2 })
    } else {
      fonts.set(m[1], { map: null, codeBytes: 1 })
    }
  }
  return fonts
}

const decodeWith = (font, bytes) => {
  if (!font || !font.map) {
    let out = ''
    for (const b of bytes) out += WIN_ANSI_HIGH[b] || String.fromCharCode(b)
    return out
  }
  const step = font.codeBytes
  let out = ''
  for (let i = 0; i + step <= bytes.length; i += step) {
    let code = 0
    for (let k = 0; k < step; k++) code = (code << 8) | bytes[i + k]
    out += font.map.get(code) ?? ''
  }
  return out
}

// --- разбор content stream ----------------------------------------------

function tokenize(content) {
  const tokens = []
  let i = 0
  while (i < content.length) {
    const ch = content[i]
    if (ch === '%') { while (i < content.length && content[i] !== '\n') i++; continue }
    if (/\s/.test(ch)) { i++; continue }
    if (ch === '(') {
      let depth = 1, j = i + 1, bytes = []
      while (j < content.length && depth > 0) {
        const c = content[j]
        if (c === '\\') {
          const n = content[j + 1]
          const oct = /^[0-7]{1,3}/.exec(content.slice(j + 1, j + 4))
          if (oct) { bytes.push(parseInt(oct[0], 8) & 0xff); j += 1 + oct[0].length; continue }
          const esc = { n: 10, r: 13, t: 9, b: 8, f: 12 }[n]
          bytes.push(esc != null ? esc : n.charCodeAt(0) & 0xff)
          j += 2; continue
        }
        if (c === '(') depth++
        if (c === ')') { depth--; if (!depth) { j++; break } }
        bytes.push(c.charCodeAt(0) & 0xff)
        j++
      }
      tokens.push({ t: 'str', v: bytes }); i = j; continue
    }
    if (ch === '<' && content[i + 1] !== '<') {
      const end = content.indexOf('>', i)
      const hex = content.slice(i + 1, end).replace(/\s/g, '')
      const bytes = []
      for (let k = 0; k + 1 < hex.length + 1; k += 2) bytes.push(parseInt((hex.slice(k, k + 2) + '0').slice(0, 2), 16))
      tokens.push({ t: 'str', v: bytes }); i = end + 1; continue
    }
    if (ch === '<' || ch === '>') { i += 2; continue }
    if (ch === '[' || ch === ']') { tokens.push({ t: ch }); i++; continue }
    if (ch === '/') {
      const m = /^\/([^\s/[\]()<>]*)/.exec(content.slice(i))
      tokens.push({ t: 'name', v: m[1] }); i += m[0].length; continue
    }
    const num = /^[-+]?[\d.]+/.exec(content.slice(i))
    if (num) { tokens.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue }
    const op = /^[A-Za-z'"*]+[01]?/.exec(content.slice(i))
    if (op) { tokens.push({ t: 'op', v: op[0] }); i += op[0].length; continue }
    i++
  }
  return tokens
}

// Умножение матриц [a b c d e f]
const mul = (m, n) => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
]

function runContent(content, fonts) {
  const items = []
  const tokens = tokenize(content)
  let ctm = [1, 0, 0, 1, 0, 0], tm = null, tlm = null, leading = 0, font = null, fontKey = null, size = 10
  const stack = []
  const ctmStack = []
  const emit = (bytes) => {
    if (!tm) return
    const text = decodeWith(font, bytes)
    if (!text.trim()) return
    const m = mul(tm, ctm)
    items.push({ x: Math.round(m[4] * 100) / 100, y: Math.round(m[5] * 100) / 100, text, font: fontKey, size })
  }
  for (const tk of tokens) {
    if (tk.t !== 'op') { stack.push(tk); continue }
    const nums = stack.filter(s => s.t === 'num').map(s => s.v)
    const strs = stack.filter(s => s.t === 'str').map(s => s.v)
    const names = stack.filter(s => s.t === 'name').map(s => s.v)
    switch (tk.v) {
      case 'q': ctmStack.push(ctm); break
      case 'Q': ctm = ctmStack.pop() || [1, 0, 0, 1, 0, 0]; break
      case 'cm': if (nums.length >= 6) ctm = mul(nums.slice(-6), ctm); break
      case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = tm; break
      case 'ET': tm = null; tlm = null; break
      case 'Tf': if (names.length) { fontKey = names[names.length - 1]; font = fonts.get(fontKey) }
        if (nums.length) size = nums[nums.length - 1]; break
      case 'Tm': if (nums.length >= 6) { tm = nums.slice(-6); tlm = tm } break
      case 'TL': if (nums.length) leading = nums[nums.length - 1]; break
      case 'TD': if (nums.length >= 2) leading = -nums[nums.length - 1] // fallthrough
      // eslint-disable-next-line no-fallthrough
      case 'Td': if (nums.length >= 2 && tlm) { tlm = mul([1, 0, 0, 1, nums[nums.length - 2], nums[nums.length - 1]], tlm); tm = tlm } break
      case 'T*': if (tlm) { tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm } break
      case 'Tj': if (strs.length) emit(strs[strs.length - 1]); break
      case "'": if (tlm) { tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm } if (strs.length) emit(strs[strs.length - 1]); break
      case '"': if (tlm) { tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm } if (strs.length) emit(strs[strs.length - 1]); break
      case 'TJ': {
        const merged = []
        for (const s of stack) {
          if (s.t === 'str') merged.push(...s.v)
          else if (s.t === 'num' && s.v < -150) merged.push(32)
        }
        if (merged.length) emit(merged)
        break
      }
      default: break
    }
    stack.length = 0
  }
  return items
}

/**
 * Извлекает текст с координатами постранично.
 * @param {ArrayBuffer|Uint8Array} data содержимое PDF
 * @returns {Promise<{pages: Array<{items: Array<{x:number,y:number,text:string}>}>}>}
 */
export async function extractPdfText(data) {
  const src = latin1(data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data)
  const objs = parseObjects(src)
  const pages = []
  for (const [, body] of objs) {
    if (!/\/Type\s*\/Page[^s]/.test(body)) continue
    let resourcesDict = dictValue(body, 'Resources')
    const resRef = refIn(body, 'Resources')
    if (resRef != null) resourcesDict = objs.get(resRef) || resourcesDict
    const fonts = await buildFontMap(objs, resourcesDict)
    const contentRefs = []
    const single = refIn(body, 'Contents')
    if (single != null) contentRefs.push(single)
    const arr = /\/Contents\s*\[([^\]]*)\]/.exec(body)
    if (arr) for (const r of arr[1].matchAll(/(\d+)\s+0\s+R/g)) contentRefs.push(Number(r[1]))
    let items = []
    for (const ref of contentRefs) {
      const content = await streamOf(objs, ref)
      if (content) items = items.concat(runContent(content, fonts))
    }
    pages.push({ items })
  }
  return { pages }
}

/**
 * Собирает элементы страницы в строки: группировка по Y, сортировка по X.
 * @returns {Array<{y:number, items:Array}>}
 */
export function itemsToLines(items, tolerance = 2) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines = []
  for (const it of sorted) {
    const line = lines.find(l => Math.abs(l.y - it.y) <= tolerance)
    if (line) line.items.push(it)
    else lines.push({ y: it.y, items: [it] })
  }
  lines.forEach(l => l.items.sort((a, b) => a.x - b.x))
  return lines
}
