import {
	app,
	BrowserWindow,
	clipboard,
	dialog,
	ipcMain,
	Menu,
	Notification,
	shell,
} from "electron";
import { autoUpdater } from "electron-updater";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import type { Hello, Method, RequestMap } from "@chiselcode/desktop-sdk";
import { EngineProcess } from "./engine.js";
import type { UpdateStatus } from "../shared/bridge.js";
let window: BrowserWindow | undefined;
let engine: EngineProcess | undefined;
let hello: Hello | undefined;
let startup: Promise<void> = Promise.resolve();
let startupError = "";
let stopping = false;
const active = new Set<string>();
const selectedPackages = new Set<string>();
const allowed = new Set<Method>([
	"extensions/list",
	"extensions/prepare",
	"extensions/operation",
	"extensions/cancel",
	"extensions/commit",
	"extensions/setEnabled",
	"extensions/settings/read",
	"extensions/settings/save",
	"extensions/builtin/read",
	"extensions/builtin/save",
	"extensions/lsp/action",
	"projects/list",
	"projects/open",
	"profiles/list",
	"profiles/save",
	"models/list",
	"sessions/list",
	"sessions/create",
	"sessions/read",
	"sessions/rename",
	"sessions/delete",
	"turn/start",
	"turn/cancel",
	"approvals/respond",
	"git/status",
	"git/diff",
	"skills/list",
	"commands/list",
	"mcp/list",
	"mcp/save",
	"mcp/action",
	"tasks/list",
	"tasks/inspect",
	"tasks/cancel",
	"settings/read",
	"settings/patch",
]);
function sender(event: Electron.IpcMainInvokeEvent) {
	if (
		!window ||
		event.sender !== window.webContents ||
		event.senderFrame !== window.webContents.mainFrame
	)
		throw new Error("Источник запроса недоступен.");
}
const update = (value: UpdateStatus) =>
	window?.webContents.send("native:update", value);
