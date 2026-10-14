import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const files = await readdir("release");
const { version } = JSON.parse(await readFile("package.json", "utf8"));
function artifact(suffix) {
	const name = `ChiselCodeDesktop-${version}-${suffix}`;
	if (!files.includes(name))
		throw new Error(`Missing current installer: ${name}`);
	return name;
}
const root = await mkdtemp(join(tmpdir(), "chisel-installer-"));
function run(file, args, options = {}) {
	execFileSync(file, args, { stdio: "inherit", ...options });
}
function gui(executable) {
	const command = process.platform === "win32" ? "npm.cmd" : "npm";
	const result = spawnSync(command, ["run", "test:e2e"], {
		stdio: "inherit",
		env: { ...process.env, CHISEL_TEST_EXECUTABLE: executable },
		shell: process.platform === "win32",
	});
	if (result.status !== 0)
		throw new Error(`GUI acceptance failed for ${executable}`);
}
try {
	if (process.platform === "linux") {
		const deb = artifact("linux-amd64.deb");
		const image = artifact("linux-x86_64.AppImage");
		run("dpkg-deb", ["-x", resolve("release", deb), join(root, "deb")]);
		gui(join(root, "deb", "opt", "ChiselCode Desktop", "chiselcode-desktop"));
		run(resolve("release", image), ["--appimage-extract"], { cwd: root });
		gui(join(root, "squashfs-root", "chiselcode-desktop"));
	} else if (process.platform === "win32") {
		const installer = artifact("win-x64.exe");
		const destination = join(root, "installed");
		run(resolve("release", installer), ["/S", `/D=${destination}`]);
		gui(join(destination, "ChiselCode Desktop.exe"));
	} else if (process.platform === "darwin") {
		const dmg = artifact(`mac-${process.arch}.dmg`);
		const zip = artifact(`mac-${process.arch}.zip`);
		const mount = join(root, "mount");
		await mkdir(mount);
		run("hdiutil", [
			"attach",
			resolve("release", dmg),
			"-nobrowse",
			"-readonly",
			"-mountpoint",
			mount,
		]);
		try {
			run("ditto", [
				join(mount, "ChiselCode Desktop.app"),
				join(root, "dmg", "ChiselCode Desktop.app"),
			]);
		} finally {
			run("hdiutil", ["detach", mount]);
		}
		gui(
			join(
				root,
				"dmg",
				"ChiselCode Desktop.app",
				"Contents",
				"MacOS",
				"ChiselCode Desktop",
			),
		);
		run("ditto", ["-x", "-k", resolve("release", zip), join(root, "zip")]);
		gui(
			join(
				root,
				"zip",
				"ChiselCode Desktop.app",
				"Contents",
				"MacOS",
				"ChiselCode Desktop",
			),
		);
	} else throw new Error(`Unsupported platform: ${process.platform}`);
} finally {
	await rm(root, { recursive: true, force: true });
}
