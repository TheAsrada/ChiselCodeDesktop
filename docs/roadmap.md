# Дальнейшее развитие

## Выполненная основа 0.1 beta

Standalone desktop, pinned engine/SDK, shared profiles/history, streaming, approval/diff, Plan/Build, Git, базовые MCP forms, команды/skills, real process/GUI acceptance и installer pipeline.

## Следующий этап

1. Сериализованный contribution API: status/menu/context/details с stable owner/action IDs. Callbacks остаются в core, UI получает DTO; stale owner проверяется до исполнения.
2. Полная панель помощников/фоновых задач: восстановленный history inspector, bounded paging logs, targeted stop/promote и owner attribution.
3. Отдельная side-query lane `/btw` с собственным AbortController и accounting; никакого смешивания с foreground queue.
4. Расширенные trust/permissions MCP и Web/network diagnostics. Настройки LSP и локальных пакетов уже подключены через общий core; [каталог и формы](extensions.md).
5. Уточнение cross-process coordinator: узкие leases для linked worktrees при сохранении common Git barriers. Сначала core concurrency tests.
6. Пагинация Session DTO и renderer virtualization для очень больших историй; bounded live-event backlog и диагностика connection loss.
7. Проверенный updater переход 0.1 → следующая beta; Windows publisher certificate и Apple signing/notarization при наличии настроенных credentials.

## Критерий устойчивости

Минимум одна следующая версия общего ядра обновляется только через release manifest/lock и acceptance, без копирования runtime в desktop. Старые sessions/profile configs продолжают читаться. Новый tool/provider появляется в generic UI; новая специальная панель проходит свой явный контракт.

IDE editor, cloud sync и remote/SSH — отдельные продуктовые решения с отдельным объёмом работ. Они не задерживают проверяемый локальный agent workflow.
