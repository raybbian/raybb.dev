import { ReactNode, useEffect, useRef, useState } from "react";
import { FaAngleDown } from "react-icons/fa6";

export function Page({ children, titleLead, title, textAccent }: {
	children?: ReactNode;
	titleLead: string;
	title: string;
	textAccent: string;
}) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [showIcon, setShowIcon] = useState(false);

	function evalScroll() {
		if (containerRef.current == null) return;
		const hasScroll = containerRef.current.scrollHeight > containerRef.current.clientHeight;
		const scrolled = containerRef.current.scrollTop != 0;
		setShowIcon(hasScroll && !scrolled);
	}

	useEffect(() => {
		window.addEventListener('resize', evalScroll);
		evalScroll();
		return () => window.removeEventListener('resize', evalScroll);
	}, [])

	return (
		<div className="w-full h-full grid place-items-center overflow-scroll lg:overflow-hidden">
			<div className={`h-full w-full max-w-screen-lg grid place-items-center px-8 py-12`}>
				<div className={`flex flex-col lg:flex-row max-w-[28rem] lg:max-w-full gap-8 lg:gap-16 lg:items-center select-none`}>
					<div>
						<p className={`text-3xl lg:text-5xl font-bold ${textAccent}`}>{titleLead}</p>
						<h1 className="text-[3rem] lg:text-[5rem] text-white font-bold leading-none whitespace-nowrap">{title}</h1>
					</div>
					<div
						className={`flex flex-col gap-8 lg:max-h-[80dvh] lg:overflow-scroll relative no-scrollbar`}
						ref={containerRef}
						onScroll={evalScroll}
						onClick={evalScroll} // click could cause container to expand
					>
						{children}
						<div className={`${!showIcon && "opacity-0"} pointer-events-none fixed bottom-6 place-self-center grid place-items-center text-2xl lg:text-3xl animate-bounce transition-opacity text-ctp-lavender`} >
							<FaAngleDown size={48} />
						</div >
					</div>
				</div>
			</div>
		</div >
	);
}
