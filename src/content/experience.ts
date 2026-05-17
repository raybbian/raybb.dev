export type Experience = {
  company: string;
  role: string;
  period: string;
  description: string;
};

export const experience: Experience[] = [
  {
    company: "Jane Street",
    role: "Incoming SWE intern",
    period: "Summer 2026",
    description:
      "Joining the SWE intern cohort for Summer 2026.",
  },
  {
    company: "GEICO",
    role: "Software Engineer Intern",
    period: "Jun – Aug 2025",
    description:
      "Engineered a Slack bot to streamline internal access-request workflows.",
  },
  {
    company: "GT SSDL",
    role: "Undergraduate Researcher",
    period: "Aug 2024 – May 2025",
    description:
      "Developed ground operations software and systems for the NASA-partnered GPDM cubesat.",
  },
];
