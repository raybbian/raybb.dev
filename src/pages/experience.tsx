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
      <p className="text-2xl lg:text-3xl font-semibold text-ctp-lavender"><span className="text-white">{company} | </span>{title}</p>
      <p className="text-md lg:text-lg opacity-80">{description}</p>
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
        company="GT SSDL"
        title="Undergrad Researcher"
        description="Developing ground operations software and systems for the upcoming GPDM cube satellite."
        from={new Date('Aug 1, 2024')}
        to={new Date()}
      />
      <ExperienceEntry
        company="DMECC"
        title="Lead Developer"
        description="Coordinated and developed an organization wide volunteer portal assisting tens of volunteers and students."
        from={new Date('May 1, 2022')}
        to={new Date('Aug 1, 2024')}
      />
      <ExperienceEntry
        company="Epoch Tech"
        title="English Instructor"
        description="Instructed and assisted 25 Chinese workforce professionals with Business english weekly."
        from={new Date('June 1, 2021')}
        to={new Date('September 1, 2021')}
      />
    </Page>
  );
}

