// Доступ к маршрутам по тем же правам, что и пункты меню (BR-ACS-004, TASK-007).
// До этого маршрут проверял только вход: прямая ссылка /pnl открывалась без pnl.view.

/** Право, нужное для пути; null — путь не описан в меню (пропускаем). */
export function permForPath(nav, path) {
  const item = (nav || []).find(n => n.to && n.to === path)
  return item ? item.perm || null : null
}

/** Первый доступный путь меню или null, если ничего не разрешено. */
export function firstAllowedPath(nav, hasPermission) {
  const item = (nav || []).find(n => n.to && (!n.perm || hasPermission(n.perm)))
  return item ? item.to : null
}

/** Можно ли открыть путь: неописанный в меню путь — можно, описанный — по праву. */
export function canOpenPath(nav, path, hasPermission) {
  const perm = permForPath(nav, path)
  return perm ? hasPermission(perm) : true
}
