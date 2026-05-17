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
      className={`rounded-2xl border border-white/15 bg-white/10 shadow-lg shadow-black/10 backdrop-blur-md ${className}`}
    >
      {children}
    </Tag>
  );
}
