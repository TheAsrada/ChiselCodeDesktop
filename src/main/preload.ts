import { contextBridge, ipcRenderer } from "electron";
import type { ChiselBridge } from "../shared/bridge.js";
const listen = <T>(channel: string, listener: (event: T) => void) => {
	const handler = (_event: Electron.IpcRendererEvent, value: T) =>
		listener(value);
	ipcRenderer.on(channel, handler);
	return () => ipcRenderer.removeListener(channel, handler);
};
const bridge: ChiselBridge = {
	request: (method, params) =>
		ipcRenderer.invoke("engine:request", method, params),
	onEvent: (listener) => listen("engine:event", listener),
	onStatus: (listener) => listen("native:status", listener),
	onUpdate: (listener) => listen("native:update", listener),
	info: () => ipcRenderer.invoke("native:info"),
	openProject: () => ipcRenderer.invoke("native:open-project"),
	chooseExtension: (kind) =>
		ipcRenderer.invoke("native:choose-extension", kind),
	restart: () => ipcRenderer.invoke("native:restart"),
	openExternal: (url) => ipcRenderer.invoke("native:open-external", url),
	copy: (text) => ipcRenderer.invoke("native:copy", text),
	window: (action) => ipcRenderer.invoke("native:window", action),
	update: (action) => ipcRenderer.invoke("native:update", action),
};
contextBridge.exposeInMainWorld("chisel", Object.freeze(bridge));
