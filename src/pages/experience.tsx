import { Page } from "@/components/Page";

function ExperienceEntry({ company, title, description, from, to }: {
  company: string;
  title: string;
  description: string;
  from: Date;
  to: Date;
}) {
  function dateObjFormat(date: Date): string {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-2xl lg:text-3xl font-semibold text-ctp-lavender"><span className="text-ctp-text">{company} | </span>{title}</p>
      <p className="text-md lg:text-lg text-ctp-subtext0">{description}</p>
      <p className="text-lg lg:text-xl font-semibold">{dateObjFormat(from)} - <span className="text-nlavendar">{dateObjFormat(to)}</span></p>
    </div>
  )
}

export default function Experience() {
  return (
    <Page
      titleLead="This is my"
      title="Experience."
      textAccent="text-ctp-lavender"
    >
      <ExperienceEntry
        company="Jane Street"
        title="Incoming Software Engineer Intern"
        description="Starting Summer 2026"
        from={new Date('May 1, 2026')}
        to={new Date('Aug 1, 2026')}
      />
      <ExperienceEntry
        company="GEICO"
        title="Software Engineer Intern"
        description="Engineered a Slack Bot to streamline internal access request workflows."
        from={new Date('June 1, 2025')}
        to={new Date('Aug 1, 2025')}
      />
      <ExperienceEntry
        company="GT SSDL"
        title="Undergrad Researcher"
        description="Developing ground operations software and systems for the upcoming GPDM cube satellite."
        from={new Date('Aug 1, 2024')}
        to={new Date('May 1, 2025')}
      />
    </Page>
  );
}

