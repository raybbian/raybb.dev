import Image from "next/image";
import { FaArrowUpRightFromSquare } from "react-icons/fa6";

export default function FriendCard({
  name,
  blurb,
  href,
  photo,
}: {
  name: string;
  blurb: string;
  href: string;
  photo: string;
  highlight?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="frost group relative flex h-full items-stretch gap-4 overflow-hidden rounded-2xl p-6 shadow-lg shadow-black/30 transition-colors hover:bg-black/40 sm:gap-5"
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg sm:h-20 sm:w-20">
        <Image
          src={photo}
          alt={`${name}'s profile photo`}
          fill
          sizes="80px"
          className="object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="accent text-xl font-semibold sm:text-2xl">{name}</h3>
          <FaArrowUpRightFromSquare
            className="ink-3 shrink-0 text-sm transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            aria-hidden
          />
        </div>
        <p className="ink-2 mt-2 text-base leading-relaxed sm:text-lg">
          {blurb}
        </p>
      </div>
    </a>
  );
}
