# Quickstart

This guide gets you from a fresh install to a running team.

## 1. Install Agent Teams

Download the latest release for your platform from the landing page or GitHub releases.

::: tip
The app is free and open source. The agent runtime you choose may still require provider access, such as Claude, Codex, OpenCode, or API-key based providers.
:::

## 2. Open or create a project

Launch the app and select the project directory you want agents to work in. Agent Teams reads local project files and runtime/session state so the UI can show tasks, logs, diffs, and teammate activity.

## 3. Choose a runtime path

Use the setup flow to detect available runtimes. A common first setup is:

| Runtime | Good for |
| --- | --- |
| Claude | Claude Code users and existing Anthropic access |
| Codex | Codex-native workflows and OpenAI access |
| OpenCode | Multimodel teams and many provider backends |

## 4. Create your first team

Create a team with a lead and one or more specialists. Keep the first team small: one lead, one implementation agent, and one review-oriented agent is enough to validate the workflow.

## 5. Give the lead a concrete goal

Write the goal like you would brief an engineering lead:

```text
Improve the onboarding flow. Split the work into tasks, keep changes small, and ask for review before broad refactors.
```

The lead should create tasks, assign work, and coordinate teammates. You can watch progress on the kanban board and intervene with comments or direct messages.

## 6. Review results

Open completed or review-ready tasks, inspect the diff, and accept, reject, or comment on individual changes. Use task logs when you need to understand why an agent made a choice.

## Next steps

- [Create a team](/guide/create-team)
- [Runtime setup](/guide/runtime-setup)
- [Code review](/guide/code-review)

