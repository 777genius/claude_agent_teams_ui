# Privacy and Local Data

Agent Teams is local-first, but the selected provider path still matters.

## What stays local

The desktop app runs on your machine and reads local project/runtime data to power the UI:

- project files
- task metadata
- runtime/session logs
- review state
- local app settings

## What can leave your machine

When an agent asks a provider-backed model to work, prompt context and tool results may be sent through that provider/runtime path. This depends on the runtime and provider you choose.

## Practical guidance

- Do not attach secrets to tasks.
- Review provider policies for sensitive projects.
- Use lower autonomy for risky repositories.
- Keep task scope narrow when working with private code.
- Prefer local evidence and logs when debugging.

## Open source model

The app itself is open source and free. You can inspect how local orchestration, task tracking, and review flows work in the repository.

