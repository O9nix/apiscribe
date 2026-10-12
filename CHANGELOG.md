# Changelog

Формат: [Semantic Versioning](https://semver.org/lang/ru/). Пока версия `0.x`, формат тегов и файлов может меняться.

## 0.4.0
- Roadmap: `ROADMAP.md` → `roadmap.html` (этапы слева, описание справа). Статусы «готово / сейчас / план» считаются по текущей версии проекта.
- Команда `apiscribe roadmap`, флаги `--roadmap`, `--roadmap-out`, `--roadmap-version-file`, `--no-roadmap`.

## 0.3.0
- Markdown-файл `api.md` рядом с HTML: содержание, все записи, история изменений.
- Флаги `--no-markdown`, `--md-file`.

## 0.2.0
- JSDoc-стиль разметки (`@apiName`, `@apiGroup`, `@param`, `@returns`, `@throws`, `@example`, `@class`, `@event`).
- Категории и вложенные группы в меню (`api.game` → `api.game.show`), страница группы со всеми методами.
- Имя, класс и параметры выводятся из кода, если не указаны явно.

## 0.1.0
- Первая версия: HTTP-стиль (`@api {GET} /path`), HTML с меню слева, версионирование по `version.md`, `history.json`.
