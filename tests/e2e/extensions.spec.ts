import {
	_electron as electron,
	expect,
	test,
	type ElectronApplication,
	type Page,
} from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { zipSync } from "fflate";

test("real extension lifecycle in Electron uses one core installer, settings, versions and durable draft", async () => {
	const root = await mkdtemp(join(tmpdir(), "desktop-extension-")),
		project = join(root, "project"),
		author = join(root, "author");
	await mkdir(project);
	await writeFile(join(project, "README.md"), "Настоящий проект расширения\n");
	await cp(resolve("tests/fixtures/extension-demo"), author, {
		recursive: true,
	});
	const initial = JSON.parse(
			await readFile(join(author, "chisel-extension.json"), "utf8"),
		),
		code = await readFile(join(author, "index.mjs"));
	const archive = join(root, "update.zip");
	await writeFile(
		archive,
		zipSync({
			"chisel-extension.json": Buffer.from(
				JSON.stringify({ ...initial, version: "1.1.0" }),
			),
			"index.mjs": code,
		}),
	);
	const incompatible = join(root, "incompatible.zip");
	await writeFile(
		incompatible,
		zipSync({
			"chisel-extension.json": Buffer.from(
				JSON.stringify({
					...initial,
					version: "2.0.0",
					chiselVersion: ">=99.0.0",
				}),
			),
			"index.mjs": code,
		}),
	);
	const broken = join(root, "broken.zip");
	await writeFile(broken, "broken zip");
	let modelCalls = 0;
	const model = createServer((_request, response) => {
		modelCalls++;
		response.writeHead(500);
		response.end("Unexpected model request");
	});
	await new Promise<void>((done) => model.listen(0, "127.0.0.1", done));
	const port = (model.address() as { port: number }).port;
	const packaged = process.env.CHISEL_TEST_EXECUTABLE;
	let app: ElectronApplication | undefined, page!: Page;
	const launch = async () => {
		app = await electron.launch({
			executablePath: packaged,
			args: packaged
				? process.platform === "linux"
					? ["--no-sandbox"]
					: []
				: [".", ...(process.platform === "linux" ? ["--no-sandbox"] : [])],
			cwd: resolve("."),
			env: {
				...process.env,
				XDG_CONFIG_HOME: join(root, "config"),
				XDG_DATA_HOME: join(root, "data"),
				APPDATA: join(root, "config"),
				LOCALAPPDATA: join(root, "data"),
				CHISEL_DEMO_IMPORTS: join(root, "imports.txt"),
			},
		});
		page = await app.firstWindow();
		await page.waitForLoadState("domcontentloaded");
		await expect(page.getByTestId("engine-status")).toHaveAttribute(
			"data-state",
			"ready",
		);
	};
	const settings = async () => {
		await page.getByRole("button", { name: "Настройки", exact: true }).click();
		await page.getByRole("button", { name: "Расширения", exact: true }).click();
		await expect(
			page.getByRole("button", { name: "Установить", exact: true }),
		).toBeVisible();
		await expect(
			page.locator(".extension-row").filter({ hasText: "Анализ кода (LSP)" }),
		).toBeVisible();
	};
	const select = async () => {
		await page
			.getByRole("button", { name: /Пример с настройками.*1\./ })
			.click();
	};
	const choose = async (
		source: string,
		kind: "directory" | "zip",
		update = false,
	) => {
		// Only the OS dialog selection is scripted. Native sender/path grant, SDK and core verification remain real.
		await app!.evaluate(
			({ dialog }, { source, kind }) => {
				const original = dialog.showOpenDialog;
				dialog.showOpenDialog = (async (...args: unknown[]) => {
					dialog.showOpenDialog = original;
					const options = args.at(-1) as { properties?: string[] };
					if (
						!options.properties?.includes(
							kind === "zip" ? "openFile" : "openDirectory",
						)
					)
						throw new Error("Wrong native dialog scope");
					return { canceled: false, filePaths: [source] };
				}) as typeof dialog.showOpenDialog;
			},
			{ source, kind },
		);
		await page
			.getByRole("button", {
				name: update ? "Обновить из файла" : "Установить",
				exact: true,
			})
			.click();
		await page
			.getByRole("button", {
				name: kind === "zip" ? "ZIP" : "Подготовленной папки",
				exact: true,
			})
			.click();
	};
	const screenshot = async (name: string) => {
		if (!packaged && process.platform === "linux") {
			await mkdir("docs/assets/screenshots", { recursive: true });
			await page.screenshot({
				path: `docs/assets/screenshots/extensions-${name}.png`,
			});
		}
	};
	const closeSettings = async () =>
		page
			.getByRole("button", { name: "Закрыть настройки", exact: true })
			.click();
	const command = async (message: string) => {
		const composer = page.getByRole("textbox", {
			name: "Задача для ChiselCode",
		});
		await composer.fill("/demo-settings");
		await page
			.getByRole("button", { name: "Отправить задачу", exact: true })
			.click();
		await expect(
			page.getByText(message, { exact: false }).first(),
		).toBeVisible();
	};
	try {
		await launch();
		await page.evaluate(
			async ({ project, port }) => {
				await window.chisel.request("profiles/save", {
					id: "fixture",
					providerId: "openai",
					label: "Fixture",
					model: "fixture",
					apiKey: "fixture-key",
					baseUrl: `http://127.0.0.1:${port}/v1`,
				});
				const value = await window.chisel.request("projects/open", {
					path: project,
				});
				localStorage.setItem("chisel:last-project", value.path);
			},
			{ project, port },
		);
		await page.reload();
		await expect(page.getByTestId("project-picker")).toHaveAttribute(
			"data-path",
			project,
		);
		await page
			.getByRole("textbox", { name: "Задача для ChiselCode" })
			.fill("Черновик перед расширениями");
		await settings();
		await screenshot("catalog-light");
		for (const [name, field, value] of [
			["Субагенты", "Одновременно работающие помощники", "1"],
			["Фоновые задачи", "Хранение результатов, дней", "3"],
		] as const) {
			await page.locator(".extension-row").filter({ hasText: name }).click();
			await page
				.locator(".extension-details")
				.getByRole("button", { name: "Настройки", exact: true })
				.click();
			await page
				.getByRole("spinbutton", { name: field, exact: true })
				.fill(value);
			await page
				.getByRole("button", { name: "Сохранить", exact: true })
				.click();
			await expect(
				page.getByText(/Настройки проекта могут только сужать/),
			).toBeVisible();
			await page
				.getByRole("button", { name: "← К расширению", exact: true })
				.click();
		}
		await page
			.locator(".extension-row")
			.filter({ hasText: "Анализ кода" })
			.click();
		await page
			.locator(".extension-details")
			.getByRole("button", { name: "Настройки", exact: true })
			.click();
		await page
			.getByRole("combobox", { name: "Режим LSP", exact: true })
			.selectOption("off");
		await page.getByRole("button", { name: "Сохранить", exact: true }).click();
		await expect(
			page.getByText(/Настройки проекта могут только сужать/),
		).toBeVisible();
		await screenshot("builtin-lsp");
		await page
			.getByRole("button", { name: "← К расширению", exact: true })
			.click();
		await choose(author, "directory");
		await expect(
			page.getByRole("checkbox", { name: "Доверяю этому содержимому" }),
		).not.toBeChecked();
		await screenshot("review");
		await page.getByRole("button", { name: "Отмена", exact: true }).click();
		expect(
			await page.evaluate(async () =>
				(await window.chisel.request("extensions/list", {})).items.filter(
					(i) => i.origin === "installed",
				),
			),
		).toHaveLength(0);
		await choose(author, "directory");
		await page
			.getByRole("button", { name: "Установить без доверия", exact: true })
			.click();
		await select();
		await expect(page.getByText("Не доверено", { exact: true })).toBeVisible();
		await page
			.getByRole("button", { name: "Доверить и включить", exact: true })
			.click();
		await expect(
			page.getByRole("checkbox", { name: "Доверяю этому содержимому" }),
		).not.toBeChecked();
		await page
			.getByRole("checkbox", { name: "Доверяю этому содержимому" })
			.check();
		await page
			.getByRole("button", { name: "Подтвердить", exact: true })
			.click();
		await expect(
			page.getByText("Нужен перезапуск", { exact: true }),
		).toBeVisible();
		await closeSettings();
		await expect(
			page.getByRole("textbox", { name: "Задача для ChiselCode" }),
		).toHaveValue("Черновик перед расширениями");
		await app!.close();
		await launch();
		await expect(
			page.getByRole("textbox", { name: "Задача для ChiselCode" }),
		).toHaveValue("Черновик перед расширениями");
		await command("Привет · Привет");
		await page
			.getByRole("textbox", { name: "Задача для ChiselCode" })
			.fill("Черновик в беседе");
		await settings();
		await select();
		await expect(page.locator(".extension-state")).toHaveText("Работает");
		await screenshot("working");
		await page
			.getByRole("button", { name: "Настройки", exact: true })
			.last()
			.click();
		await page
			.getByRole("textbox", { name: "Сообщение", exact: true })
			.fill("После restart");
		await page
			.getByRole("spinbutton", { name: "Повторения", exact: true })
			.fill("99");
		await page.getByRole("button", { name: "Сохранить", exact: true }).click();
		await expect(page.getByText(/Недопустимое значение/)).toBeVisible();
		await expect(
			page.getByRole("spinbutton", { name: "Повторения", exact: true }),
		).toHaveValue("99");
		await expect(
			page.getByRole("textbox", { name: "Сообщение", exact: true }),
		).toHaveValue("После restart");
		await page
			.getByRole("spinbutton", { name: "Повторения", exact: true })
			.fill("3");
		await page
			.getByRole("textbox", { name: "Секрет примера", exact: true })
			.fill("desktop-fixture-secret-8742");
		await page.getByRole("button", { name: "Сохранить", exact: true }).click();
		await expect(
			page.getByText(/Параметры применятся после перезапуска/),
		).toBeVisible();
		await screenshot("settings");
		const dto = await page.evaluate(async () => {
			const item = (
				await window.chisel.request("extensions/list", {})
			).items.find((i) => i.id === "example.settings-demo")!;
			return window.chisel.request("extensions/settings/read", {
				id: item.id,
				digest: item.digest!,
				revision: item.revision,
			});
		});
		expect(JSON.stringify(dto)).not.toContain("desktop-fixture-secret-8742");
		expect(dto.secretSet.access).toBe(true);
		await closeSettings();
		await app!.close();
		await launch();
		await expect(
			page.getByRole("textbox", { name: "Задача для ChiselCode" }),
		).toHaveValue("Черновик в беседе");
		await expect(
			page.getByText("Привет · Привет", { exact: false }).first(),
		).toBeVisible();
		await command("После restart · После restart · После restart");
		await settings();
		await select();
		await choose(incompatible, "zip", true);
		await expect(page.getByText(/Версия ChiselCode не подходит/)).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Подтвердить", exact: true }),
		).toBeDisabled();
		await page.getByRole("button", { name: "Отмена", exact: true }).click();
		await choose(broken, "zip", true);
		await expect(page.locator(".settings-notice").first()).toBeVisible();
		await choose(archive, "zip", true);
		await page
			.getByRole("checkbox", { name: "Доверяю этому содержимому" })
			.check();
		await page.evaluate(async () => {
			const item = (
				await window.chisel.request("extensions/list", {})
			).items.find((i) => i.id === "example.settings-demo")!;
			await window.chisel.request("extensions/setEnabled", {
				id: item.id,
				digest: item.digest!,
				revision: item.revision,
				enabled: false,
			});
		});
		await page
			.getByRole("button", { name: "Подтвердить", exact: true })
			.click();
		await expect(page.getByText(/Пакет изменился после preview/)).toBeVisible();
		expect(
			await page.evaluate(
				async () =>
					(await window.chisel.request("extensions/list", {})).items.find(
						(i) => i.id === "example.settings-demo",
					)?.version,
			),
		).toBe("1.0.0");
		await page.evaluate(async () => {
			const item = (
				await window.chisel.request("extensions/list", {})
			).items.find((i) => i.id === "example.settings-demo")!;
			await window.chisel.request("extensions/setEnabled", {
				id: item.id,
				digest: item.digest!,
				revision: item.revision,
				enabled: true,
			});
		});
		await choose(archive, "zip", true);
		await expect(
			page.getByRole("checkbox", { name: "Доверяю этому содержимому" }),
		).not.toBeChecked();
		await page
			.getByRole("checkbox", { name: "Доверяю этому содержимому" })
			.check();
		await page
			.getByRole("button", { name: "Подтвердить", exact: true })
			.click();
		await select();
		await expect(page.locator(".extension-details")).toContainText("1.1.0");
		await page.getByRole("button", { name: "Версии", exact: true }).click();
		await screenshot("versions");
		await page
			.getByRole("button", { name: "Проверить rollback", exact: true })
			.first()
			.click();
		await page
			.getByRole("button", { name: "Вернуть эту версию", exact: true })
			.click();
		await select();
		await expect(page.locator(".extension-details")).toContainText("1.0.0");
		// Both themes and the compact window use the same core state; focused controls remain visible.
		await closeSettings();
		await page.evaluate(() => {
			localStorage.setItem("chisel:theme", "dark");
		});
		await page.reload();
		await settings();
		await select();
		await screenshot("catalog-dark");
		await app!.evaluate(({ BrowserWindow }) =>
			BrowserWindow.getAllWindows()[0]!.setContentSize(920, 700),
		);
		await page.getByRole("textbox", { name: "Поиск расширений" }).focus();
		await screenshot("compact-focus");
		await page.getByRole("button", { name: "Выключить", exact: true }).click();
		await expect(page.locator(".extension-details")).toContainText(
			"Нужен перезапуск",
		);
		await page.getByRole("button", { name: "Удалить", exact: true }).click();
		await page.getByRole("button", { name: "Удалить", exact: true }).click();
		await expect(
			page.getByText(/Удаление занятых файлов отложено/).first(),
		).toBeVisible();
		await screenshot("removed-deferred");
		expect(modelCalls).toBe(0);
		expect(await readFile(join(project, "README.md"), "utf8")).toBe(
			"Настоящий проект расширения\n",
		);
		const marker = await readFile(join(root, "imports.txt"), "utf8");
		expect(marker).toBe("import\nimport\n");
	} finally {
		await app?.close();
		await new Promise<void>((done) => model.close(() => done()));
		await rm(root, { recursive: true, force: true });
	}
});
