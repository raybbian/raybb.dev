import Panel from "./Panel";

export default function Entry({
  title,
  subtitle,
  meta,
  description,
}: {
  title: string;
  // optional secondary line shown smaller, to the right of the title
  subtitle?: string;
  meta?: string;
  description: string;
}) {
  return (
    <Panel className="p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="flex flex-col gap-x-3 gap-y-1 sm:flex-row sm:items-baseline">
          <h3 className="text-xl font-semibold text-emerald-200 sm:text-2xl">
            {title}
          </h3>
          {subtitle && (
            <span className="text-lg font-semibold text-white/60 sm:text-xl">
              {subtitle}
            </span>
          )}
        </div>
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
