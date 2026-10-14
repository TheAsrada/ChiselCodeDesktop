# Разработка

Node.js 24.19+, npm, Git и системные библиотеки Electron. Engine скачивается из закреплённого release; Bun нужен только для изменения общего ядра в соседнем ChiselCode.

```sh
npm run sync:engine
npm ci
npm run icon
npm run dev
```

`vendor` не хранится в Git. `engine.lock.json` и package-lock.json хранятся. Прямые импорты ChiselCode/src в renderer запрещены; публичные типы и клиент берутся из проверенного SDK.

## Проверки

```sh
npm run verify
npm run test:e2e
npm run package
```

Linux GUI в CI запускается через `xvfb-run`. Тесты запускают реальный Electron/preload/compiled engine и локальный HTTP model fixture. Проверяются профили, stream, запись только после approval, отказ, отмена, durable resume и отсутствие Node/raw IPC в renderer. File picker не подменяет engine: fixture регистрирует проект через настоящий API.

Установленный payload проверяется тем же тестом с `CHISEL_TEST_EXECUTABLE` — путём его executable. Платформенные workflows передают свой путь. На Linux display нужен также для этой проверки. `--no-sandbox` используется только test launcher в CI; runtime BrowserWindow сохраняет contextIsolation/sandbox settings.

В core `desktop-server.ts` fixture дополнительно проверяет реальные JSON-RPC/SDK, второй процесс и history resume после остановки первого. Модель fixture детерминированная: acceptance доказывает wiring/policy, а не качество ответов живой модели.

## Структура

Проверки оформления дополнительно проходят быстрые действия Plan/Build, навигацию с сохранением черновика, сохранение темы после перезапуска и доступность поля ввода при content size 1080 × 760 и 920 × 700. Исходный GUI-прогон на Linux сохраняет актуальные кадры обеих тем, компактного окна и настроек. Устройство оформления описано в [руководстве по дизайну](design.md).

`src/main` — lifecycle, engine transport и ОС. `src/shared/bridge.ts` — narrow preload API. `src/renderer` — React UI. `scripts/sync-engine.mjs` — закреплённые артефакты. `tests/e2e` — сценарии через настоящую сборку. `docs/assets/screenshots` — кадры этой сборки; source/packaged сценарии генерируют их только для проверенного UI.

При изменении поведения обновляйте документацию и Unreleased CHANGELOG. При wire change сначала меняйте контракт в ChiselCode, затем выпускайте SDK/engine, обновляйте lock и клиент. SDK files руками не редактируются.

`npm run test:e2e` перед Playwright завершает установку закреплённого Electron binary штатным installer с checksums. Это исключает гонку первого запуска после `npm ci`. Ожидаемый путь проекта в GUI берите из DTO `projects/open`: engine возвращает canonical identity, включая Windows long/lowercase paths и macOS `/private` aliases; frontend не повторяет нормализацию.

## Source candidate ядра

До core release соберите engine/SDK из текущего соседнего ChiselCode и временно поместите их в игнорируемый vendor. `CHISEL_DESKTOP_CANDIDATE_LOCK` может указывать отдельную dev metadata с фактической candidate version/protocol; путь применяется только к непакетному запуску. Production handshake не отключается, настоящий engine.lock.json сохраняется. Укажите source commit и локальные правки в отчёте. После публикации выполните update:engine/sync:engine/npm ci и повторите GUI/payload с опубликованными bytes по [desktop-sync](https://github.com/TheAsrada/ChiselCode/blob/main/docs/contributors/desktop-sync.md).
