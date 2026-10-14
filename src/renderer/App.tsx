import { useCallback, useEffect, useRef, useState } from "react";
import {
	ArrowDown,
	ArrowRight,
	ArrowUp,
	Bell,
	BookOpen,
	Check,
	ChevronDown,
	ChevronRight,
	Circle,
	Code2,
	Command,
	FileCode2,
	Folder,
	FolderOpen,
	GitBranch,
	Loader2,
	MessageSquare,
	Minus,
	Moon,
	PanelRightClose,
	PanelRightOpen,
	Plus,
	Search,
	Settings2,
	ShieldCheck,
	Square,
	Sun,
	Terminal,
	Trash2,
	X,
	Zap,
} from "lucide-react";
import type {
	Approval,
	EngineEvent,
	GitState,
	Json,
	Profile,
	Project,
	Provider,
	Session,
	SessionSummary,
	StartTurn,
} from "@chiselcode/desktop-sdk";
import type { NativeStatus } from "../shared/bridge.js";
import {
	DiffCard,
	Markdown,
	MessageView,
	Patch,
} from "./components/Content.js";
import Settings from "./components/Settings.js";
import { BrandMark, ChiselSculpture } from "./components/Brand.js";
interface LiveTool {
	id: string;
	name: string;
	state: string;
	output?: string;
	diffs?: import("@chiselcode/desktop-sdk").Diff[];
}
interface Run {
	turnId: string;
	text: string;
	phase: string;
	tools: LiveTool[];
}
const suggestions = [
	{
		icon: Search,
		title: "Изучить проект",
		mode: "plan" as const,
		prompt:
			"Изучи структуру проекта, объясни его архитектуру и основные точки входа. Пока ничего не меняй.",
	},
	{
		icon: Code2,
		title: "Исправить ошибку",
		mode: "build" as const,
		prompt:
			"Помоги найти и исправить ошибку в проекте. Начни с изучения кода и предложи план проверки.",
	},
	{
		icon: ShieldCheck,
		title: "Проверить изменения",
		mode: "plan" as const,
		prompt:
			"Проверь текущие изменения Git. Найди ошибки, риски и пропущенные проверки, со ссылками на файлы.",
	},
];
function text(error: unknown) {
	return error instanceof Error
		? error.message.replace(
				/^Error invoking remote method '[^']+': (?:Error: )?/,
				"",
			)
		: "Не удалось выполнить действие.";
}
function name(path?: string) {
	return path?.split(/[\\/]/).filter(Boolean).at(-1) ?? "Проект";
}
function objects(value: Json): Record<string, Json>[] {
	return value && typeof value === "object" && !Array.isArray(value)
		? Object.values(value).filter(
				(item): item is Record<string, Json> =>
					!!item && typeof item === "object" && !Array.isArray(item),
			)
		: [];
}
export default function App() {
	const [ready, setReady] = useState(false);
	const [info, setInfo] =
		useState<Awaited<ReturnType<Window["chisel"]["info"]>>>();
	const [projects, setProjects] = useState<Project[]>([]);
	const [project, setProject] = useState<Project>();
	const [sessions, setSessions] = useState<SessionSummary[]>([]);
	const [session, setSession] = useState<Session>();
	const [profiles, setProfiles] = useState<Profile[]>([]);
	const [providers, setProviders] = useState<Provider[]>([]);
	const [profileId, setProfileId] = useState("");
	const [model, setModel] = useState("");
	const [mode, setMode] = useState<StartTurn["mode"]>("build");
	const [permissions, setPermissions] =
		useState<StartTurn["approvalMode"]>("default");
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [runs, setRuns] = useState<Record<string, Run>>({});
	const [queue, setQueue] = useState<Record<string, StartTurn[]>>({});
	const [approvals, setApprovals] = useState<Approval[]>([]);
	const [approvalId, setApprovalId] = useState<string>();
	const [git, setGit] = useState<GitState | null>(null);
	const [inspector, setInspector] = useState(true);
	const [inspectorTab, setInspectorTab] = useState("changes");
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [projectMenu, setProjectMenu] = useState(false);
	const [sessionSearch, setSessionSearch] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [fatal, setFatal] = useState("");
	const [theme, setTheme] = useState(
		localStorage.getItem("chisel:theme") ?? "light",
	);
	const [skills, setSkills] = useState<
		{ name: string; description: string; source: string }[]
	>([]);
	const [commands, setCommands] = useState<
		{ name: string; description: string; usage?: string }[]
	>([]);
	const [tasks, setTasks] = useState<Record<string, Json>>({});
	const [detail, setDetail] = useState<{
		title: string;
		patch?: string;
		content?: string;
	}>();
	const [visible, setVisible] = useState(100);
	const [following, setFollowing] = useState(true);
	const transcript = useRef<HTMLDivElement>(null);
	const composer = useRef<HTMLTextAreaElement>(null);
	const selected = useRef({ path: "", id: "" });
	const queueRef = useRef(queue);
	queueRef.current = queue;
	const sessionKey = session?.id ?? `draft:${project?.path ?? "home"}`;
	const draft = drafts[sessionKey] ?? "";
	const run = session ? runs[session.id] : undefined;
	const approval = approvals.find((item) => item.requestId === approvalId);
	const approvalPreview =
		approval &&
		approval.preview.trim() !==
			(approval.diffs ?? [])
				.map((diff) => diff.patch)
				.join("\n")
				.trim()
			? approval.preview
			: "";
	const report = useCallback((error: unknown) => setError(text(error)), []);
	selected.current = { path: project?.path ?? "", id: session?.id ?? "" };
	useEffect(() => {
		const apply = () =>
			(document.documentElement.dataset.theme =
				theme === "system"
					? matchMedia("(prefers-color-scheme: light)").matches
						? "light"
						: "dark"
					: theme);
		apply();
		localStorage.setItem("chisel:theme", theme);
		const media = matchMedia("(prefers-color-scheme: light)");
		media.addEventListener("change", apply);
		return () => media.removeEventListener("change", apply);
	}, [theme]);
	async function loadProfiles() {
		const value = await window.chisel.request("profiles/list", {});
		setProfiles(value.profiles);
		setProviders(value.providers);
		if (!profileId) {
			const current =
				value.profiles.find((item) => item.id === value.defaultProfileId) ??
				value.profiles[0];
			if (current) {
				setProfileId(current.id);
				setModel(current.model);
			}
		}
	}
	async function openProject(path?: string) {
		const chosen = path ?? (await window.chisel.openProject());
		if (!chosen) return;
		const item = await window.chisel.request("projects/open", { path: chosen });
		selected.current = { path: item.path, id: "" };
		setProject(item);
		setSession(undefined);
		setGit(null);
		setTasks({});
		setProjectMenu(false);
		setVisible(100);
		setError("");
		localStorage.setItem("chisel:last-project", item.path);
		const [list, recent, status, skillList, commandList] = await Promise.all([
			window.chisel.request("sessions/list", { path: item.path }),
			window.chisel.request("projects/list", {}),
			window.chisel.request("git/status", { path: item.path }),
			window.chisel.request("skills/list", { path: item.path }),
			window.chisel.request("commands/list", { path: item.path }),
		]);
		if (selected.current.path !== item.path) return;
		setSessions(list);
		setProjects(recent);
		setGit(status);
		setSkills(skillList);
		setCommands(commandList);
		composer.current?.focus();
	}
	async function openSession(item: SessionSummary) {
		if (!project) return;
		const value = await window.chisel.request("sessions/read", {
			path: project.path,
			sessionId: item.id,
		});
		setSession(value);
		selected.current = { path: project.path, id: value.id };
		setProfileId(value.profileId);
		setModel(value.model);
		setMode(value.mode);
		setPermissions(value.approvalMode);
		setVisible(100);
		setFollowing(true);
		setError("");
		setTasks(
			(await window.chisel.request("tasks/list", {
				path: project.path,
				sessionId: item.id,
			})) as Record<string, Json>,
		);
		composer.current?.focus();
	}
	function newConversation() {
		setSession(undefined);
		setTasks({});
		setVisible(100);
		setFollowing(true);
		setError("");
		composer.current?.focus();
	}
	async function refresh(id: string, path: string) {
		const [item, list, status, taskList] = await Promise.all([
			window.chisel.request("sessions/read", { path, sessionId: id }),
			window.chisel.request("sessions/list", { path }),
			window.chisel.request("git/status", { path }),
			window.chisel.request("tasks/list", { path, sessionId: id }),
		]);
		if (selected.current.path === path) {
			setSessions(list);
			setGit(status);
			if (selected.current.id === id) {
				setSession(item);
				setTasks(taskList as Record<string, Json>);
			}
		}
	}
	useEffect(() => {
		if (!window.chisel) {
			setFatal("Запустите ChiselCode Desktop из установленного приложения.");
			return;
		}
		let alive = true;
		void (async () => {
			const value = await window.chisel.info();
			if (!alive) return;
			setInfo(value);
			setReady(true);
			const catalog = await window.chisel.request("profiles/list", {});
			setProfiles(catalog.profiles);
			setProviders(catalog.providers);
			const current =
				catalog.profiles.find((item) => item.id === catalog.defaultProfileId) ??
				catalog.profiles[0];
			if (current) {
				setProfileId(current.id);
				setModel(current.model);
			}
			const recent = await window.chisel.request("projects/list", {});
			setProjects(recent);
			const last = localStorage.getItem("chisel:last-project");
			if (last && recent.some((item) => item.path === last))
				await openProject(last);
		})().catch((error) => {
			if (alive) setFatal(text(error));
		});
		const unsubscribe = window.chisel.onEvent(
			(event: EngineEvent["params"]) => {
				const data = (event.data ?? {}) as Record<string, Json>;
				if (event.type === "turn.started")
					setRuns((current) => ({
						...current,
						[event.sessionId]: {
							turnId: event.turnId,
							text: "",
							phase: "Выполняется",
							tools: [],
						},
					}));
				if (event.type === "runtime") {
					setRuns((current) => {
						const value = current[event.sessionId];
						if (!value || value.turnId !== event.turnId) return current;
						const next = { ...value, tools: [...value.tools] };
						if (data.type === "provider_text_delta") {
							next.text += String(data.text ?? "");
							next.phase = "Ответ";
						}
						if (data.type === "turn_state")
							next.phase =
								data.state === "awaiting_approval"
									? "Ждёт подтверждения"
									: data.state === "calling_provider"
										? "Запрос к модели"
										: data.state === "executing_tools"
											? "Выполнение инструментов"
											: next.phase;
						if (data.type === "context_compaction_started")
							next.phase = "Сжатие контекста";
						if (data.type === "tool_started") {
							next.phase = String(data.name ?? "Выполняет инструмент");
							next.tools.push({
								id: String(data.invocationId),
								name: String(data.name),
								state: "running",
							});
						}
						if (data.type === "tool_completed" || data.type === "tool_failed") {
							const result = data.result as Record<string, Json> | undefined;
							next.tools = next.tools.map((tool) =>
								tool.id === data.invocationId
									? {
											...tool,
											state:
												data.type === "tool_failed" || result?.isError
													? "failed"
													: "completed",
											output: String(result?.output ?? ""),
											diffs: (result?.diffs ??
												(result?.fileDiff
													? [result.fileDiff]
													: [])) as unknown as LiveTool["diffs"],
										}
									: tool,
							);
						}
						if (data.type === "command_result") {
							const result = data.result as Record<string, Json>;
							next.text += String(result.output ?? "");
						}
						return { ...current, [event.sessionId]: next };
					});
				}
				if (event.type === "approval.requested") {
					const value = event.data as unknown as Approval;
					setApprovals((current) => [
						...current.filter((item) => item.requestId !== value.requestId),
						value,
					]);
					if (selected.current.id === event.sessionId)
						setApprovalId(value.requestId);
				}
				if (event.type === "approval.resolved") {
					setApprovals((current) =>
						current.filter((item) => item.requestId !== data.requestId),
					);
					setApprovalId((current) =>
						current === data.requestId ? undefined : current,
					);
				}
				if (event.type === "subagent" || event.type === "background") {
					if (selected.current.id === event.sessionId)
						void window.chisel
							.request("tasks/list", {
								path: selected.current.path,
								sessionId: event.sessionId,
							})
							.then((value) => setTasks(value as Record<string, Json>))
							.catch(report);
				}
				if (event.type === "worktree.opened") {
					setError(
						`Рабочая копия готова: ${String(data.path)}. Откройте её через выбор проекта.`,
					);
				}
				if (event.type === "turn.completed") {
					if (data.error) setError(String(data.error));
					const path = selected.current.path;
					// Keep the final streamed text until durable history has replaced it.
					void (async () => {
						if (path && selected.current.id === event.sessionId)
							await refresh(event.sessionId, path);
						setRuns((current) => {
							const next = { ...current };
							delete next[event.sessionId];
							return next;
						});
						const waiting = queueRef.current[event.sessionId] ?? [];
						const next = waiting[0];
						if (next) {
							setQueue((current) => ({
								...current,
								[event.sessionId]: (current[event.sessionId] ?? []).slice(1),
							}));
							await window.chisel.request("turn/start", next);
						}
					})().catch(report);
				}
			},
		);
		const status = window.chisel.onStatus((status: NativeStatus) => {
			if (status.state === "error") {
				setReady(false);
				setFatal(status.message ?? "Ядро недоступно.");
			}
		});
		return () => {
			alive = false;
			unsubscribe();
			status();
		};
	}, []);
	useEffect(() => {
		if (following)
			transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
	}, [
		session?.messages.length,
		run?.text,
		run?.tools.length,
		following,
		session?.id,
	]);
	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
				event.preventDefault();
				newConversation();
			}
			if ((event.ctrlKey || event.metaKey) && event.key === ",") {
				event.preventDefault();
				setSettingsOpen((value) => !value);
			}
			if (event.key === "Escape") {
				setSettingsOpen(false);
				setDetail(undefined);
				setApprovalId(undefined);
				setProjectMenu(false);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);
	function setDraft(value: string) {
		setDrafts((current) => ({ ...current, [sessionKey]: value }));
	}
	async function submit() {
		if (!draft.trim() || submitting || !ready) return;
		if (!project) {
			await openProject().catch(report);
			return;
		}
		if (!profiles.some((item) => item.id === profileId) || !model.trim()) {
			setSettingsOpen(true);
			return;
		}
		setSubmitting(true);
		setError("");
		try {
			const item =
				session ??
				(await window.chisel.request("sessions/create", {
					path: project.path,
					profileId,
					model,
				}));
			if (!session) {
				setSession(item);
				selected.current.id = item.id;
				setSessions((current) => [
					item,
					...current.filter((value) => value.id !== item.id),
				]);
			}
			const input: StartTurn = {
				path: project.path,
				sessionId: item.id,
				prompt: draft.trim(),
				profileId,
				model,
				mode,
				approvalMode: permissions,
			};
			if (runs[item.id])
				setQueue((current) => ({
					...current,
					[item.id]: [...(current[item.id] ?? []), input],
				}));
			else {
				await window.chisel.request("turn/start", input);
				setSession((current) =>
					current?.id === item.id
						? {
								...current,
								messages: [
									...current.messages,
									{
										id: `optimistic:${Date.now()}`,
										role: "user",
										text: input.prompt,
									},
								],
							}
						: current,
				);
			}
			setDrafts((current) => ({ ...current, [sessionKey]: "", [item.id]: "" }));
			setFollowing(true);
		} catch (error) {
			report(error);
		} finally {
			setSubmitting(false);
		}
	}
	async function respond(decision: "approved" | "denied") {
		if (!approval) return;
		try {
			await window.chisel.request("approvals/respond", {
				requestId: approval.requestId,
				decision,
			});
		} catch (error) {
			report(error);
		}
	}
	async function cancel() {
		if (!session) return;
		setQueue((current) => ({ ...current, [session.id]: [] }));
		await window.chisel.request("turn/cancel", { sessionId: session.id });
	}
	const taskItems = [
		...objects(tasks.children ?? {}).map((receipt) =>
			receipt.child &&
			typeof receipt.child === "object" &&
			!Array.isArray(receipt.child)
				? receipt.child
				: receipt,
		),
		...objects(tasks.background ?? {}),
	];
	const emptyConversation = !session?.messages.length && !run;
	function showInspector(tab: string) {
		setInspector(true);
		setInspectorTab(tab);
	}
	return (
		<>
			<div
				className={`app-shell ${emptyConversation ? "is-home" : "is-conversation"}`}
				inert={settingsOpen || !!approval || !!detail ? true : undefined}
			>
				<header
					className={`titlebar ${info?.platform === "darwin" ? "mac" : ""}`}
				>
					<div className="titlebar-brand">
						<strong>ChiselCode</strong>
					</div>
					{info?.platform !== "darwin" && (
						<div className="window-controls">
							<button
								aria-label="Свернуть"
								onClick={() => void window.chisel.window("minimize")}
							>
								<Minus size={15} />
							</button>
							<button
								aria-label="Развернуть"
								onClick={() => void window.chisel.window("maximize")}
							>
								<Square size={12} />
							</button>
							<button
								aria-label="Закрыть приложение"
								onClick={() => void window.chisel.window("close")}
							>
								<X size={16} />
							</button>
						</div>
					)}
				</header>
				<nav className="navigation-rail" aria-label="Навигация">
					<button
						className="rail-brand"
						aria-label="Начальный экран"
						title="Начальный экран"
						onClick={newConversation}
					>
						<BrandMark size={27} />
					</button>
					<div className="rail-main">
						<button
							aria-label="Проекты"
							title="Проекты"
							aria-pressed={projectMenu}
							onClick={() => setProjectMenu(!projectMenu)}
						>
							<FolderOpen size={20} />
						</button>
						<button
							aria-label="Начать беседу"
							title="Начать беседу"
							aria-pressed={emptyConversation}
							onClick={newConversation}
						>
							<MessageSquare size={20} />
						</button>
						<span className="rail-divider" />
						<button
							className="rail-context"
							aria-label="Панель изменений"
							title="Изменения"
							aria-pressed={inspector && inspectorTab === "changes"}
							onClick={() => showInspector("changes")}
						>
							<GitBranch size={20} />
						</button>
						<button
							className="rail-context"
							aria-label="Панель задач"
							title="Задачи"
							aria-pressed={inspector && inspectorTab === "tasks"}
							onClick={() => showInspector("tasks")}
						>
							<Terminal size={20} />
						</button>
						<button
							className="rail-context"
							aria-label="Панель контекста"
							title="Контекст"
							aria-pressed={inspector && inspectorTab === "context"}
							onClick={() => showInspector("context")}
						>
							<Command size={20} />
						</button>
					</div>
					<div className="rail-bottom">
						<button
							aria-label="Переключить тему"
							title="Переключить тему"
							onClick={() =>
								setTheme(
									document.documentElement.dataset.theme === "dark"
										? "light"
										: "dark",
								)
							}
						>
							<Sun size={20} className="theme-sun" />
							<Moon size={20} className="theme-moon" />
						</button>
						<button
							aria-label="Документация"
							title="Документация"
							onClick={() =>
								void window.chisel.openExternal(
									"https://github.com/TheAsrada/ChiselCodeDesktop/blob/main/docs/README.md",
								)
							}
						>
							<BookOpen size={20} />
						</button>
						<button
							aria-label="Настройки"
							title="Настройки"
							onClick={() => setSettingsOpen(true)}
						>
							<Settings2 size={20} />
						</button>
					</div>
				</nav>
				<aside className="sidebar">
					<div className="sidebar-top">
						<button
							className="project-picker"
							data-testid="project-picker"
							data-path={project?.path}
							onClick={() => setProjectMenu(!projectMenu)}
						>
							<span className="project-icon">
								<Folder size={18} />
							</span>
							<span>
								<strong>
									{project ? name(project.path) : "Открыть проект"}
								</strong>
							</span>
							<ChevronDown size={14} />
						</button>
						{projectMenu && (
							<div className="project-menu">
								<button onClick={() => void openProject().catch(report)}>
									<FolderOpen size={15} />
									Открыть папку…
								</button>
								{projects.map((item) => (
									<button
										key={item.id}
										title={item.path}
										onClick={() => void openProject(item.path).catch(report)}
									>
										<Folder size={14} />
										<span>
											{item.name}
											<small>{item.path}</small>
										</span>
										{project?.id === item.id && <Check size={14} />}
									</button>
								))}
							</div>
						)}
						<button className="new-chat" onClick={newConversation}>
							<Plus size={17} />
							Новая беседа
							<kbd>{info?.platform === "darwin" ? "⌘" : "Ctrl"} N</kbd>
						</button>
					</div>
					<div className="sidebar-section-label">
						Беседы<span>{sessions.length || ""}</span>
					</div>
					{sessions.length > 5 && (
						<label className="session-search">
							<Search size={13} />
							<input
								placeholder="Найти беседу"
								aria-label="Найти беседу"
								value={sessionSearch}
								onChange={(event) => setSessionSearch(event.target.value)}
							/>
						</label>
					)}
					<nav className="session-list" aria-label="Беседы">
						{sessions
							.filter((item) =>
								item.title.toLowerCase().includes(sessionSearch.toLowerCase()),
							)
							.map((item) => (
								<button
									key={item.id}
									className={session?.id === item.id ? "selected" : ""}
									onClick={() => void openSession(item).catch(report)}
								>
									<span className="session-icon">
										{approvals.some((value) => value.sessionId === item.id) ? (
											<Bell size={14} className="warning-icon" />
										) : runs[item.id] ? (
											<Loader2 size={14} className="spin" />
										) : (
											<MessageSquare size={14} />
										)}
									</span>
									<span className="session-label">{item.title}</span>
								</button>
							))}
					</nav>
					<div className="sidebar-bottom">
						<div
							className="engine-status"
							data-testid="engine-status"
							data-state={ready ? "ready" : fatal ? "error" : "starting"}
							title="Версия ядра ChiselCode"
						>
							<span>
								{ready
									? info?.engine.engineVersion
									: fatal
										? "Ошибка"
										: "Запуск…"}
							</span>
						</div>
					</div>
				</aside>
				<main className="workspace">
					<div className="workspace-header">
						<div>
							<span className="breadcrumb">
								{project ? name(project.path) : "ChiselCode"}
							</span>
							<ChevronRight size={13} />
							<span>{session?.title ?? "Новая беседа"}</span>
						</div>
						<div className="workspace-actions">
							{git?.branch && (
								<span className="branch-badge">
									<GitBranch size={13} />
									{git.branch}
								</span>
							)}
							<button
								className="icon-button"
								aria-label={inspector ? "Скрыть панель" : "Показать панель"}
								onClick={() => setInspector(!inspector)}
							>
								{inspector ? (
									<PanelRightClose size={17} />
								) : (
									<PanelRightOpen size={17} />
								)}
							</button>
							{session && (
								<button
									className="icon-button"
									aria-label="Удалить беседу"
									disabled={!!run}
									onClick={() => {
										if (!project || !session) return;
										setDetail({
											title: "Удалить беседу?",
											content: "История беседы будет удалена.",
										});
									}}
								>
									<Trash2 size={15} />
								</button>
							)}
						</div>
					</div>
					<div
						className="transcript"
						ref={transcript}
						onScroll={() => {
							const el = transcript.current;
							if (el)
								setFollowing(
									el.scrollHeight - el.scrollTop - el.clientHeight < 80,
								);
						}}
					>
						{emptyConversation ? (
							<div className="welcome">
								<div className="project-stage">
									<div className="stage-emblem">
										<BrandMark size={21} />
									</div>
									<ChiselSculpture />
									<div className="stage-caption">
										<h1 title={project?.path}>
											{project ? name(project.path) : "ChiselCode"}
										</h1>
										{project ? (
											<p title={project.path}>{project.path}</p>
										) : (
											<button
												className="open-project-button"
												onClick={() => void openProject().catch(report)}
											>
												<FolderOpen size={17} />
												Открыть проект
												<ArrowRight size={16} />
											</button>
										)}
									</div>
								</div>
								<div className="suggestions">
									{suggestions.map((item) => (
										<button
											key={item.title}
											onClick={() => {
												setDraft(item.prompt);
												setMode(item.mode);
												composer.current?.focus();
											}}
										>
											<span className="suggestion-icon">
												<item.icon size={18} />
											</span>
											<strong>{item.title}</strong>
											<ArrowUp size={13} />
										</button>
									))}
								</div>
								{!profiles.length && ready && (
									<button
										className="setup-prompt"
										onClick={() => setSettingsOpen(true)}
									>
										<KeyHint />
										Подключить модель
										<ChevronRight size={14} />
									</button>
								)}
							</div>
						) : (
							<div className="messages">
								{session && session.messages.length > visible && (
									<button
										className="load-history"
										onClick={() => setVisible((value) => value + 100)}
									>
										Показать предыдущие сообщения
									</button>
								)}
								{session?.messages.slice(-visible).map((message) => (
									<MessageView key={message.id} message={message} />
								))}
								{run && (
									<div className="live-run">
										{run.tools.map((tool) => (
											<div key={tool.id} className="live-tool">
												<details>
													<summary>
														{tool.state === "running" ? (
															<Loader2 size={14} className="spin" />
														) : tool.state === "failed" ? (
															<X size={14} />
														) : (
															<Check size={14} />
														)}
														<Terminal size={14} />
														<span>{tool.name}</span>
														<small>
															{tool.state === "running"
																? "Выполняется"
																: tool.state === "failed"
																	? "Ошибка"
																	: "Выполнено"}
														</small>
													</summary>
													{tool.output && <Markdown text={tool.output} />}
												</details>
												{tool.diffs?.map((diff) => (
													<DiffCard diff={diff} key={diff.path} />
												))}
											</div>
										))}
										{run.text && (
											<article className="message message-assistant">
												<div className="message-meta">
													<span className="avatar">
														<BrandMark size={15} />
													</span>
													<strong>ChiselCode</strong>
													<span className="streaming-label">Пишет</span>
												</div>
												<div className="message-body">
													<Markdown text={run.text} />
												</div>
											</article>
										)}
										<div className="run-status">
											<span className="pulse-dot" />
											{run.phase}
										</div>
									</div>
								)}
							</div>
						)}
					</div>
					{!following && (
						<button
							className="follow-button"
							onClick={() => setFollowing(true)}
						>
							<ArrowDown size={14} />К последнему сообщению
						</button>
					)}
					<div className="composer-area">
						{error && (
							<div role="alert" className="error-banner">
								<span>{error}</span>
								<button
									aria-label="Скрыть сообщение"
									onClick={() => setError("")}
								>
									<X size={14} />
								</button>
							</div>
						)}
						{approvals.length > 0 && !approval && (
							<button
								className="approval-notice"
								onClick={() => setApprovalId(approvals[0]!.requestId)}
							>
								<ShieldCheck size={16} />
								Требуется подтверждение · {approvals.length}
								<ArrowRight size={15} />
							</button>
						)}
						{session && (queue[session.id]?.length ?? 0) > 0 && (
							<div className="queue-notice">
								В очереди: {queue[session.id]!.length}
								<button
									onClick={() =>
										setQueue((current) => ({ ...current, [session.id]: [] }))
									}
								>
									Очистить
								</button>
							</div>
						)}
						<div className={`composer ${run ? "working" : ""}`}>
							<textarea
								ref={composer}
								aria-label="Задача для ChiselCode"
								placeholder={
									project ? "Сообщение или /команда…" : "Открыть проект…"
								}
								value={draft}
								onChange={(event) => setDraft(event.target.value)}
								onKeyDown={(event) => {
									if (
										event.key === "Enter" &&
										!event.shiftKey &&
										!event.nativeEvent.isComposing
									) {
										event.preventDefault();
										void submit();
									}
									if (event.key === "Tab" && event.shiftKey) {
										event.preventDefault();
										setMode((value) => (value === "plan" ? "build" : "plan"));
									}
								}}
							/>
							<div className="composer-toolbar">
								<div className="composer-options">
									<button
										className={`mode-button ${mode}`}
										onClick={() => setMode(mode === "plan" ? "build" : "plan")}
										title="Shift+Tab"
									>
										{mode === "plan" ? (
											<BookOpen size={14} />
										) : (
											<Zap size={14} />
										)}{" "}
										{mode === "plan" ? "Plan" : "Build"}
										<ChevronDown size={12} />
									</button>
									<select
										aria-label="Режим разрешений"
										value={permissions}
										onChange={(event) =>
											setPermissions(
												event.target.value as StartTurn["approvalMode"],
											)
										}
									>
										<option value="default">Подтверждать</option>
										<option value="acceptEdits">Разрешать правки</option>
										<option value="dontAsk">Без запросов</option>
									</select>
								</div>
								{run && (
									<button
										className="stop-button"
										aria-label="Остановить задачу"
										onClick={() => void cancel().catch(report)}
									>
										<Square size={12} />
									</button>
								)}
								<button
									className="send-button"
									aria-label={
										run ? "Добавить задачу в очередь" : "Отправить задачу"
									}
									disabled={!draft.trim() || submitting || !ready}
									onClick={() => void submit()}
								>
									{submitting ? (
										<Loader2 size={17} className="spin" />
									) : (
										<ArrowUp size={19} />
									)}
								</button>
							</div>
							<div className="composer-model">
								<Circle size={8} />
								<select
									aria-label="Профиль модели"
									value={profileId}
									onChange={(event) => {
										const profile = profiles.find(
											(item) => item.id === event.target.value,
										);
										setProfileId(event.target.value);
										setModel(profile?.model ?? "");
									}}
								>
									<option value="" disabled>
										Подключить модель
									</option>
									{profiles.map((profile) => (
										<option key={profile.id} value={profile.id}>
											{profile.label}
										</option>
									))}
								</select>
								<span>/</span>
								<input
									aria-label="Модель"
									value={model}
									onChange={(event) => setModel(event.target.value)}
									placeholder="Выберите модель"
								/>
								<button
									className="icon-button"
									aria-label="Настроить подключение"
									onClick={() => setSettingsOpen(true)}
								>
									<Settings2 size={13} />
								</button>
							</div>
						</div>
						<div className="composer-hint">
							<span>
								<kbd>Enter</kbd> отправить · <kbd>Shift Enter</kbd> новая строка
							</span>
						</div>
					</div>
				</main>
				{inspector && (
					<aside className="inspector">
						<div className="inspector-tabs">
							{[
								{ id: "changes", label: "Изменения" },
								{ id: "tasks", label: "Задачи" },
								{ id: "context", label: "Контекст" },
							].map((tab) => (
								<button
									key={tab.id}
									className={inspectorTab === tab.id ? "selected" : ""}
									onClick={() => setInspectorTab(tab.id)}
								>
									{tab.label}
									{tab.id === "changes" && !!git?.files.length && (
										<small>{git.totalFiles}</small>
									)}
									{tab.id === "tasks" && !!taskItems.length && (
										<small>{taskItems.length}</small>
									)}
								</button>
							))}
							<button
								className="icon-button inspector-close"
								aria-label="Закрыть панель"
								onClick={() => setInspector(false)}
							>
								<X size={16} />
							</button>
						</div>
						<div className="inspector-content">
							{inspectorTab === "changes" && (
								<>
									<div className="inspector-section-head">
										<span>Рабочая папка</span>
										{project && (
											<button
												className="icon-button"
												aria-label="Обновить изменения"
												onClick={() =>
													void window.chisel
														.request("git/status", { path: project.path })
														.then(setGit)
														.catch(report)
												}
											>
												<Loader2 size={13} />
											</button>
										)}
									</div>
									{git?.files.length ? (
										<>
											<div className="change-totals">
												<span>
													{git.totalFiles}{" "}
													{git.totalFiles % 10 === 1 &&
													git.totalFiles % 100 !== 11
														? "файл"
														: git.totalFiles % 10 >= 2 &&
																git.totalFiles % 10 <= 4 &&
																(git.totalFiles % 100 < 12 ||
																	git.totalFiles % 100 > 14)
															? "файла"
															: "файлов"}
												</span>
												<b className="addition">
													+
													{git.files.reduce(
														(sum, file) => sum + file.additions,
														0,
													)}
												</b>
												<b className="deletion">
													−
													{git.files.reduce(
														(sum, file) => sum + file.deletions,
														0,
													)}
												</b>
											</div>
											<div className="changed-files">
												{git.files.map((file) => (
													<button
														key={file.path}
														title={file.path}
														onClick={() => {
															if (project)
																void window.chisel
																	.request("git/diff", {
																		path: project.path,
																		file: file.path,
																	})
																	.then((value) =>
																		setDetail({
																			title: file.path,
																			patch: value.patch || "Diff отсутствует.",
																		}),
																	)
																	.catch(report);
														}}
													>
														<FileCode2 size={14} />
														<span>{file.path}</span>
														<small className="addition">
															{file.additions ? `+${file.additions}` : ""}
														</small>
														<small className="deletion">
															{file.deletions ? `−${file.deletions}` : ""}
														</small>
														<i>{file.status.trim()}</i>
													</button>
												))}
											</div>
										</>
									) : (
										<div className="inspector-empty">
											<div>
												<GitBranch size={25} />
											</div>
											<strong>
												{project
													? git
														? "Нет изменений"
														: "Git недоступен"
													: "Проект не выбран"}
											</strong>
										</div>
									)}
								</>
							)}
							{inspectorTab === "tasks" && (
								<>
									<div className="inspector-section-head">
										<span>Помощники и процессы</span>
									</div>
									{taskItems.length ? (
										taskItems.map((task, index) => (
											<div className="task-card" key={String(task.id ?? index)}>
												<div>
													<span className="status-dot" />
													<strong>
														{String(
															task.label ??
																task.task ??
																task.prompt ??
																task.id ??
																"Задача",
														).slice(0, 120)}
													</strong>
												</div>
												<p>
													{String(task.status ?? task.state ?? "Сохранена")}
												</p>
												<button
													onClick={() => {
														if (session && typeof task.id === "string")
															void window.chisel
																.request("tasks/inspect", {
																	sessionId: session.id,
																	id: task.id,
																	view: "history",
																})
																.then((value) =>
																	setDetail({
																		title: "История задачи",
																		content: value.text,
																	}),
																)
																.catch(report);
													}}
												>
													Посмотреть
												</button>
												{session &&
													typeof task.id === "string" &&
													[
														"queued",
														"preparing",
														"running",
														"awaiting_approval",
														"waiting_resources",
														"starting",
														"stopping",
														"cancelling",
													].includes(String(task.status ?? task.state)) && (
														<button
															onClick={() =>
																void window.chisel
																	.request("tasks/cancel", {
																		sessionId: session.id,
																		id: String(task.id),
																	})
																	.catch(report)
															}
														>
															Остановить
														</button>
													)}
											</div>
										))
									) : (
										<div className="inspector-empty">
											<div>
												<Terminal size={25} />
											</div>
											<strong>Нет задач</strong>
										</div>
									)}
								</>
							)}
							{inspectorTab === "context" && (
								<>
									<div className="inspector-section-head">
										<span>Текущая беседа</span>
									</div>
									<div className="context-stats">
										<div>
											<span>Режим</span>
											<strong>{mode === "plan" ? "Plan" : "Build"}</strong>
										</div>
										<div>
											<span>Использовано токенов</span>
											<strong>
												{(session?.totalTokens ?? 0).toLocaleString("ru")}
											</strong>
										</div>
										<div>
											<span>Стоимость</span>
											<strong>
												{session?.totalCost
													? `$${session.totalCost.toFixed(4)}`
													: "—"}
											</strong>
										</div>
										<div>
											<span>Профиль</span>
											<strong>
												{profiles.find((profile) => profile.id === profileId)
													?.label ?? "Не настроен"}
											</strong>
										</div>
									</div>
									<div className="inspector-section-head">
										<span>Команды</span>
										<Command size={13} />
									</div>
									{commands
										.filter((command) => command.name !== "btw")
										.map((command) => (
											<button
												className="catalog-command"
												key={command.name}
												title={command.usage}
												onClick={() => {
													setDraft(`/${command.name} `);
													composer.current?.focus();
												}}
											>
												<code>/{command.name}</code>
												<span>{command.description}</span>
											</button>
										))}
									<div className="inspector-section-head">
										<span>Навыки</span>
										<BookOpen size={13} />
									</div>
									{skills.map((skill) => (
										<button
											className="catalog-command"
											key={skill.name}
											onClick={() => {
												setDraft(`/${skill.name} `);
												composer.current?.focus();
											}}
										>
											<code>/{skill.name}</code>
											<span>{skill.description}</span>
										</button>
									))}
								</>
							)}
						</div>
						<div className="inspector-footer">
							<Folder size={12} />
							<span title={project?.path}>
								{project?.path ?? "Проект не выбран"}
							</span>
						</div>
					</aside>
				)}
			</div>
			{settingsOpen && (
				<Settings
					path={project?.path}
					profiles={profiles}
					providers={providers}
					version={info?.version}
					engineVersion={info?.engine.engineVersion}
					theme={theme}
					onTheme={setTheme}
					onClose={() => setSettingsOpen(false)}
					onSaved={loadProfiles}
					report={report}
				/>
			)}
			{approval && (
				<div className="modal-backdrop">
					<section
						role="dialog"
						aria-modal="true"
						aria-label="Подтверждение действия"
						className="approval-modal"
					>
						<div className="approval-modal-head">
							<div>
								<h2>Подтвердить действие</h2>
								<p>
									{approval.ownerLabel ?? "ChiselCode"} · {approval.tool}
								</p>
							</div>
						</div>
						<div className="approval-body">
							{approval.command && (
								<pre className="command-preview">{approval.command}</pre>
							)}
							{approvalPreview && <Markdown text={approvalPreview} />}
							{approval.diffs?.map((diff) => (
								<div key={diff.path}>
									<h3>
										<FileCode2 size={15} />
										{diff.path}
										<b className="addition">+{diff.additions}</b>
										<b className="deletion">−{diff.deletions}</b>
									</h3>
									<Patch patch={diff.patch} />
								</div>
							))}
						</div>
						<div className="approval-actions">
							<button onClick={() => void respond("denied")}>
								<X size={15} />
								Отклонить
							</button>
							<button
								className="primary-button"
								onClick={() => void respond("approved")}
							>
								<Check size={16} />
								Разрешить один раз
							</button>
						</div>
					</section>
				</div>
			)}
			{detail && (
				<div
					className="modal-backdrop"
					onMouseDown={(event) => {
						if (event.target === event.currentTarget) setDetail(undefined);
					}}
				>
					<section
						role="dialog"
						aria-modal="true"
						aria-label={detail.title}
						className="detail-modal"
					>
						<header>
							<FileCode2 size={18} />
							<h2>{detail.title}</h2>
							<button
								className="icon-button"
								aria-label="Закрыть просмотр"
								onClick={() => setDetail(undefined)}
							>
								<X size={18} />
							</button>
						</header>
						<div>
							{detail.patch !== undefined ? (
								<Patch patch={detail.patch} />
							) : (
								<Markdown text={detail.content ?? ""} />
							)}
						</div>
						{detail.title === "Удалить беседу?" && (
							<footer>
								<button
									className="danger-button"
									onClick={() => {
										if (!session || !project) return;
										void window.chisel
											.request("sessions/delete", {
												path: project.path,
												sessionId: session.id,
											})
											.then(() => {
												setSessions((current) =>
													current.filter((item) => item.id !== session.id),
												);
												newConversation();
												setDetail(undefined);
											})
											.catch(report);
									}}
								>
									Удалить беседу
								</button>
							</footer>
						)}
					</section>
				</div>
			)}
			{fatal && (
				<div className="fatal-banner" role="alert">
					<X size={18} />
					<div>
						<strong>Ядро ChiselCode недоступно</strong>
						<p>{fatal}</p>
					</div>
					<button onClick={() => location.reload()}>
						Перезагрузить интерфейс
					</button>
					<button
						onClick={() =>
							void window.chisel?.openExternal(
								"https://github.com/TheAsrada/ChiselCodeDesktop/releases",
							)
						}
					>
						Открыть выпуски
					</button>
				</div>
			)}
		</>
	);
}
function KeyHint() {
	return <Settings2 size={14} />;
}
