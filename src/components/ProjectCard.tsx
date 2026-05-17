import { FaGithub } from "react-icons/fa6";
import { Project } from "@/content/projects";

export default function ProjectCard({ project }: { project: Project }) {
  const primary = project.link ?? project.github;
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-lg shadow-black/10 backdrop-blur-md">
      {/* media placeholder — keeps the 3:4 pane visually balanced */}
      <div className="flex h-2/5 items-center justify-center border-b border-white/10 bg-gradient-to-br from-white/10 to-transparent">
        <span className="text-4xl font-bold text-white/30">
          {project.name.charAt(0)}
        </span>
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
