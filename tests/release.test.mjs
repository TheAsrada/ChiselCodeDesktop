import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

test("release metadata binds every installer, both Mac architectures and Linux formats; incomplete sets cannot publish", async () => {
	const root = await mkdtemp(join(tmpdir(), "desktop-release-fixture-"));
	const script = resolve("scripts/prepare-release.mjs");
	try {
		await mkdir(join(root, "release"));
		execFileSync("git", ["init", root], { stdio: "ignore" });
		await writeFile(
			join(root, "package.json"),
			JSON.stringify({ version: "0.1.0-beta.1" }),
		);
		await writeFile(
			join(root, "CHANGELOG.md"),
			"## [0.1.0-beta.1] - 2026-10-14\n\n- Проверка\n",
		);
		await writeFile(
			join(root, "engine.lock.json"),
			JSON.stringify({
				sourceCommit: "a".repeat(40),
				protocol: { major: 1, minor: 0 },
				assets: Object.fromEntries(
					[
						"win32-x64",
						"linux-x64",
						"darwin-arm64",
						"darwin-x64",
						"sdk",
						"skills",
					].map((target) => [target, { name: target, sha256: "b".repeat(64) }]),
				),
			}),
		);
		execFileSync("git", ["-C", root, "add", "."], { stdio: "ignore" });
		execFileSync(
			"git",
			[
				"-C",
				root,
				"-c",
				"user.name=Fixture",
				"-c",
				"user.email=fixture@example.invalid",
				"commit",
				"-m",
				"Fixture",
			],
			{ stdio: "ignore" },
		);
		assert.notEqual(
			spawnSync(process.execPath, [script], { cwd: root }).status,
			0,
		);
		const suffixes = [
			"win-x64.exe",
			"mac-arm64.dmg",
			"mac-arm64.zip",
			"mac-x64.dmg",
			"mac-x64.zip",
			"linux-x86_64.AppImage",
			"linux-amd64.deb",
		];
		for (const suffix of suffixes)
			await writeFile(
				join(root, "release", `ChiselCodeDesktop-0.1.0-beta.1-${suffix}`),
				suffix,
			);
		execFileSync(process.execPath, [script], { cwd: root });
		const linux = JSON.parse(
			await readFile(join(root, "release", "beta-linux.yml"), "utf8"),
		);
		assert.equal(linux.files.length, 2);
		assert(linux.files.some((file) => file.url.endsWith(".deb")));
		assert(linux.files.some((file) => file.url.endsWith(".AppImage")));
		const mac = JSON.parse(
			await readFile(join(root, "release", "beta-mac.yml"), "utf8"),
		);
		assert.equal(mac.files.length, 2);
		assert(mac.files.some((file) => file.url.includes("arm64")));
		assert(mac.files.some((file) => file.url.includes("x64")));
		const manifest = JSON.parse(
			await readFile(join(root, "release", "release-manifest.json"), "utf8"),
		);
		assert.equal(manifest.assets.length, 7);
		for (const asset of manifest.assets) {
			const bytes = await readFile(join(root, "release", asset.name));
			assert.equal(
				asset.sha256,
				createHash("sha256").update(bytes).digest("hex"),
			);
			assert.equal(
				asset.sha512,
				createHash("sha512").update(bytes).digest("base64"),
			);
			assert.equal(asset.size, bytes.length);
		}
		assert.equal(
			(await readFile(join(root, "release", "SHA256SUMS"), "utf8"))
				.trim()
				.split("\n").length,
			7,
		);
		const notes = await readFile(
			join(root, "release", "release-notes.md"),
			"utf8",
		);
		assert(notes.startsWith("- Проверка"));
		assert(notes.includes("notarization"));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
