import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const root = process.argv[2] ?? "release";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const lock = JSON.parse(await readFile("engine.lock.json", "utf8"));
if (
	!/^[a-f0-9]{40}$/.test(lock.sourceCommit) ||
	Object.keys(lock.assets).length !== 6
)
	throw new Error("Engine must be pinned to a complete released manifest");
const names = (await readdir(root))
	.filter((name) => /\.(exe|dmg|zip|AppImage|deb|blockmap)$/.test(name))
	.sort();
const installers = names.filter((name) => !name.endsWith(".blockmap"));
const required = [
	`win-x64.exe`,
	`mac-arm64.dmg`,
	`mac-arm64.zip`,
	`mac-x64.dmg`,
	`mac-x64.zip`,
	`linux-x86_64.AppImage`,
	`linux-amd64.deb`,
].map((suffix) => `ChiselCodeDesktop-${pkg.version}-${suffix}`);
if (JSON.stringify(installers) !== JSON.stringify([...required].sort()))
	throw new Error(`Unexpected installer set: ${installers.join(", ")}`);
const assets = [];
for (const name of names) {
	const bytes = await readFile(join(root, name));
	assets.push({
		name,
		size: bytes.length,
		sha256: createHash("sha256").update(bytes).digest("hex"),
		sha512: createHash("sha512").update(bytes).digest("base64"),
	});
}
const channel = pkg.version.includes("-")
	? pkg.version.split("-")[1].split(".")[0]
	: "latest";
for (const [suffix, pattern] of [
	["", /win-x64\.exe$/],
	["-linux", /\.(AppImage|deb)$/],
	["-mac", /mac-(arm64|x64)\.zip$/],
]) {
	const files = assets
		.filter((asset) => pattern.test(asset.name))
		.map((asset) => ({
			url: asset.name,
			sha512: asset.sha512,
			size: asset.size,
		}));
	await writeFile(
		join(root, `${channel}${suffix}.yml`),
		JSON.stringify(
			{
				version: pkg.version,
				files,
				path: files[0].url,
				sha512: files[0].sha512,
				releaseDate: new Date().toISOString(),
			},
			null,
			2,
		) + "\n",
	);
}
await writeFile(
	join(root, "release-manifest.json"),
	JSON.stringify(
		{
			schemaVersion: 1,
			version: pkg.version,
			sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
				encoding: "utf8",
			}).trim(),
			engine: lock,
			signing: { windows: "unsigned", macOS: "ad-hoc, not notarized" },
			assets,
		},
		null,
		2,
	) + "\n",
);
await writeFile(
	join(root, "SHA256SUMS"),
	assets.map((asset) => `${asset.sha256}  ${asset.name}`).join("\n") + "\n",
);
const section = await readFile("CHANGELOG.md", "utf8");
const notes = section.split(`## [${pkg.version}]`)[1]?.split("\n## [")[0];
if (!notes) throw new Error("Missing version in CHANGELOG");
await writeFile(
	join(root, "release-notes.md"),
	`${notes.replace(/^\s*[-—] [^\n]*\n/, "").trim()}\n\nВстроенное ядро: [ChiselCode ${lock.engineVersion}](https://github.com/${lock.repository}/releases/tag/${lock.tag}), commit \`${lock.sourceCommit}\`, протокол ${lock.protocol.major}.${lock.protocol.minor}.\n\nУстановщики Windows, macOS arm64/x64 и Linux прошли GUI acceptance на извлечённом/установленном payload. Проверяются потоковый ответ, запись после подтверждения, отказ, отмена и история. Модель проверки — локальный scripted HTTP fixture, runtime и инструменты настоящие.\n\nBeta без издательской подписи Windows и notarization macOS. macOS подписан ad-hoc. Инструкции: [установка](https://github.com/TheAsrada/ChiselCodeDesktop/blob/main/docs/installation.md), [проверки](https://github.com/TheAsrada/ChiselCodeDesktop/blob/main/docs/verification.md).\n\nSHA-256 установщиков: SHA256SUMS; происхождение ядра и desktop: release-manifest.json.\n`,
);
