# 005. Управление расширениями через общее ядро

Статус: принято, 14.10.2026.

## Контекст

P3.2 core уже владеет локальной установкой, trust, immutable версиями, CAS и use leases. Новый раздел настроек должен работать одинаково в CLI/Desktop и показывать actual activation, а не только registry.

## Решение

Каталог, private candidates, validation, настройки и credentials остаются в ChiselCode. Desktop SDK 1.1.0 получает checked DTO и narrow operations; browser renderer не устанавливает пакеты и не импортирует внутренние core объекты. Native bridge даёт только системный chooser с одноразовым path grant и явный restart после проверки занятости. Схемы внешних параметров декларативные и пассивные; секреты write-only для GUI.

## Последствия

Один digest/revision подтверждается для одного review; повторные клики и stale/cancelled requests не создают новый trust. Обновлённый пакет/параметры применяются после restart, без hot unload. Старый engine показывает отсутствие capability. Проверки GUI идут с candidate engine/SDK этих исходников, а release lock обновляется только из настоящего опубликованного core release.

[ADR](README.md) · [Протокол](../protocol.md) · [Общий порядок](https://github.com/TheAsrada/ChiselCode/blob/main/docs/contributors/desktop-sync.md)
