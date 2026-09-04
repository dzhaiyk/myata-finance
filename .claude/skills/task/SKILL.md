---
description: Оформить задачу — собрать контекст, задать вопросы по бизнес-логике, составить план. Код не писать.
disable-model-invocation: true
argument-hint: [описание задачи или TASK-id]
---
Задача: $ARGUMENTS

1. Классифицируй: bug | feature | process-change | refactor | question. Извлеки цель, домены, out-of-scope; чего нет — спроси в одном пакете с п.3.
2. Прочитай docs/INDEX.md, выбери документы по доменам задачи, прочитай только их (нужные секции).
3. Проверь правила: все затронутые BR со статусом CONFIRMED? Нет правила / INFERRED / ASSUMED / противоречие → вопросы по формату из CLAUDE.md, пакетом ≤7. Ответы запиши в rules.md / process.md со статусом CONFIRMED и датой.
4. Создай tasks/active/TASK-NNN-<slug>.md по docs/_templates/task.md (NNN — следующий свободный номер по BACKLOG и done/). Для feature с новой возможностью — также FEAT-NNN по шаблону.
5. Покажи план и критерии приёмки. Жди «ок». Код до «ок» не пиши.
