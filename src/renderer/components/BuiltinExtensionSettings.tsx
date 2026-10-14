import { useEffect, useRef, useState } from "react";
import type { BuiltinSettings, Json } from "@chiselcode/desktop-sdk";

const definitions: Record<
	string,
	{ key: string; label: string; min: number; max: number }[]
> = {
	"builtin.subagents": [
		{
			key: "maxActive",
			label: "Одновременно работающие помощники",
			min: 1,
			max: 2,
		},
		{ key: "deadlineMs", label: "Время задачи, мс", min: 1000, max: 600000 },
		{
			key: "childTokens",
			label: "Токены одного помощника",
			min: 1024,
			max: 100000,
		},
		{
			key: "ownerTokens",
			label: "Токены всех помощников",
			min: 1024,
			max: 200000,
		},
	],
	"builtin.background": [
		{
			key: "maxActive",
			label: "Одновременно работающие процессы",
			min: 1,
			max: 2,
		},
		{
			key: "batchDeadlineMs",
			label: "Время команды, мс",
			min: 1000,
			max: 7200000,
		},
		{
			key: "serviceDeadlineMs",
			label: "Время сервиса, мс",
			min: 1000,
			max: 28800000,
		},
		{
			key: "outputBytes",
			label: "Максимальный вывод, байт",
			min: 1024,
			max: 16777216,
		},
		{
			key: "retentionDays",
			label: "Хранение результатов, дней",
			min: 1,
			max: 7,
		},
	],
};
const object = (value: Json | undefined): Record<string, Json> =>
	value && typeof value === "object" && !Array.isArray(value) ? value : {};
