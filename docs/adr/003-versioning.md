# ADR 003: закреплённый engine и независимые версии

Статус: принято и реализовано.

Desktop SemVer, engine version и protocol version независимы. Core release производит SDK и manifest; desktop commit закрепляет source commit и SHA-256 assets. Во время использования приложение выбирает собственный binary, а не системный CLI.

Обновляется весь desktop installer. Кандидат с другим protocol major отклоняется. Compatibility tests и установленные payload tests выполняются до публикации. SDK не редактируется вручную; опубликованный tag/assets не перезаписываются исправлением под тем же номером.
