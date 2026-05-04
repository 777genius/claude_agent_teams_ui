# Провайдеры и рантаймы

Agent Teams отделяет orchestration от model access.

## Что даёт приложение

Agent Teams даёт:

- orchestration команд и задач
- kanban board UI
- teammate messaging
- task logs
- review UI
- local project integration

## Что даёт runtime

Runtime отвечает за:

- model execution
- provider authentication
- tool execution behavior
- rate limits и capabilities конкретной модели

## Частые варианты

| Runtime | Заметки |
| --- | --- |
| Claude | Хорошо для Claude Code users и Anthropic access |
| Codex | Хорошо для Codex-native workflows и OpenAI access |
| OpenCode | Хорошо для multimodel routing и широкой provider coverage |

## Стоимость providers

Agent Teams бесплатен. Стоимость provider usage зависит от выбранного runtime/provider.

## Capability checks

Во время setup приложение может выполнять access и capability checks. Это помогает найти отсутствующую авторизацию до того, как team launch застрянет в provisioning.

