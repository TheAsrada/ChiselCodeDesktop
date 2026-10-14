# Возможности beta

| Сценарий | Desktop 0.1 beta |
|---|---|
| Все обычные core tools и поддерживаемые provider profiles | Через общий runtime и generic cards |
| Проекты, история, продолжение, новые/удалённые беседы | Графический интерфейс |
| Параллельные беседы и sequential follow-up | Графический интерфейс; очередь в памяти |
| Plan/Build, Manual/Accept edits/Dont ask | Графический интерфейс |
| Bypass | Не предлагается UI beta |
| Подтверждение, отказ, остановка, diff | Графический интерфейс |
| Профили, keys, API endpoint, проверка моделей | Графический интерфейс и общая конфигурация |
| MCP HTTP/stdio | Основная форма и общий controller; сложные credentials/env refs — CLI/config |
| Web tools | Runtime и переключатель; сложные сетевые параметры — CLI/config |
| Навыки и foreground extension commands | Динамический каталог и исполнение |
| Subagents | Core submission; список и live inspect/cancel владельца |
| Background tasks | Core execution/commands; список, live output/stop владельца, receipts в истории |
| Worktrees | Core commands; созданную папку можно открыть отдельным проектом |
| LSP | Runtime, `/lsp-status`/`/lsp-restart`; формы Auto/Custom/Off и project trust — Настройки → Расширения |
| Внешние extensions | Настройки → Расширения: папка/ZIP, exact trust, состояния, параметры, update/rollback и remove через core; UI contributions развиваются отдельно |
| `/btw` | Явно сообщает о недоступной desktop lane; используйте CLI/отдельную беседу |
| Облако, SSH, sync между устройствами | В scope beta не входят |
| Полноценный IDE editor/inline autocomplete | В scope beta не входят |

Состояние и результаты core feature не означают, что вся соответствующая TUI-панель уже перенесена. Дальнейшие изменения описаны в [roadmap](roadmap.md).
