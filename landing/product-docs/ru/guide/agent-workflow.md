# Работа агентов

Agent Teams делает работу агентов видимой через task state, messages, logs и reviewable code changes.

## Lifecycle

| Этап | Что происходит |
| --- | --- |
| Provisioning | Приложение запускает команду и проверяет готовность runtime |
| Planning | Lead создаёт задачи и назначает teammates |
| In progress | Агенты работают параллельно и обновляют статус задач |
| Review | Изменения проверяют агенты или вы |
| Done | Принятая работа остаётся связанной с историей задачи |

## Канбан-доска

Доска - основной рабочий экран. Через неё удобно смотреть работу, находить blocked tasks, открывать task detail, читать logs и ревьюить changes без ручного чтения session files.

## Messages и comments

Direct messages подходят для перенаправления агента. Task comments лучше использовать, когда заметка относится к конкретной работе. Комментарии сохраняют контекст для review.

## Task logs

Task-specific logs изолируют runtime output, actions и messages по одному assignment. Они помогают понять:

- что агент запускал?
- почему он изменил этот файл?
- просил ли он помощи у teammate?
- какая задача породила diff?

## Live processes

Live process section показывает URLs и running processes, когда агенты поднимают локальные servers или tools. Открывайте URL прямо из приложения.

