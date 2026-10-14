# Выпуск установщиков

Desktop выпускается из `main` по новому неизменяемому тегу `v<package.json.version>`. Версии UI и ядра независимы. До тега обновите CHANGELOG и закрепите настоящий core release в `engine.lock.json`; placeholder или неполный manifest не допускаются.

По AGENTS.md просьба владельца «сделай релиз» по умолчанию означает выпуск обоих проектов. Следуйте [общему порядку](https://github.com/TheAsrada/ChiselCode/blob/main/docs/contributors/desktop-sync.md): сначала успешный ChiselCode release, затем этот engine в Desktop, native main CI и новый desktop tag. Дополнительное согласование второго выпуска не требуется. Явная просьба выпустить только один проект меняет этот порядок для конкретного задания. Изменение исходников без просьбы о релизе не запускает публикацию.

## Автоматическая сборка

Workflow [Desktop](../.github/workflows/desktop.yml) запускается также на push в main. Четыре native runner: Windows x64, Linux x64, macOS Apple Silicon и Intel. Каждый скачивает engine/SDK/skills с проверкой SHA-256, устанавливает зависимости из lock, проверяет TypeScript и архитектурные границы, собирает приложение и выполняет GUI acceptance.

После упаковки запускается GUI из реального payload: Windows — тихая установка NSIS в временную папку; Linux — извлечение deb и AppImage; macOS — mount DMG/перенос .app и отдельно распаковка ZIP. Подтверждение записи, отказ, отмена и история проверяются тем же сценарием. Проверка не ограничивается `--version` или существованием файла установщика.

Публикация зависит от успеха всей матрицы. Скрипт `prepare-release.mjs` требует ровно семь установочных файлов, создаёт SHA256SUMS, release-manifest с core/source provenance и updater metadata. Для beta используются `beta.yml`, `beta-mac.yml`, `beta-linux.yml`; macOS metadata содержит обе архитектуры. Blockmap сохраняются для обновлений.

GitHub release создаётся draft/prerelease, загружается полный набор, сверяется число assets, затем draft публикуется. Повторный запуск может восстановить только draft. Уже опубликованный выпуск не перезаписывается: исправлению нужна новая версия.

## Ручной локальный цикл

```sh
npm run sync:engine
npm ci
npm run verify
npm run test:e2e
npm run package
node scripts/verify-installers.mjs
```

Linux требует display (`xvfb-run -a` в CI). Проверить macOS или Windows можно только на соответствующей ОС. Наличие cross-compiled binary не заменяет native acceptance.

После успешного main workflow создайте новый tag и push tag. Перед публикацией ещё раз проверьте release notes, engine/source commit и результаты всех платформ. Пользовательские конфиги, проекты, CLI и история не включаются в установщики.

## Подписи и дальнейшее обновление

Первая beta Windows не подписана сертификатом издателя; macOS подписана ad-hoc без Apple notarization. Настоящая publisher signing требует настроенных сертификатов и меняет критерий release. Секреты не хранятся в репозитории.

Проверка/загрузка через updater реализована. Переход на следующий опубликованный выпуск требует отдельного acceptance; первый release сам по себе не доказывает рабочую установку обновления. Ручная переустановка остаётся доступной. Для deb используется системный пакетный менеджер; AppImage updater работает только при запуске установленного AppImage.
