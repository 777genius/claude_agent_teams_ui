# Диагностика

Большинство проблем команды попадает в четыре группы: runtime setup, launch confirmation, task parsing или provider limits.

## Команда не запускается

Проверьте:

- выбранный runtime установлен или авторизован
- runtime доступен в environment PATH
- у провайдера есть доступ к нужной модели
- project path существует и читается

Если OpenCode показывает `registered`, но bootstrap не подтверждён, сначала смотрите launch logs.

## Не видны ответы агента

Откройте task logs и teammate messages. Пропавшие replies часто связаны с runtime delivery, parsing или task filtering. Не считайте, что модель проигнорировала сообщение, пока это не подтверждено логами.

## Changes не связаны с tasks

Используйте task-specific logs и code review links. Если diff выглядит detached, проверьте, был ли task id или task reference в output агента.

## Rate limits

Если провайдер сообщает reset time, Agent Teams может подтолкнуть lead продолжить после cooldown. Если reset time неизвестен, подождите или смените provider/runtime path.

## Какие данные собрать

Соберите:

- task id
- team name
- runtime path
- launch log excerpt
- provider/model
- точный time window

Этого обычно хватает для диагностики launch и task lifecycle issues.

