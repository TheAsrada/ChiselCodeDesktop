# ADR 004: владельцы и локальный транспорт

Статус: принято и реализовано с консервативным process admission.

Electron main владеет engine process; core владеет conversation/turn/resources. Stdout — framed JSON-RPC, сетевой API в beta не открывается. Renderer получает limited preload port и не запускает tools самостоятельно.

Durable Session/config/credentials общие с CLI и имеют одну реализацию. Для двух независимых writers core вводит process lease; внутри процесса работает существующий coordinator. Цена первого этапа: linked worktrees между процессами делят coarse common Git admission. Более узкое согласование требует отдельной core concurrency реализации, а не renderer workaround.
