export type Experience = {
  company: string;
  role: string;
  period: string;
  description: string;
};

export const experience: Experience[] = [
  {
    company: "Trading Firm",
    role: "Incoming SWE intern",
    period: "Summer 2026",
    description: "Providing market liquidity.",
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
      "Developed ground ops software for the NASA-partnered GPDM cubesat.",
  },
];
