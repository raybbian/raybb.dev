import Hero from "@/components/Hero";
import Section from "@/components/Section";
import Entry from "@/components/Entry";
import SocialLinks from "@/components/SocialLinks";
import ProjectsCarousel from "@/components/ProjectsCarousel";
import ScrollSpy from "@/components/ScrollSpy";
import { experience } from "@/content/experience";
import { about } from "@/content/about";

export default function Home() {
  return (
    <main className="flex flex-col">
      <ScrollSpy />
      <Hero />

      <Section id="about" lead="This is" title="who I am.">
        <div className="flex flex-col gap-5">
          {about.map((a) => (
            <Entry
              key={a.title}
              title={a.title}
              description={a.description}
            />
          ))}
          <div className="mt-4">
            <SocialLinks />
          </div>
        </div>
      </Section>

      <Section id="projects" lead="Here are my" title="Projects." full>
        <ProjectsCarousel />
      </Section>

      <Section id="experience" lead="This is my" title="Experience.">
        <div className="flex flex-col gap-5">
          {experience.map((e) => (
            <Entry
              key={e.company}
              title={e.company}
              subtitle={e.role}
              meta={e.period}
              description={e.description}
            />
          ))}
        </div>
      </Section>
    </main>
  );
}
