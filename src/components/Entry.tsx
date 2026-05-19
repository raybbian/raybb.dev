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
          <h3 className="accent text-xl font-semibold sm:text-2xl">
            {title}
          </h3>
          {subtitle && (
            <span className="ink-2 text-lg font-semibold sm:text-xl">
              {subtitle}
            </span>
          )}
        </div>
        {meta && (
          <span className="ink-3 text-sm sm:text-base">{meta}</span>
        )}
      </div>
      <p className="ink-2 mt-2 text-base leading-relaxed sm:text-lg">
        {description}
      </p>
    </Panel>
  );
}
