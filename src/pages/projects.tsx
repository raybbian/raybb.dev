import { Page } from "@/components/Page";
import Link from "next/link";

function Project({ name, technologies, description, link }: {
  name: string;
  technologies: string;
  description: string;
  link?: string;
}) {
  return (
    <div className="w-full flex flex-col gap-2 snap-center">
      <p className="text-2xl lg:text-3xl font-semibold text-ctp-lavender">
        {link ? <Link href={link} target="_blank" className="underline underline-offset-4">{name}</Link> : name}
        <span className="text-white"> | {technologies}</span>
      </p>
      <p className="text-md lg:text-lg opacity-80">{description}</p>
    </div>
  )
}


export default function Projects() {
  return (
    <Page
      titleLead="Here are my"
      title="Projects."
      textAccent="text-ctp-lavender"
    >
      <Project
        name="iUtils"
        description="A Windows Kernel driver + WinUI 3 GUI App that expose and enable hidden but useful iDevice USB interfaces."
        technologies="WDF, WinUI3, Visual Studio"
        link="https://github.com/raybbian/iUtils"
      />
      <Project
        name="Graphscii"
        description="Python app that utilizes Topology-Shape-Metrics and the Kandinsky model to embed graphs with ASCII characters only."
        technologies="NetworkX, Python, React"
        link="https://graphscii.raybb.dev/"
      />
      <Project
        name="LoL CD Tracker"
        description="An external tool for League of Legends developed with ReClass, ImGUI, the Windows API, and reverse engineering techniques."
        technologies="C++, ImGUI, ReClass"
      />
      <Project
        name="Landing"
        description="Simple full stack todo list app built with Prisma, Next.js, and Postgres. Features OAuth2 Github login and Codeforces integration."
        technologies="Prisma, Next.js, Postgres"
        link="https://landing.raybb.dev"
      />
      <Project
        name="GT Multibooker"
        description="UI and wrapper utility that allows users to book multiple GT Library rooms at once, built with React, FastAPI, and Postman."
        technologies="FastAPI, React"
        link="https://multibooker.raybb.dev/"
      />
      <Project
        name="USACO Checklist"
        description="Sophisticated web scraper that pulls problem progress and information from the USACO website, keeping track of and allowing you to share your progress."
        technologies="FastAPI, SQL"
      />
      <Project
        name="Codeforces Debug"
        description="Simple C++ single header debug file that allows for a quick and easy visualization of even the most complex nested data structures."
        technologies="C++, Templates"
        link="https://github.com/raybbian/comp-programming"
      />
      <Project
        name="Garden of Growth"
        description="My old personal portfolio, featuring a rule based procedural terrain generation algorithm (Wave Function Collapse)."
        technologies="React, Tailwind"
        link="https://old.raybb.dev"
      />
    </Page>
  );
}


