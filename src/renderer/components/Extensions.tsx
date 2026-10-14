import { useEffect, useRef, useState } from "react";
import { Loader2, Package, Search } from "lucide-react";
import type {
	CatalogExtension,
	ExtensionAction,
	ExtensionOperation,
	ExtensionReview,
	ExtensionSettings,
	SettingValue,
} from "@chiselcode/desktop-sdk";
import BuiltinExtensionSettings from "./BuiltinExtensionSettings.js";

const states = {
	saved: "Сохранено",
	working: "Работает",
	disabled: "Выключено",
	not_trusted: "Не доверено",
	error: "Ошибка",
	restart_required: "Нужен перезапуск",
};
const labels: Record<ExtensionAction, string> = {
	enable: "Включить",
	disable: "Выключить",
	trust: "Доверить и включить",
	settings: "Настройки",
	update: "Обновить из файла",
	versions: "Версии",
	remove: "Удалить",
};
const filters = ["Все", "Встроенные", "Установленные", "Требуют внимания"];
type Attempt = {
	kind: ExtensionReview["kind"];
	id?: string;
	versionKey?: string;
	sourceKind?: "directory" | "zip";
};
export default function Extensions({
	path,
	available,
	active,
	onDirty,
	onBusy,
	onRestart,
}: {
	path?: string;
	available: boolean;
	active: boolean;
	onDirty(value: boolean): void;
	onBusy(value: boolean): void;
	onRestart(): Promise<void>;
}) {
	const [items, setItems] = useState<CatalogExtension[]>([]),
		[selectedId, setSelectedId] = useState(""),
		[query, setQuery] = useState(""),
		[filter, setFilter] = useState(0),
		[view, setView] = useState<
			"catalog" | "review" | "versions" | "settings" | "builtin"
		>("catalog");
	const [chooser, setChooser] = useState<"install" | "update">(),
		[review, setReview] = useState<ExtensionReview>(),
		[trusted, setTrusted] = useState(false),
		[busy, setBusy] = useState(false),
		[operation, setOperation] = useState<ExtensionOperation>(),
		[notice, setNotice] = useState("");
	const [failed, setFailed] = useState(false);
	const [loading, setLoading] = useState(true);
	const [settings, setSettings] = useState<ExtensionSettings>(),
		[values, setValues] = useState<Record<string, SettingValue>>({}),
		[secrets, setSecrets] = useState<Record<string, string>>({}),
		[clearSecrets, setClearSecrets] = useState<string[]>([]),
		[builtinDirty, setBuiltinDirty] = useState(false);
	const pending = useRef(false),
		alive = useRef(true),
		requestId = useRef<string | undefined>(undefined),
		lastAttempt = useRef<Attempt | undefined>(undefined),
		search = useRef<HTMLInputElement>(null);
	const selected = items.find((item) => item.id === selectedId);
	const dirty =
		builtinDirty ||
		(view === "settings" &&
			!!settings &&
			(JSON.stringify(values) !== JSON.stringify(settings.values) ||
				Object.keys(secrets).length > 0 ||
				clearSecrets.length > 0));
	useEffect(() => {
		onDirty(dirty);
	}, [dirty, onDirty]);
	useEffect(() => {
		onBusy(busy);
	}, [busy, onBusy]);
	const refresh = async () => {
		if (!available) return;
		setLoading(true);
		try {
			const list = await window.chisel.request(
				"extensions/list",
				path ? { path } : {},
			);
			if (!alive.current) return;
			setItems(list.items);
			setSelectedId((id) =>
				list.items.some((i) => i.id === id) ? id : (list.items[0]?.id ?? ""),
			);
		} finally {
			if (alive.current) setLoading(false);
		}
	};
	const cancel = async () => {
		const id = requestId.current;
		requestId.current = undefined;
		if (id) await window.chisel.request("extensions/cancel", { requestId: id });
		if (alive.current) {
			setReview(undefined);
			setTrusted(false);
			setOperation(undefined);
			setView("catalog");
		}
	};
	useEffect(() => {
		alive.current = true;
		return () => {
			alive.current = false;
			const id = requestId.current;
			if (id)
				void window.chisel
					.request("extensions/cancel", { requestId: id })
					.catch(() => {});
		};
	}, []);
	useEffect(() => {
		if (active && available) void refresh().catch((e) => setNotice(e.message));
		else if (requestId.current)
			void cancel().catch((e) => setNotice(e.message));
	}, [path, active, available]);
	useEffect(() => {
		if (!busy || !requestId.current) return;
		const id = requestId.current;
		const timer = setInterval(() => {
			void window.chisel
				.request("extensions/operation", { requestId: id })
				.then((op) => {
					if (alive.current && requestId.current === id) setOperation(op);
				})
				.catch(() => {});
		}, 200);
		return () => clearInterval(timer);
	}, [busy]);
	const work = async (action: () => Promise<void>) => {
		if (pending.current) return;
		pending.current = true;
		setBusy(true);
		setNotice("");
		setFailed(false);
		try {
			await action();
		} catch (error) {
			if (alive.current) setFailed(true);
			if (alive.current)
				setNotice(
					error instanceof Error ? error.message : "Операция не завершена.",
				);
			if (requestId.current) await cancel().catch(() => {});
			await refresh().catch(() => {});
		} finally {
			pending.current = false;
			if (alive.current) {
				setBusy(false);
				setOperation(undefined);
			}
		}
	};
	const prepare = (attempt: Attempt) =>
		work(async () => {
			await cancel();
			lastAttempt.current = attempt;
			let source: string | null = null;
			if (attempt.kind === "install" || attempt.kind === "update") {
				source = await window.chisel.chooseExtension(
					attempt.sourceKind ?? "directory",
				);
				if (!source || !alive.current) return;
			}
			const id = crypto.randomUUID();
			requestId.current = id;
			setChooser(undefined);
			setTrusted(false);
			const data = await window.chisel.request("extensions/prepare", {
				requestId: id,
				kind: attempt.kind,
				...(attempt.id ? { id: attempt.id } : {}),
				...(attempt.versionKey ? { versionKey: attempt.versionKey } : {}),
				...(source ? { source } : {}),
			});
			if (alive.current && requestId.current === id) {
				setReview(data);
				setView("review");
			} else
				await window.chisel.request("extensions/cancel", { requestId: id });
		});
	const commit = () =>
		work(async () => {
			if (!review) return;
			const result = await window.chisel.request("extensions/commit", {
				requestId: review.requestId,
				digest: review.digest,
				revision: review.revision,
				trust: trusted,
				...(review.kind === "install" || review.kind === "trust"
					? { enable: trusted }
					: {}),
			});
			requestId.current = undefined;
			setReview(undefined);
			setView("catalog");
			setSelectedId(result.id);
			await refresh();
			setNotice(
				`Сохранено.${result.restartRequired ? " Примените через перезапуск приложения после завершения задач. Черновик и беседа сохраняются." : ""}${result.deferred ? " Удаление занятых файлов отложено; пользовательские данные сохранены." : ""}${result.warning ? " " + result.warning : ""}`,
			);
		});
	const action = (name: ExtensionAction) => {
		if (!selected || busy || !selected.actions.includes(name)) return;
		if (name === "update") setChooser("update");
		else if (name === "versions") setView("versions");
		else if (name === "remove" || name === "trust")
			void prepare({ kind: name, id: selected.id });
		else if (name === "settings") {
			if (selected.origin === "builtin") setView("builtin");
			else
				void work(async () => {
					const next = await window.chisel.request("extensions/settings/read", {
						id: selected.id,
						digest: selected.digest!,
						revision: selected.revision,
					});
					setSettings(next);
					setValues(next.values);
					setSecrets({});
					setClearSecrets([]);
					setView("settings");
				});
		} else
			void work(async () => {
				const result = await window.chisel.request("extensions/setEnabled", {
					id: selected.id,
					enabled: name === "enable",
					digest: selected.digest!,
					revision: selected.revision,
					...(path ? { path } : {}),
				});
				await refresh();
				setNotice(
					result.restartRequired
						? "Сохранено. Примените через перезапуск приложения после завершения задач."
						: "Настройка возможности сохранена.",
				);
			});
	};
	const save = (reset = false) =>
		work(async () => {
			if (!selected || !settings) return;
			const next = await window.chisel.request("extensions/settings/save", {
				id: selected.id,
				digest: selected.digest!,
				revision: selected.revision,
				settingsRevision: settings.revision,
				values,
				secrets,
				clearSecrets,
				reset,
			});
			setSettings(next);
			setValues(next.values);
			setSecrets({});
			setClearSecrets([]);
			await refresh();
			setNotice(
				"Сохранено. Параметры применятся после перезапуска приложения.",
			);
		});
	const back = () => {
		if (dirty) {
			setNotice("Сохраните или отмените изменения перед возвратом.");
			return;
		}
		if (requestId.current) void cancel().catch((e) => setNotice(e.message));
		else {
			setChooser(undefined);
			setView("catalog");
		}
	};
	if (!available)
		return (
			<div className="empty-state">
				<Package size={28} />
				<h3>Управление расширениями недоступно</h3>
				<p>
					Это ядро не объявило capability управления расширениями. Установите
					выпуск Desktop с новым ядром.
				</p>
			</div>
		);
	const visible = items.filter(
		(item) =>
			`${item.name} ${item.id}`
				.toLocaleLowerCase()
				.includes(query.toLocaleLowerCase()) &&
			(filter === 0 ||
				(filter === 1 && item.origin === "builtin") ||
				(filter === 2 && item.origin === "installed") ||
				(filter === 3 &&
					(item.state === "error" ||
						item.state === "not_trusted" ||
						item.restartRequired ||
						item.projectBlocked ||
						item.deferredRemoval))),
	);
	return (
		<div
			className="extensions"
			onKeyDown={(event) => {
				if (
					event.key === "Escape" &&
					(view !== "catalog" || chooser || requestId.current)
				) {
					event.stopPropagation();
					event.preventDefault();
					back();
				}
				if ((event.ctrlKey || event.metaKey) && event.key === "f") {
					event.preventDefault();
					search.current?.focus();
				}
			}}
		>
			<h2>Расширения</h2>
			{busy && (
				<div role="status" className="extension-operation">
					<Loader2 className="spin" size={16} />
					{operation?.phase === "committing" ? "Сохраняем…" : "Проверяем…"}{" "}
					{operation?.progress &&
						`${operation.progress.files} файлов · ${operation.progress.bytes} байт`}
					<button onClick={() => void cancel()}>Отмена</button>
				</div>
			)}
			{notice && (
				<div className="settings-notice" role="status">
					{notice}
					{failed && view === "catalog" && lastAttempt.current && !busy && (
						<button onClick={() => void prepare(lastAttempt.current!)}>
							Повторить проверку
						</button>
					)}
				</div>
			)}
			{view === "review" && review ? (
				<section className="extension-review" aria-label="Проверенный пакет">
					<h3>{review.name}</h3>
					<p>
						{review.oldVersion ? `${review.oldVersion} → ` : ""}
						{review.version} · {review.id}
					</p>
					<p>{review.description}</p>
					<dl>
						<dt>Совместимость</dt>
						<dd>
							{review.incompatible ?? "Совместим"} · {review.compatibility}
						</dd>
						<dt>SHA-256</dt>
						<dd className="digest">{review.digest}</dd>
						{review.oldDigest && review.oldDigest !== review.digest && (
							<>
								<dt>Прежний SHA-256</dt>
								<dd className="digest">{review.oldDigest}</dd>
							</>
						)}
						<dt>Установленная папка</dt>
						<dd>{review.location}</dd>
						<dt>Содержимое</dt>
						<dd>
							{review.files} файлов · {review.bytes} байт · entry:{" "}
							{review.entry}
						</dd>
					</dl>
					{review.oldDigest && review.oldDigest !== review.digest && (
						<p className="settings-notice">
							Содержимое изменилось. Для новой версии требуется отдельное
							подтверждение.
						</p>
					)}
					{review.kind === "remove" ? (
						<p className="settings-notice">
							Подключение будет удалено. Загруженный JavaScript продолжает
							работать до выхода. Занятые файлы удаляются позже;
							пользовательские данные и история сохраняются.
						</p>
					) : (
						<>
							<p className="settings-notice">
								Доверенный JavaScript получает доступ процесса к файлам, сети и
								запуску программ. SHA-256 связывает содержимое и не подтверждает
								автора пакета.
							</p>
							<label className="extension-trust">
								<input
									type="checkbox"
									aria-label="Доверяю этому содержимому"
									checked={trusted}
									disabled={busy || !!review.incompatible}
									onChange={(e) => setTrusted(e.target.checked)}
								/>
								Доверяю именно этому содержимому
								{review.kind === "install" || review.kind === "trust"
									? " и включаю расширение"
									: ""}
							</label>
						</>
					)}
					<div className="settings-actions">
						<button
							className="primary"
							disabled={
								busy ||
								!!review.incompatible ||
								(review.kind !== "install" &&
									review.kind !== "remove" &&
									review.trustRequired &&
									!trusted)
							}
							onClick={() => void commit()}
						>
							{review.kind === "remove"
								? "Удалить"
								: review.kind === "install" && !trusted
									? "Установить без доверия"
									: review.kind === "rollback"
										? "Вернуть эту версию"
										: "Подтвердить"}
						</button>
						<button onClick={() => void cancel()}>Отмена</button>
					</div>
					<details>
						<summary>Проверенные файлы</summary>
						<ul className="extension-files">
							{review.contents.map((file) => (
								<li key={file.path}>
									{file.path} · {file.bytes} байт{" "}
									<span className="digest">{file.digest}</span>
								</li>
							))}
						</ul>
					</details>
				</section>
			) : view === "versions" && selected ? (
				<section>
					<button onClick={back}>← К расширению</button>
					<h3>Версии · {selected.name}</h3>
					<p className="settings-hint">
						Rollback перепроверяет сохранённые файлы и доверие. Применяется
						после перезапуска.
					</p>
					{selected.versions.map((version) => (
						<div className="extension-version" key={version.key}>
							<div>
								<strong>{version.version}</strong>{" "}
								{version.selected ? "· Выбрана" : ""}{" "}
								{version.inUse ? "· Используется" : ""}
								<p className="digest">{version.digest}</p>
								<p>
									{version.trusted ? "Доверие сохранено" : "Доверие не выдано"}
								</p>
							</div>
							<button
								disabled={busy || version.selected}
								onClick={() =>
									void prepare({
										kind: "rollback",
										id: selected.id,
										versionKey: version.key,
									})
								}
							>
								Проверить rollback
							</button>
						</div>
					))}
				</section>
			) : view === "settings" && settings ? (
				<section>
					<button onClick={back}>← К расширению</button>
					<h3>Настройки · {selected?.name}</h3>
					{!settings.schema.fields.length ? (
						<p>У этого расширения нет настроек.</p>
					) : (
						<>
							<p className="settings-hint">
								Параметры глобальные и применяются после перезапуска приложения.
							</p>
							{settings.unknownKeys.length > 0 && (
								<p className="settings-notice">
									Сохранены неизвестные поля: {settings.unknownKeys.join(", ")}.
									Они не удаляются при сохранении или сбросе этой формы.
								</p>
							)}
							{settings.issues.map((issue) => (
								<p className="settings-notice" key={issue}>
									{issue}
								</p>
							))}
							<div className="form-grid">
								{settings.schema.fields.map((field) => (
									<label
										key={field.name}
										className={field.type === "string" ? "full" : ""}
									>
										{field.label}
										{field.secret ? (
											<>
												<input
													type="password"
													aria-label={field.label}
													autoComplete="new-password"
													value={secrets[field.name] ?? ""}
													placeholder={
														clearSecrets.includes(field.name)
															? "Будет удалён"
															: settings.secretSet[field.name]
																? "Сохранён · оставьте пустым"
																: "Не задан"
													}
													onChange={(e) => {
														const next = { ...secrets };
														if (e.target.value)
															next[field.name] = e.target.value;
														else delete next[field.name];
														setSecrets(next);
														setClearSecrets(
															clearSecrets.filter(
																(name) => name !== field.name,
															),
														);
													}}
												/>
												<span>
													<button
														type="button"
														onClick={() => {
															setClearSecrets([...clearSecrets, field.name]);
															const next = { ...secrets };
															delete next[field.name];
															setSecrets(next);
														}}
													>
														Удалить сохранённый секрет
													</button>
												</span>
											</>
										) : field.type === "boolean" ? (
											<input
												aria-label={field.label}
												type="checkbox"
												checked={values[field.name] === true}
												onChange={(e) =>
													setValues({
														...values,
														[field.name]: e.target.checked,
													})
												}
											/>
										) : field.type === "enum" ? (
											<select
												aria-label={field.label}
												value={String(values[field.name] ?? "")}
												onChange={(e) =>
													setValues({ ...values, [field.name]: e.target.value })
												}
											>
												<option value="" disabled>
													Выберите значение
												</option>
												{field.options?.map((option) => (
													<option key={option.value} value={option.value}>
														{option.label}
													</option>
												))}
											</select>
										) : (
											<input
												aria-label={field.label}
												type={field.type === "number" ? "number" : "text"}
												value={
													values[field.name] === undefined
														? ""
														: String(values[field.name])
												}
												min={field.min}
												max={field.max}
												step={field.integer ? "1" : "any"}
												minLength={field.minLength}
												maxLength={field.maxLength}
												onChange={(e) => {
													const next = { ...values };
													if (field.type === "number" && !e.target.value)
														delete next[field.name];
													else
														next[field.name] =
															field.type === "number"
																? Number(e.target.value)
																: e.target.value;
													setValues(next);
												}}
											/>
										)}
										{field.description && (
											<span className="settings-hint">{field.description}</span>
										)}
									</label>
								))}
							</div>
							<div className="settings-actions">
								<button
									className="primary"
									disabled={busy}
									onClick={() => void save()}
								>
									Сохранить
								</button>
								<button disabled={busy} onClick={() => void save(true)}>
									Сбросить
								</button>
								<button
									disabled={busy}
									onClick={() => {
										setValues(settings.values);
										setSecrets({});
										setClearSecrets([]);
									}}
								>
									Отменить изменения
								</button>
								<button
									disabled={busy}
									onClick={() =>
										void work(async () => {
											if (selected) {
												const current = await window.chisel.request(
													"extensions/settings/read",
													{
														id: selected.id,
														digest: selected.digest!,
														revision: selected.revision,
													},
												);
												setSettings(current);
												setNotice(
													"Состояние перечитано; введённые значения сохранены. Подтвердите сохранение заново.",
												);
											}
										})
									}
								>
									Перечитать, сохранив ввод
								</button>
							</div>
						</>
					)}
				</section>
			) : view === "builtin" && selected ? (
				<BuiltinExtensionSettings
					id={selected.id}
					path={path}
					onBack={back}
					onChanged={refresh}
					onDirty={setBuiltinDirty}
				/>
			) : (
				<>
					<div className="extensions-toolbar">
						<button
							className="primary"
							disabled={busy}
							onClick={() => setChooser("install")}
						>
							Установить
						</button>
						<button disabled={busy} onClick={() => void work(refresh)}>
							Обновить список
						</button>
						<label className="extension-search">
							<Search size={15} />
							<input
								ref={search}
								aria-label="Поиск расширений"
								placeholder="Поиск расширений"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
							/>
						</label>
					</div>
					{chooser && (
						<div
							className="extension-source"
							role="group"
							aria-label="Источник пакета"
						>
							<span>
								{chooser === "install" ? "Установить из" : "Обновить из"}
							</span>
							<button
								disabled={busy}
								onClick={() =>
									void prepare({
										kind: chooser,
										sourceKind: "directory",
										...(chooser === "update" ? { id: selectedId } : {}),
									})
								}
							>
								Подготовленной папки
							</button>
							<button
								disabled={busy}
								onClick={() =>
									void prepare({
										kind: chooser,
										sourceKind: "zip",
										...(chooser === "update" ? { id: selectedId } : {}),
									})
								}
							>
								ZIP
							</button>
							<button onClick={() => setChooser(undefined)}>Отмена</button>
						</div>
					)}
					<div className="extension-filters" aria-label="Фильтр расширений">
						{filters.map((label, index) => (
							<button
								key={label}
								aria-pressed={filter === index}
								className={filter === index ? "selected" : ""}
								onClick={() => setFilter(index)}
							>
								{label}
							</button>
						))}
					</div>
					<div className="extension-columns">
						<div className="extension-list" aria-label="Список расширений">
							{!visible.length && (
								<p className="settings-hint" role="status">
									{loading ? "Загрузка каталога…" : "Нет расширений по фильтру."}
								</p>
							)}
							{visible.map((item) => (
								<button
									key={item.id}
									className={`extension-row ${selectedId === item.id ? "selected" : ""}`}
									aria-pressed={selectedId === item.id}
									onClick={() => setSelectedId(item.id)}
								>
									<span>{item.name}</span>
									<small>
										{item.version} · {states[item.state]}
									</small>
								</button>
							))}
						</div>
						<section
							className="extension-details"
							aria-label="Подробности расширения"
						>
							{selected ? (
								<>
									<h3>{selected.name}</h3>
									<p>
										{selected.version} ·{" "}
										<span className={`extension-state ${selected.state}`}>
											{states[selected.state]}
										</span>
									</p>
									<p>{selected.description}</p>
									<dl>
										<dt>ID</dt>
										<dd>{selected.id}</dd>
										<dt>Источник</dt>
										<dd>{selected.source}</dd>
										<dt>Совместимость</dt>
										<dd>{selected.compatibility}</dd>
										<dt>Доверие</dt>
										<dd>{selected.trusted ? "Подтверждено" : "Не выдано"}</dd>
										<dt>Сохранено</dt>
										<dd>
											{selected.desiredEnabled ? "Включено" : "Выключено"}
										</dd>
										<dt>Сейчас</dt>
										<dd>{selected.actualLabel}</dd>
									</dl>
									{selected.reason && (
										<p className="settings-notice">{selected.reason}</p>
									)}
									{selected.deferredRemoval && (
										<p className="settings-notice">
											Удаление занятых файлов отложено; пользовательские данные
											сохранены.
										</p>
									)}
									{selected.restartRequired && (
										<p className="settings-notice">
											Загруженная версия сохраняется до выхода. Перезапуск
											применит сохранённые изменения.
										</p>
									)}
									<div className="settings-actions">
										{selected.actions.map((name) => (
											<button
												key={name}
												disabled={
													busy || (selected.origin === "builtin" && !path)
												}
												onClick={() => action(name)}
											>
												{labels[name]}
											</button>
										))}
									</div>
								</>
							) : (
								<p>Выберите расширение.</p>
							)}
						</section>
					</div>
				</>
			)}
			{(items.some((item) => item.restartRequired) ||
				notice.includes("перезапуск")) && (
				<div className="extension-restart">
					<p>
						Дождитесь задач или остановите их и фоновые процессы. Беседа и
						черновик сохранятся.
					</p>
					<button disabled={busy || dirty} onClick={() => void work(onRestart)}>
						Перезапустить приложение
					</button>
				</div>
			)}
		</div>
	);
}
