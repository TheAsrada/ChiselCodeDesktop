# ADR 002: Electron + React

Статус: принято и реализовано.

Выбран единый Chromium runtime для Windows/macOS/Linux, стандартные dialog/notification/updater APIs и React DOM. ChiselCode на Bun компилируется отдельно и общается через stdio. Rust-переписывание runtime не требуется.

Tauri рассматривался как возможная компактная оболочка. После проверки текущего OpenCode desktop и требований первого platform release выбран Electron: меньше различий webview и проще native GUI acceptance в доступном stack. Цена: больший размер установщика и память Chromium. Граница SDK сохраняет возможность другой оболочки в будущем.
