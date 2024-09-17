import { Page } from "@/components/Page";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { FaPause, FaPlay } from "react-icons/fa6";

function Project({ name, technologies, description, link, img, video }: {
  name: string;
  technologies: string;
  description: string;
  video?: string;
  img?: string;
  link?: string;
}) {
  const [preview, setPreview] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  return (
    <div className="w-full h-full flex flex-col lg:block">
      <div className={`w-full ${preview ? "lg:w-[65%] lg:max-w-full" : "lg:hover:w-[30%] lg:w-[29%]"} bg-ctp-crust aspect-video float-left mr-4 mb-3 lg:mb-1 border-2 border-ctp-surface0 cursor-pointer transition-width order-3 lg:order-1 relative z-10`}>
        {video &&
          <video
            ref={videoRef}
            src={`/project-cover/${video}`}
            preload="auto"
            loop={true}
            muted={true}
            width={640} height={360}
            className={`w-full h-full object-cover`}
            onClick={() => {
              if (preview) {
                videoRef.current?.pause();
                setPlaying(false);
              } else {
                videoRef.current?.play();
                setPlaying(true);
              }
              setPreview(!preview)
            }}
          >
            <source src={`/project-cover/${video}`} type={`video/${video.split('.')[1]}`} />
          </video>
        }
        {video &&
          <div className="absolute top-2 left-2 pointer-events-none rounded-full bg-ctp-base p-[0.3rem] grid place-items-center">
            {!playing ? <FaPlay /> : <FaPause />}
          </div>
        }
        {img &&
          <Image
            src={`/project-cover/${img}`}
            alt={`${name}-project-cover`}
            width={640} height={360}
            className={`w-full h-full object-cover`}
            onClick={() => setPreview(!preview)}
          />
        }
      </div>
      <p className={`text-2xl lg:text-3xl font-semibold text-ctp-lavender mb-1 order-1 lg:order-2`}>
        {link ? <Link href={link} target="_blank" className="underline underline-offset-4">{name}</Link> : name}
      </p>
      <p className="text-lg lg:text-xl font-semibold order-2 lg:order-3 mb-1 lg:mb-0">
        {technologies}
      </p>
      <p className="text-md lg:text-lg text-ctp-subtext0 order-4 lg:order-4">{description}</p>
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
        description="A Windows Kernel driver + WinUI 3 GUI App that exposes and enables hidden but useful iDevice USB interfaces. Implements what Apple didn't in the form of wired P2P ethernet, iPad screen sharing, etc. between Windows and iDevices."
        technologies="WDF, WinUI3, Visual Studio"
        link="https://github.com/raybbian/iUtils"
        video="iUtils.mp4"
      />
      <Project
        name="Graphscii"
        description="Python app that utilizes Topology-Shape-Metrics and the Kandinsky model to embed graphs with ASCII characters only. Useful for including diagrams of combinatorial graphs in code comments, markdown files, and plaintext documents."
        technologies="NetworkX, Python, React"
        link="https://graphscii.raybb.dev/"
        video="graphscii.mp4"
      />
      <Project
        name="Dungeon Deja Vu"
        description="Precision platformer, with a twist, made for Bevy Game Jam #5. Join Cy the slime and ascend the cyclic tower to escape and reunite with his slime friends! Placed #8 overall and #3 in game design. "
        technologies="Rust, Bevy, WASM, LDTK"
        link="https://dsfhdshdjtsb.itch.io/dungeon-deja-vu"
        video="ddv.mp4"
      />
      <Project
        name="Daedalus"
        description="My own esoteric programming language, built with Rust. Become Daedalus as you write and solve mazes and labyrinths that form instructions to control a stack machine. Develop your next puzzle with the IDE, written in React.js."
        technologies="Rust, React.js, WebGL"
        link="https://daedalus-ide.vercel.app"
        video="daedalus.mp4"
      />
      <Project
        name="Landing"
        description="A simple full stack todo list app built with Prisma, Next.js, and Postgres. Features OAuth2 Github login and Codeforces integration, along with a user-friendly and responsive frontend."
        technologies="Prisma, Next.js, Postgres"
        link="https://landing.raybb.dev"
        video="landing.mp4"
      />
      <Project
        name="CF Debug"
        description="Simple C++ single header debug file (that abuses generics and recursion), allowing for quick and easy visualization of even the most complex nested data structures. Check it out if you spend too much time debugging on Codeforces/USACO/ICPC!"
        technologies="C++, Templates"
        link="https://github.com/raybbian/comp-programming"
        video="cfdebug.mp4"
      />
      <Project
        name="USACO Checklist"
        description="Sophisticated web scraper that pulls problem progress and information from the USACO website, keeping track of and allowing you to share your progress. No more switching back and forth between a spreadsheet to figure out which problems you've solved!"
        technologies="FastAPI, SQL"
        img="usaco-checklist.png"
      />
      <Project
        name="GT Multi-booker"
        description="UI and wrapper utility that allows users to book multiple GT Library rooms at once, built with React, FastAPI, and Postman. Don't abuse it and get new rules imposed on your entire school!"
        technologies="FastAPI, React"
        link="https://multibooker.raybb.dev/"
        video="multibooker.mp4"
      />
      <Project
        name="Garden of Growth"
        description="My old personal portfolio, featuring a rule based procedural terrain generation algorithm, ensuring that the site (and my experiences) will have changed every time you visit! (Wave Function Collapse)."
        technologies="React, Tailwind"
        link="https://old.raybb.dev"
        video="garden.mp4"
      />
    </Page>
  );
}


