import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
async function files(root) {
	return (
		await Promise.all(
			(
				await readdir(root, { withFileTypes: true })
			).map((entry) =>
				entry.isDirectory()
					? files(join(root, entry.name))
					: join(root, entry.name),
			),
		)
	).flat();
}
test("renderer stays outside the runtime and native filesystem boundary", async () => {
	for (const file of await files("src/renderer"))
		if (/\.tsx?$/.test(file)) {
			const source = await readFile(file, "utf8");
			assert.doesNotMatch(
				source,
				/(?:from\s*|import\s*\()["'](?:node:|electron|.*ChiselCode\/src)/,
				file,
			);
		}
	const source = await readFile("src/main/preload.ts", "utf8");
	assert.doesNotMatch(source, /exposeInMainWorld\([^,]+,\s*ipcRenderer/);
});
test("UI and engine versions remain independent and the protocol is explicit", async () => {
	const pkg = JSON.parse(await readFile("package.json", "utf8"));
	const lock = JSON.parse(await readFile("engine.lock.json", "utf8"));
	assert.notEqual(pkg.version, lock.engineVersion);
	assert.equal(lock.repository, "TheAsrada/ChiselCode");
	assert.equal(lock.protocol.major, 1);
	assert.equal(lock.schemaVersion, 1);
});
