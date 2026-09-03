// Прокси к iiko Cloud API. Ключ (apiLogin) живёт только здесь, в переменной
// окружения Netlify — во фронтенд он не попадает.
//
// Переменные окружения:
//   IIKO_API_LOGIN  — обязательный, apiLogin из личного кабинета iiko
//   IIKO_PROXY_KEY  — необязательный общий секрет: если задан, запрос без
//                     заголовка x-proxy-key будет отклонён
//   IIKO_API_HOST   — необязательный, по умолчанию https://api-ru.iiko.services
//
// Разрешены только перечисленные ниже эндпоинты: функция не должна быть
// открытым проксёром к произвольному API.

const HOST = process.env.IIKO_API_HOST || 'https://api-ru.iiko.services'

const ALLOWED = {
  organizations: '/api/1/organizations',
  terminal_groups: '/api/1/terminal_groups',
  olap: '/api/2/reports/olap',
  olap_columns: '/api/2/reports/olap/columns',
}

let cached = { token: null, expiresAt: 0 }

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})

async function getToken(apiLogin) {
  if (cached.token && Date.now() < cached.expiresAt) return cached.token
  const res = await fetch(`${HOST}/api/1/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiLogin }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`iiko access_token ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  if (!data.token) throw new Error('iiko access_token: в ответе нет token')
  // токен живёт час, обновляем за пять минут до конца
  cached = { token: data.token, expiresAt: Date.now() + 55 * 60 * 1000 }
  return cached.token
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (req.method !== 'POST') return json(405, { error: 'Только POST' })

  const apiLogin = process.env.IIKO_API_LOGIN
  if (!apiLogin) return json(500, { error: 'Не задана переменная окружения IIKO_API_LOGIN' })

  const proxyKey = process.env.IIKO_PROXY_KEY
  if (proxyKey && req.headers.get('x-proxy-key') !== proxyKey) {
    return json(401, { error: 'Неверный ключ доступа к прокси' })
  }

  let payload
  try { payload = await req.json() } catch { return json(400, { error: 'Тело запроса не JSON' }) }

  const path = ALLOWED[payload?.action]
  if (!path) return json(400, { error: `Неизвестное действие. Доступны: ${Object.keys(ALLOWED).join(', ')}` })

  try {
    let token = await getToken(apiLogin)
    const call = () => fetch(`${HOST}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(payload.body ?? {}),
    })
    let res = await call()
    if (res.status === 401) { // токен протух раньше срока — берём новый и повторяем один раз
      cached = { token: null, expiresAt: 0 }
      token = await getToken(apiLogin)
      res = await call()
    }
    const text = await res.text()
    if (!res.ok) return json(res.status, { error: `iiko ${path} ${res.status}`, details: text.slice(0, 500) })
    return new Response(text, {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  } catch (err) {
    return json(502, { error: String(err.message || err) })
  }
}

export const config = { path: '/api/iiko' }
