import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, chmod, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const lock = JSON.parse(await readFile("engine.lock.json", "utf8"));
const target = process.argv[2] ?? `${process.platform}-${process.arch}`;
if (lock.sourceCommit === "pending" || !lock.assets[target])
	throw new Error(
		"Ядро ещё не закреплено. Обновите engine.lock.json проверенным выпуском.",
	);
const base = `https://github.com/${lock.repository}/releases/download/${lock.tag}/`;
async function download(asset) {
	const response = await fetch(base + asset.name);
	if (!response.ok)
		throw new Error(`Не удалось скачать ${asset.name}: ${response.status}`);
	const buffer = Buffer.from(await response.arrayBuffer());
	const hash = createHash("sha256").update(buffer).digest("hex");
	if (hash !== asset.sha256)
		throw new Error(
			`Контрольная сумма ${asset.name} не совпала с engine.lock.json`,
		);
	return buffer;
}
await mkdir("vendor/engine", { recursive: true });
await mkdir("vendor/desktop-sdk", { recursive: true });
const binary = await download(lock.assets[target]);
const destination = resolve(
	"vendor/engine",
	target.startsWith("win32") ? "chisel-engine.exe" : "chisel-engine",
);
await writeFile(destination, binary);
if (!target.startsWith("win32")) await chmod(destination, 0o755);
const sdk = await download(lock.assets.sdk);
await writeFile("vendor/desktop-sdk.tgz", sdk);
execFileSync("tar", [
	"-xzf",
	"vendor/desktop-sdk.tgz",
	"--strip-components=1",
	"-C",
	"vendor/desktop-sdk",
]);
await rm("vendor/desktop-sdk.tgz");
const skills = await download(lock.assets.skills);
await writeFile("vendor/skills.tgz", skills);
execFileSync("tar", ["-xzf", "vendor/skills.tgz", "-C", "vendor/engine"]);
await rm("vendor/skills.tgz");
await writeFile(
	"vendor/engine/engine-lock.json",
	JSON.stringify(lock, null, 2),
);
console.log(
	`ChiselCode ${lock.engineVersion} (${target}), SDK и встроенные навыки проверены.`,
);
