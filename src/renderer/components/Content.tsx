import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
	ChevronDown,
	ChevronRight,
	Check,
	Copy,
	FileCode2,
	Terminal,
	X,
} from "lucide-react";
import type { Diff, Message } from "@chiselcode/desktop-sdk";
import { BrandMark } from "./Brand.js";
export const Markdown = memo(({ text }: { text: string }) => (
	<div className="markdown">
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			components={{
				a: ({ href, children }) => (
					<a
						href={href}
						onClick={(event) => {
							event.preventDefault();
							if (href) void window.chisel.openExternal(href);
						}}
					>
						{children}
					</a>
				),
				pre: ({ children }) => <pre>{children}</pre>,
				img: ({ alt }) => (
					<span className="image-reference">{alt ?? "Изображение"}</span>
				),
			}}
		>
			{text}
		</ReactMarkdown>
	</div>
));
export function Patch({ patch }: { patch: string }) {
	return (
		<pre className="patch">
			{patch.split("\n").map((line, index) => (
				<span
					key={index}
					className={
						line.startsWith("+") && !line.startsWith("+++")
							? "added"
							: line.startsWith("-") && !line.startsWith("---")
								? "removed"
								: line.startsWith("@@")
									? "hunk"
									: ""
					}
				>
					<i>{index + 1}</i>
					{line || " "}
					{"\n"}
				</span>
			))}
		</pre>
	);
}
export function DiffCard({ diff }: { diff: Diff }) {
	const [open, setOpen] = useState(false);
	return (
		<div className="diff-card">
			<button className="diff-heading" onClick={() => setOpen(!open)}>
				{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
				<FileCode2 size={15} />
				<span>{diff.path}</span>
				<b className="addition">+{diff.additions}</b>
				<b className="deletion">−{diff.deletions}</b>
			</button>
			{open && <Patch patch={diff.patch} />}
		</div>
	);
}
export const MessageView = memo(({ message }: { message: Message }) => {
	const [open, setOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	if (message.role === "tool")
		return (
			<div className={`tool-card ${message.isError ? "tool-error" : ""}`}>
				<button onClick={() => setOpen(!open)} className="tool-heading">
					{message.isError ? <X size={15} /> : <Check size={15} />}
					<Terminal size={14} />
					<span>{message.tool}</span>
					<small>{message.isError ? "Ошибка" : "Выполнено"}</small>
					{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
				</button>
				{open && (
					<div className="tool-output">
						<Markdown text={message.text} />
					</div>
				)}
				{message.diffs?.map((diff) => (
					<DiffCard key={diff.path} diff={diff} />
				))}
			</div>
		);
	return (
		<article className={`message message-${message.role}`}>
			<div className="message-meta">
				<span
					className={`avatar ${message.role === "user" ? "user-avatar" : ""}`}
				>
					{message.role === "user" ? "Вы" : <BrandMark size={15} />}
				</span>
				<strong>{message.role === "user" ? "Вы" : "ChiselCode"}</strong>
				<button
					className="icon-button copy-button"
					aria-label="Скопировать сообщение"
					onClick={() => {
						void window.chisel.copy(message.text);
						setCopied(true);
						setTimeout(() => setCopied(false), 1600);
					}}
				>
					{copied ? <Check size={14} /> : <Copy size={14} />}
				</button>
			</div>
			<div className="message-body">
				<Markdown text={message.text} />
			</div>
		</article>
	);
});
