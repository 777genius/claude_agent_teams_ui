# Features

This directory contains the canonical home for medium and large feature slices.

Before creating or refactoring a feature, read:
- [Feature Architecture Standard](../../docs/FEATURE_ARCHITECTURE_STANDARD.md)
- [Feature-local agent guidance](./CLAUDE.md)

Reference implementation:
- `src/features/recent-projects`
- `src/features/agent-graph`

Use `src/features/<feature-name>/` by default when the work introduces:
- a new use case or business policy
- transport wiring
- more than one process boundary
- more than one adapter or provider

Do not duplicate architecture rules in feature folders.
Keep the standard centralized in [../../docs/FEATURE_ARCHITECTURE_STANDARD.md](../../docs/FEATURE_ARCHITECTURE_STANDARD.md).

Rule of thumb:
- `recent-projects` is the full slice example with process-aware outer layers
- `agent-graph` is the thin slice example built around `core/` plus `renderer/`
