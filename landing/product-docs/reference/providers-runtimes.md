# Providers and Runtimes

Agent Teams separates orchestration from model access.

## What the app provides

Agent Teams provides:

- team and task orchestration
- kanban board UI
- teammate messaging
- task logs
- review UI
- local project integration

## What the runtime provides

The runtime provides:

- model execution
- provider authentication
- tool execution behavior
- model-specific rate limits and capabilities

## Common choices

| Runtime | Notes |
| --- | --- |
| Claude | Good for Claude Code users and Anthropic access |
| Codex | Good for Codex-native workflows and OpenAI access |
| OpenCode | Good for multimodel routing and broad provider coverage |

## Provider costs

Agent Teams is free. Provider usage is governed by the runtime/provider you select.

## Capability checks

During setup, the app may perform access and capability checks. This helps detect missing runtime auth before a team launch fails halfway through provisioning.

