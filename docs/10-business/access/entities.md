---
title: Сущности домена access
summary: пользователь (active/inactive), роль, право, настройка
read_when: меняешь поля пользователей, ролей или настроек
domain: access
status: inferred
updated: 2026-09-04
---

# Сущности

## Пользователь (`app_users`)
`username` (уникален), `password_hash` (открытый пароль), `full_name`, `role_id`, `is_active`, `last_login`. Состояния: active ↔ inactive (админ).

## Роль (`roles`) и право (`permissions`)
Роль: `name` (уникально), `is_system`. Право: `role_id`, `permission_key`, `allowed`; одна строка на роль и ключ.

## Настройка (`settings`)
`key` PK, `value` JSONB, `updated_at`. Ключи — BR-ACS-007.
