import { writeFile } from "node:fs/promises";
const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(tag))
	throw new Error("Укажите точный тег: npm run update:engine -- v0.6.28");
const url = `https://github.com/TheAsrada/ChiselCode/releases/download/${tag}/engine-manifest.json`;
const response = await fetch(url);
if (!response.ok) throw new Error(`Manifest недоступен: ${response.status}`);
const manifest = await response.json();
if (
	manifest.schemaVersion !== 1 ||
	manifest.repository !== "TheAsrada/ChiselCode" ||
	manifest.tag !== tag ||
	manifest.engineVersion !== tag.slice(1) ||
	manifest.protocol?.major !== 1 ||
	!/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(manifest.sourceCommit)
)
	throw new Error("Manifest не соответствует поддерживаемому контракту.");
for (const target of [
	"win32-x64",
	"linux-x64",
	"darwin-arm64",
	"darwin-x64",
	"sdk",
	"skills",
]) {
	const asset = manifest.assets?.[target];
	if (
		!asset ||
		!/^chisel-(engine|desktop-sdk)-[a-zA-Z0-9._-]+$/.test(asset.name) ||
		!/^[0-9a-f]{64}$/.test(asset.sha256)
	)
		throw new Error(`Некорректный asset ${target}`);
}
await writeFile("engine.lock.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(
	`Закреплён ChiselCode ${manifest.engineVersion}. Выполните npm run sync:engine, npm ci, npm run verify и npm run test:e2e перед выпуском.`,
);
