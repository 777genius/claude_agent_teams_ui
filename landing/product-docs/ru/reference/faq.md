# FAQ

## Agent Teams бесплатный?

Да. Приложение бесплатное и open source. Provider или runtime access может стоить денег в зависимости от выбранного пути.

## Нужно ли заранее ставить Claude или Codex?

Не всегда. Приложение ведёт runtime detection и setup через UI. Некоторые пути всё равно требуют внешнюю авторизацию runtime.

## Приложение загружает мой код на серверы Agent Teams?

Нет. Agent Teams не является cloud code-sync сервисом. Но provider-backed model calls могут получать prompt context в зависимости от выбранного runtime.

## Агенты могут общаться друг с другом?

Да. Агенты могут писать teammates, комментировать tasks и координироваться между teams.

## Можно ревьюить код перед принятием?

Да. Review flow построен вокруг task-scoped diffs и hunk-level decisions.

## Что такое solo mode?

Solo mode - команда из одного агента. Подходит для небольших задач и меньшего coordination overhead.

## Что делать, если launch завис?

Откройте диагностику, соберите runtime logs и проверьте provider auth до изменения prompts.
