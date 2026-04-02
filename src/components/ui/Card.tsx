import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

export function Card({ children, className = "", onClick, hover = false }: CardProps) {
  const base = "bg-white rounded-lg p-6 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.03)]";
  const hoverClass = hover
    ? "transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] cursor-pointer"
    : "";

  const Tag = onClick ? "button" : "div";

  return (
    <Tag onClick={onClick} className={`${base} ${hoverClass} ${className} ${onClick ? "text-left w-full" : ""}`}>
      {children}
    </Tag>
  );
}
