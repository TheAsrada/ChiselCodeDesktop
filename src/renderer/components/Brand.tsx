export function BrandMark({ size = 24 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 32 32"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M10 4h18l-6 7H11l-4 5 4 5h11l6 7H10L0 16 10 4Z"
				fill="currentColor"
			/>
			<path d="m27 12 5-6v14l-5 6V12Z" fill="currentColor" opacity=".4" />
		</svg>
	);
}

export function ChiselSculpture() {
	return (
		<svg
			className="chisel-sculpture"
			viewBox="0 0 420 360"
			fill="none"
			aria-hidden="true"
		>
			<defs>
				<linearGradient
					id="chisel-front"
					x1="166"
					y1="102"
					x2="286"
					y2="298"
					gradientUnits="userSpaceOnUse"
				>
					<stop stopColor="#fff" />
					<stop offset="1" stopColor="#b7b9b4" />
				</linearGradient>
				<linearGradient
					id="chisel-top"
					x1="100"
					y1="66"
					x2="325"
					y2="120"
					gradientUnits="userSpaceOnUse"
				>
					<stop stopColor="#e2e3df" />
					<stop offset="1" stopColor="#fff" />
				</linearGradient>
				<linearGradient
					id="chisel-side"
					x1="84"
					y1="140"
					x2="168"
					y2="245"
					gradientUnits="userSpaceOnUse"
				>
					<stop stopColor="#93958e" />
					<stop offset="1" stopColor="#d9dbd4" />
				</linearGradient>
				<linearGradient
					id="chisel-cut"
					x1="168"
					y1="173"
					x2="276"
					y2="213"
					gradientUnits="userSpaceOnUse"
				>
					<stop stopColor="#555952" />
					<stop offset="1" stopColor="#aaaDA5" />
				</linearGradient>
				<filter
					id="chisel-shadow"
					x="20"
					y="250"
					width="370"
					height="100"
					filterUnits="userSpaceOnUse"
				>
					<feGaussianBlur stdDeviation="15" />
				</filter>
			</defs>
			<ellipse
				cx="216"
				cy="294"
				rx="138"
				ry="14"
				fill="#000"
				opacity=".65"
				filter="url(#chisel-shadow)"
			/>
			<path d="m86 121 89-80 151 23-92 80-148-23Z" fill="url(#chisel-top)" />
			<path d="m86 121 62 31v98l-62-32v-97Z" fill="url(#chisel-side)" />
			<path d="m86 121 89-80v52l-42 39-47-11Z" fill="#bbbdb6" />
			<path
				d="m148 152 86-8 92-80v68l-58 49-61 6-23 24 23 29 61-6 58 27v55l-92 8-86-74v-98Z"
				fill="url(#chisel-front)"
			/>
			<path
				d="m184 211 23-24 61-6 58-49-61-13-96 84 15 8Z"
				fill="url(#chisel-cut)"
			/>
			<path d="m184 211 23 29 61-6 58 27-69-6-73-44Z" fill="#fafbf8" />
			<path d="m148 250 86 74 92-8-61-32-89-70-28 36Z" fill="#b4b8ae" />
			<path d="m86 218 62 32 86 74-61-32-87-74Z" fill="#747a70" />
			<path
				d="m234 144 92-80M148 152l86-8M234 324l92-8"
				stroke="#fff"
				strokeOpacity=".5"
			/>
		</svg>
	);
}
