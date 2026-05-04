# Runtime Setup

Agent Teams is a coordination layer. The actual model work runs through supported local runtimes and providers.

## Supported paths

| Path | Use when |
| --- | --- |
| Claude | You already use Claude Code or Anthropic-backed workflows |
| Codex | You want Codex-native runtime integration |
| OpenCode | You want multimodel routing and broad provider coverage |

The app detects supported runtimes and guides setup from the UI when possible.

## Provider access

Agent Teams has no paid tier of its own. You bring the provider access you already have: subscriptions, local runtime auth, or API keys depending on the path you choose.

## Multimodel mode

Multimodel mode can route work through many provider backends via OpenCode-compatible configuration. Use it when you need provider flexibility or want teammates to use different model lanes.

## Operational advice

- Keep the first runtime setup simple.
- Confirm one team can launch before adding many providers.
- Treat auth, provider model names, and runtime PATH issues as setup problems, not team-prompt problems.
- If launch hangs, check the troubleshooting page before changing code.

## When to switch runtime paths

Switch when the current path is blocked by model availability, rate limits, provider capabilities, or team role needs. Keep the same project and team workflow, but validate one small task after switching.

