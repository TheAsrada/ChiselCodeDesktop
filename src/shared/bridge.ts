import type {
	EngineEvent,
	Hello,
	Method,
	RequestMap,
} from "@chiselcode/desktop-sdk";
export interface NativeStatus {
	state: "ready" | "error";
	message?: string;
}
export interface UpdateStatus {
	state:
		| "idle"
		| "checking"
		| "available"
		| "current"
		| "downloading"
		| "downloaded"
		| "error";
	version?: string;
	progress?: number;
	message?: string;
}
export interface ChiselBridge {
	request<M extends Method>(
		method: M,
		params: RequestMap[M]["params"],
	): Promise<RequestMap[M]["result"]>;
	onEvent(listener: (event: EngineEvent["params"]) => void): () => void;
	onStatus(listener: (status: NativeStatus) => void): () => void;
	onUpdate(listener: (status: UpdateStatus) => void): () => void;
	info(): Promise<{ version: string; platform: string; engine: Hello }>;
	openProject(): Promise<string | null>;
	openExternal(url: string): Promise<void>;
	copy(text: string): Promise<void>;
	window(action: "minimize" | "maximize" | "close"): Promise<void>;
	update(action: "check" | "download" | "install"): Promise<void>;
}
declare global {
	interface Window {
		chisel: ChiselBridge;
	}
}
