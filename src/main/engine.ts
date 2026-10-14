import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import {
	DesktopClient,
	type EngineEvent,
	type RpcRequest,
	type WireMessage,
} from "@chiselcode/desktop-sdk";
const MAX_FRAME = 16 * 1024 * 1024;
export class EngineProcess {
	readonly client: DesktopClient;
	private process: ChildProcessWithoutNullStreams;
	private listeners = new Set<(message: WireMessage) => void>();
	private ending = false;
	constructor(
		executable: string,
		private readonly onExit: (message: string) => void,
		configPath?: string,
	) {
		this.process = spawn(
			executable,
			configPath ? ["--config", configPath] : [],
			{ stdio: "pipe", windowsHide: true },
		);
		const decoder = new StringDecoder("utf8");
		let buffer = "";
		this.client = new DesktopClient({
			send: (request: RpcRequest) => {
				const line = `${JSON.stringify(request)}\n`;
				if (Buffer.byteLength(line) > MAX_FRAME || !this.process.stdin.writable)
					throw new Error("Соединение с ядром недоступно.");
				this.process.stdin.write(line);
			},
			subscribe: (listener) => {
				this.listeners.add(listener);
				return () => this.listeners.delete(listener);
			},
		});
		const fail = (message: string) => {
			this.client.dispose(message);
			if (!this.ending) this.onExit(message);
		};
		this.process.stdout.on("data", (chunk: Buffer) => {
			buffer += decoder.write(chunk);
			if (Buffer.byteLength(buffer) > MAX_FRAME) {
				fail("Ядро прислало слишком большой ответ.");
				this.process.kill();
				return;
			}
			let end: number;
			while ((end = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, end);
				buffer = buffer.slice(end + 1);
				try {
					const message = JSON.parse(line) as WireMessage;
					if (message.jsonrpc !== "2.0") throw new Error("protocol");
					for (const listener of this.listeners) listener(message);
				} catch {
					fail("Ошибка протокола ядра. Перезапустите приложение.");
					this.process.kill();
					return;
				}
			}
		});
		// Drain stderr without persisting payloads or credential-bearing extension diagnostics.
		this.process.stderr.resume();
		this.process.on("error", () =>
			fail("Не удалось запустить встроенное ядро ChiselCode."),
		);
		this.process.on("exit", (code) =>
			fail(
				`Ядро завершило работу (${code ?? "сигнал"}). Перезапустите приложение.`,
			),
		);
	}
	onEvent(listener: (event: EngineEvent["params"]) => void) {
		return this.client.onEvent(listener);
	}
	async close() {
		if (this.ending) return;
		this.ending = true;
		try {
			await this.client.request("shutdown", {}, 12_000);
		} catch {
			/* Process supervisor also cleans descendants on host death. */
		}
		this.process.stdin.end();
		if (this.process.exitCode === null) {
			await new Promise<void>((resolve) => {
				const timer = setTimeout(() => {
					this.process.kill();
					resolve();
				}, 3_000);
				this.process.once("exit", () => {
					clearTimeout(timer);
					resolve();
				});
			});
		}
		this.client.dispose();
	}
}
