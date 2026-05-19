export default function SectionHeading({
  lead,
  title,
}: {
  lead: string;
  title: string;
}) {
  return (
    <div className="mb-10">
      <p className="accent ink-shadow text-2xl font-bold sm:text-3xl">
        {lead}
      </p>
      <h2 className="ink text-4xl font-bold leading-none tracking-tight sm:text-6xl">
        {title}
      </h2>
    </div>
  );
}
