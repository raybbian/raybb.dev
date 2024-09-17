import { ReactNode } from "react";

export function Page({ children, titleLead, title, textAccent }: {
	children?: ReactNode;
	titleLead: string;
	title: string;
	textAccent: string;
}) {
	return (
		<div className="w-full h-full grid place-items-center overflow-scroll lg:overflow-hidden">
			<div className={`h-full w-full max-w-screen-lg grid place-items-center px-8 py-12`}>
				<div className={`flex flex-col lg:flex-row gap-8 lg:gap-16 lg:items-center select-none`}>
					<div>
						<p className={`text-3xl lg:text-5xl font-bold ${textAccent}`}>{titleLead}</p>
						<h1 className="text-[3rem] lg:text-[5rem] text-white font-bold leading-none whitespace-nowrap">{title}</h1>
					</div>
					<div className={`flex flex-col gap-8 lg:max-h-[80dvh] lg:overflow-scroll`}>
						{children}
					</div>
				</div>
			</div>
		</div>
	);
}
