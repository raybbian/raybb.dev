import { projects } from "@/content/projects";
import Carousel from "./Carousel";
import ProjectCard from "./ProjectCard";

export default function ProjectsCarousel() {
  return (
    <Carousel prevLabel="Previous projects" nextLabel="Next projects">
      {projects.map((project) => (
        <div
          key={project.name}
          // Cap height so the 3:4 width never exceeds ~80vw — keeps edge
          // space on narrow/mobile screens (width = height * 3/4).
          className="aspect-[3/4] h-[min(clamp(20rem,62vh,34rem),106vw)] shrink-0 snap-start select-none"
        >
          <ProjectCard project={project} />
        </div>
      ))}
    </Carousel>
  );
}
