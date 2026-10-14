# ADR 001: общий runtime

Статус: принято и реализовано в первой beta.

ChiselCode остаётся владельцем runtime/tools/policy/providers/storage и публичного desktop-протокола. ChiselCodeDesktop содержит native host и UI. Runtime не копируется и не форкается. Цена решения: core release является предварительным условием desktop build; wire changes проверяются в двух репозиториях.

Новый обычный tool или provider поступает через generic DTO. Специализированная GUI-функция требует нового клиентского компонента. Это не обещание автоматического переноса любого TUI layout.
