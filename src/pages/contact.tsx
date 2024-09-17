import { Page } from "@/components/Page";
import Link from "next/link";
import { useEffect, useState } from "react";

function ContactEntry({ subject, description }: {
  subject: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-2xl lg:text-3xl font-semibold text-ctp-lavender"><span className="text-white">About </span>{subject}</p>
      <p className="text-md lg:text-lg opacity-80">{description}</p>
    </div>
  )
}

export default function Contact() {
  const [email, setEmail] = useState('mailto:hi@gmail.com');
  useEffect(() => {
    setEmail('mailto:raybbian@gmail.com');
  }, [])

  return (
    <Page
      titleLead="Please,"
      title="Contact Me."
      textAccent="text-ctp-lavender"
    >
      <ContactEntry
        subject="Internship Opportunities"
        description="I'm currently looking for an internship to learn more about working in a fast paced, professional environment."
      />
      <ContactEntry
        subject="What I'm Working On"
        description="I'd love to tell you about anything I'm currently working on! It gives me purpose to know that what I'm building isn't just for my eyes, only."
      />
      <ContactEntry
        subject="Cool Technologies"
        description="Its always more fun building cool things when you use cool tools! It also gives me a lot of inspiration and motivation to keep on building projects."
      />
      <div className="w-full flex flex-row justify-center gap-8">
        <Link
          className="text-2xl text-ctp-lavender font-semibold underline underline-offset-4"
          href={email}
          target="_blank"
        >
          Email
        </Link>
        <Link
          className="text-2xl text-ctp-lavender font-semibold underline underline-offset-4"
          href={'https://linkedin.com/in/raybbian'}
          target="_blank"
        >
          Linkedin
        </Link>
      </div>
    </Page>
  );
}
