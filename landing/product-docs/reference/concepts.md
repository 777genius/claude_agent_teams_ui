# Concepts

This page defines the core terms used across Agent Teams.

## Team

A team is a group of agents configured for a project. A team usually has a lead and one or more teammates with specialized roles.

## Lead

The lead coordinates work. It should break goals into tasks, assign teammates, track blockers, and ask for review when needed.

## Task

A task is the durable unit of work. It has status, description, comments, logs, attachments, and reviewable changes.

## Solo mode

Solo mode runs a one-member team. It is useful for quick work, lower token usage, and validating a prompt before expanding to a full team.

## Cross-team communication

Agents can message within and across teams. Use this when separate teams own related work and need to coordinate.

## Autonomy level

Autonomy controls how much agents can do before asking. Higher autonomy is faster; lower autonomy is safer for sensitive code paths.

## Runtime

A runtime is the local execution path that connects Agent Teams to a model/provider workflow, such as Claude, Codex, or OpenCode.

