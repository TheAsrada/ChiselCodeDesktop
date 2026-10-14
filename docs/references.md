# Референсы и принятые решения

Исследование выполнено 2026-10-13 по официальной документации и доступным исходникам. Закрытые приложения не запускались в этой среде; их внутренний stack не выводится из внешнего вида. Опубликованные интерфейсы используются как ориентиры, ChiselCode имеет своё оформление.

## Codex

Официальный [App Server](https://developers.openai.com/codex/app-server/) описывает structured requests, streamed events и approvals. Изучен также [открытый app-server](https://github.com/openai/codex/tree/6fbfc352cafb50332d62dbdc8720cb5d7fe3b7c7/codex-rs/app-server). Для ChiselCode это подтверждает полезность отдельного versioned contract. Наш wire format сохраняет стандартный jsonrpc header и свой vocabulary, а не совместимость с Codex protocol.

[Представление приложения](https://openai.com/index/introducing-the-codex-app/), [code review](https://learn.chatgpt.com/docs/code-review) и [worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees) изучены как ориентиры рабочего цикла: задача, контролируемые изменения, независимая работа и review. В ChiselCode эти направления основаны на существующих core services.

## OpenCode

[Server](https://opencode.ai/docs/server/) и [SDK](https://opencode.ai/docs/sdk/) описывают разделение клиента и runtime. На момент исследования [desktop package](https://github.com/anomalyco/opencode/blob/23e3493ab2efb6b8c00725cfd652b7f946af5343/packages/desktop/package.json) использует Electron. Изучены [main](https://github.com/anomalyco/opencode/blob/23e3493ab2efb6b8c00725cfd652b7f946af5343/packages/desktop/src/main/index.ts), [preload](https://github.com/anomalyco/opencode/blob/23e3493ab2efb6b8c00725cfd652b7f946af5343/packages/desktop/src/preload/index.ts) и [app composition](https://github.com/anomalyco/opencode/blob/23e3493ab2efb6b8c00725cfd652b7f946af5343/packages/app/src/app.tsx). Решение ChiselCode: Electron + React, core sidecar и генерируемый SDK, без импорта чужого runtime или копирования его components.

## Claude Code Desktop

[Официальная документация desktop](https://code.claude.com/docs/en/desktop) показывает, что CLI и GUI могут использовать общее agent engine и согласовывать пользовательское окружение. Для ChiselCode выбрана общая история через existing Session store; владелец живой операции остаётся один. Перенос фокуса между интерфейсами не даёт право повторно запустить активную сессию.

## Cursor

[Reviewing and testing](https://cursor.com/learn/reviewing-testing) изучен как пример проверки результата рядом с агентной работой. ChiselCode beta отделяет approval от просмотра Git: подтверждение относится к конкретной подготовленной операции, Git-панель показывает текущую рабочую папку. Успешный tool result не объявляется успешным тестом без настоящего запуска проверки.

## Zed

[External Agents](https://zed.dev/docs/ai/external-agents) показывает отделение интерфейса от внешнего процесса и его конфигурации. Для ChiselCode сохраняется native ownership: profiles/keys/tools принадлежат ядру. ACP может стать будущим адаптером, но не заменяет desktop API для собственных worktrees, permissions и lifecycle.

## Применение к интерфейсу

| Наблюдаемая потребность | Решение ChiselCode | Критерий |
|---|---|---|
| Несколько независимых задач | Проектная sidebar, active индикатор, очередь | Смена выбранной беседы не отменяет run |
| Читаемый stream | Центральная лента Markdown, код, tool details | История заменяет live state без потери ответа |
| Проверка изменений | Правый inspector и отдельный approval diff | Файл не изменяется до разрешения |
| Быстрый старт | Открытие папки, строки действий, profile setup | Нет обязательного терминала/Bun для пользователя |
| Спокойное оформление | Manrope, JetBrains Mono, семантические цвета, три темы | Состояния readable, без декоративной перегрузки |
| Долговечная архитектура | Core-owned protocol и pinned engine | Новый runtime не требует fork в desktop |

Первый UI проверен настоящими кадрами Electron. Реализация, ограничения и последовательность дальнейших улучшений записаны отдельно; внешний ориентир не считается доказательством реализованной функции.

Оформление beta.3 основано также на трёх визуальных референсах владельца. Их разбор, композиция, палитра и настоящие рабочие экраны находятся в [руководстве по дизайну](design.md). Первая опубликованная beta.2 сохраняет своё прежнее оформление.
