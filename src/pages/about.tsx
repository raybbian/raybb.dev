import { Page } from "@/components/Page";
import Link from "next/link";

function AboutEntry({ title, description }: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-2xl lg:text-3xl font-semibold text-ctp-lavender"><span className="text-ctp-text">I am </span>{title}</p>
      <p className="text-md lg:text-lg text-ctp-subtext0">{description}</p>
    </div>
  )
}

export default function About() {
  return (
    <Page
      titleLead="This is"
      title="who I am."
      textAccent="text-ctp-lavender"
    >
      <AboutEntry
        title="a CS & Math Major @ GT"
        description="Junior studying CS and Mathematics at Georgia Tech (Sysarch + Intel). Competitive Programming co-president, VGDev team lead, Klaus invader, Panda Express enjoyer."
      />
      <AboutEntry
        title="Passionate"
        description="... about making projects and building new things. I'm also interested in game development, competitive programming, and algorithms, and I love to play Saxophone, Volleyball, and Tennis!"
      />
      <AboutEntry
        title="a Food Lover"
        description="Everything from pho to Sichuan hotpot to big-ass burgers - I'm always interested in trying (and finishing) new foods."
      />
      <div className="w-full flex flex-row justify-center gap-8">
        <Link
          className="text-2xl text-ctp-lavender font-semibold underline underline-offset-4"
          href={'https://github.com/raybbian'}
          target="_blank"
        >
          Github
        </Link>
      </div>
    </Page>
  );
}
