# Протокол приложения

Публичный источник типов — ChiselCode `src/desktop/protocol.ts`; SDK генерируется из того же commit. Копии domain Session и runtime objects в frontend не поддерживаются.

## Подключение

Main запускает встроенный engine с pipe stdin/stdout и вызывает initialize с protocolMajor/clientVersion. Ответ содержит engineVersion, protocol, capabilities и sessionSchemaVersion. Несовместимый major, неправильный формат и неизвестный метод отклоняются.

Сообщения JSON-RPC 2.0 разделены LF. Размер frame ограничен 16 MiB; при переполнении процесс прекращает транспорт. До 128 входящих операций допускается одновременно. SDK correlates response по request id, снимает waiters при disconnect и не повторяет mutations после таймаута.

## Методы

| Группа | Назначение |
|---|---|
| projects/list, projects/open | Общий project registry |
| profiles/list, profiles/save, models/list | Профили, ключ write-only, проверка моделей |
| sessions/create/read/list/rename/delete | Durable Session через core store |
| turn/start, turn/cancel | Выполнение и отмена |
| approvals/respond | Решение строго по существующему requestId |
| git/status, git/diff | Read-only просмотр |
| skills/list, commands/list | Динамический каталог |
| mcp/list/save/action | Existing controller и model trust |
| tasks/list/inspect/cancel | Owned task controls |
| settings/read/patch | Узкие настройки Web/LSP |
| extensions/list/prepare/operation/cancel/commit | Пассивный каталог, progress, exact review и core candidate lifecycle |
| extensions/setEnabled/settings/read/settings/save | Желаемое состояние и декларативные global per-ID параметры; секреты write-only |
| extensions/builtin/read/builtin/save/lsp/action | Реальные core stores LSP/subagents/background, revisions и проектные ограничения |
| system/status, shutdown | Native lifecycle, renderer не управляет shutdown |

В первой beta turn/start принимает одну задачу; следующая сохраняется в клиентской очереди. Foreground slash commands исполняются через runExtensionCommand, skill commands расширяются через существующий skill loader. `/btw` явно сообщает о недоступной графической lane; его нельзя считать обычным agent prompt.

## Управление расширениями

Protocol 1.1 / SDK 1.1.0 добавляет capabilities `extension-management`, `extension-settings`. Review содержит точные digest/revision и requestId, но не prepared handle. Commit authority остаётся в engine; stale/cancelled review требует новой проверки. Polling `extensions/operation` возвращает bounded progress, terminal result или ошибку и не вызывает модель.

Native bridge выбирает только directory либо ZIP. Одноразовый path grant разрешает `extensions/prepare` для выбранного источника; renderer не читает файлы и не реализует installer. Явный restart проверяет активные задачи; production handshake остаётся обязательным. При отсутствии новой capability GUI показывает недоступность раздела.

## События

Event envelope содержит sequence/sessionId/turnId/type/data. Runtime сохраняет свои события; desktop adapter сериализует их после redaction. Есть turn.started/completed, approval.requested/resolved, subagent/background и worktree.opened. После завершения клиент читает sessions/read, чтобы показывать durable историю.

### Совместимость событий

Имена и поля событий, которые читает клиент, являются частью публичного desktop-контракта:

| Runtime payload | Стабильные поля |
|---|---|
| provider_text_delta | text |
| turn_state | state: calling_provider, executing_tools, awaiting_approval |
| tool_started | invocationId, name |
| tool_completed, tool_failed | invocationId, result.output/isError/fileDiff/diffs |
| context_compaction_started | type |
| command_result | result.output |

Внутренний runtime может изменять свои события, но core adapter обязан сохранить этот wire vocabulary либо выпустить новый protocol major с клиентской миграцией. Пересылка события текущего runtime не означает разрешение менять его поля без проверки desktop compatibility. Дополнительные необязательные поля клиент может игнорировать. Это условие проверяется при обновлении engine вместе с method DTO и durable snapshots.

Подтверждения существуют в ядре только до ответа/отмены текущей операции. Поздний requestId получает APPROVAL_EXPIRED. При disconnect разрешение не восстанавливается как grant. Потеря ответа на mutation не даёт оснований запускать её снова: сначала обновите snapshot.

Live text временный; checkpoint остаётся источником истории. После аварии нет обещания event replay или exactly-once исполнения внешнего shell/MCP: их неизвестный исход обрабатывает существующий core recovery.
