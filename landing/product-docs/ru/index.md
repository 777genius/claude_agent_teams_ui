---
layout: home
hero:
  name: Документация Agent Teams
  text: Запускайте команды AI-агентов из локального desktop-приложения
  tagline: Создавайте команды, наблюдайте за канбан-доской, ревьюйте изменения и координируйте Claude, Codex, OpenCode и multimodel workflows без потери локального контроля.
  actions:
    - theme: brand
      text: Быстрый старт
      link: /ru/guide/quickstart
    - theme: alt
      text: Установка
      link: /ru/guide/installation
    - theme: alt
      text: Концепции
      link: /ru/reference/concepts
features:
  - icon: "01"
    title: Командный workflow
    details: Опишите роли, запустите lead-агента и дайте команде разбивать, брать и координировать задачи.
    link: /ru/guide/create-team
    linkText: Создать команду
  - icon: "02"
    title: Живая канбан-доска
    details: Видно, как задачи проходят todo, progress, review, blocked и done во время работы агентов.
    link: /ru/guide/agent-workflow
    linkText: Разобрать workflow
  - icon: "03"
    title: Встроенное код-ревью
    details: Проверяйте diff по задаче, принимайте или отклоняйте hunks и оставляйте комментарии.
    link: /ru/guide/code-review
    linkText: Ревью изменений
  - icon: "04"
    title: Runtime-aware setup
    details: Используйте Claude, Codex, OpenCode или multimodel-провайдеры через доступ, который у вас уже есть.
    link: /ru/guide/runtime-setup
    linkText: Настроить рантаймы
  - icon: "05"
    title: Local-first контроль
    details: Приложение читает локальный проект и runtime-состояние. Код остаётся у вас, если выбранный провайдер не получает контекст для model call.
    link: /ru/reference/privacy-local-data
    linkText: Модель приватности
  - icon: "06"
    title: Диагностируемые команды
    details: Отслеживайте task logs, runtime output, сообщения агентов и live processes, когда запуск или задача застряли.
    link: /ru/guide/troubleshooting
    linkText: Диагностика
---

<InstallBlock label="Скопировать" copied-label="Скопировано" />

## С чего начать

Agent Teams - бесплатное desktop-приложение для оркестрации команд AI-агентов. Это не просто одиночные промпты одному агенту: вы создаёте команду, задаёте роли и смотрите, как агенты координируют работу через task board.

<DocsCardGrid />

## Справочник

Используйте справочник, когда нужны точные термины, поведение провайдеров или границы приватности.

<DocsCardGrid type="reference" />

## Превью продукта

<ZoomImage src="/screenshots/1.jpg" alt="Канбан-доска Agent Teams" caption="Статусы задач, активность агентов и review workflow видны в одном рабочем пространстве." />

