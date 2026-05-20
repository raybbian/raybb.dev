import { ElementType, HTMLAttributes, ReactNode } from "react";

type PanelProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  children: ReactNode;
};

export default function Panel({
  as: Tag = "div",
  className = "",
  children,
  ...rest
}: PanelProps) {
  return (
    <Tag
      className={`frost rounded-2xl shadow-lg shadow-black/30 ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
