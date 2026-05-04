# Концепции

Основные термины Agent Teams.

## Team

Team - группа агентов, настроенная для проекта. Обычно есть lead и один или несколько teammates со специализированными ролями.

## Lead

Lead координирует работу: разбивает цель на tasks, назначает teammates, отслеживает blockers и просит review.

## Task

Task - устойчивая единица работы. У неё есть status, description, comments, logs, attachments и reviewable changes.

## Solo mode

Solo mode запускает команду из одного агента. Полезно для маленьких задач, меньшего token usage и проверки prompt перед расширением до команды.

## Cross-team communication

Агенты могут писать внутри и между командами. Это нужно, когда разные teams владеют связанными частями работы.

## Autonomy level

Autonomy определяет, сколько агент может делать до запроса подтверждения. Больше автономности быстрее, меньше - безопаснее для sensitive code paths.

## Runtime

Runtime - локальный execution path, который соединяет Agent Teams с model/provider workflow, например Claude, Codex или OpenCode.

