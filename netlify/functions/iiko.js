// Прокси к iiko. Учётные данные живут только здесь, в переменных окружения
// Netlify, и во фронтенд не попадают.
//
// Поддерживаются два интерфейса iiko — режим выбирается по заданным переменным:
//
// 1) iikoServer API (он же resto). Нужны:
//      IIKO_SERVER_URL  — https://xxxxx-co.iiko.it (без /resto)
//      IIKO_LOGIN       — логин пользователя с правами API
//      IIKO_PASSWORD    — пароль (SHA1 посчитаем сами)
//      или IIKO_PASS_SHA1 — уже посчитанный SHA1 пароля
//
// 2) iikoCloud (Transport API). Нужна:
//      IIKO_API_LOGIN   — apiLogin из личного кабинета
//
// Общие необязательные:
//      IIKO_PROXY_KEY   — общий секрет: если задан, запрос без заголовка
//                         x-proxy-key отклоняется
//
// Важно про iikoServer: каждая авторизация занимает слот лицензии, поэтому
// на каждый запрос делаем auth → вызов → logout. Иначе слоты кончатся.

import { createHash } from 'node:crypto'

const SERVER_ACTIONS = {
  olap: { method: 'POST', path: '/resto/api/v2/reports/olap' },
  olap_columns: { method: 'GET', path: '/resto/api/v2/reports/olap/columns' },
  departments: { method: 'GET', path: '/resto/api/corporation/departments' },
  terminals: { method: 'GET', path: '/resto/api/corporation/terminals' },
}

const CLOUD_ACTIONS = {
  organizations: '/api/1/organizations',
  terminal_groups: '/api/1/terminal_groups',
  olap: '/api/2/reports/olap',
  olap_columns: '/api/2/reports/olap/columns',
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})

const passHash = () => process.env.IIKO_PASS_SHA1
  || (process.env.IIKO_PASSWORD ? createHash('sha1').update(process.env.IIKO_PASSWORD).digest('hex') : null)

// --- iikoServer (resto) --------------------------------------------------

async function callServer(action, payload) {
  const base = String(process.env.IIKO_SERVER_URL).replace(/\/+$/, '')
  const login = process.env.IIKO_LOGIN
  const pass = passHash()
  if (!login || !pass) throw new Error('Заданы не все переменные: нужны IIKO_LOGIN и IIKO_PASSWORD (или IIKO_PASS_SHA1)')

  const authRes = await fetch(`${base}/resto/api/auth?login=${encodeURIComponent(login)}&pass=${encodeURIComponent(pass)}`)
  const token = (await authRes.text()).trim()
  if (!authRes.ok || !token || token.includes('<')) {
    throw new Error(`Авторизация iiko не прошла (${authRes.status}): ${token.slice(0, 200)}`)
  }

  try {
    const spec = SERVER_ACTIONS[action]
    const url = new URL(base + spec.path)
    url.searchParams.set('key', token)
    for (const [k, val] of Object.entries(payload?.query || {})) {
      if (val != null) url.searchParams.set(k, String(val))
    }
    const res = await fetch(url, spec.method === 'GET' ? {} : {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload?.body ?? {}),
    })
    const text = await res.text()
    return { ok: res.ok, status: res.status, text }
  } finally {
    // слот лицензии освобождаем всегда, даже если запрос упал
    try { await fetch(`${base}/resto/api/logout?key=${encodeURIComponent(token)}`) } catch { /* не критично */ }
  }
}

// --- iikoCloud (Transport API) -------------------------------------------

let cloudToken = { value: null, expiresAt: 0 }

async function cloudAuth(apiLogin, host) {
  if (cloudToken.value && Date.now() < cloudToken.expiresAt) return cloudToken.value
  const res = await fetch(`${host}/api/1/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiLogin }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.token) throw new Error(`iiko access_token ${res.status}: ${JSON.stringify(data).slice(0, 200)}`)
  cloudToken = { value: data.token, expiresAt: Date.now() + 55 * 60 * 1000 }
  return data.token
}

async function callCloud(action, payload) {
  const host = process.env.IIKO_API_HOST || 'https://api-ru.iiko.services'
  const path = CLOUD_ACTIONS[action]
  let token = await cloudAuth(process.env.IIKO_API_LOGIN, host)
  const send = () => fetch(`${host}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(payload?.body ?? {}),
  })
  let res = await send()
  if (res.status === 401) {
    cloudToken = { value: null, expiresAt: 0 }
    token = await cloudAuth(process.env.IIKO_API_LOGIN, host)
    res = await send()
  }
  return { ok: res.ok, status: res.status, text: await res.text() }
}

// --- обработчик -----------------------------------------------------------

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (req.method !== 'POST') return json(405, { error: 'Только POST' })

  const isServer = !!process.env.IIKO_SERVER_URL
  const isCloud = !isServer && !!process.env.IIKO_API_LOGIN
  if (!isServer && !isCloud) {
    return json(500, { error: 'iiko не настроен: задайте IIKO_SERVER_URL + IIKO_LOGIN + IIKO_PASSWORD (iikoServer) или IIKO_API_LOGIN (iikoCloud)' })
  }

  const proxyKey = process.env.IIKO_PROXY_KEY
  if (proxyKey && req.headers.get('x-proxy-key') !== proxyKey) {
    return json(401, { error: 'Неверный ключ доступа к прокси' })
  }

  let payload
  try { payload = await req.json() } catch { return json(400, { error: 'Тело запроса не JSON' }) }

  const allowed = isServer ? SERVER_ACTIONS : CLOUD_ACTIONS
  if (!allowed[payload?.action]) {
    return json(400, { error: `Неизвестное действие. Доступны: ${Object.keys(allowed).join(', ')}` })
  }

  try {
    const { ok, status, text } = isServer
      ? await callServer(payload.action, payload)
      : await callCloud(payload.action, payload)
    if (!ok) return json(status, { error: `iiko ${payload.action} ${status}`, details: text.slice(0, 500) })
    return new Response(text, {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  } catch (err) {
    return json(502, { error: String(err.message || err) })
  }
}

export const config = { path: '/api/iiko' }
