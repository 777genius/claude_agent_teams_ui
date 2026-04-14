# Feature Architecture Standard

**Status**: team standard  
**Reference implementation**: `src/features/recent-projects`

This document defines the default architecture for medium and large features in this repository.

## Goals

- keep business rules isolated from Electron-specific runtime details
- make features easier to scale, test, and review
- keep renderer code closer to browser and Tauri portability
- enforce architecture with tooling, not only with code review comments

## Canonical Template

```text
src/features/<feature-name>/
  contracts/
  core/
    domain/
    application/
  main/
    composition/
    adapters/
      input/
      output/
    infrastructure/
  preload/
  renderer/
```

Use this template by default when a feature:

- spans more than one process boundary
- introduces its own use case or business policy
- needs its own transport bridge or integration surface
- is expected to grow with new providers, sources, or presentation flows

## Layer Responsibilities

### `contracts/`

Cross-process public API for the feature.

Allowed content:

- DTOs
- API fragment types
- IPC or route constants

Not allowed:

- store access
- Electron APIs
- business orchestration

### `core/domain/`

Pure business rules and invariants.

Examples:

- merge policies
- provider-agnostic models
- selection rules
- dedupe logic

Not allowed:

- infrastructure access
- framework access
- side effects

### `core/application/`

Use cases and ports.

Examples:

- orchestration flow
- output ports
- cache ports
- source ports
- response models

Not allowed:

- Electron, Fastify, React, Zustand, child processes

### `main/composition/`

Feature composition root in the main process.

Responsibilities:

- instantiate infrastructure
- wire adapters
- wire use cases
- expose a small facade to app shell entrypoints

### `main/adapters/input/`

Driving adapters for the main process.

Examples:

- IPC handlers
- HTTP route registration

Responsibilities:

- translate transport input into use case calls
- keep transport concerns out of use cases

### `main/adapters/output/`

Driven adapters that implement application ports.

Examples:

- presenters
- source adapters

Responsibilities:

- translate between external data and core models
- stay thin around infrastructure helpers

### `main/infrastructure/`

Concrete technical implementation details.

Examples:

- file system adapters
- JSON-RPC transport clients
- binary discovery
- cache implementation
- git identity helpers

Responsibilities:

- know about runtime, process, OS, or protocol details

### `preload/`

Thin transport bridge between renderer and main.

Responsibilities:

- expose a feature API fragment
- depend on `contracts/`

Not allowed:

- main composition code
- renderer logic

### `renderer/`

Feature presentation and interaction.

Recommended structure:

```text
renderer/
  index.ts
  adapters/
  hooks/
  ui/
  utils/
```

Responsibilities:

- `ui/` renders
- `hooks/` orchestrate interaction and transport usage
- `adapters/` transform DTOs into view models
- `utils/` contain small pure renderer helpers

## Import Rules

### Public entrypoints only

Outside the feature, import only:

- `@features/<feature>/contracts`
- `@features/<feature>/main`
- `@features/<feature>/preload`
- `@features/<feature>/renderer`

Do not deep-import feature internals from app shell or from other features.

### Core isolation

`core/domain` must not import:

- `@main/*`
- `@renderer/*`
- `@preload/*`
- adapters
- infrastructure
- Electron APIs
- Fastify
- child process modules

`core/application` must not import:

- `main/*`
- `renderer/*`
- Electron APIs
- Fastify
- child process modules

### UI isolation

`renderer/ui` must not import:

- `@renderer/api`
- `@renderer/store`
- `@main/*`
- Electron APIs

Push transport and store access into feature hooks or adapters.

## Browser and Tauri Friendly Guidance

The default transport direction should be:

`renderer -> feature contracts -> app api abstraction -> preload/http adapter`

This keeps renderer code closer to:

- browser mode through HTTP adapters
- a future Tauri bridge
- alternative shells with minimal feature rewrites

To keep that path clean:

- never call `window.electronAPI` directly inside feature UI or hooks
- go through shared renderer API adapters
- keep Electron-specific concerns in `main/` and `preload/`
- keep business rules in `core/`

## When To Use The Full Slice

Use the full template when a feature has:

- its own business rules
- its own merge or filtering policy
- transport wiring
- more than one adapter
- a roadmap beyond a one-off screen tweak

## When A Thin Slice Is Enough

A smaller feature may skip `core/` and `preload/` when it is:

- purely presentational
- only reshaping already-owned data
- not adding a new use case
- not adding a new transport boundary

If the feature still owns meaningful pure semantics or projection rules, keep
`core/` and skip only the process layers you do not need.

Example:
- `src/features/agent-graph` keeps `core/domain` and `renderer`, but does not add fake `main/` or `preload/` folders because the transport boundary lives elsewhere.
## Definition Of Done For A Reference Feature

A feature is reference-quality when:

- structure matches the canonical template
- core is side-effect free
- app shell imports only public entrypoints
- renderer UI is dumb and presentational
- at least the main domain and application rules are tested
- architecture is enforced by lint rules
- feature has a concise standard or plan doc if it introduces a new pattern

## Recommended Test Coverage

For medium and large features, cover at least:

- domain policy tests
- application use case tests
- critical renderer interaction utilities
- one adapter-level mapping test

## Recent Projects As The Reference

`src/features/recent-projects` is the first slice that follows this standard end-to-end.

Use it as the example for:

- contracts ownership
- core/application separation
- composition-root wiring
- renderer dumb UI + hook orchestration
- browser-friendly transport direction
- feature-level lint guard rails

## Agent Graph As The Thin-Slice Reference

`src/features/agent-graph` is the thin-slice example for a renderer integration
feature built on top of a reusable package.

Use it as the example for:

- keeping pure graph semantics in `core/domain`
- exposing a renderer-only public entrypoint
- integrating `packages/agent-graph` without inventing fake process layers
- migrating legacy `src/renderer/features/*` code into the canonical feature root