export default function BuiltinExtensionSettings({
	id,
	path,
	onBack,
	onChanged,
	onDirty,
}: {
	id: string;
	path?: string;
	onBack(): void;
	onChanged(): Promise<void>;
	onDirty(value: boolean): void;
}) {
	const [state, setState] = useState<BuiltinSettings>(),
		[scope, setScope] = useState<"global" | "project">("global"),
		[draft, setDraft] = useState<Record<string, Json>>({}),
		[busy, setBusy] = useState(false),
		[notice, setNotice] = useState("");
	const [serverId, setServerId] = useState(""),
		[newId, setNewId] = useState("custom");
	const [jsonDrafts, setJsonDrafts] = useState<Record<string, string>>({});
	const pending = useRef(false);
	const dirty =
		!!state &&
		(JSON.stringify(draft) !== JSON.stringify(object(state[scope])) ||
			Object.keys(jsonDrafts).length > 0);
	useEffect(() => {
		onDirty(dirty);
		return () => onDirty(false);
	}, [dirty, onDirty]);
	const reload = async () => {
		if (!path) return;
		const value = await window.chisel.request("extensions/builtin/read", {
			id,
			path,
		});
		setState(value);
		setDraft(object(value[scope]));
		setJsonDrafts({});
	};
	useEffect(() => {
		void reload().catch((error) => setNotice(error.message));
	}, [id, path]);
	const changeScope = (value: "global" | "project") => {
		if (dirty) {
			setNotice("Сохраните или сбросьте изменения перед сменой области.");
			return;
		}
		setScope(value);
		if (state) setDraft(object(state[value]));
	};
	const set = (key: string, value?: Json) => {
		const next = { ...draft };
		if (value === undefined) delete next[key];
		else next[key] = value;
		setDraft(next);
		setNotice("");
	};
	const work = async (action: () => Promise<void>) => {
		if (pending.current) return;
		pending.current = true;
		setBusy(true);
		setNotice("");
		try {
			await action();
		} catch (error) {
			setNotice(
				error instanceof Error
					? error.message
					: "Не удалось сохранить настройки.",
			);
		} finally {
			pending.current = false;
			setBusy(false);
		}
	};
	const save = (reset = false) =>
		work(async () => {
			if (!state || !path) return;
			const submitted = structuredClone(draft);
			if (!reset)
				for (const [key, text] of Object.entries(jsonDrafts)) {
					const [serverKey, field] = key.split(":");
					const serverMap = object(submitted.servers);
					if (serverKey && field && serverMap[serverKey]) {
						try {
							serverMap[serverKey] = {
								...object(serverMap[serverKey]),
								[field]: JSON.parse(text) as Json,
							};
						} catch {
							throw new Error("Исправьте JSON дополнительных параметров LSP.");
						}
						submitted.servers = serverMap;
					}
				}
			const value = await window.chisel.request("extensions/builtin/save", {
				id,
				path,
				scope,
				revision:
					scope === "global" ? state.globalRevision : state.projectRevision,
				value: reset ? {} : submitted,
			});
			setState(value);
			setDraft(object(value[scope]));
			setJsonDrafts({});
			await onChanged();
			setNotice(
				"Сохранено. Настройки проекта могут только сужать глобальные ограничения. Уже запущенные задачи сохраняют свои условия.",
			);
		});
	if (!path) return <p>Откройте проект для его настроек и ограничений.</p>;
	const servers = object(draft.servers),
		server = object(servers[serverId]);
	const setServer = (key: string, value: Json) =>
		set("servers", { ...servers, [serverId]: { ...server, [key]: value } });
	const serverInput = (key: string, label: string) => (
		<label key={key}>
			{label}
			<input
				aria-label={label}
				value={String(server[key] ?? "")}
				onChange={(event) => setServer(key, event.target.value)}
			/>
		</label>
	);
	return (
		<div className="extension-settings">
			<button onClick={onBack}>← К расширению</button>
			<h3>
				{id === "builtin.lsp"
					? "Анализ кода (LSP)"
					: id === "builtin.subagents"
						? "Субагенты"
						: "Фоновые задачи"}
			</h3>
			<div className="profile-tabs">
				<button
					aria-pressed={scope === "global"}
					className={scope === "global" ? "selected" : ""}
					onClick={() => changeScope("global")}
				>
					Для всех проектов
				</button>
				<button
					aria-pressed={scope === "project"}
					className={scope === "project" ? "selected" : ""}
					onClick={() => changeScope("project")}
				>
					Этот проект
				</button>
			</div>
			{scope === "project" && (
				<p className="settings-hint">
					Пустые поля наследуют глобальные значения. Проект может запретить
					возможность и уменьшить лимиты.
				</p>
			)}
			{id === "builtin.lsp" ? (
				<>
					<div className="form-grid">
						<label>
							Режим LSP
							<select
								aria-label="Режим LSP"
								value={String(
									draft.mode ??
										(scope === "project"
											? "inherit"
											: Object.keys(servers).length
												? "custom"
												: "auto"),
								)}
								onChange={(e) =>
									set(
										"mode",
										e.target.value === "inherit" ? undefined : e.target.value,
									)
								}
							>
								{scope === "project" && (
									<option value="inherit">Наследовать</option>
								)}
								<option value="auto">Auto</option>
								<option value="custom">Своя настройка</option>
								<option value="off">Выключено</option>
							</select>
						</label>
						{scope === "project" && (
							<>
								<label>
									Разрешено в проекте
									<select
										aria-label="Разрешено в проекте"
										value={
											draft.enabled === undefined
												? "inherit"
												: String(draft.enabled)
										}
										onChange={(e) =>
											set(
												"enabled",
												e.target.value === "inherit"
													? undefined
													: e.target.value === "true",
											)
										}
									>
										<option value="inherit">Наследовать</option>
										<option value="false">Запретить</option>
										<option value="true">
											Разрешить в пределах глобальных настроек
										</option>
									</select>
								</label>
								<label>
									Сервер проекта
									<select
										aria-label="Сервер проекта"
										value={String(draft.serverId ?? "")}
										onChange={(e) =>
											set("serverId", e.target.value || undefined)
										}
									>
										<option value="">Наследовать</option>
										{Object.keys(object(object(state?.global).servers)).map(
											(key) => (
												<option key={key}>{key}</option>
											),
										)}
									</select>
								</label>
							</>
						)}
					</div>
					{scope === "global" && (
						<>
							<p className="settings-hint">
								Auto использует стандартный каталог. Свой executable требует
								сохранённых путей и явного доверия проекта.
							</p>
							<div className="profile-tabs">
								{Object.keys(servers).map((key) => (
									<button
										key={key}
										onClick={() => setServerId(key)}
										className={serverId === key ? "selected" : ""}
									>
										{key}
									</button>
								))}
							</div>
							<div className="input-action">
								<input
									aria-label="ID нового LSP-сервера"
									value={newId}
									onChange={(e) => setNewId(e.target.value)}
								/>
								<button
									disabled={busy}
									onClick={() => {
										if (servers[newId]) {
											setNotice("ID уже существует.");
											return;
										}
										set("servers", {
											...servers,
											[newId]: {
												backend: "generic",
												enabled: true,
												command: "",
												args: [],
												trustedWorkspaces: [],
												languageIds: ["plaintext"],
												extensions: [],
											},
										});
										setServerId(newId);
									}}
								>
									Добавить сервер
								</button>
							</div>
							{serverId && servers[serverId] && (
								<div className="form-grid">
									<label>
										Backend
										<select
											aria-label="Backend LSP"
											value={String(server.backend)}
											onChange={(e) => {
												const common = {
													enabled: server.enabled ?? true,
													command: server.command ?? "",
													args: server.args ?? [],
													trustedWorkspaces: server.trustedWorkspaces ?? [],
												};
												set("servers", {
													...servers,
													[serverId]:
														e.target.value === "typescript"
															? {
																	...common,
																	backend: "typescript",
																	typescriptPath: "",
																}
															: {
																	...common,
																	backend: "generic",
																	languageIds: ["plaintext"],
																	extensions: [],
																},
												});
											}}
										>
											<option value="generic">stdio LSP</option>
											<option value="typescript">
												TypeScript / JavaScript
											</option>
										</select>
									</label>
									<label>
										Сервер включён
										<input
											aria-label="Сервер включён"
											type="checkbox"
											checked={server.enabled === true}
											onChange={(e) => setServer("enabled", e.target.checked)}
										/>
									</label>
									{serverInput(
										"command",
										server.backend === "typescript"
											? "Абсолютный путь Node.js"
											: "Абсолютный путь executable",
									)}
									<label className="full">
										Аргументы, по одному в строке
										<textarea
											aria-label="Аргументы LSP"
											value={
												Array.isArray(server.args) ? server.args.join("\n") : ""
											}
											onChange={(e) =>
												setServer(
													"args",
													e.target.value.split("\n").filter(Boolean),
												)
											}
										/>
									</label>
									{server.backend === "typescript" ? (
										serverInput("typescriptPath", "Абсолютный путь TypeScript")
									) : (
										<>
											<label>
												Language IDs
												<input
													aria-label="Language IDs"
													value={
														Array.isArray(server.languageIds)
															? server.languageIds.join(", ")
															: ""
													}
													onChange={(e) =>
														setServer(
															"languageIds",
															e.target.value
																.split(",")
																.map((v) => v.trim())
																.filter(Boolean),
														)
													}
												/>
											</label>
											<label>
												Расширения файлов
												<input
													aria-label="Расширения файлов"
													value={
														Array.isArray(server.extensions)
															? server.extensions.join(", ")
															: ""
													}
													onChange={(e) =>
														setServer(
															"extensions",
															e.target.value
																.split(",")
																.map((v) => v.trim())
																.filter(Boolean),
														)
													}
												/>
											</label>
										</>
									)}
									{server.backend === "generic" &&
										["initializationOptions", "settings"].map((field) => (
											<label className="full" key={field}>
												{field === "settings"
													? "Настройки сервера (JSON)"
													: "Initialization options (JSON)"}
												<textarea
													aria-label={
														field === "settings"
															? "Настройки сервера (JSON)"
															: "Initialization options (JSON)"
													}
													value={
														jsonDrafts[`${serverId}:${field}`] ??
														JSON.stringify(server[field] ?? {}, null, 2)
													}
													onChange={(event) =>
														setJsonDrafts({
															...jsonDrafts,
															[`${serverId}:${field}`]: event.target.value,
														})
													}
												/>
											</label>
										))}
									<div className="settings-actions full">
										<button
											disabled={busy || dirty}
											onClick={() =>
												work(async () => {
													const result = await window.chisel.request(
														"extensions/lsp/action",
														{ path, serverId, action: "check", value: server },
													);
													setNotice(result.text);
												})
											}
										>
											Проверить пути
										</button>
										<button
											disabled={busy || dirty}
											onClick={() =>
												work(async () => {
													await window.chisel.request("extensions/lsp/action", {
														path,
														serverId,
														action: "trust",
														allowed: true,
													});
													await reload();
													setNotice(
														"Доверие проекта сохранено. Исполняемый сервер получает доступ процесса.",
													);
												})
											}
										>
											Доверить сервер этому проекту
										</button>
										<button
											disabled={busy || dirty}
											onClick={() =>
												work(async () => {
													await window.chisel.request("extensions/lsp/action", {
														path,
														serverId,
														action: "trust",
														allowed: false,
													});
													await reload();
													setNotice("Доверие проекта снято.");
												})
											}
										>
											Снять доверие
										</button>
										<button
											disabled={busy}
											onClick={() => {
												const next = { ...servers };
												delete next[serverId];
												set("servers", next);
												setServerId("");
											}}
										>
											Удалить сервер из настроек
										</button>
									</div>
								</div>
							)}
						</>
					)}
					{state?.status && (
						<p className="settings-hint">
							Состояние LSP:{" "}
							{String(object(state.status).state ?? "unavailable")}. Перезапуск
							сервера доступен через /lsp-restart в беседе с обычной проверкой
							разрешений.
						</p>
					)}
				</>
			) : (
				<div className="form-grid">
					<label>
						Включение
						<select
							aria-label="Включение возможности"
							value={
								draft.enabled === undefined ? "inherit" : String(draft.enabled)
							}
							onChange={(e) =>
								set(
									"enabled",
									e.target.value === "inherit"
										? undefined
										: e.target.value === "true",
								)
							}
						>
							{scope === "project" && (
								<option value="inherit">Наследовать</option>
							)}
							<option value="true">Включено</option>
							<option value="false">Выключено</option>
						</select>
					</label>
					{(definitions[id] ?? []).map((f) => (
						<label key={f.key}>
							{f.label}
							<input
								aria-label={f.label}
								type="number"
								min={f.min}
								max={f.max}
								step="1"
								value={draft[f.key] === undefined ? "" : String(draft[f.key])}
								placeholder={scope === "project" ? "Наследовать" : ""}
								onChange={(e) =>
									set(
										f.key,
										e.target.value === "" ? undefined : Number(e.target.value),
									)
								}
							/>
						</label>
					))}
				</div>
			)}
			{state?.effective && (
				<p className="settings-hint">
					Сейчас разрешено:{" "}
					{object(state.effective).enabled === true ? "Да" : "Нет"}. Лимит
					активных задач: {String(object(state.effective).maxActive ?? "—")}.
				</p>
			)}
			<div className="settings-actions">
				<button
					className="primary"
					disabled={busy || !state}
					onClick={() => save()}
				>
					Сохранить
				</button>
				<button disabled={busy || !state} onClick={() => save(true)}>
					Сбросить
				</button>
				<button
					disabled={busy || !state}
					onClick={() => {
						if (state) setDraft(object(state[scope]));
						setJsonDrafts({});
						setNotice("");
					}}
				>
					Отменить изменения
				</button>
				<button disabled={busy || dirty} onClick={() => work(reload)}>
					Перечитать
				</button>
			</div>
			{notice && (
				<p role="status" className="settings-notice">
					{notice}
				</p>
			)}
		</div>
	);
}
