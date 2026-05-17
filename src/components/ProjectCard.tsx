"use client";

import { Stream, type StreamPlayerApi } from "@cloudflare/stream-react";
import { useEffect, useRef, useState } from "react";
import { FaGithub, FaPause, FaPlay } from "react-icons/fa6";
import { Project } from "@/content/projects";

export default function ProjectCard({ project }: { project: Project }) {
  const primary = project.link ?? project.github;
  const player = useRef<StreamPlayerApi>(undefined);
  const cardRef = useRef<HTMLElement>(null);
  const [playing, setPlaying] = useState(false);

  // Touch / hover-less devices have no mouseenter — drive playback by
  // visibility instead: the carousel snaps a card to center, so the most
  // on-screen card plays and the rest pause.
  useEffect(() => {
    if (!project.video) return;
    const el = cardRef.current;
    if (!el || !window.matchMedia("(hover: none)").matches) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio > 0.7) player.current?.play().catch(() => {});
        else player.current?.pause();
      },
      { threshold: [0, 0.7, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [project.video]);

  // Play only while the card is hovered; reset to the start when it isn't.
  const onEnter = () => {
    player.current?.play().catch(() => {});
  };
  const onLeave = () => {
    player.current?.pause();
  };
  const onToggle = () => {
    const p = player.current;
    if (!p) return;
    if (p.paused) p.play().catch(() => {});
    else p.pause();
  };

  return (
    <article
      ref={cardRef}
      onMouseEnter={project.video ? onEnter : undefined}
      onMouseLeave={project.video ? onLeave : undefined}
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-lg shadow-black/10 backdrop-blur-md"
    >
      {/* Cover video when available; letter placeholder keeps the 3:4 pane
          balanced otherwise. */}
      <div
        onClick={project.video ? onToggle : undefined}
        className={`relative flex h-2/5 items-center justify-center overflow-hidden border-b border-white/10 bg-gradient-to-br from-white/10 to-transparent${
          project.video ? " cursor-pointer" : ""
        }`}
      >
        {project.video ? (
          <Stream
            src={project.video}
            streamRef={player}
            muted
            loop
            controls={false}
            preload="auto"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            className="absolute inset-0 h-full w-full [&_iframe]:h-full [&_iframe]:w-full"
          />
        ) : (
          <span className="text-4xl font-bold text-white/30">
            {project.name.charAt(0)}
          </span>
        )}
        {project.video && (
          <span
            aria-hidden
            className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/40 text-[10px] text-white/80 backdrop-blur-sm"
          >
            {playing ? <FaPause /> : <FaPlay className="ml-px" />}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-xl font-semibold text-white">
          {primary ? (
            <a
              href={primary}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-emerald-200"
            >
              {project.name}
            </a>
          ) : (
            project.name
          )}
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {project.tech.map((t) => (
            <span
              key={t}
              className="rounded-full bg-emerald-300/15 px-2 py-0.5 text-xs font-medium text-emerald-100"
            >
              {t}
            </span>
          ))}
        </div>
        <p className="mt-3 flex-1 overflow-hidden text-sm leading-relaxed text-white/70">
          {project.description}
        </p>
        {(project.link || project.github) && (
          <div className="mt-4 flex justify-end gap-2">
            {project.github && (
              <a
                href={project.github}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 transition-colors hover:bg-white/20"
              >
                <FaGithub /> Code
              </a>
            )}
            {project.link && (
              <a
                href={project.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-emerald-300/15 px-3 py-1 text-xs font-medium text-emerald-100 transition-colors hover:bg-emerald-300/25"
              >
                Visit <span aria-hidden>↗</span>
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
