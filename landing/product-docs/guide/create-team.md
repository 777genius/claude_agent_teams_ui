# Create a Team

A team is a named group of agents with roles, a lead, a target project, and a coordination prompt.

## Recommended first team

Start with a small team:

| Role | Purpose |
| --- | --- |
| Lead | Splits work, creates tasks, coordinates teammates |
| Builder | Implements scoped tasks |
| Reviewer | Reviews output, catches regressions, asks for fixes |

This shape gives you enough coordination to see the product value without making the first launch noisy.

## Write a good team brief

The team brief should include:

- the outcome you want
- the files or feature areas that matter
- risk boundaries, such as "do not refactor unrelated modules"
- review expectations
- verification commands when you know them

Example:

```text
Build a focused improvement to the download flow. Keep changes inside the landing app unless a shared helper is clearly needed. Create tasks before implementation, review each task diff, and run landing lint/build checks.
```

## Choose autonomy

Agent Teams supports different levels of control. Use more autonomy for routine changes and tighter review for risky areas like provider auth, IPC, persistence, Git workflows, and release tooling.

## Add context

Attach files, screenshots, or specific notes when they materially change the task. Agents can use task descriptions, comments, and attachments as durable context.

## Watch for task quality

Good teams create tasks that are:

- specific enough to review
- small enough to finish
- linked to visible output
- backed by a verification path

If the lead creates vague tasks, send a direct message asking for smaller, testable tasks.

