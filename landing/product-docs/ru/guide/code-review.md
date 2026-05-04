# Код-ревью

Code review в Agent Teams строится вокруг задачи. Вы смотрите изменения конкретной задачи, а не огромный неструктурированный diff.

## Review surface

Через review UI можно:

- смотреть changed files
- принимать или отклонять отдельные hunks
- оставлять comments
- связывать diff с task logs и агентом

## Hunk-level decisions

Принимайте маленькие правильные изменения и отклоняйте отдельные ошибки без удаления всей работы. Это полезно, когда агент в целом решил задачу, но переборщил в одном файле.

## Agent review workflow

Команды могут ревьюить работу друг друга до вашего финального решения. Это ловит очевидные регрессии, но risky areas всё равно стоит проверять вручную.

## Что проверять вручную

Приоритет:

- provider auth и runtime detection
- IPC, preload и filesystem boundaries
- Git и worktree behavior
- parsing и task lifecycle logic
- persistence и code review flows

## Verification

Лучше запускать focused verification commands. Broad formatting или lint-fix команды не стоит использовать, если задача явно не про форматирование.

