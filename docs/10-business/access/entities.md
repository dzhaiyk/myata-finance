---
title: Сущности домена access
summary: пользователь (active/inactive), роль, право, настройка
read_when: меняешь поля пользователей, ролей или настроек
domain: access
status: inferred
updated: 2026-09-06
---

# Сущности

## Пользователь (`app_users`)

Тема оформления: `theme` — `dark`, `light` или пусто (как в системе). Личная
настройка: планшет в зале общий, а выбор у каждого свой (ADR-0013, миграция 033).
`username` (уникален), `password_hash` (открытый пароль), `full_name`, `role_id`, `is_active`, `last_login`. Состояния: active ↔ inactive (админ).

## Роль (`roles`) и право (`permissions`)
Роль: `name` (уникально), `is_system`. Право: `role_id`, `permission_key`, `allowed`; одна строка на роль и ключ.

## Настройка (`settings`)
`key` PK, `value` JSONB, `updated_at`. Ключи — BR-ACS-007.
