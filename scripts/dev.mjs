import { spawn } from "node:child_process";
import { build } from "esbuild";
import { createServer } from "vite";
import electron from "electron";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("dist/main", { recursive: true });
await build({
	entryPoints: ["src/main/index.ts", "src/main/preload.ts"],
	bundle: true,
	platform: "node",
	format: "cjs",
	external: ["electron", "electron-updater"],
	outdir: "dist/main",
});
await writeFile("dist/main/package.json", '{"type":"commonjs"}\n');
const server = await createServer();
await server.listen();
const child = spawn(electron, ["."], {
	stdio: "inherit",
	env: { ...process.env, CHISEL_DESKTOP_DEV_URL: server.resolvedUrls.local[0] },
});
child.on("exit", async (code) => {
	await server.close();
	process.exitCode = code ?? 0;
});
