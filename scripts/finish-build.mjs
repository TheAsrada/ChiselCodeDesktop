import { readFile, writeFile, rename } from "node:fs/promises";
await writeFile("dist/main/package.json", '{"type":"commonjs"}\n');
await rename("dist/main/index.cjs", "dist/main/index.js");
await rename("dist/main/preload.cjs", "dist/main/preload.js");
const pkg = JSON.parse(await readFile("package.json", "utf8"));
await writeFile(
	"dist/build-info.json",
	JSON.stringify(
		{
			version: pkg.version,
			engine: JSON.parse(await readFile("engine.lock.json", "utf8")),
		},
		null,
		2,
	),
);
