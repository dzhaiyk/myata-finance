---
title: Права домена access
summary: пользователи users.view/manage, роли roles.view/manage, настройки settings.view/edit
read_when: меняешь доступ к администрированию
domain: access
status: inferred
updated: 2026-09-04
---

| Действие | Ключ | Админ | Остальные роли |
|---|---|---|---|
| Страница «Пользователи» | `users.view` | ✔ | по настройке |
| Создать / изменить / деактивировать пользователя | `users.manage` | ✔ | по настройке |
| Страница «Роли», матрица прав | `roles.view` / `roles.manage` | ✔ | по настройке |
| Настройки (Telegram, час отсечки) | `settings.view` (меню), `settings.edit` (сохранение — не проверяется) | ✔ | по настройке |
