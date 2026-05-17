export default function SectionHeading({
  lead,
  title,
}: {
  lead: string;
  title: string;
}) {
  return (
    <div className="mb-10">
      <p className="text-2xl font-bold text-emerald-200/90 [text-shadow:0_2px_8px_rgba(0,0,0,0.45)] sm:text-3xl">
        {lead}
      </p>
      <h2 className="text-4xl font-bold leading-none tracking-tight text-white [text-shadow:0_3px_12px_rgba(0,0,0,0.5)] sm:text-6xl">
        {title}
      </h2>
    </div>
  );
}
