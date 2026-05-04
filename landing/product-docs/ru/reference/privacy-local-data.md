# Приватность и локальные данные

Agent Teams local-first, но выбранный provider path всё равно важен.

## Что остаётся локально

Desktop app работает на вашей машине и читает локальные project/runtime data для UI:

- project files
- task metadata
- runtime/session logs
- review state
- local app settings

## Что может выйти с машины

Когда агент обращается к provider-backed model, prompt context и tool results могут отправляться через выбранный provider/runtime path. Это зависит от runtime и provider.

## Практические правила

- Не прикладывайте secrets к tasks.
- Проверяйте provider policies для sensitive projects.
- Используйте меньшую autonomy для risky repositories.
- Держите task scope узким при работе с private code.
- Для диагностики опирайтесь на local evidence и logs.

## Open source

Само приложение open source и бесплатное. В репозитории можно посмотреть, как устроены local orchestration, task tracking и review flows.

