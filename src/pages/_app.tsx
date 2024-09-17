import Voronoi from "@/components/Voronoi";
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { useRef, useState } from "react";
import { Rubik } from 'next/font/google';
import Link from "next/link";
import { usePathname } from "next/navigation";
const rubik = Rubik({
  subsets: ['latin', 'latin-ext'],
});

type Pages = "" | "about" | "projects" | "experience" | "contact";
const pagesTypes: Pages[] = ["", "about", "projects", "experience", "contact"]

export default function App({ Component, pageProps }: AppProps) {
  const mousePosRef = useRef<[number, number]>([0, 0]);
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div
      className={`w-[100dvw] h-[100dvh] ${rubik.className} text-ctp-text overflow-hidden relative`}
      onMouseMove={(e) => {
        mousePosRef.current[0] = e.clientX;
        mousePosRef.current[1] = e.clientY;
      }}
      onMouseEnter={(e) => {
        mousePosRef.current[0] = e.clientX;
        mousePosRef.current[1] = e.clientY;
      }}
    >
      <Voronoi mousePosRef={mousePosRef} className="-z-10 absolute" />
      <button
        className={`w-8 h-8 absolute top-8 right-8 z-30 rounded-full transition-colors ${navOpen ? "bg-ctp-red" : "bg-ctp-green"}`}
        onClick={() => setNavOpen(!navOpen)}
      />
      <div
        className={`w-full h-full absolute z-10 bg-black ${navOpen ? "opacity-50" : "opacity-0 pointer-events-none"} transition-opacity cursor-pointer`}
        onClick={() => setNavOpen(false)}
      />
      <div className={`p-6 py-24 h-full absolute left-full z-20 w-56 max-w-full lg:w-80 bg-ctp-crust border-l-2 border-ctp-surface0 transition-transform ${navOpen && "-translate-x-full"}`} >
        <div className="flex flex-col justify-end gap-1 lg:gap-3">
          {pagesTypes.map((pageName, i) =>
            <Link
              key={i}
              className={`${pathname == '/' + pageName && "text-ctp-lavender underline"} text-2xl lg:text-4xl text-right`}
              href={`/${pageName}`}
              onClick={() => setNavOpen(false)}
            >
              {pageName == "" ? "home" : pageName}.
            </Link>
          )}
        </div>
      </div>
      <Component {...pageProps} />
    </div>
  );
}
