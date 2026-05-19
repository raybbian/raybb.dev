import { ReactNode } from "react";
import SectionHeading from "./SectionHeading";

export default function Section({
  id,
  lead,
  title,
  full = false,
  children,
}: {
  id: string;
  lead: string;
  title: string;
  // full: let children manage their own width (e.g. edge-to-edge carousel)
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="flex snap-start flex-col justify-center py-24 lg:min-h-[100svh]"
    >
      <div className={full ? "" : "mx-auto w-full max-w-3xl px-6"}>
        <div className={full ? "mx-auto w-full max-w-3xl px-6" : ""}>
          <SectionHeading lead={lead} title={title} />
        </div>
        {children}
      </div>
    </section>
  );
}
