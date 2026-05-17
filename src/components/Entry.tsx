import Panel from "./Panel";

export default function Entry({
  title,
  titleAccent,
  meta,
  description,
}: {
  title: string;
  // optional plain prefix before the accented title (e.g. "Incoming · ")
  titleAccent?: string;
  meta?: string;
  description: string;
}) {
  return (
    <Panel className="p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="text-xl font-semibold text-white sm:text-2xl">
          {titleAccent && (
            <span className="text-white/60">{titleAccent}</span>
          )}
          <span className="text-emerald-200">{title}</span>
        </h3>
        {meta && (
          <span className="text-sm text-white/50 sm:text-base">{meta}</span>
        )}
      </div>
      <p className="mt-2 text-base leading-relaxed text-white/70 sm:text-lg">
        {description}
      </p>
    </Panel>
  );
}
