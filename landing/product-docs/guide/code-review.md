# Code Review

Code review in Agent Teams is task-centered. You inspect what changed for a specific task instead of hunting through a large unstructured diff.

## Review surface

Use the review UI to:

- inspect changed files
- accept or reject individual hunks
- leave comments
- connect the diff back to the task and agent logs

## Hunk-level decisions

Accept small correct changes and reject isolated mistakes without throwing away the whole task. This is useful when an agent mostly solved the task but overreached in one file.

## Agent review workflow

Teams can review each other's work before you make the final call. This catches obvious regressions and keeps the board honest, but you should still review risky areas yourself.

## What to check manually

Prioritize:

- provider auth and runtime detection
- IPC, preload, and filesystem boundaries
- Git and worktree behavior
- parsing and task lifecycle logic
- persistence and code review flows

## Verification

Prefer focused verification commands. Broad formatting or lint-fix commands should not be used unless the task explicitly intends broad formatting churn.

