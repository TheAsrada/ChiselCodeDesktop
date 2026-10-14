import { _electron as electron, expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

test("real desktop configures a model, streams, approves/denies/cancels and resumes history", async () => {
	const root = await mkdtemp(join(tmpdir(), "chisel-desktop-ui-"));
	const project = join(root, "desktop-project");
	await mkdir(project);
	await writeFile(join(project, "README.md"), "# Desktop acceptance project\n");
	execFileSync("git", ["init", project]);
	execFileSync("git", [
		"-C",
		project,
		"-c",
		"user.name=Fixture",
		"-c",
		"user.email=fixture@example.invalid",
		"add",
		".",
	]);
	execFileSync("git", [
		"-C",
		project,
		"-c",
		"user.name=Fixture",
		"-c",
		"user.email=fixture@example.invalid",
		"commit",
		"-m",
		"Fixture",
	]);
	const server = createServer(async (request, response) => {
		if (request.url?.endsWith("/models")) {
			response.setHeader("Content-Type", "application/json");
			response.end(
				JSON.stringify({
					data: [
						{
							id: "desktop-fixture",
							context_window: 65536,
							max_output_tokens: 2048,
						},
					],
				}),
			);
			return;
		}
		let raw = "";
		for await (const chunk of request) raw += String(chunk);
		const body = JSON.parse(raw) as {
			messages: { role: string; content?: string }[];
			tools?: { function: { name: string } }[];
		};
		const prompt =
			[...body.messages]
				.reverse()
				.find(
					(message) =>
						message.role === "user" && typeof message.content === "string",
				)?.content ?? "";
		const edit =
			prompt.includes("WRITE") && body.messages.at(-1)?.role !== "tool";
		const file = prompt.includes("DENY")
			? "denied.txt"
			: prompt.includes("CANCEL")
				? "cancelled.txt"
				: "desktop.txt";
		const tool = body.tools?.find(
			(item) => item.function.name === "write_file",
		);
		const delta = edit
			? {
					tool_calls: [
						{
							index: 0,
							id: "desktop-write",
							type: "function",
							function: {
								name: tool?.function.name,
								arguments: JSON.stringify({
									path: file,
									content: "ChiselCode Desktop ✓\n",
								}),
							},
						},
					],
				}
			: {
					content:
						"## desktop.txt\n\nСоздан файл `desktop.txt`:\n\n```text\nChiselCode Desktop ✓\n```",
				};
		response.setHeader("Content-Type", "text/event-stream");
		response.end(
			`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", model: "desktop-fixture", choices: [{ index: 0, delta, finish_reason: edit ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`,
		);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const port = (server.address() as { port: number }).port;
	const packaged = process.env.CHISEL_TEST_EXECUTABLE;
	const app = await electron.launch({
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
		},
	});
	try {
		const page = await app.firstWindow();
		await page.waitForLoadState("domcontentloaded");
		await expect(page.getByTestId("engine-status")).toHaveAttribute(
			"data-state",
			"ready",
		);
		expect(
			await page.evaluate(
				() => typeof (window as unknown as { require?: unknown }).require,
			),
		).toBe("undefined");
		expect(
			await page.evaluate(
				() => typeof (window as unknown as { process?: unknown }).process,
			),
		).toBe("undefined");
		await expect(
			page.evaluate(() => window.chisel.request("shutdown", {})),
		).rejects.toThrow();
		await page
			.getByRole("button", { name: /Настройки/ })
			.first()
			.click();
		await page
			.getByRole("dialog", { name: "Настройки", exact: true })
			.getByLabel("Провайдер", { exact: true })
			.selectOption("openai-compatible");
		await page
			.getByRole("dialog", { name: "Настройки", exact: true })
			.getByLabel("ID профиля", { exact: true })
			.fill("desktop-fixture");
		await page
			.getByRole("dialog", { name: "Настройки", exact: true })
			.getByLabel("Название", { exact: true })
			.fill("Тестовый профиль");
		await page
			.getByRole("dialog", { name: "Настройки", exact: true })
			.getByLabel("Модель", { exact: true })
			.fill("desktop-fixture");
		await page
			.getByRole("dialog", { name: "Настройки", exact: true })
			.getByLabel("Адрес API", { exact: true })
			.fill(`http://127.0.0.1:${port}/v1`);
		await page
			.getByRole("dialog", { name: "Настройки", exact: true })
			.getByLabel("API-ключ", { exact: true })
			.fill("fixture-not-a-real-api-key");
		await page
			.getByRole("button", { name: "Сохранить профиль", exact: true })
			.click();
		await expect(page.getByText(/Профиль сохранён/)).toBeVisible();
		await page
			.getByRole("button", { name: "Закрыть настройки", exact: true })
			.click();
		// Seed an existing project using the actual preload/engine API; no mocked dialog/backend.
		await page.evaluate(async (path) => {
			const project = await window.chisel.request("projects/open", { path });
			localStorage.setItem("chisel:last-project", project.path);
		}, project);
		await page.reload();
		await expect(page.getByTestId("project-picker")).toHaveAttribute(
			"data-path",
			/desktop-project$/,
		);
		await expect(
			page.getByText("Нет изменений", { exact: true }),
		).toBeVisible();
		await page.evaluate(() => document.fonts.ready);
		await mkdir("docs/assets/screenshots", { recursive: true });
		if (!packaged && process.platform === "linux")
			await page.screenshot({ path: "docs/assets/screenshots/home.png" });
		// Real navigation and theme changes preserve the project and draft.
		const composer = page.getByRole("textbox", {
			name: "Задача для ChiselCode",
		});
		await page
			.getByRole("button", { name: "Изучить проект", exact: true })
			.click();
		await expect(
			page.getByRole("button", { name: "Plan", exact: true }),
		).toBeVisible();
		await page
			.getByRole("button", { name: "Исправить ошибку", exact: true })
			.click();
		await expect(
			page.getByRole("button", { name: "Build", exact: true }),
		).toBeVisible();
		await composer.fill("Черновик проверки навигации");
		await page
			.getByRole("button", { name: "Панель задач", exact: true })
			.click();
		await expect(page.getByText("Нет задач", { exact: true })).toBeVisible();
		await page
			.getByRole("button", { name: "Панель контекста", exact: true })
			.click();
		await expect(
			page.getByText("Текущая беседа", { exact: true }),
		).toBeVisible();
		await expect(composer).toHaveValue("Черновик проверки навигации");
		await page
			.getByRole("button", { name: "Панель изменений", exact: true })
			.click();
		await composer.fill("");
		await page
			.getByRole("button", { name: "Переключить тему", exact: true })
			.click();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		await page.reload();
		await expect(
			page.getByText("Нет изменений", { exact: true }),
		).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		if (!packaged && process.platform === "linux")
			await page.screenshot({ path: "docs/assets/screenshots/home-dark.png" });
		await page
			.getByRole("button", { name: "Переключить тему", exact: true })
			.click();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
		await app.evaluate(({ BrowserWindow }) =>
			BrowserWindow.getAllWindows()[0]!.setContentSize(1080, 760),
		);
		await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1080);
		await expect(composer).toBeVisible();
		const send = page.getByRole("button", {
			name: "Отправить задачу",
			exact: true,
		});
		await expect(send).toBeVisible();
		const sendBounds = await send.boundingBox();
		expect(sendBounds!.y + sendBounds!.height).toBeLessThan(
			await page.evaluate(() => innerHeight),
		);
		if (!packaged && process.platform === "linux")
			await page.screenshot({
				path: "docs/assets/screenshots/home-compact.png",
			});
		await app.evaluate(({ BrowserWindow }) =>
			BrowserWindow.getAllWindows()[0]!.setContentSize(920, 700),
		);
		await expect.poll(() => page.evaluate(() => innerWidth)).toBe(920);
		await page
			.getByRole("button", { name: "Закрыть панель", exact: true })
			.click();
		await expect(send).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Показать панель", exact: true }),
		).toBeVisible();
		if (!packaged && process.platform === "linux")
			await page.screenshot({ path: "docs/assets/screenshots/home-small.png" });
		await app.evaluate(({ BrowserWindow }) =>
			BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 960),
		);
		await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440);
		await page
			.getByRole("button", { name: "Панель изменений", exact: true })
			.click();
		await page.getByRole("button", { name: "Настройки", exact: true }).click();
		await page
			.getByRole("button", { name: "Внешний вид", exact: true })
			.click();
		if (!packaged && process.platform === "linux")
			await page.screenshot({ path: "docs/assets/screenshots/settings.png" });
		await page
			.getByRole("button", { name: "Закрыть настройки", exact: true })
			.click();
		await page
			.getByRole("textbox", { name: "Задача для ChiselCode" })
			.fill("WRITE: создай файл desktop.txt для проверки desktop.");
		await page
			.getByRole("button", { name: "Отправить задачу", exact: true })
			.click();
		await expect(
			page.getByRole("dialog", { name: "Подтверждение действия" }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Index: desktop.txt", exact: true }),
		).toHaveCount(0);
		await expect(
			page
				.getByRole("dialog", { name: "Подтверждение действия" })
				.locator(".patch"),
		).toContainText("+ChiselCode Desktop ✓");
		await expect(readFile(join(project, "desktop.txt"))).rejects.toThrow();
		if (!packaged && process.platform === "linux")
			await page.screenshot({ path: "docs/assets/screenshots/approval.png" });
		await page
			.getByRole("button", { name: "Разрешить один раз", exact: true })
			.click();
		await expect(
			page.getByRole("heading", { name: "desktop.txt", exact: true, level: 2 }),
		).toBeVisible();
		await expect
			.poll(async () => readFile(join(project, "desktop.txt"), "utf8"))
			.toContain("Desktop ✓");
		await expect(
			page.getByRole("button", { name: "Остановить задачу", exact: true }),
		).toHaveCount(0);
		if (!packaged && process.platform === "linux")
			await page.screenshot({ path: "docs/assets/screenshots/chat.png" });
		await page.reload();
		await expect(
			page.getByRole("button", { name: /WRITE: создай файл/ }),
		).toBeVisible();
		await page.getByRole("button", { name: /WRITE: создай файл/ }).click();
		await expect(
			page.getByRole("heading", { name: "desktop.txt", exact: true, level: 2 }),
		).toBeVisible();
		await page.getByRole("button", { name: /Новая беседа/ }).click();
		await page
			.getByRole("textbox", { name: "Задача для ChiselCode" })
			.fill("WRITE DENY: отклонить изменение");
		await page
			.getByRole("button", { name: "Отправить задачу", exact: true })
			.click();
		await expect(
			page.getByRole("dialog", { name: "Подтверждение действия" }),
		).toBeVisible();
		await page.getByRole("button", { name: "Отклонить", exact: true }).click();
		await expect(
			page.getByRole("button", { name: "Остановить задачу", exact: true }),
		).toHaveCount(0);
		await expect(readFile(join(project, "denied.txt"))).rejects.toThrow();
		await page.getByRole("button", { name: /Новая беседа/ }).click();
		await page
			.getByRole("textbox", { name: "Задача для ChiselCode" })
			.fill("WRITE CANCEL: остановить изменение");
		await page
			.getByRole("button", { name: "Отправить задачу", exact: true })
			.click();
		await expect(
			page.getByRole("dialog", { name: "Подтверждение действия" }),
		).toBeVisible();
		await page.keyboard.press("Escape");
		await page
			.getByRole("button", { name: "Остановить задачу", exact: true })
			.click();
		await expect(
			page.getByRole("button", { name: "Остановить задачу", exact: true }),
		).toHaveCount(0);
		await expect(readFile(join(project, "cancelled.txt"))).rejects.toThrow();
		const catalog = await page.evaluate(() =>
			window.chisel.request("profiles/list", {}),
		);
		expect(JSON.stringify(catalog)).not.toContain("fixture-not-a-real-api-key");
	} finally {
		await app.close();
		await new Promise<void>((resolve) => server.close(() => resolve()));
		await rm(root, { recursive: true, force: true });
	}
});