function bind() {
	ipcMain.handle(
		"engine:request",
		async (event, method: Method, params: RequestMap[Method]["params"]) => {
			sender(event);
			if (!allowed.has(method)) throw new Error("Действие недоступно.");
			await startup;
			if (!engine || !hello)
				throw new Error(startupError || "Ядро недоступно.");
			if (
				method.startsWith("extensions/") &&
				!hello.capabilities.includes("extension-management")
			)
				throw new Error(
					"Это ядро не поддерживает управление расширениями. Обновите приложение.",
				);
			if (method === "extensions/prepare") {
				const source = (params as RequestMap["extensions/prepare"]["params"])
					.source;
				if (source && !selectedPackages.delete(source))
					throw new Error("Выберите папку или ZIP через системный диалог.");
			}
			return engine.client.request(
				method,
				params,
				method.startsWith("mcp/") || method.startsWith("extensions/")
					? 130_000
					: 30_000,
			);
		},
	);
	ipcMain.handle("native:info", async (event) => {
		sender(event);
		await startup;
		if (!hello) throw new Error(startupError || "Ядро недоступно.");
		return {
			version: app.getVersion(),
			platform: process.platform,
			engine: hello,
		};
	});
	ipcMain.handle("native:open-project", async (event) => {
		sender(event);
		const result = await dialog.showOpenDialog(window!, {
			title: "Открыть проект",
			properties: ["openDirectory"],
		});
		return result.canceled ? null : (result.filePaths[0] ?? null);
	});
	ipcMain.handle("native:choose-extension", async (event, kind: unknown) => {
		sender(event);
		if (kind !== "directory" && kind !== "zip")
			throw new Error("Выберите папку или ZIP.");
		const result = await dialog.showOpenDialog(window!, {
			title:
				kind === "directory"
					? "Подготовленная папка расширения"
					: "ZIP расширения",
			properties: [kind === "directory" ? "openDirectory" : "openFile"],
			...(kind === "zip"
				? { filters: [{ name: "Пакет расширения", extensions: ["zip"] }] }
				: {}),
		});
		const source = result.canceled ? undefined : result.filePaths[0];
		if (!source) return null;
		if (selectedPackages.size >= 16) selectedPackages.clear();
		selectedPackages.add(source);
		return source;
	});
	ipcMain.handle("native:restart", async (event) => {
		sender(event);
		await startup;
		if (
			!engine ||
			active.size ||
			(await engine.client.request("system/status", {})).busy
		)
			throw new Error(
				"Дождитесь задач или остановите их и фоновые процессы перед перезапуском.",
			);
		await engine.close();
		app.relaunch();
		app.quit();
	});
	ipcMain.handle("native:open-external", async (event, value: unknown) => {
		sender(event);
		if (typeof value !== "string" || value.length > 8192) return;
		const url = new URL(value);
		if (
			["https:", "http:"].includes(url.protocol) &&
			!url.username &&
			!url.password
		)
			await shell.openExternal(url.toString());
	});
	ipcMain.handle("native:copy", (event, value: unknown) => {
		sender(event);
		if (typeof value === "string" && value.length <= 1_000_000)
			clipboard.writeText(value);
	});
	ipcMain.handle("native:window", (event, action: unknown) => {
		sender(event);
		if (action === "minimize") window?.minimize();
		if (action === "maximize")
			window?.isMaximized() ? window.unmaximize() : window?.maximize();
		if (action === "close") window?.close();
	});
	ipcMain.handle("native:update", async (event, action: unknown) => {
		sender(event);
		if (!app.isPackaged) {
			update({
				state: "current",
				message: "Обновления доступны в установленной версии.",
			});
			return;
		}
		try {
			if (action === "check") {
				update({ state: "checking" });
				await autoUpdater.checkForUpdates();
			}
			if (action === "download") await autoUpdater.downloadUpdate();
			if (action === "install") {
				if (
					active.size ||
					(await engine?.client.request("system/status", {}))?.busy
				)
					throw new Error(
						"Сначала остановите выполняющиеся задачи и фоновые процессы.",
					);
				await engine?.close();
				autoUpdater.quitAndInstall();
			}
		} catch (error) {
			update({
				state: "error",
				message:
					error instanceof Error
						? error.message
						: "Проверка обновления не удалась.",
			});
		}
	});
	autoUpdater.autoDownload = false;
	autoUpdater.autoInstallOnAppQuit = false;
	autoUpdater.allowPrerelease = true;
	autoUpdater.on("update-available", (info) =>
		update({ state: "available", version: info.version }),
	);
	autoUpdater.on("update-not-available", () => update({ state: "current" }));
	autoUpdater.on("download-progress", (info) =>
		update({ state: "downloading", progress: info.percent }),
	);
	autoUpdater.on("update-downloaded", (info) =>
		update({ state: "downloaded", version: info.version }),
	);
	autoUpdater.on("error", () =>
		update({
			state: "error",
			message: "Обновление недоступно. Откройте страницу выпусков.",
		}),
	);
}
async function createWindow() {
	window = new BrowserWindow({
		width: 1440,
		height: 960,
		minWidth: 900,
		minHeight: 640,
		title: "ChiselCode Desktop",
		backgroundColor: "#dfe2dc",
		titleBarStyle: "hidden",
		titleBarOverlay: false,
		trafficLightPosition: { x: 18, y: 17 },
		show: false,
		icon: join(__dirname, "../../assets/icon.png"),
		webPreferences: {
			preload: join(__dirname, "preload.js"),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			webSecurity: true,
		},
	});
	window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	window.webContents.on("will-navigate", (event) => event.preventDefault());
	window.webContents.on("will-attach-webview", (event) =>
		event.preventDefault(),
	);
	window.webContents.on("did-finish-load", () => {
		window?.show();
		if (hello || startupError)
			window?.webContents.send("native:status", {
				state: hello ? "ready" : "error",
				message: startupError || undefined,
			});
	});
	const enginePath = app.isPackaged
		? join(
				process.resourcesPath,
				"engine",
				process.platform === "win32" ? "chisel-engine.exe" : "chisel-engine",
			)
		: resolve(
				"vendor/engine",
				process.platform === "win32" ? "chisel-engine.exe" : "chisel-engine",
			);
	const lock = JSON.parse(
		readFileSync(
			app.isPackaged
				? join(__dirname, "../build-info.json")
				: process.env.CHISEL_DESKTOP_CANDIDATE_LOCK
					? resolve(process.env.CHISEL_DESKTOP_CANDIDATE_LOCK)
					: resolve("engine.lock.json"),
			"utf8",
		),
	);
	engine = new EngineProcess(
		enginePath,
		(message) => {
			hello = undefined;
			window?.webContents.send("native:status", { state: "error", message });
		},
		!app.isPackaged ? process.env.CHISEL_DESKTOP_TEST_CONFIG : undefined,
	);
	engine.onEvent((event) => {
		if (event.type === "turn.started") active.add(event.sessionId);
		if (event.type === "turn.completed") {
			active.delete(event.sessionId);
			if (!window?.isFocused() && Notification.isSupported())
				new Notification({
					title: "ChiselCode",
					body: "Задача завершена. Можно посмотреть результат.",
				}).show();
		}
		window?.webContents.send("engine:event", event);
	});
	startup = (async () => {
		try {
			const value = await engine.client.initialize(app.getVersion());
			const expected = app.isPackaged ? lock.engine : lock;
			if (
				value.engineVersion !== expected.engineVersion ||
				value.protocol.major !== expected.protocol.major
			)
				throw new Error(
					"Версия встроенного ядра не соответствует выпуску приложения.",
				);
			hello = value;
		} catch (error) {
			startupError =
				error instanceof Error ? error.message : "Ошибка запуска ядра.";
			window?.webContents.send("native:status", {
				state: "error",
				message: startupError,
			});
		}
	})();
	if (!app.isPackaged && process.env.CHISEL_DESKTOP_DEV_URL)
		await window.loadURL(process.env.CHISEL_DESKTOP_DEV_URL);
	else await window.loadFile(join(__dirname, "../renderer/index.html"));
	window.on("closed", () => {
		window = undefined;
	});
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
	app.on("second-instance", () => {
		if (window?.isMinimized()) window.restore();
		window?.show();
		window?.focus();
	});
	app.on("before-quit", (event) => {
		if (stopping) return;
		event.preventDefault();
		stopping = true;
		void (engine?.close() ?? Promise.resolve()).finally(() => app.quit());
	});
	app.on("window-all-closed", () => app.quit());
	void app.whenReady().then(() => {
		Menu.setApplicationMenu(
			Menu.buildFromTemplate([
				{
					label: "ChiselCode",
					submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }],
				},
				{
					label: "Правка",
					submenu: [
						{ role: "undo" },
						{ role: "redo" },
						{ type: "separator" },
						{ role: "cut" },
						{ role: "copy" },
						{ role: "paste" },
						{ role: "selectAll" },
					],
				},
			]),
		);
		bind();
		return createWindow();
	});
}
