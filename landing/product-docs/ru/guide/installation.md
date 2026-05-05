# Установка

Agent Teams распространяется как desktop-приложение для macOS, Windows и Linux.

## Готовые сборки

Берите последний GitHub release:

- macOS Apple Silicon: `.dmg`
- macOS Intel: `.dmg`
- Windows: `.exe`
- Linux: `.AppImage`, `.deb`, `.rpm` или `.pacman`

::: warning Windows SmartScreen
Новые open-source приложения могут вызывать SmartScreen. Если вы доверяете источнику релиза, выберите **More info**, затем **Run anyway**.
:::

## Требования

Пакетная сборка рассчитана на zero-setup onboarding. Приложение само помогает с runtime detection и provider authentication.

Для запуска из исходников:

| Инструмент | Версия |
| --- | --- |
| Node.js | 20+ |
| pnpm | 10+ |

## Запуск из исходников

<InstallBlock command="git clone https://github.com/777genius/claude_agent_teams_ui.git && cd claude_agent_teams_ui && pnpm install && pnpm dev" label="Скопировать" copied-label="Скопировано" />

```bash
git clone https://github.com/777genius/claude_agent_teams_ui.git
cd claude_agent_teams_ui
pnpm install
pnpm dev
```

Если нужна самая свежая локальная версия, используйте ветку репозитория, где сейчас идёт активная разработка.

## Обновления

Для packaged builds берите последний release. Для запуска из исходников подтяните нужную ветку и повторите install, если поменялись зависимости.

