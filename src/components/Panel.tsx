import { ElementType, ReactNode } from "react";

export default function Panel({
  as: Tag = "div",
  className = "",
  children,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={`frost rounded-2xl shadow-lg shadow-black/10 dark:shadow-black/30 ${className}`}
    >
      {children}
    </Tag>
  );
}
