import { FaGithub, FaLinkedin, FaEnvelope, FaCode } from "react-icons/fa6";
import { profile } from "@/content/profile";

const links = [
  { href: profile.socials.github, label: "GitHub", Icon: FaGithub },
  { href: profile.socials.linkedin, label: "LinkedIn", Icon: FaLinkedin },
  {
    href: `mailto:${profile.socials.email}`,
    label: "Email",
    Icon: FaEnvelope,
  },
  { href: profile.socials.codeforces, label: "Codeforces", Icon: FaCode },
];

export default function SocialLinks() {
  return (
    <div className="flex flex-wrap gap-3">
      {links.map(({ href, label, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={label}
          className="frost flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/30 hover:text-white dark:text-white/80 dark:hover:bg-black/50"
        >
          <Icon className="text-base" />
          {label}
        </a>
      ))}
    </div>
  );
}
