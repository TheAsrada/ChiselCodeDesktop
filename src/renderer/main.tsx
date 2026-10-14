import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import "@fontsource/jetbrains-mono/400.css";
import App from "./App.js";
import "./style.css";
class ErrorBoundary extends React.Component<
	{ children: React.ReactNode },
	{ error?: string }
> {
	state: { error?: string } = {};
	static getDerivedStateFromError(error: Error) {
		return { error: error.message };
	}
	render() {
		return this.state.error ? (
			<div className="fatal">
				<h1>Не удалось отобразить приложение</h1>
				<p>{this.state.error}</p>
				<button onClick={() => location.reload()}>
					Перезагрузить интерфейс
				</button>
			</div>
		) : (
			this.props.children
		);
	}
}
createRoot(document.getElementById("root")!).render(
	<ErrorBoundary>
		<App />
	</ErrorBoundary>,
);
