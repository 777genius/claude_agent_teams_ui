# Installation

Agent Teams is distributed as a desktop app for macOS, Windows, and Linux.

## Download builds

Use the latest GitHub release when you want the packaged app:

- macOS Apple Silicon: `.dmg`
- macOS Intel: `.dmg`
- Windows: `.exe`
- Linux: `.AppImage`, `.deb`, `.rpm`, or `.pacman`

::: warning Windows SmartScreen
Unsigned or newly published open-source apps can trigger SmartScreen. If you trust the release source, choose **More info** and then **Run anyway**.
:::

## Requirements

The packaged app is designed for zero-setup onboarding. It can guide runtime detection and provider authentication from the UI.

For source development, use:

| Tool | Version |
| --- | --- |
| Node.js | 20+ |
| pnpm | 10+ |

## Run from source

<InstallBlock command="git clone https://github.com/777genius/claude_agent_teams_ui.git && cd claude_agent_teams_ui && pnpm install && pnpm dev" />

```bash
git clone https://github.com/777genius/claude_agent_teams_ui.git
cd claude_agent_teams_ui
pnpm install
pnpm dev
```

If you want the freshest local version, use the repository branch that currently carries active development.

## Updating

Use the latest release for packaged builds. If you run from source, pull the branch you use and rerun install when dependencies change.

