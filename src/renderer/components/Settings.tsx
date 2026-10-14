import { useEffect, useState } from "react";
import {
	ArrowUpRight,
	Check,
	ChevronRight,
	Download,
	Globe,
	KeyRound,
	Loader2,
	Plug,
	Plus,
	Settings2,
	Sparkles,
	X,
} from "lucide-react";
import type { Json, Profile, Provider } from "@chiselcode/desktop-sdk";
import type { UpdateStatus } from "../../shared/bridge.js";
interface Props {
	path?: string;
	profiles: Profile[];
	providers: Provider[];
	version?: string;
	engineVersion?: string;
	theme: string;
	onTheme(value: string): void;
	onClose(): void;
	onSaved(): Promise<void>;
	report(error: unknown): void;
}
type McpItem = {
	id: string;
	label: string;
	state: string;
	trusted: boolean;
	enabled: boolean;
	toolsCount: number;
	lastError?: { message: string };
};
export default function Settings(props: Props) {
	const [section, setSection] = useState("connection");
	const [selected, setSelected] = useState(props.profiles[0]?.id ?? "");
	const [provider, setProvider] = useState(props.providers[0]?.id ?? "openai");
	const [id, setId] = useState("my-profile");
	const [label, setLabel] = useState("");
	const [model, setModel] = useState("");
	const [endpoint, setEndpoint] = useState("");
	const [key, setKey] = useState("");
	const [saving, setSaving] = useState(false);
	const [notice, setNotice] = useState("");
	const [models, setModels] = useState<{ id: string; name: string }[]>([]);
	const [servers, setServers] = useState<McpItem[]>([]);
	const [mcpId, setMcpId] = useState("");
	const [mcpUrl, setMcpUrl] = useState("");
	const [mcpType, setMcpType] = useState("http");
	const [mcpArgs, setMcpArgs] = useState("");
	const [settings, setSettings] = useState<Record<string, Json>>({});
	const [update, setUpdate] = useState<UpdateStatus>({ state: "idle" });
	useEffect(() => {
		const profile = props.profiles.find((item) => item.id === selected);
		if (profile) {
			setId(profile.id);
			setLabel(profile.label);
			setProvider(profile.providerId);
			setModel(profile.model);
			setEndpoint(profile.baseUrl ?? "");
			setKey("");
		} else {
			const definition = props.providers.find((item) => item.id === provider);
			setId("my-profile");
			setLabel("");
			setModel(definition?.defaultModel ?? "");
			setEndpoint(definition?.defaultBaseUrl ?? "");
			setKey("");
		}
	}, [selected]);
	useEffect(() => {
		void window.chisel
			.request("settings/read", {})
			.then((value) => setSettings(value as Record<string, Json>))
			.catch(props.report);
		return window.chisel.onUpdate(setUpdate);
	}, []);
	async function loadMcp() {
		if (props.path)
			setServers(
				(await window.chisel.request("mcp/list", {
					path: props.path,
				})) as unknown as McpItem[],
			);
	}
	useEffect(() => {
		if (section === "mcp") void loadMcp().catch(props.report);
	}, [section]);
	async function action(work: () => Promise<void>) {
		setSaving(true);
		setNotice("");
		try {
			await work();
		} catch (error) {
			props.report(error);
		} finally {
			setSaving(false);
		}
	}
	async function saveProfile() {
		await action(async () => {
			await window.chisel.request("profiles/save", {
				id,
				providerId: provider,
				label: label || id,
				model,
				...(endpoint ? { baseUrl: endpoint } : {}),
				...(key ? { apiKey: key } : {}),
			});
			setKey("");
			await props.onSaved();
			setSelected(id);
			setNotice("Профиль сохранён.");
		});
	}
	async function saveMcp() {
		if (!props.path) return;
		const config: Json =
			mcpType === "http"
				? { transport: { type: "http", url: mcpUrl }, label: mcpId }
				: {
						transport: {
							type: "stdio",
							command: mcpUrl,
							args: JSON.parse(mcpArgs || "[]") as Json,
						},
						label: mcpId,
					};
		await action(async () => {
			await window.chisel.request("mcp/save", {
				path: props.path!,
				id: mcpId,
				config,
			});
			setMcpId("");
			setMcpUrl("");
			await loadMcp();
			setNotice("Сервер сохранён.");
		});
	}
	const tabs = [
		{ id: "connection", icon: KeyRound, label: "Модели и подключение" },
		{ id: "appearance", icon: Sparkles, label: "Внешний вид" },
		{ id: "mcp", icon: Plug, label: "MCP-серверы" },
		{ id: "tools", icon: Globe, label: "Инструменты" },
		{ id: "about", icon: Settings2, label: "О приложении" },
	];
	return (
		<div
			className="modal-backdrop"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) props.onClose();
			}}
		>
			<section
				role="dialog"
				aria-modal="true"
				aria-label="Настройки"
				className="settings-modal"
			>
				<div className="settings-nav">
					<div className="settings-title">Настройки</div>
					{tabs.map((tab) => (
						<button
							key={tab.id}
							className={section === tab.id ? "selected" : ""}
							onClick={() => {
								setSection(tab.id);
								setNotice("");
							}}
						>
							<tab.icon size={16} />
							{tab.label}
						</button>
					))}
					<div className="settings-nav-footer">
						ChiselCode Desktop
						<br />
						<span>{props.version}</span>
					</div>
				</div>
				<div className="settings-content">
					<button
						aria-label="Закрыть настройки"
						className="icon-button modal-close"
						onClick={props.onClose}
					>
						<X size={19} />
					</button>
					{section === "connection" && (
						<>
							<h2>Модели и подключение</h2>
							<div className="profile-tabs">
								{props.profiles.map((profile) => (
									<button
										className={selected === profile.id ? "selected" : ""}
										onClick={() => setSelected(profile.id)}
										key={profile.id}
									>
										{profile.label}
										{profile.hasKey && <Check size={12} />}
									</button>
								))}
								<button onClick={() => setSelected("")}>
									<Plus size={14} />
									Добавить
								</button>
							</div>
							<div className="form-grid">
								<label>
									Провайдер
									<select
										aria-label="Провайдер"
										value={provider}
										onChange={(event) => {
											const value = event.target.value;
											setProvider(value);
											const definition = props.providers.find(
												(item) => item.id === value,
											);
											setModel(definition?.defaultModel ?? "");
											setEndpoint(definition?.defaultBaseUrl ?? "");
										}}
									>
										{props.providers.map((item) => (
											<option key={item.id} value={item.id}>
												{item.label}
											</option>
										))}
									</select>
								</label>
								<label>
									ID профиля
									<input
										aria-label="ID профиля"
										value={id}
										disabled={!!selected}
										onChange={(event) => setId(event.target.value)}
										placeholder="openai-work"
									/>
								</label>
								<label className="full">
									Название
									<input
										aria-label="Название"
										value={label}
										onChange={(event) => setLabel(event.target.value)}
										placeholder="Рабочий профиль"
									/>
								</label>
								<label className="full">
									Модель
									<div className="input-action">
										<input
											aria-label="Модель"
											list="models"
											value={model}
											onChange={(event) => setModel(event.target.value)}
											placeholder="Название модели"
										/>
										<button
											disabled={!selected || saving}
											onClick={() =>
												void action(async () => {
													setModels(
														await window.chisel.request("models/list", {
															profileId: selected,
														}),
													);
													setNotice("Модели загружены.");
												})
											}
										>
											Проверить
										</button>
									</div>
									<datalist id="models">
										{models.map((item) => (
											<option key={item.id} value={item.id} />
										))}
									</datalist>
								</label>
								<label className="full">
									Адрес API
									<input
										aria-label="Адрес API"
										value={endpoint}
										onChange={(event) => setEndpoint(event.target.value)}
										placeholder="https://api.openai.com/v1"
									/>
								</label>
								<label className="full">
									API-ключ
									<input
										aria-label="API-ключ"
										type="password"
										autoComplete="off"
										value={key}
										onChange={(event) => setKey(event.target.value)}
										placeholder={
											props.profiles.find((item) => item.id === selected)
												?.hasKey
												? "Сохранён. Пустое поле не меняет ключ."
												: "API-ключ"
										}
									/>
								</label>
							</div>
							<button
								className="primary-button"
								disabled={saving || !model.trim() || !id.trim()}
								onClick={() => void saveProfile()}
							>
								{saving ? (
									<Loader2 className="spin" size={16} />
								) : (
									<Check size={16} />
								)}
								Сохранить профиль
							</button>
						</>
					)}
					{section === "appearance" && (
						<>
							<h2>Внешний вид</h2>
							<div className="theme-options">
								{["dark", "light", "system"].map((theme) => (
									<button
										key={theme}
										className={`theme-preview ${theme} ${props.theme === theme ? "selected" : ""}`}
										onClick={() => props.onTheme(theme)}
									>
										<div>
											<i />
											<i />
											<i />
										</div>
										<span>
											{theme === "dark"
												? "Тёмная"
												: theme === "light"
													? "Светлая"
													: "Системная"}
										</span>
										{props.theme === theme && <Check size={15} />}
									</button>
								))}
							</div>
							<div className="setting-row">
								<div>
									<strong>Горячие клавиши</strong>
									<p>Новая беседа · Настройки · Отправить</p>
								</div>
								<span className="shortcut">Ctrl/⌘ N · Ctrl/⌘ , · Enter</span>
							</div>
							<p className="subtle">
								Shift+Enter добавляет строку. Shift+Tab переключает Plan и
								Build. Esc закрывает окно.
							</p>
						</>
					)}
					{section === "mcp" && (
						<>
							<h2>MCP-серверы</h2>
							{!props.path && (
								<p className="info-note">Сначала откройте проект.</p>
							)}
							<div className="server-list">
								{servers.map((server) => (
									<div className="server-row" key={server.id}>
										<Plug size={18} />
										<div>
											<strong>{server.label || server.id}</strong>
											<p>
												{server.state} · {server.toolsCount} инструментов
												{!server.trusted && " · требуется доверие"}
											</p>
											{server.lastError && (
												<small className="error-text">
													{server.lastError.message}
												</small>
											)}
										</div>
										<button
											disabled={saving}
											onClick={() =>
												void action(async () => {
													await window.chisel.request("mcp/action", {
														path: props.path!,
														id: server.id,
														action: !server.trusted
															? "trust"
															: server.state === "connected"
																? "disconnect"
																: "connect",
													});
													await loadMcp();
												})
											}
										>
											{!server.trusted
												? "Доверять"
												: server.state === "connected"
													? "Отключить"
													: "Подключить"}
										</button>
									</div>
								))}
							</div>
							<h3>Добавить сервер</h3>
							<div className="form-grid">
								<label>
									ID
									<input
										value={mcpId}
										onChange={(event) => setMcpId(event.target.value)}
										placeholder="docs"
									/>
								</label>
								<label>
									Подключение
									<select
										value={mcpType}
										onChange={(event) => setMcpType(event.target.value)}
									>
										<option value="http">HTTP</option>
										<option value="stdio">Локальная команда</option>
									</select>
								</label>
								<label className="full">
									{mcpType === "http" ? "URL сервера" : "Исполняемый файл"}
									<input
										value={mcpUrl}
										onChange={(event) => setMcpUrl(event.target.value)}
										placeholder={
											mcpType === "http" ? "https://example.com/mcp" : "npx"
										}
									/>
								</label>
								{mcpType === "stdio" && (
									<label className="full">
										Аргументы (JSON-массив)
										<input
											value={mcpArgs}
											onChange={(event) => setMcpArgs(event.target.value)}
											placeholder={'["-y", "@example/server"]'}
										/>
									</label>
								)}
							</div>
							<p className="subtle">
								{mcpType === "stdio"
									? "Проверка запускает локальную команду."
									: "Проверка подключается к URL."}
							</p>
							<button
								className="primary-button"
								disabled={saving || !props.path || !mcpId || !mcpUrl}
								onClick={() => void saveMcp()}
							>
								<Plus size={16} />
								Проверить и сохранить
							</button>
						</>
					)}
					{section === "tools" && (
						<>
							<h2>Инструменты</h2>
							<div className="setting-row">
								<div>
									<strong>Поиск в интернете</strong>
								</div>
								<button
									className="toggle-button"
									onClick={() =>
										void action(async () => {
											const current =
												settings.web &&
												typeof settings.web === "object" &&
												!Array.isArray(settings.web)
													? settings.web
													: {};
											const value = {
												...current,
												enabled: current.enabled === false,
											};
											await window.chisel.request("settings/patch", {
												section: "web",
												value,
											});
											setSettings({ ...settings, web: value });
										})
									}
								>
									{settings.web &&
									typeof settings.web === "object" &&
									!Array.isArray(settings.web) &&
									settings.web.enabled === false
										? "Выключен"
										: "Включён"}
								</button>
							</div>
							<div className="setting-row">
								<div>
									<strong>Анализ кода (LSP)</strong>
								</div>
								<span className="subtle">/lsp-status · /lsp-restart</span>
							</div>
						</>
					)}
					{section === "about" && (
						<>
							<div className="about-logo">
								C<span>_</span>
							</div>
							<h2>ChiselCode Desktop</h2>
							<div className="version-table">
								<div>
									<span>Desktop</span>
									<strong>{props.version}</strong>
								</div>
								<div>
									<span>Общее ядро ChiselCode</span>
									<strong>{props.engineVersion ?? "Недоступно"}</strong>
								</div>
								<div>
									<span>Протокол</span>
									<strong>1.0</strong>
								</div>
								<div>
									<span>Канал</span>
									<strong>Beta</strong>
								</div>
							</div>
							<button
								className="primary-button"
								disabled={
									update.state === "checking" || update.state === "downloading"
								}
								onClick={() =>
									void window.chisel.update(
										update.state === "available"
											? "download"
											: update.state === "downloaded"
												? "install"
												: "check",
									)
								}
							>
								{update.state === "checking" ? (
									<Loader2 className="spin" size={15} />
								) : (
									<Download size={15} />
								)}{" "}
								{update.state === "available"
									? `Скачать ${update.version}`
									: update.state === "downloaded"
										? "Установить и перезапустить"
										: update.state === "downloading"
											? `Загрузка ${Math.round(update.progress ?? 0)}%`
											: "Проверить обновления"}
							</button>
							{update.message && <p className="subtle">{update.message}</p>}
							{update.state === "current" && (
								<p className="success-text">Обновлений нет.</p>
							)}
							<button
								className="text-button"
								onClick={() =>
									void window.chisel.openExternal(
										"https://github.com/TheAsrada/ChiselCodeDesktop/releases",
									)
								}
							>
								<ArrowUpRight size={15} />
								Выпуски на GitHub
							</button>
							<p className="subtle">
								Beta: Windows без подписи издателя, macOS без notarization.
							</p>
						</>
					)}
					{notice && (
						<div role="status" className="success-note">
							<Check size={16} />
							{notice}
						</div>
					)}
				</div>
			</section>
		</div>
	);
}
