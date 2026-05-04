# Настройка рантайма

Agent Teams - coordination layer. Model work выполняется через локальные runtimes и providers.

## Поддерживаемые пути

| Путь | Когда использовать |
| --- | --- |
| Claude | Если вы уже используете Claude Code или Anthropic access |
| Codex | Для Codex-native workflows и OpenAI access |
| OpenCode | Для multimodel routing и широкой provider coverage |

Приложение по возможности определяет доступные runtimes и ведёт настройку через UI.

## Provider access

У Agent Teams нет своего платного тарифа. Вы используете доступ к провайдеру, который у вас уже есть: subscription, local runtime auth или API keys в зависимости от выбранного пути.

## Multimodel mode

Multimodel mode может направлять работу через разные provider backends в OpenCode-compatible конфигурации. Используйте его, когда нужна гибкость провайдеров или разные model lanes для teammates.

## Практические советы

- Первый runtime setup держите простым.
- Подтвердите запуск одной команды до добавления многих providers.
- Auth, model names и PATH issues считайте setup-проблемами, а не проблемами team prompt.
- Если запуск завис, сначала откройте диагностику.

## Когда менять runtime path

Меняйте путь, когда текущий упирается в availability модели, rate limits, provider capabilities или роли команды. После смены проверьте одну маленькую задачу.

